# Configuration and operations

## Identity

Google uses OAuth state bound to an encrypted HttpOnly cookie and PKCE. Only a verified Google email can sign into a public user account. Administrator accounts cannot be accessed through the public Google/OTP flow.

Email codes expire in 5 minutes, allow 5 verification attempts, are hashed in MySQL and consumed once. Resend has a 60-second cooldown. Administrator sign-in is email/password only, with rate limits. PHP bcrypt hashes are supported; new bcrypt passwords are limited to 72 bytes.

Session cookies are HttpOnly, SameSite=Lax and Secure for HTTPS APP_URLs. Sessions are stored as opaque token hashes in MySQL and expire after 24 hours / 8 hours inactivity. State-changing browser requests require a session-bound CSRF token and reject foreign Origin headers.

Set TRUST_PROXY=true only when the app is reachable through a trusted reverse proxy that replaces forwarded client IP headers. Account/email limits apply in addition to IP limits.

## Data, uploads and plans

All project/library/history queries check account ownership. Private image URLs also check authorization; placing files in public/ would bypass these controls and is unsupported.

PNG, JPG and WebP images must pass extension, decoded format, dimensions and decoder checks. Maximum 10 MB / 50 megapixels; animations are excluded. Files are saved outside public/. Delete archives a library reference, preserving saved projects and history. Archived files still count toward storage.

Free creation access ends at March 1, 2027 00:00 Asia/Jakarta. Existing work remains viewable. Administrator and active premium accounts may continue creating. The admin dashboard controls plan limits and model availability.

The app uses persistent local storage, one application replica and MySQL. Shared S3/R2 storage and horizontal scaling are not included in this release. Private multi-user access works on the provided single-instance deployment.

## Secrets and setup

Keep AUTH_SECRET stable after deployment. Rotating it expires pending OAuth/OTP cookies and changes CSRF tokens; authenticated sessions must refresh their forms. Use a separate secret SETUP_TOKEN for first-admin provisioning. Remove SETUP_TOKEN after setup if desired; /setup also closes whenever a provisioned administrator exists.

The one-time setup and interactive CLI are administrator provisioning tools. Public registration always creates an ordinary free user.

## Backup and monitoring

Back up MySQL and STORAGE_DIR together, keep an off-server copy, and periodically test restoration. Dokploy's database backups plus a storage-volume backup are recommended. The admin metadata export excludes credentials/sessions and does not contain image bytes or replace a full backup.

Use `/api/health` for database/application availability. Inspect Dokploy logs for failures; the application avoids logging credentials and OTP codes. Monitor storage usage, memory, failed logins and email delivery.

Visitor analytics remains opt-in. No consent banner is displayed on the public page, so new visitors are not automatically enrolled. Account signups and authenticated operational events are recorded for administration. The overview distinguishes consented visitors from registered accounts.

Expired sessions, OTP challenges and rate buckets can be pruned regularly using `npm run maintenance`. Image files are not removed by that command.

## Prompt behavior

The generator is a deterministic structured prompt builder, not an external AI inference endpoint. Uploads are references; the app does not interpret image content or generate actual videos. Model names describe handoff instructions, not connected paid model APIs.

The previous discussions about further Simple UX refinements are recommendations, not extra changes in this Node port. The implemented baseline is the latest PHP feature release, including its style catalog and neon loading animation.
