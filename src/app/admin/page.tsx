import { requireAdmin, csrfToken } from "@/lib/auth";
import { one, rows, setting } from "@/lib/db";
import { LIMIT_KEYS } from "@/lib/admin";
import { MODELS } from "@/lib/prompts";
export const dynamic = "force-dynamic";
const tabs: Record<string, string> = {
  overview: "Overview",
  users: "Users",
  plans: "Plans & access",
  templates: "Templates",
  assets: "Asset management",
  security: "Security",
  logs: "Activity logs",
  backup: "Backup & maintenance",
  settings: "Settings",
  announcements: "Announcements",
};
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const u = await requireAdmin(),
    p = await searchParams,
    tab = p.tab && tabs[p.tab] ? p.tab : "overview",
    csrf = await csrfToken();
  const hidden = (action: string, id: string | number = "0") => (
    <>
      <input type="hidden" name="csrf" value={csrf} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="tab" value={tab} />
    </>
  );
  let content: React.ReactNode;
  if (tab === "overview") {
    const metrics: Record<string, number> = {};
    for (const [label, sql] of Object.entries({
      "Verified users":
        "SELECT COUNT(*) AS n FROM users WHERE role='user' AND email_verified_at IS NOT NULL",
      Projects: "SELECT COUNT(*) AS n FROM projects",
      Prompts: "SELECT COUNT(*) AS n FROM prompt_generations",
      "Storage used (MB)":
        "SELECT CEIL(COALESCE(SUM(file_size),0)/1048576) AS n FROM assets",
      "Consented visitors (30 days)":
        "SELECT COUNT(DISTINCT visitor_hash) AS n FROM visit_events WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)",
      "Active users (30 days)":
        "SELECT COUNT(DISTINCT user_id) AS n FROM activity_logs WHERE event IN ('login','project_saved','prompt_generated') AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)",
    }))
      metrics[label] = Number((await one(sql))?.n || 0);
    const daily = await rows(
      "SELECT DATE(created_at) AS day,COUNT(*) AS total FROM users WHERE created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 14 DAY) GROUP BY DATE(created_at) ORDER BY day",
    );
    content = (
      <>
        <div className="stats">
          {Object.entries(metrics).map(([label, n]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{n}</strong>
            </article>
          ))}
        </div>
        <div className="panel">
          <h2>Registrations by day</h2>
          <p>
            Reporting uses UTC. Visit counts include only visitors with
            analytics consent.
          </p>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Registrations</th>
              </tr>
            </thead>
            <tbody>
              {daily.map((r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  } else if (tab === "users") {
    const users = await rows("SELECT * FROM users ORDER BY id DESC LIMIT 100");
    content = (
      <div className="panel">
        <h2>Accounts</h2>
        <p>
          Administrator accounts are provisioned through setup or the
          administrator CLI.
        </p>
        {users.map((a) => (
          <article className="node-admin-row" key={a.id}>
            <b>{a.name}</b>
            <p>
              {a.email || "Not provisioned"} · {a.role}
            </p>
            {a.role === "user" && (
              <form method="post" action="/api/admin">
                {hidden("user_update", a.id)}
                <label>
                  Status
                  <select name="status" defaultValue={a.status}>
                    <option>active</option>
                    <option>disabled</option>
                  </select>
                </label>
                <label>
                  Plan
                  <select name="plan" defaultValue={a.plan}>
                    <option>free</option>
                    <option>premium</option>
                  </select>
                </label>
                <label>
                  Plan expiry
                  <input
                    name="plan_until"
                    type="date"
                    defaultValue={a.plan_until?.slice(0, 10) || ""}
                  />
                </label>
                <button>Save account</button>
              </form>
            )}
            <form method="post" action="/api/admin">
              {hidden("revoke", a.id)}
              <label className="confirm">
                <input type="checkbox" name="confirm" value="yes" required />{" "}
                Confirm signing out all sessions
              </label>
              <button className="secondary">Revoke sessions</button>
            </form>
          </article>
        ))}
      </div>
    );
  } else if (tab === "plans" || tab === "settings") {
    const defaults = [20, 500, 100, 10000, 100, 5120],
      values = await Promise.all(
        LIMIT_KEYS.map((k, i) => setting(k, defaults[i])),
      ),
      models = await setting("models", MODELS);
    content = (
      <div className="panel">
        <h2>Plan limits & video models</h2>
        <p>
          Free access ends February 28, 2027 in Asia/Jakarta. Third-party video
          credits are separate. Archived references continue to use storage.
        </p>
        <form method="post" action="/api/admin">
          {hidden("settings_save")}
          <div className="form-grid">
            {LIMIT_KEYS.map((key, i) => (
              <label key={key}>
                {key.replaceAll("_", " ")}
                <input
                  type="number"
                  min="0"
                  max="100000"
                  name={key}
                  required
                  defaultValue={String(values[i])}
                />
              </label>
            ))}
          </div>
          <h3>Enabled video models</h3>
          {MODELS.map((model) => (
            <label className="confirm" key={model}>
              <input
                type="checkbox"
                name="models"
                value={model}
                defaultChecked={models.includes(model)}
              />
              {model}
            </label>
          ))}
          <button>Save settings</button>
        </form>
      </div>
    );
  } else if (tab === "templates") {
    const all = await rows("SELECT * FROM templates ORDER BY id DESC"),
      edit = p.edit
        ? await one("SELECT * FROM templates WHERE id=?", [p.edit])
        : null;
    const config = edit
      ? JSON.parse(edit.config_json)
      : {
          name: "New scene template",
          description: "A reusable starting point.",
          category: "Product Promotion",
          style: "Cinematic",
          goal: "Product Promotion",
          location: "Studio",
          action: "Showing Product",
          structure: "Single Action",
          idea: "Reveal a product in a clean studio.",
          color: "#e6e1d6",
          settings: { lighting: "Studio Softbox", shot: "Close-Up" },
        };
    delete config.id;
    const files = edit
      ? await rows("SELECT * FROM template_files WHERE template_id=?", [
          edit.id,
        ])
      : [];
    content = (
      <>
        <div className="panel">
          <h2>Template library</h2>
          <p>
            Import JSON templates as drafts, attach examples, then publish them
            for free or premium users.
          </p>
          <div className="node-template-list">
            {all.map((t) => (
              <article key={t.id}>
                <a href={"/admin?tab=templates&edit=" + t.id}>{t.name}</a>
                <small>
                  {t.status} · {t.access_tier}
                </small>
                <form method="post" action="/api/admin">
                  {hidden("template_duplicate", t.id)}
                  <button className="secondary">Duplicate</button>
                </form>
              </article>
            ))}
          </div>
          <a href="/admin?tab=templates">Create new template</a>
          <form method="post" action="/api/admin" encType="multipart/form-data">
            {hidden("template_import")}
            <label>
              Import JSON template
              <input
                type="file"
                name="template"
                accept="application/json,.json"
                required
              />
            </label>
            <button>Import as draft</button>
          </form>
        </div>
        <div className="panel">
          <h2>{edit ? "Edit template #" + edit.id : "Create a template"}</h2>
          <form method="post" action="/api/admin">
            {hidden("template_save", edit?.id || "0")}
            <label>
              Template JSON
              <textarea
                name="config_json"
                rows={20}
                required
                defaultValue={JSON.stringify(config, null, 2)}
              />
            </label>
            <div className="form-grid">
              <label>
                Status
                <select name="status" defaultValue={edit?.status || "draft"}>
                  <option>draft</option>
                  <option>published</option>
                  <option>disabled</option>
                </select>
              </label>
              <label>
                Access
                <select
                  name="access_tier"
                  defaultValue={edit?.access_tier || "free"}
                >
                  <option>free</option>
                  <option>premium</option>
                </select>
              </label>
            </div>
            <button
              name="action"
              value="template_preview"
              className="secondary"
            >
              Preview without publishing
            </button>
            <button name="action" value="template_save">
              Save template
            </button>
          </form>
          {edit && (
            <>
              <h3>Reference images</h3>
              <form
                method="post"
                action="/api/admin"
                encType="multipart/form-data"
              >
                {hidden("template_asset", edit.id)}
                <label>
                  Role
                  <select name="role">
                    <option>cover</option>
                    <option>character</option>
                    <option>product</option>
                    <option>background</option>
                    <option>logo</option>
                  </select>
                </label>
                <label>
                  Image
                  <input
                    type="file"
                    name="image"
                    accept="image/png,image/jpeg,image/webp"
                    required
                  />
                </label>
                <button>Upload reference</button>
              </form>
              <div className="node-template-list">
                {files.map((f) => (
                  <article key={f.id}>
                    <img
                      src={"/template-media?id=" + f.id}
                      alt={f.original_filename}
                      width="120"
                    />
                    <p>
                      {f.role} · {f.original_filename}
                    </p>
                    <form method="post" action="/api/admin">
                      {hidden("template_asset_delete", f.id)}
                      <label className="confirm">
                        <input
                          type="checkbox"
                          name="confirm"
                          value="yes"
                          required
                        />{" "}
                        Confirm removal
                      </label>
                      <button className="danger">Remove image</button>
                    </form>
                  </article>
                ))}
              </div>
              <form method="post" action="/api/admin">
                {hidden("template_delete", edit.id)}
                <label className="confirm">
                  <input type="checkbox" name="confirm" value="yes" required />{" "}
                  Delete this template and its example files
                </label>
                <button className="danger">Delete template</button>
              </form>
            </>
          )}
        </div>
      </>
    );
  } else if (tab === "assets") {
    const assets = await rows(
      "SELECT a.*,u.email FROM assets a JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 100",
    );
    content = (
      <div className="panel">
        <h2>Stored assets</h2>
        <p>
          Archiving removes an asset from new selections while keeping saved
          project references.
        </p>
        <div className="node-template-list">
          {assets.map((a) => (
            <article key={a.id}>
              <img
                src={"/media?id=" + a.id + "&scope=admin"}
                alt={a.original_filename}
                width="120"
              />
              <p>{a.original_filename}</p>
              <small>
                {a.email} · {a.asset_type}
              </small>
              {!a.asset_type.startsWith("archived_") && (
                <form method="post" action="/api/admin">
                  {hidden("asset_archive", a.id)}
                  <label className="confirm">
                    <input
                      type="checkbox"
                      name="confirm"
                      value="yes"
                      required
                    />{" "}
                    Confirm library removal
                  </label>
                  <button className="danger">Archive</button>
                </form>
              )}
            </article>
          ))}
        </div>
      </div>
    );
  } else if (tab === "security") {
    const checks = {
      "Session secret": (process.env.AUTH_SECRET?.length || 0) >= 32,
      "Google sign-in": !!(
        process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ),
      "Email sender": !!process.env.MAIL_FROM,
      "HTTPS application URL": process.env.APP_URL?.startsWith("https://"),
    };
    content = (
      <div className="panel">
        <h2>Authentication & upload protection</h2>
        <dl>
          {Object.entries(checks).map(([key, value]) => (
            <div key={key}>
              <dt>{key}</dt>
              <dd>{value ? "Configured" : "Needs configuration"}</dd>
            </div>
          ))}
        </dl>
        <p>
          Public users sign in with Google or a single-use email code. Codes
          expire after 5 minutes and allow at most 5 attempts. Administrator
          sign-in uses its provisioned email and password.
        </p>
        <p>
          Sessions expire after 24 hours or 8 hours of inactivity.
          State-changing requests require CSRF validation. Uploads are decoded
          and validated as PNG, JPG or WebP, up to 10 MB. Private files are
          served only through authorized endpoints.
        </p>
        <p>
          Use the Users tab to disable accounts and revoke sessions. Credentials
          are never displayed here.
        </p>
      </div>
    );
  } else if (tab === "logs") {
    const logs = await rows(
      "SELECT l.*,u.email FROM activity_logs l LEFT JOIN users u ON u.id=l.user_id ORDER BY l.id DESC LIMIT 100",
    );
    content = (
      <div className="panel">
        <h2>Latest activity</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time (UTC)</th>
                <th>Account</th>
                <th>Event</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.created_at}</td>
                  <td>{l.email || "System"}</td>
                  <td>{l.event}</td>
                  <td>{l.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  } else if (tab === "backup") {
    content = (
      <div className="panel">
        <h2>Backup & maintenance</h2>
        <p>
          Back up the MySQL database and persistent storage together using your
          hosting backup service. Keep a copy outside the VPS and test
          restoration.
        </p>
        <p>
          The export below contains workspace metadata, projects and prompt
          history. It excludes passwords, sessions and OTP challenges; image
          bytes must be backed up separately.
        </p>
        <form method="post" action="/api/admin">
          {hidden("export_metadata")}
          <button>Export workspace metadata</button>
        </form>
        <p>
          See docs/MIGRATION.md for moving data from PHP V4 and docs/DOKPLOY.md
          for persistent storage setup.
        </p>
      </div>
    );
  } else {
    content = (
      <div className="panel">
        <h2>Workspace announcement</h2>
        <form method="post" action="/api/admin">
          {hidden("announcement_save")}
          <label>
            Message
            <textarea
              name="announcement"
              rows={5}
              maxLength={2000}
              defaultValue={await setting("announcement", "")}
            />
          </label>
          <button>Save announcement</button>
        </form>
      </div>
    );
  }
  return (
    <>
      <link rel="stylesheet" href="/assets/css/admin.css?v=node1" />
      <link rel="stylesheet" href="/assets/css/node-admin.css?v=node1" />
      <aside className="admin-sidebar">
        <a className="admin-logo" href="/admin">
          <img
            src="/assets/images/xscene-mark.svg"
            width="32"
            height="32"
            alt=""
          />{" "}
          XSCENE<span>.</span>
        </a>
        <p>ADMINISTRATOR</p>
        <nav>
          {Object.entries(tabs).map(([key, label]) => (
            <a
              key={key}
              className={key === tab ? "active" : ""}
              href={"/admin?tab=" + key}
            >
              {label}
            </a>
          ))}
        </nav>
        <a className="workspace-back" href="/dashboard">
          Open my workspace
        </a>
        <form method="post" action="/logout">
          <input type="hidden" name="csrf" value={csrf} />
          <button>Log out</button>
        </form>
      </aside>
      <main className="admin-main">
        <header>
          <div>
            <span className="eyebrow">XSCENE / CONTROL CENTER</span>
            <h1>{tabs[tab]}</h1>
          </div>
          <span>{u.email}</span>
        </header>
        {p.notice && (
          <div className="notice" role="status">
            {p.notice.slice(0, 500)}
          </div>
        )}
        {p.error && (
          <div className="error" role="alert">
            {p.error.slice(0, 500)}
          </div>
        )}
        {content}
      </main>
    </>
  );
}
