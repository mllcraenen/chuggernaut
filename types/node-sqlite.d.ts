// Minimal type shim for node:sqlite (DatabaseSync).
// @types/node@20 predates these typings; this covers only the API we use.
declare module "node:sqlite" {
  type SQLValue = string | number | bigint | null | Uint8Array;

  interface RunResult {
    changes: number | bigint;
    lastInsertRowid: number | bigint;
  }

  class StatementSync {
    run(...params: SQLValue[]): RunResult;
    get<T = Record<string, SQLValue>>(...params: SQLValue[]): T | undefined;
    all<T = Record<string, SQLValue>>(...params: SQLValue[]): T[];
  }

  export class DatabaseSync {
    constructor(path: string, options?: { open?: boolean; readOnly?: boolean });
    exec(sql: string): void;
    prepare(sql: string): StatementSync;
    close(): void;
  }
}
