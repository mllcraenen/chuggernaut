import { signOut } from "@/auth";
import Link from "next/link";
import { BASE_PATH } from "@/lib/base-path";

export default function Nav() {
  return (
    <header className="border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
      <Link href="/" className="text-sm font-medium text-zinc-300 tracking-tight hover:text-white transition-colors">
        Chuggernaut
      </Link>
      <form
        action={async () => {
          "use server";
          // Auth.js redirects resolve against AUTH_URL's origin, not Next's
          // basePath, so the prefix must be explicit.
          await signOut({ redirectTo: `${BASE_PATH}/login` });
        }}
      >
        <button
          type="submit"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}
