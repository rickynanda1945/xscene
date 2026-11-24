import mysql, {
  type Pool,
  type PoolConnection,
  type RowDataPacket,
  type ResultSetHeader,
} from "mysql2/promise";
export type DB = Pool | PoolConnection;
let pool: Pool;
export function db(): Pool {
  for (const key of ["DB_HOST", "DB_NAME", "DB_USER", "DB_PASSWORD"]) {
    if (!process.env[key]?.trim()) {
      throw new Error(`Missing runtime database configuration: ${key}`);
    }
  }
  return (pool ??= mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    connectionLimit: 10,
    waitForConnections: true,
    charset: "utf8mb4",
    timezone: "Z",
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
    enableKeepAlive: true,
  }));
}
export type Row = Record<string, any>;
export async function rows<T extends Row = Row>(
  sql: string,
  args: any[] = [],
  connection: DB = db(),
): Promise<T[]> {
  const [result] = await connection.execute<RowDataPacket[]>(sql, args);
  return result as T[];
}
export async function one<T extends Row = Row>(
  sql: string,
  args: any[] = [],
  connection: DB = db(),
): Promise<T | undefined> {
  return (await rows<T>(sql, args, connection))[0];
}
export async function run(
  sql: string,
  args: any[] = [],
  connection: DB = db(),
): Promise<ResultSetHeader> {
  const [result] = await connection.execute<ResultSetHeader>(sql, args);
  return result;
}
export async function transaction<T>(
  fn: (c: PoolConnection) => Promise<T>,
): Promise<T> {
  const c = await db().getConnection();
  try {
    await c.beginTransaction();
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}
export async function setting<T>(
  key: string,
  fallback: T,
  connection: DB = db(),
): Promise<T> {
  const r = await one(
    "SELECT value_json FROM app_settings WHERE setting_key=?",
    [key],
    connection,
  );
  return r ? JSON.parse(r.value_json) : fallback;
}
export async function setSetting(
  key: string,
  value: unknown,
  connection: DB = db(),
) {
  await run(
    "INSERT INTO app_settings(setting_key,value_json) VALUES (?,?) ON DUPLICATE KEY UPDATE value_json=VALUES(value_json)",
    [key, JSON.stringify(value)],
    connection,
  );
}
export async function audit(
  event: string,
  detail = "",
  uid: string | null = null,
  connection: DB = db(),
) {
  await run(
    "INSERT INTO activity_logs(user_id,event,detail,created_at) VALUES (?,?,?,UTC_TIMESTAMP())",
    [uid, event, detail.slice(0, 1000)],
    connection,
  );
}
