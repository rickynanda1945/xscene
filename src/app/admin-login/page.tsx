import { redirect } from "next/navigation";
import { currentUser, csrfToken } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const u = await currentUser();
  if (u) redirect(u.role === "admin" ? "/admin" : "/dashboard");
  const { error } = await searchParams;
  return (
    <>
      <link rel="stylesheet" href="/assets/css/login.css?v=node1" />
      <link rel="stylesheet" href="/assets/css/admin-login.css?v=node1" />
      <div className="admin-access">
        <main className="admin-access-main">
          <a className="logo" href="/login">
            <img
              src="/assets/images/xscene-mark.svg"
              width="40"
              height="40"
              alt=""
            />
            XSCENE<span>.</span>
          </a>
          <section className="login-card">
            <div className="eyebrow">ADMINISTRATOR ACCESS</div>
            <h1>Administrator sign in</h1>
            <p className="intro">Manage your XSCENE workspace.</p>
            {error && (
              <div className="error" role="alert">
                {error.slice(0, 500)}
              </div>
            )}
            <form method="post" action="/auth/admin">
              <input type="hidden" name="csrf" value={await csrfToken()} />
              <label htmlFor="admin-email">Administrator email</label>
              <input
                id="admin-email"
                name="email"
                type="email"
                autoComplete="username"
                required
                maxLength={255}
              />
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={72}
              />
              <button className="button primary">
                Log in as administrator
              </button>
            </form>
            <a className="admin-back" href="/login#login">
              Back to user sign in
            </a>
          </section>
        </main>
      </div>
    </>
  );
}
