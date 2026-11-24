# Deploy XSCENE with GitHub + Dokploy

For the v1.0.1 deployment repair and a private File Mount fallback when runtime
variables do not reach the container, start with `DEPLOY-FIX-ID.txt` at the
repository root. That guide includes the observed failures, expected release
markers, mount paths, and the current production-domain example.

## 1. Upload the source

Extract the delivered ZIP on your computer. Upload its contents directly to the root of your GitHub repository, normally `xscene`, on branch `main`.

The repository root must contain `package.json`, `package-lock.json` and `Dockerfile`. Do not wrap everything inside an extra folder. Include `.dockerignore` and `.gitignore`; omit `.env`, uploads, `node_modules` and `.next`.

## 2. Create MySQL in Dokploy

Create a MySQL service in the same Dokploy project/network as the application. Set a database name, a dedicated database user and strong passwords. Save the internal host/service name and internal port from Dokploy.

Use that service's **internal** hostname for `DB_HOST`. `localhost` inside the application container refers to the application itself, not a separate MySQL container. Do not publish the database to the public internet.

If importing PHP data, restore the database and files into staging first; follow MIGRATION.md before continuing.

## 3. Configure the application source

- Provider: GitHub
- Repository: your private `xscene` repository
- Branch: `main` (or your actual source branch)
- Build Path: `/`
- Build Type: Dockerfile
- Dockerfile Path: `Dockerfile`
- Docker build context: repository root (`.` if this field is requested)
- Watch Paths: empty initially
- Submodules: off
- Trigger: On Push for the selected branch

## 4. Configure a persistent volume

In the application mounts/volumes settings, create a named volume mounted at:

```
/data/storage
```

Keep that volume when redeploying. The application runs as UID/GID **1001**. If you use a bind mount, give that user write access to the mounted directory.

Do not store uploads in `public/` or the container's temporary filesystem. Back up this volume alongside MySQL. Use one application replica with this local-volume configuration.

## 5. Add environment variables

Use `.env.example` as the field list. Required values include:

```
NODE_ENV=production
APP_URL=https://staging.xscene.rickngrowth.click
DB_HOST=YOUR_DOKPLOY_INTERNAL_MYSQL_HOST
DB_PORT=3306
DB_NAME=YOUR_DATABASE
DB_USER=YOUR_DATABASE_USER
DB_PASSWORD=YOUR_DATABASE_PASSWORD
AUTH_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
SETUP_TOKEN=ANOTHER_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
STORAGE_DIR=/data/storage
AUTO_MIGRATE=true
TRUST_PROXY=true
```

Generate secrets on a trusted computer using `npm run secrets`, or your password manager. Paste the output into Dokploy Environment, not GitHub.

For OTP email choose one transport:

- Resend: `MAIL_TRANSPORT=resend`, a verified-domain `MAIL_FROM`, and `RESEND_API_KEY`.
- SMTP: `MAIL_TRANSPORT=smtp`, `MAIL_FROM`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`. Gmail SMTP requires its supported authentication setup, such as an app password; do not enter your ordinary Google account password.

For Google sign-in set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`. Add these to your Google OAuth web client:

- Authorized JavaScript origin: your `APP_URL` origin.
- Authorized redirect URI: **`https://YOUR_DOMAIN/auth/callback`**.

The Node callback path differs from the old PHP `/google-callback`. Register both staging and production callback URLs if both will be used.

## 6. Domain and deployment

Point your staging domain's DNS to the VPS. Add the domain in Dokploy, enable HTTPS and forward traffic to container port **3000**. Keep `APP_URL` exactly aligned with that HTTPS origin, without a path or trailing login route.

Click Deploy. The build runs `npm ci`, checks startup-script syntax and records
startup-file fingerprints, then builds Next.js. At startup the container checks
the fingerprint and required runtime configuration, applies the included
migrations, then starts Node on `0.0.0.0:3000`.

Check deployment logs and `/api/health`. A healthy response in this repair is
`{"status":"ok","release":"1.0.1-dokploy-fix"}`. Startup configuration and
migration failures stop the container with a diagnostic log; if the HTTP server
is running but the database is unavailable, the health route returns HTTP 503
without exposing credentials.

## 7. Create the administrator

Open:

```
https://YOUR_DOMAIN/setup
```

Enter `SETUP_TOKEN`, your administrator email and a new password of 14–72 bytes. Setup becomes unavailable after an administrator with a password exists.

Sign in at:

```
https://YOUR_DOMAIN/admin-login
```

Administrator login uses email and password, with no email OTP. Public users use `/login` and Google/email verification. If an imported PHP administrator already exists, use its existing email/password instead of `/setup`.

To reset a password using the container terminal:

```
npm run admin:create -- admin@example.com
```

The password prompt is interactive and hidden. Do not put a password in the command or GitHub.

## 8. Verify before moving the main domain

Test public email OTP, Google login with your real configured client, administrator login, upload, each account's private library, generation, saved projects, template upload/publication and mobile layout. Redeploy once and verify uploaded images still exist.

Back up and restore the database plus storage volume on staging before switching the main domain. Keep the old PHP site available until the final data transfer is complete. Avoid accepting writes on both versions during the final cutover.

## Docker Compose alternative

`compose.yaml` provides an application and MySQL for local or single-server use. Add `MYSQL_ROOT_PASSWORD` to your private `.env`, along with the other required values, then run `docker compose up --build -d`.

The Compose application port is bound to `127.0.0.1:3000`. For an internet-facing deployment use a reverse proxy with HTTPS; Dokploy Application mode above provides that routing.
