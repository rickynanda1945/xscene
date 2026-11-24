import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { one, run, audit, transaction, type Row, type DB } from "./db";
import { AppError, required } from "./errors";
export const SESSION = "xscene_session";
export function secret() {
  const s = process.env.AUTH_SECRET || "";
  required(
    s.length >= 32,
    "Configure AUTH_SECRET with at least 32 random characters.",
    503,
  );
  return s;
}
export function hash(s: string) {
  return createHash("sha256").update(s).digest("hex");
}
export function hmac(s: string) {
  return createHmac("sha256", secret()).update(s).digest("hex");
}
export function equal(a: string, b: string) {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function appURL() {
  const url = new URL(process.env.APP_URL || "http://localhost:3000");
  required(
    !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      url.pathname === "/" &&
      ["https:", "http:"].includes(url.protocol),
    "APP_URL must be an application origin.",
    503,
  );
  required(
    url.protocol === "https:" ||
      ["localhost", "127.0.0.1"].includes(url.hostname),
    "Use HTTPS for APP_URL.",
    503,
  );
  return url.origin;
}
export const cookieOptions = () => ({
  httpOnly: true,
  secure: appURL().startsWith("https://"),
  sameSite: "lax" as const,
  path: "/",
});
export function seal(payload: Record<string, unknown>, seconds = 600) {
  const iv = randomBytes(12),
    cipher = createCipheriv(
      "aes-256-gcm",
      createHash("sha256").update(secret()).digest(),
      iv,
    );
  const encrypted = Buffer.concat([
    cipher.update(
      JSON.stringify({ ...payload, exp: Date.now() + seconds * 1000 }),
    ),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unseal(value: string | undefined): Record<string, any> | null {
  if (!value) return null;
  try {
    const b = Buffer.from(value, "base64url"),
      cipher = createDecipheriv(
        "aes-256-gcm",
        createHash("sha256").update(secret()).digest(),
        b.subarray(0, 12),
      );
    cipher.setAuthTag(b.subarray(12, 28));
    const data = JSON.parse(
      Buffer.concat([cipher.update(b.subarray(28)), cipher.final()]).toString(),
    );
    return typeof data.exp === "number" && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export async function csrfToken() {
  const jar = await cookies();
  const token = jar.get(SESSION)?.value || jar.get("xscene_guest")?.value;
  required(token, "Reload this page before continuing.", 403);
  return hmac("csrf:" + token);
}
export async function checkCSRF(request: Request, form?: FormData) {
  const origin = request.headers.get("origin");
  required(
    !origin || origin === appURL(),
    "This request origin is not allowed.",
    403,
  );
  const supplied = String(
    form?.get("csrf") || request.headers.get("x-csrf-token") || "",
  );
  required(
    equal(supplied, await csrfToken()),
    "Your session changed. Reload the page and try again.",
    403,
  );
}
export async function rate(key: string, max: number, seconds: number) {
  const bucket = Math.floor(Date.now() / 1000 / seconds),
    id = hash(key + ":" + bucket);
  await run(
    "INSERT INTO node_rate_limits(key_hash,hits,expires_at) VALUES (?,1,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? SECOND)) ON DUPLICATE KEY UPDATE hits=hits+1",
    [id, seconds * 2],
  );
  const r = await one("SELECT hits FROM node_rate_limits WHERE key_hash=?", [
    id,
  ]);
  required(
    Number(r?.hits) <= max,
    "Too many attempts. Please wait before trying again.",
    429,
  );
}
export function clientKey(request: Request) {
  return process.env.TRUST_PROXY === "true"
    ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "direct";
}
export async function currentUser(): Promise<Row | null> {
  const token = (await cookies()).get(SESSION)?.value;
  if (!token) return null;
  const u = await one(
    "SELECT u.* FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND s.last_seen>DATE_SUB(UTC_TIMESTAMP(),INTERVAL 8 HOUR) AND u.status='active'",
    [hash(token)],
  );
  if (!u) return null;
  await run(
    "UPDATE auth_sessions SET last_seen=UTC_TIMESTAMP() WHERE token_hash=?",
    [hash(token)],
  );
  return u;
}
export async function requireUser(api = false): Promise<Row> {
  const u = await currentUser();
  if (u) return u;
  if (api)
    throw new AppError("Please sign in to continue.", 401, "AUTH_REQUIRED");
  redirect("/login");
}
export async function requireAdmin(api = false): Promise<Row> {
  const u = await currentUser();
  if (!u) {
    if (api) throw new AppError("Administrator sign-in required.", 401);
    redirect("/admin-login");
  }
  if (u.role !== "admin") {
    if (!api) redirect("/dashboard");
    throw new AppError("Administrator access required.", 403);
  }
  return u;
}
export async function startSession(u: Row, method: string) {
  required(u.status === "active", "Unable to sign in.", 403);
  const jar = await cookies(),
    previous = jar.get(SESSION)?.value;
  if (previous)
    await run("DELETE FROM auth_sessions WHERE token_hash=?", [hash(previous)]);
  const token = randomBytes(32).toString("hex");
  await run(
    "INSERT INTO auth_sessions(token_hash,user_id,created_at,last_seen,expires_at) VALUES (?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(),INTERVAL 1 DAY))",
    [hash(token), u.id],
  );
  jar.set(SESSION, token, { ...cookieOptions(), maxAge: 86400 });
  jar.delete("xscene_otp");
  jar.delete("xscene_oauth");
  await audit("login", method, String(u.id));
}
export async function logout() {
  const jar = await cookies(),
    token = jar.get(SESSION)?.value;
  if (token)
    await run("DELETE FROM auth_sessions WHERE token_hash=?", [hash(token)]);
  jar.delete(SESSION);
  jar.delete("xscene_otp");
  jar.delete("xscene_oauth");
}
export function emailAddress(value: unknown) {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  required(
    email.length <= 255 &&
      /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(
        email,
      ),
    "Enter a valid email address.",
  );
  return email;
}
export async function publicIdentity(
  email: string,
  googleSub: string | null = null,
  connection?: DB,
): Promise<Row> {
  const work = async (c: DB) => {
    let u = await one(
      "SELECT * FROM users WHERE email=? FOR UPDATE",
      [email],
      c,
    );
    if (!u) {
      const r = await run(
        "INSERT INTO users(name,email,role,status,plan,email_verified_at,google_sub) VALUES (?,?,'user','active','free',UTC_TIMESTAMP(),?)",
        [email.split("@")[0].slice(0, 180), email, googleSub],
        c,
      );
      u = await one("SELECT * FROM users WHERE id=?", [r.insertId], c);
      await audit(
        "signup",
        googleSub ? "google" : "email",
        String(r.insertId),
        c,
      );
    }
    required(
      u && u.role === "user" && u.status === "active",
      "Unable to sign in here. Use administrator sign in if applicable.",
      403,
    );
    if (googleSub) {
      required(
        !u.google_sub || u.google_sub === googleSub,
        "Unable to link this Google account.",
        403,
      );
      await run(
        "UPDATE users SET google_sub=?,email_verified_at=COALESCE(email_verified_at,UTC_TIMESTAMP()) WHERE id=?",
        [googleSub, u.id],
        c,
      );
    }
    return u;
  };
  return connection ? work(connection) : transaction(work);
}
