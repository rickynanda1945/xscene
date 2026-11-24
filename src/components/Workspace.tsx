import { requireUser, csrfToken } from "@/lib/auth";
export default async function Workspace() {
  const u = await requireUser();
  return (
    <>
      {[
        "app",
        "xscene-v2",
        "workspace-layout",
        "mobile-workspace",
        "generation-loader",
      ].map((name) => (
        <link
          key={name}
          rel="stylesheet"
          href={"/assets/css/" + name + ".css?v=node1"}
        />
      ))}
      <aside className="sidebar" id="sidebar">
        <a className="logo" href="/dashboard" aria-label="XSCENE home">
          <img
            className="brand-symbol"
            src="/assets/images/xscene-mark.svg"
            alt=""
          />{" "}
          XSCENE<span className="logo-period">.</span>
        </a>
        <div className="workspace-label">PRODUCTION WORKSPACE</div>
        <nav id="nav" />
        {u.role === "admin" && (
          <a className="nav-link" href="/admin">
            Administrator dashboard →
          </a>
        )}
        <div className="sidebar-bottom">
          <div className="workspace-note">
            <span className="status-dot" />
            Your next idea starts here.
            <p>
              A little structure.
              <br />A lot of possibility.
            </p>
          </div>
          <a href="/settings" className="profile">
            <span className="avatar">X</span>
            <span>
              {u.name}
              <small>Personal workspace</small>
            </span>
            <span className="profile-arrow">⌄</span>
          </a>
        </div>
      </aside>
      <div className="app-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            id="menu-toggle"
            aria-label="Toggle navigation"
          >
            ☰
          </button>
          <div className="breadcrumbs">
            Workspace <span>/</span> <b id="breadcrumb">Create prompt</b>
          </div>
          <div className="topbar-right">
            <span className="internal-label">
              <i /> Personal workspace
            </span>
            <form method="post" action="/logout">
              <input type="hidden" name="csrf" value={await csrfToken()} />
              <button className="btn secondary">Logout</button>
            </form>
            <span className="topbar-divider" />
            <span className="avatar small">X</span>
          </div>
        </header>
        <main id="main" />
        <footer className="app-footer">
          <span>XSCENE / Built for your next big idea.</span>
          <span>IDEA → SCENE → PROMPT → VIDEO</span>
        </footer>
      </div>
      <dialog id="modal">
        <div id="modal-body" />
      </dialog>
      <div id="toast" role="status" aria-live="polite" />
      <script type="module" src="/assets/js/app.js?v=node1" />
    </>
  );
}
