# Recovery email verification activation

Migration 006 is installed on development fingerprint `868295d24a51`. Do not rerun migrations.

## Checked locally

- Production frontend build succeeds and contains the confirmation entry and verification API calls.
- Vercel routes `/api/*` to Express and other paths to the SPA. API entry imports the verification router.
- Both administrator and staff use `POST /api/login` with cookie sessions; the frontend defaults to same-origin `/api`.
- Six database-blocked route checks pass: missing login credentials 400, anonymous session and recovery-email update 401, and all three disabled verification endpoints 503.
- Both actual feature flags remain disabled. No database connection, account changes, or email sends were needed for these checks.
- Local APP_URL is localhost; it must not be used for public verification links.
- Resend key and syntactically valid sender are configured locally. Read-only domain lookup returned `restricted_api_key`: the sending-only key cannot prove domain verification or domain authorization. Do not replace it with a broader key merely for this check.

## Missing confirmations

1. User confirmed the canonical public origin: `https://districtlinebooking.com`. Live deployment inspection remains pending: normal HTTPS and forced IPv4 checks timed out from this environment, although public DNS resolves. This does not establish that the website is unavailable elsewhere.
2. User confirmed the Resend domain is Verified and the API key has sending access. Domain status was not independently readable with the sending-only key; exact deployed sender/key configuration still needs confirmation.
3. Controlled recipient confirmed privately by the owner. A guarded read-only check found exactly one active administrator using that normalized recovery email, with no other administrator or staff matches. No account update is required.
4. Live deployment includes this code and the required server environment variables; local presence does not establish deployed configuration.

## Exact proposed changes — NOT APPLIED

In the intended backend deployment environment:

```dotenv
APP_URL=https://districtlinebooking.com
ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=true
```

Retain the existing verified `RECOVERY_EMAIL_FROM`, secret `RESEND_API_KEY`, and development-project `DATABASE_URL` server-side. Do not expose these with VITE prefixes. Use `NODE_ENV=production` for a public deployment. Do not alter other recovery flags.

In the matching frontend build environment:

```dotenv
VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=true
```

Keep `VITE_API_BASE` unset for the configured same-origin Vercel deployment. A split deployment requires a confirmed API origin and cookie/CORS review first.

Deploy the current backend and rebuild/redeploy the frontend after authorized environment changes. The confirmation URL is `APP_URL/#verify-recovery-email?token=...`; opening it does not consume the token. Do not put a real token into deployment checks or logs.

## Activation order

1. Confirm missing deployment and provider information; inspect the live page/assets and API routing using safe requests. Do not invoke recovery request/confirm while enabled: rate-limit storage can write even for invalid input.
2. Obtain activation authorization; apply the exact settings above and redeploy. No migrations are needed.
3. Obtain separate real-email authorization with confirmed recipient, then use the controlled administrator to test delivery and explicit confirmation. Verify accurate status, expiry and single-use behavior without altering unrelated accounts.

Until these steps are complete: **not ready to use**. No live settings or flags have been changed by this preparation.

## Deployment fallback and local workflow

The latest public HTTPS check again timed out. This cannot distinguish an undeployed site from a network/reachability problem. No authenticated hosting connection or linked Vercel project is available locally to inspect deployed secrets or deployment contents.

For a public deployment, use the repository root, `npm run build`, output `dist`, and the existing `vercel.json` API/SPA rewrites. Confirm the deployed revision contains `server/admin-recovery-email-verification.js`, its router mount in `server/server.js`, and the frontend confirmation entry in `src/main.jsx`. Review the intended environment's existing `RECOVERY_EMAIL_FROM` and secret `RESEND_API_KEY` privately in the hosting dashboard; local values do not prove deployed values. Keep flags false during deployment preparation; deployment itself remains separately authorized. Set the confirmed public APP_URL only when configuration changes are approved. No migration step is needed.

Until public hosting is confirmed, the existing database-blocked route harness and mock-email verification tests are the safe local workflow. They suppress server startup initialization and cannot email or modify the source database. They have already passed and need not be rerun. Do not start the full server merely to inspect routes, as its startup performs initialization. A future actual local email test would require explicit activation/email authorization and a deliberately approved local APP_URL; localhost must never be used for publicly deployed links.

The shortest next step is read-only access to the actual hosting project's deployment and environment metadata (or equivalent dashboard confirmation) to establish the deployed revision, reachability and private sender configuration. Current activation is blocked by that deployment evidence, not by the controlled administrator account or Migration 006.
