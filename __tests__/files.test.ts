import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// Override UPLOADS_ROOT to a temp dir for all tests
let testRoot: string;
beforeEach(async () => {
  testRoot = await mkdtemp(join(tmpdir(), "files-test-"));
  process.env.UPLOADS_ROOT = testRoot;
});
afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true });
  delete process.env.UPLOADS_ROOT;
});

// Import after env is set so uploadsRoot() picks up the override
import {
  sanitizeFilename,
  validateExtension,
  validateSize,
  validateMagic,
  storeFile,
  listFiles,
  getFileBuffer,
  deleteFile,
  safeContentType,
  safeResolvePath,
  MAX_FILE_SIZE,
} from "../lib/files";

// ─── sanitizeFilename ─────────────────────────────────────────────────────────

describe("sanitizeFilename", () => {
  it("passes a normal filename through unchanged", () => {
    expect(sanitizeFilename("report.pdf")).toBe("report.pdf");
  });

  it("strips path traversal sequences", () => {
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("..");
    expect(sanitizeFilename("../../etc/passwd")).not.toContain("/");
  });

  it("strips null bytes and control characters", () => {
    expect(sanitizeFilename("file\x00name.txt")).not.toContain("\x00");
    expect(sanitizeFilename("file\x1fname.txt")).not.toContain("\x1f");
  });

  it("strips leading dots to prevent hidden files", () => {
    expect(sanitizeFilename(".env")).not.toMatch(/^\./);
    expect(sanitizeFilename("..hidden")).not.toMatch(/^\./);
  });

  it("replaces shell-special characters", () => {
    const result = sanitizeFilename("file;rm -rf *.txt");
    expect(result).not.toContain(";");
    expect(result).not.toContain("*");
  });

  it("truncates to 200 characters", () => {
    const long = "a".repeat(300) + ".txt";
    expect(sanitizeFilename(long).length).toBeLessThanOrEqual(200);
  });

  it("returns 'file' for empty or blank input", () => {
    expect(sanitizeFilename("")).toBe("file");
    expect(sanitizeFilename("   ")).toBe("file");
  });
});

// ─── validateExtension ────────────────────────────────────────────────────────

describe("validateExtension", () => {
  it("allows permitted extensions", () => {
    expect(validateExtension("report.pdf")).toBeNull();
    expect(validateExtension("data.csv")).toBeNull();
    expect(validateExtension("image.png")).toBeNull();
    expect(validateExtension("archive.zip")).toBeNull();
  });

  it("rejects executables", () => {
    expect(validateExtension("malware.exe")).toBe("EXTENSION_NOT_ALLOWED");
    expect(validateExtension("script.sh")).toBe("EXTENSION_NOT_ALLOWED");
    expect(validateExtension("binary.elf")).toBe("EXTENSION_NOT_ALLOWED");
  });

  it("rejects scripts", () => {
    expect(validateExtension("attack.js")).toBe("EXTENSION_NOT_ALLOWED");
    expect(validateExtension("attack.py")).toBe("EXTENSION_NOT_ALLOWED");
    expect(validateExtension("attack.rb")).toBe("EXTENSION_NOT_ALLOWED");
    expect(validateExtension("attack.php")).toBe("EXTENSION_NOT_ALLOWED");
  });

  it("rejects files with no extension", () => {
    expect(validateExtension("noextension")).toBe("EXTENSION_NOT_ALLOWED");
  });

  it("is case-insensitive on extension", () => {
    expect(validateExtension("IMAGE.PNG")).toBeNull();
    expect(validateExtension("doc.PDF")).toBeNull();
  });
});

// ─── validateSize ─────────────────────────────────────────────────────────────

describe("validateSize", () => {
  it("accepts normal file sizes", () => {
    expect(validateSize(1024)).toBeNull();
    expect(validateSize(MAX_FILE_SIZE)).toBeNull();
  });

  it("rejects empty files", () => {
    expect(validateSize(0)).toBe("EMPTY_FILE");
  });

  it("rejects files over the limit", () => {
    expect(validateSize(MAX_FILE_SIZE + 1)).toBe("FILE_TOO_LARGE");
  });
});

// ─── validateMagic ────────────────────────────────────────────────────────────

