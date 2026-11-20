declare module 'sql.js' {
  export interface QueryExecResult {
    columns: string[];
    values: (string | number | null)[][];
  }

  export interface Database {
    prepare(sql: string): Statement;
    exec(sql: string): QueryExecResult[];
    close(): void;
  }

  export interface Statement {
    bind(values?: unknown[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  export interface InitSqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export default function initSqlJs(config?: InitSqlJsConfig): Promise<SqlJsStatic>;
}
