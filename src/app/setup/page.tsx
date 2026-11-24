import { notFound } from "next/navigation";
import { one } from "@/lib/db";
import { csrfToken } from "@/lib/auth";
export const dynamic = "force-dynamic";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (
    !process.env.SETUP_TOKEN ||
    (await one(
      "SELECT id FROM users WHERE role='admin' AND password_hash IS NOT NULL LIMIT 1",
    ))
  )
    notFound();
  const { error } = await searchParams;
  return (
    <>
      <link rel="stylesheet" href="/assets/css/login.css?v=node1" />
      <link rel="stylesheet" href="/assets/css/admin-login.css?v=node1" />
      <div className="admin-access">
        <main className="admin-access-main">
          <a className="logo" href="/">
            XSCENE<span>.</span>
          </a>
          <section className="login-card">
            <div className="eyebrow">ONE-TIME SETUP</div>
            <h1>Create administrator</h1>
            <p className="intro">
              Use the SETUP_TOKEN from your Dokploy environment. This page
              closes after the first administrator is created.
            </p>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            <form method="post" action="/auth/setup">
              <input type="hidden" name="csrf" value={await csrfToken()} />
              <label htmlFor="setup-token">Setup token</label>
              <input
                id="setup-token"
                name="token"
                type="password"
                autoComplete="off"
                required
              />
              <label htmlFor="setup-email">Administrator email</label>
              <input
                id="setup-email"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
              <label htmlFor="setup-password">Password (14–72 bytes)</label>
              <input
                id="setup-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={14}
                maxLength={72}
                required
              />
              <button className="button primary">Create administrator</button>
            </form>
          </section>
        </main>
      </div>
    </>
  );
}