describe("validateMagic", () => {
  it("accepts a real PNG header", () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(validateMagic(".png", pngHeader)).toBeNull();
  });

  it("rejects a non-PNG file with .png extension", () => {
    const fakeHeader = Buffer.from([0x4d, 0x5a, 0x00, 0x00]); // MZ (Windows EXE)
    expect(validateMagic(".png", fakeHeader)).toBe("MAGIC_MISMATCH");
  });

  it("accepts a real PDF header", () => {
    const pdfHeader = Buffer.from("%PDF-1.4 header content");
    expect(validateMagic(".pdf", pdfHeader)).toBeNull();
  });

  it("rejects executable bytes as PDF", () => {
    const exeHeader = Buffer.from([0x4d, 0x5a, 0x90, 0x00]); // MZ header
    expect(validateMagic(".pdf", exeHeader)).toBe("MAGIC_MISMATCH");
  });

  it("skips magic check for types with no signature (e.g. .txt)", () => {
    const anything = Buffer.from("hello world");
    expect(validateMagic(".txt", anything)).toBeNull();
  });

  it("accepts a real ZIP header", () => {
    const zipHeader = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(validateMagic(".zip", zipHeader)).toBeNull();
  });
});

// ─── safeResolvePath ─────────────────────────────────────────────────────────

describe("safeResolvePath", () => {
  it("returns a path inside the zone root for a valid UUID", () => {
    const id = "550e8400-e29b-41d4-a716-446655440000";
    const result = safeResolvePath("inbox", id);
    expect(result).not.toBeNull();
    expect(result).toContain(id);
  });

  it("returns null for path traversal attempts", () => {
    expect(safeResolvePath("inbox", "../../../etc/passwd")).toBeNull();
    expect(safeResolvePath("inbox", "..%2F..%2Fetc%2Fpasswd")).toBeNull();
    expect(safeResolvePath("inbox", "valid/../../../etc/shadow")).toBeNull();
  });
});

// ─── safeContentType ─────────────────────────────────────────────────────────

describe("safeContentType", () => {
  it("marks PDFs as potentially inline", () => {
    const { inline } = safeContentType(".pdf");
    expect(inline).toBe(true);
  });

  it("marks images as potentially inline", () => {
    expect(safeContentType(".png").inline).toBe(true);
    expect(safeContentType(".jpg").inline).toBe(true);
  });

  it("marks text files as attachment (not inline)", () => {
    expect(safeContentType(".txt").inline).toBe(false);
    expect(safeContentType(".md").inline).toBe(false);
    expect(safeContentType(".csv").inline).toBe(false);
  });

  it("falls back to octet-stream for unknown types", () => {
    expect(safeContentType(".xyz").contentType).toBe("application/octet-stream");
  });

  it("never returns a script MIME type", () => {
    const dangerous = [".js", ".sh", ".py", ".rb", ".php"];
    for (const ext of dangerous) {
      const { contentType } = safeContentType(ext);
      expect(contentType).not.toContain("javascript");
      expect(contentType).not.toContain("x-sh");
      expect(contentType).not.toContain("x-python");
    }
  });
});

// ─── Storage round-trip ───────────────────────────────────────────────────────

describe("storeFile / listFiles / getFileBuffer / deleteFile", () => {
  it("stores a file and lists it back", async () => {
    const data = Buffer.from("hello world");
    const entry = await storeFile("inbox", "hello.txt", data);
    expect(entry.originalName).toBe("hello.txt");
    expect(entry.zone).toBe("inbox");

    const listed = await listFiles("inbox");
    expect(listed.some((f) => f.id === entry.id)).toBe(true);
  });

  it("retrieves file content correctly", async () => {
    const data = Buffer.from("test content 123");
    const entry = await storeFile("staging", "test.txt", data);
    const retrieved = await getFileBuffer("staging", entry.id);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.toString()).toBe("test content 123");
  });

  it("deletes a file and removes it from the listing", async () => {
    const data = Buffer.from("to be deleted");
    const entry = await storeFile("inbox", "delete-me.txt", data);
    const deleted = await deleteFile("inbox", entry.id);
    expect(deleted).toBe(true);

    const listed = await listFiles("inbox");
    expect(listed.some((f) => f.id === entry.id)).toBe(false);
  });

  it("returns null for getFileBuffer with a non-existent ID", async () => {
    const result = await getFileBuffer("inbox", "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });

  it("returns false for deleteFile with a non-existent ID", async () => {
    const result = await deleteFile("inbox", "00000000-0000-0000-0000-000000000000");
    expect(result).toBe(false);
  });

  it("does not allow accessing meta files via getFileBuffer", async () => {
    const data = Buffer.from("secret");
    const entry = await storeFile("inbox", "secret.txt", data);
    const result = await getFileBuffer("inbox", entry.id + ".meta.json");
    expect(result).toBeNull();
  });

  it("sanitizes the filename on store", async () => {
    const data = Buffer.from("x");
    const entry = await storeFile("inbox", "../../evil.txt", data);
    expect(entry.originalName).not.toContain("..");
    expect(entry.originalName).not.toContain("/");
  });
});
