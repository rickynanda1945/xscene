import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import {
  appURL,
  checkCSRF,
  clientKey,
  rate,
  emailAddress,
  seal,
  unseal,
  cookieOptions,
  equal,
  publicIdentity,
  startSession,
} from "@/lib/auth";
import { requestCode, verifyCode } from "@/lib/identity";
import { one, run, transaction, audit } from "@/lib/db";
import { AppError, required, formBody } from "@/lib/errors";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const go = (to: string) => NextResponse.redirect(new URL(to, appURL()), 303);
function authError(error: unknown, fallback = "/login") {
  const message =
    error instanceof AppError
      ? error.message
      : "Sign-in could not finish. Check the service configuration or contact support.";
  if (!(error instanceof AppError))
    console.error(
      "XSCENE authentication failure:",
      error instanceof Error ? error.name : "Unknown",
    );
  return go(fallback + "?error=" + encodeURIComponent(message) + "#login");
}
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  try {
    const f = await formBody(request, 65536);
    await checkCSRF(request, f);
    await rate("auth-ip:" + clientKey(request), 30, 900);
    switch (action) {
      case "email":
        await requestCode(f.get("email"));
        return go(
          "/login?notice=Check%20your%20email%20for%20your%20verification%20code.#login",
        );
      case "resend": {
        const pending = unseal((await cookies()).get("xscene_otp")?.value);
        required(pending?.email, "Enter your email first.");
        await requestCode(pending.email);
        return go("/login?notice=A%20new%20code%20has%20been%20sent.#login");
      }
      case "verify":
        await verifyCode(f.get("code"));
        return go("/dashboard");
      case "change":
        (await cookies()).delete("xscene_otp");
        return go("/login#login");
      case "admin": {
        const email = emailAddress(f.get("email")),
          password = String(f.get("password") || "");
        await rate("admin-ip:" + clientKey(request), 10, 900);
        await rate("admin-email:" + email, 5, 900);
        const u = await one(
          "SELECT * FROM users WHERE email=? AND role='admin' AND status='active'",
          [email],
        );
        const ok = await bcrypt.compare(
          password,
          String(
            u?.password_hash ||
              "$2b$12$T.ia7bg9Prk8SN4amFikSOvDLzM.2r0OxyMwGJbu9mKoS4b/ZpHa6",
          ).replace(/^\$2y\$/, "$2b$"),
        );
        if (!u || !ok || Buffer.byteLength(password) > 72) {
          await audit("admin_login_failed");
          throw new AppError("Unable to sign in. Check your details.", 403);
        }
        await startSession(u, "admin_password");
        return go("/admin");
      }
      case "setup": {
        const configured = process.env.SETUP_TOKEN || "";
        required(
          configured.length >= 32 &&
            equal(String(f.get("token") || ""), configured),
          "Invalid setup token.",
          403,
        );
        const email = emailAddress(f.get("email")),
          password = String(f.get("password") || "");
        required(
          Buffer.byteLength(password) >= 14 &&
            Buffer.byteLength(password) <= 72,
          "Use a password of 14 to 72 bytes.",
        );
        const passwordHash = await bcrypt.hash(password, 12),
          u = await transaction(async (c) => {
            await one("SELECT id FROM users WHERE id=1 FOR UPDATE", [], c);
            required(
              !(await one(
                "SELECT id FROM users WHERE role='admin' AND password_hash IS NOT NULL LIMIT 1 FOR UPDATE",
                [],
                c,
              )),
              "Administrator setup is already complete.",
              404,
            );
            let id: string;
            const existing = await one(
              "SELECT id FROM users WHERE email=? FOR UPDATE",
              [email],
              c,
            );
            if (existing) {
              id = String(existing.id);
              await run(
                "UPDATE users SET role='admin',status='active',password_hash=?,email_verified_at=UTC_TIMESTAMP() WHERE id=?",
                [passwordHash, id],
                c,
              );
            } else {
              const legacy = await one(
                "SELECT id FROM users WHERE id=1 AND email IS NULL",
                [],
                c,
              );
              if (legacy) {
                id = "1";
                await run(
                  "UPDATE users SET name='Administrator',email=?,role='admin',status='active',password_hash=?,email_verified_at=UTC_TIMESTAMP() WHERE id=1",
                  [email, passwordHash],
                  c,
                );
              } else {
                id = String(
                  (
                    await run(
                      "INSERT INTO users(name,email,role,status,password_hash,email_verified_at) VALUES ('Administrator',?,'admin','active',?,UTC_TIMESTAMP())",
                      [email, passwordHash],
                      c,
                    )
                  ).insertId,
                );
              }
            }
            await audit("admin_configured", "One-time setup", id, c);
            return (await one("SELECT * FROM users WHERE id=?", [id], c))!;
          });
        await startSession(u, "admin_setup");
        return go("/admin");
      }
      case "google": {
        required(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
          "Google sign-in is unavailable. Please use email verification.",
          503,
        );
        const state = randomBytes(32).toString("base64url"),
          verifier = randomBytes(48).toString("base64url"),
          challenge = createHash("sha256").update(verifier).digest("base64url");
        (await cookies()).set("xscene_oauth", seal({ state, verifier }, 600), {
          ...cookieOptions(),
          maxAge: 600,
        });
        const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        url.search = new URLSearchParams({
          client_id: process.env.GOOGLE_CLIENT_ID,
          redirect_uri: appURL() + "/auth/callback",
          response_type: "code",
          scope: "openid email profile",
          state,
          code_challenge: challenge,
          code_challenge_method: "S256",
          prompt: "select_account",
        }).toString();
        return NextResponse.redirect(url);
      }
      default:
        throw new AppError("Unknown authentication action.", 404);
    }
  } catch (e) {
    return authError(
      e,
      action === "admin"
        ? "/admin-login"
        : action === "setup"
          ? "/setup"
          : "/login",
    );
  }
}
export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  const { action } = await params;
  if (action !== "callback") return new Response("Use POST", { status: 405 });
  const jar = await cookies(),
    pending = unseal(jar.get("xscene_oauth")?.value);
  jar.delete("xscene_oauth");
  try {
    const url = new URL(request.url);
    required(
      pending?.state &&
        equal(pending.state, url.searchParams.get("state") || ""),
      "Google sign-in expired. Please try again.",
      403,
    );
    required(!url.searchParams.get("error"), "Google sign-in was cancelled.");
    const code = url.searchParams.get("code");
    required(
      code && code.length < 12000,
      "Google sign-in did not return a code.",
    );
    required(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
      "Google sign-in is not configured.",
      503,
    );
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        code,
        code_verifier: pending.verifier,
        grant_type: "authorization_code",
        redirect_uri: appURL() + "/auth/callback",
      }),
      signal: AbortSignal.timeout(15000),
    });
    required(
      response.ok,
      "Google sign-in could not finish. Please try again.",
      503,
    );
    const token = await response.json();
    required(
      typeof token.access_token === "string",
      "Invalid Google token response.",
      503,
    );
    const profileResponse = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: "Bearer " + token.access_token },
        signal: AbortSignal.timeout(15000),
      },
    );
    required(profileResponse.ok, "Google account could not be verified.", 503);
    const profile = await profileResponse.json();
    required(
      profile.email_verified === true &&
        typeof profile.sub === "string" &&
        profile.sub.length <= 255,
      "Use a verified Google email address.",
      403,
    );
    const u = await publicIdentity(emailAddress(profile.email), profile.sub);
    await startSession(u, "google");
    return go("/dashboard");
  } catch (e) {
    return authError(e);
  }
}
