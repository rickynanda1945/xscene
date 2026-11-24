import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import { stdin, stdout } from "node:process";
const email = String(process.argv[2] || "")
  .trim()
  .toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !stdin.isTTY) {
  console.error("Run interactively: npm run admin:create -- admin@example.com");
  process.exit(1);
}
stdout.write("Administrator password (14–72 bytes): ");
stdin.setRawMode(true);
stdin.resume();
const password = await new Promise((resolve, reject) => {
  let value = "";
  const listener = (chunk) => {
    const chars = chunk.toString();
    if (chars === "\u0003") {
      stdin.off("data", listener);
      reject(new Error("Cancelled"));
      return;
    }
    if (chars.includes("\r") || chars.includes("\n")) {
      stdin.off("data", listener);
      resolve(value);
      return;
    }
    if (chars === "\u007f") value = value.slice(0, -1);
    else value += chars;
  };
  stdin.on("data", listener);
}).finally(() => {
  stdin.setRawMode(false);
  stdin.pause();
  stdout.write("\n");
});
if (Buffer.byteLength(password) < 14 || Buffer.byteLength(password) > 72)
  throw new Error("Use 14 to 72 bytes.");
const c = await mysql.createConnection({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  timezone: "Z",
});
try {
  const hash = await bcrypt.hash(password, 12);
  await c.beginTransaction();
  await c.execute(
    "INSERT INTO users(name,email,password_hash,role,status,email_verified_at) VALUES ('Administrator',?,?,'admin','active',UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash),role='admin',status='active',email_verified_at=UTC_TIMESTAMP()",
    [email, hash],
  );
  const [[u]] = await c.execute("SELECT id FROM users WHERE email=?", [email]);
  await c.execute("DELETE FROM auth_sessions WHERE user_id=?", [u.id]);
  await c.execute(
    "INSERT INTO activity_logs(user_id,event,detail,created_at) VALUES (?,'admin_configured','CLI provisioning',UTC_TIMESTAMP())",
    [u.id],
  );
  await c.commit();
  console.log("Administrator configured. Sign in at /admin-login.");
} catch (e) {
  await c.rollback();
  throw e;
} finally {
  await c.end();
}
