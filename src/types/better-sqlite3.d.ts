declare module "better-sqlite3" {
  type Statement = {
    run(...params: unknown[]): unknown;
    get(...params: unknown[]): Record<string, unknown> | undefined;
    all(...params: unknown[]): Array<Record<string, unknown>>;
  };

  export default class Database {
    constructor(location: string);
    exec(sql: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }
}
