import type { ConnectionPool, IResult } from 'mssql';

export interface PreparedQuery {
  sql: string;
  inputs: Record<string, string | number | Date>;
}

export async function exec<T>(pool: ConnectionPool, query: PreparedQuery): Promise<T[]> {
  const req = pool.request();
  for (const [key, value] of Object.entries(query.inputs)) {
    req.input(key, value);
  }
  const result: IResult<T> = await req.query<T>(query.sql);
  return result.recordset;
}
