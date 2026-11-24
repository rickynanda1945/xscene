import mysql from "mysql2/promise";
const c = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});
try {
  for (const sql of [
    "DELETE FROM auth_sessions WHERE expires_at<UTC_TIMESTAMP()",
    "DELETE FROM otp_challenges WHERE expires_at<DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 DAY)",
    "DELETE FROM node_rate_limits WHERE expires_at<UTC_TIMESTAMP()",
  ])
    await c.execute(sql);
  console.log(
    "Expired authentication/rate records cleaned. Image files retained.",
  );
} finally {
  await c.end();
}
