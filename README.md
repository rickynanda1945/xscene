# XSCENE — standalone Node.js application

A private AI video prompt workspace built with **Next.js, TypeScript and MySQL**. Deploy from a private GitHub repository using Dokploy and the included Dockerfile. WordPress and PHP are not required.

## Included

- Three-section English landing/sign-in page with early access free through February 28, 2027 (Asia/Jakarta).
- Google OAuth with state and PKCE, passwordless email OTP, separate password-only administrator login.
- One-time browser administrator setup at `/setup`, protected by your secret `SETUP_TOKEN`.
- Account-private projects, uploads and prompt history; character, product, brand/logo and background libraries.
- Simple / Advanced workspace, all 14 supplied positive/negative visual-style presets, first-to-last-frame product/character consistency, reference/random outfit, optional script with No Dialogue, five Simple camera sequences, Advanced frame scripts, captions, continuity and audio directions.
- Five-second minimum red neon AI loading animation and mobile bottom navigation.
- Administrator user/plan management, template JSON import and image upload, publication/access tiers, asset archiving, session revocation, logs, announcements and metadata export.
- Private filesystem storage on a persistent volume; uploaded files are authorized on every request.

XSCENE builds structured prompt instructions. It does not generate videos, send assets to external video tools or automatically analyze the contents of uploaded images. Use the references and prompt in your chosen video tool.

## Quick start

Requires Node.js 24 and MySQL 8 / compatible MariaDB.

1. `npm ci`
2. Copy `.env.example` to `.env`, configure a local MySQL database and set `APP_URL=http://localhost:3000`.
3. Run `npm run secrets`, then copy the generated `AUTH_SECRET` and `SETUP_TOKEN` values into your private `.env`.
4. `npm run db:migrate`
5. `npm run dev`
6. Open `/setup`, enter your setup token and create the first administrator. Then sign in at `/admin-login`.

For production, use the Dockerfile and follow [Dokploy installation](docs/DOKPLOY.md). The container runs migrations automatically unless `AUTO_MIGRATE=false`.

## Commands

- `npm test` — prompt/validation/security checks.
- `npm run typecheck` — TypeScript checks.
- `npm run build` — production compilation.
- `npm run start` — production Next server from a local build.
- `npm run db:migrate` — repeatable migrations, with a database lock and existing-row preservation.
- `npm run admin:create -- admin@example.com` — interactive administrator creation/password reset; password input is hidden.
- `npm run secrets` — generate new configuration secrets locally.

## Documentation

- [Step-by-step Dokploy setup](docs/DOKPLOY.md)
- [Moving PHP V4 data](docs/MIGRATION.md)
- [Configuration, security and operational limits](docs/OPERATIONS.md)
- [Validation report](docs/VALIDATION.md)

Never commit `.env`, real credentials, database exports or customer uploads. The example environment contains placeholders only. Keep the repository private while preparing your deployment.
