import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser, csrfToken, unseal } from "@/lib/auth";
import copy from "./landing-copy.json";
export default async function Landing({
  error = "",
  notice = "",
}: {
  error?: string;
  notice?: string;
}) {
  const user = await currentUser();
  if (user) redirect(user.role === "admin" ? "/admin" : "/dashboard");
  const csrf = await csrfToken(),
    pending = unseal((await cookies()).get("xscene_otp")?.value),
    google = !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    );
  return (
    <>
      <link rel="stylesheet" href="/assets/css/login.css?v=node1" />
      <header
        className="site-header"
        dangerouslySetInnerHTML={{ __html: copy.header }}
      />
      <main>
        <section
          className="overview section"
          id="overview"
          aria-labelledby="overview-title"
          dangerouslySetInnerHTML={{ __html: copy.overview }}
        />
        <section
          className="pricing section"
          id="pricing"
          aria-labelledby="pricing-title"
          dangerouslySetInnerHTML={{ __html: copy.pricing }}
        />
        <section className="access section" id="login">
          <div className="access-intro">
            <div className="eyebrow">YOUR NEXT IDEA STARTS HERE</div>
            <h2>
              Welcome back.
              <br />
              Let&apos;s make
              <br />
              something move.
            </h2>
            <p>
              Log in to pick up where you left off.
              <br />
              Your scenes and references are ready when you are.
            </p>
            <span className="access-mark" aria-hidden="true">
              X<span>.</span>
            </span>
          </div>
          <div className="login-card">
            <div className="eyebrow">YOUR XSCENE WORKSPACE</div>
            <h3>{pending ? "Check your email" : "Welcome to XSCENE"}</h3>
            <p className="intro">
              {pending
                ? "Enter the verification code we sent to your email."
                : "Sign in or create your free account. No password needed."}
            </p>
            {error && (
              <div className="error" role="alert">
                {error}
              </div>
            )}
            {notice && (
              <div className="auth-notice" role="status">
                {notice}
              </div>
            )}
            {pending ? (
              <>
                <p className="otp-address">
                  Code sent to <b>{pending.email}</b>
                </p>
                <form method="post" action="/auth/verify">
                  <input type="hidden" name="csrf" value={csrf} />
                  <label htmlFor="code">Verification code</label>
                  <input
                    id="code"
                    name="code"
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="one-time-code"
                    required
                  />
                  <p className="micro">
                    Expires in 5 minutes. Maximum 5 attempts.
                  </p>
                  <button className="button primary">
                    Verify &amp; continue
                  </button>
                </form>
                <div className="otp-controls">
                  <form method="post" action="/auth/resend">
                    <input type="hidden" name="csrf" value={csrf} />
                    <button className="text-button">Resend code</button>
                  </form>
                  <form method="post" action="/auth/change">
                    <input type="hidden" name="csrf" value={csrf} />
                    <button className="text-button">Use another email</button>
                  </form>
                </div>
                <p className="micro">
                  Please wait at least 60 seconds before requesting another
                  code.
                </p>
              </>
            ) : (
              <>
                {google && (
                  <>
                    <form method="post" action="/auth/google">
                      <input type="hidden" name="csrf" value={csrf} />
                      <button className="button google-button">
                        <span className="google-g">G</span> Continue with Google
                      </button>
                    </form>
                    <div className="auth-divider">or continue with email</div>
                  </>
                )}
                <form method="post" action="/auth/email">
                  <input type="hidden" name="csrf" value={csrf} />
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    maxLength={255}
                    required
                    placeholder="you@example.com"
                  />
                  <button className="button primary">
                    Send verification code
                  </button>
                </form>
              </>
            )}
            <div className="signup">
              <p>
                New here? Your first verified sign-in creates your free account.
              </p>
              <a
                href="https://wa.me/6285813999233"
                target="_blank"
                rel="noopener noreferrer"
              >
                Need help? Contact us on WhatsApp
              </a>
            </div>
          </div>
        </section>
      </main>
      <footer>
        <a className="logo" href="#overview">
          XSCENE<span>.</span>
        </a>
        <span>Built for your next big idea.</span>
        <span>IDEA → SCENE → PROMPT → VIDEO</span>
      </footer>
    </>
  );
}
