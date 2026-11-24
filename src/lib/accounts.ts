import { one, setting, type Row, type DB, db } from "./db";
import { required } from "./errors";
export function plan(u: Row) {
  return u.plan === "premium" &&
    (!u.plan_until ||
      Date.parse(String(u.plan_until).replace(" ", "T") + "Z") > Date.now())
    ? "premium"
    : "free";
}
export function canWrite(u: Row) {
  return (
    u.role === "admin" ||
    plan(u) === "premium" ||
    Date.now() < Date.parse("2027-02-28T17:00:00Z")
  );
}
export async function limits(u: Row, c: DB = db()) {
  const p = plan(u);
  return {
    projects: Number(
      await setting(p + "_projects", p === "free" ? 20 : 500, c),
    ),
    prompts: Number(
      await setting(p + "_prompts", p === "free" ? 100 : 10000, c),
    ),
    storage_mb: Number(
      await setting(p + "_storage_mb", p === "free" ? 100 : 5120, c),
    ),
  };
}
export async function lockAccount(uid: string, c: DB) {
  const u = await one("SELECT * FROM users WHERE id=? FOR UPDATE", [uid], c);
  required(u && u.status === "active", "Your account is not active.", 403);
  required(
    canWrite(u),
    "Free access has ended. Contact support to activate a paid plan.",
    403,
  );
  return u;
}
export async function quota(
  u: Row,
  kind: "projects" | "prompts" | "storage",
  extra = 1,
  c: DB = db(),
) {
  if (u.role === "admin") return;
  const l = await limits(u, c);
  const sql =
    kind === "projects"
      ? "SELECT COUNT(*) AS n FROM projects WHERE user_id=?"
      : kind === "prompts"
        ? "SELECT COUNT(*) AS n FROM activity_logs WHERE user_id=? AND event='prompt_generated' AND created_at>=DATE_FORMAT(UTC_TIMESTAMP(),'%Y-%m-01')"
        : "SELECT COALESCE(SUM(file_size),0) AS n FROM assets WHERE user_id=?";
  const n = Number((await one(sql, [u.id], c))?.n || 0),
    max = kind === "storage" ? l.storage_mb * 1048576 : l[kind];
  required(
    n + extra <= max,
    "Your plan limit has been reached. Contact support to change your plan.",
    403,
  );
}
