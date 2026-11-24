# Validation report

Validated November 24, 2026.

## Automated code checks

- Production Next.js build and strict TypeScript checks passed.
- 79 unit tests passed: all supplied styles in both modes, all five camera sequences across supported durations, positive/negative output, silent scenes, outfits, product/character consistency, frame validation, safe template settings, cookie sealing/tampering/expiry, path containment, bounded body reads, email validation and PHP bcrypt compatibility.
- `npm audit --omit=dev --audit-level=high`: no vulnerabilities reported by the configured registry at validation time.

## Browser and real database tests

Tested a production build with a disposable MariaDB database, two ordinary accounts and an administrator:

- Three-section public page, Google/email controls, separate admin login and one-time setup lockout.
- Real SMTP delivery through a local test SMTP server, six-digit OTP verification and public user creation.
- Direct administrator password login without email OTP; session/CSRF handling.
- Product/character/background uploads, 14 style controls, No Dialogue with blank script, both outfit choices and Simple/Advanced switching.
- Actual generated prompts, saved projects, custom frame scripts, captions, instrumental music and shot labels.
- Neon loader and five-second minimum animation.
- Unauthorized project/image/library access and cross-account deletion rejection; archived references still usable by their saved project.
- Template draft/premium visibility, JSON validation, image attachment, publication, private per-account reference copying and duplication.
- All ten administrator screens.
- Workspace widths 320, 375, 390, 650 and 720 pixels, plus mobile administrator layout.
- No browser script errors in the tested flow.

## Google verification boundary

Verified authorization redirect structure, state binding, PKCE, encrypted HttpOnly flow cookie, invalid callback rejection and foreign-origin form rejection. A live Google account exchange requires the owner's client credentials and registered deployment callback; no live customer Google account was used for these local tests.

## Deployment verification

Docker build/start and persistent-volume checks are recorded in DOCKER-VALIDATION.txt included with the release. The managed test environment required its HTTPS proxy CA to be mounted as a temporary BuildKit secret for npm downloads. That CA and the adapted test-only Dockerfile are not part of the source release. TLS verification stayed enabled.

Live hosting, real-domain DNS/HTTPS, actual Resend delivery and the owner's real Google OAuth client must be verified after entering production configuration. This source release has not been pushed to the user's GitHub or deployed to their VPS.
