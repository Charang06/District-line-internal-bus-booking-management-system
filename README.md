# District Line Bus Booking

## Run locally

1. Create a PostgreSQL database and set `DATABASE_URL` in the root `.env` file. The Supabase schema and additive migrations are in `server/migrations/`; startup applies unapplied versions automatically.
2. Install dependencies with `npm ci`.
3. Start the frontend and API together with `npm run dev`.
4. Open the Vite address shown in the terminal. Local development seeds demo accounts (`admin_kt` / `admin123` and `staff_kt` / `staff123`) and demo buses.
5. For local admin email recovery, set `RESEND_API_KEY`, `RECOVERY_EMAIL_FROM`, and `APP_URL=http://localhost:5173` in the root `.env`. Use a sender verified in Resend; `APP_URL` must match the browser origin used to open the app. `APP_URL` only sets the reset link destination; it does not configure Resend delivery or affect recovery rate limits.

## Deploy to Vercel

The React frontend builds as static files in `dist`; Express API routes run as Vercel Functions from `api/`. The Vercel routing config is in `vercel.json`. Uploaded images use a Supabase Storage bucket rather than the function's temporary filesystem.

1. Push the project to a private Git repository and import it into Vercel. Keep `.env` out of Git; `.gitignore` excludes it.
2. In Vercel Project Settings, use the repository root, `npm run build` as the build command, and `dist` as the output directory. `vercel.json` already defines these values.
3. In Supabase Storage, create a public bucket named `district-line-uploads` (or choose another name and set `SUPABASE_STORAGE_BUCKET` to match). Public access means uploaded images can be viewed by anyone with their URL; upload and delete operations remain server-side.
4. Add these in Vercel Project Settings → Environment Variables. Use **Secret** visibility for credentials and select the intended environments:
   - `DATABASE_URL`: Supabase transaction-pooler URI from the Connect panel.
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD` (at least 12 characters), and optionally `ADMIN_FULL_NAME` for the first production administrator. `ADMIN_PASSWORD` initializes a new account only. Existing PostgreSQL password hashes remain authoritative across restarts and deployments.
   - `RESEND_API_KEY`, `RECOVERY_EMAIL_FROM`, and `APP_URL` for email recovery. Verify the sender domain in Resend and use an address on that domain. Set `APP_URL` to the canonical HTTPS production origin (for example `https://booking.example.com`), not a Vercel preview URL. Keep these variables server-side; never expose them with a `VITE_` prefix. Redeploy after changing Vercel environment variables.
   - `CORS_ORIGIN` if the frontend and API use different origins. `SESSION_COOKIE_SAME_SITE` defaults to `lax`; use `none` only for a cross-site HTTPS deployment with an explicit origin allowlist.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`. Mark the service role key as Secret; never expose it with a `VITE_` prefix.
   - `SMS_USER_ID`, `SMS_API_KEY`, `SMS_SENDER_ID`, and `SMS_HOTLINE` if SMS sending is required. Keep SMS credentials Secret.
   - `NODE_ENV=production` and `DATABASE_SSL=require`.
5. Deploy a Preview first. Confirm `/api/health`, login, booking, cargo, and image upload. Then deploy Production. Vercel environment-variable changes apply to new deployments, so redeploy after changing them. Startup applies database migration 4, adding `users.recovery_email` without changing existing user or business rows.

Vercel Functions use temporary local storage. Do not switch uploads back to local filesystem paths. The server applies the PostgreSQL schema at startup; production does not seed demo accounts or buses. Set a strong production admin password before the first production deployment.

Production mode does not seed demo accounts or demo buses. It requires an initial admin password to create the first admin. Login uses persistent PostgreSQL-backed sessions in an HttpOnly cookie; the cookie lasts at most eight hours and expires after 30 minutes idle. The server stores only a hash of the session identifier. `ADMIN_PASSWORD` is a bootstrap value and is never used to replace an existing production password hash.

After the first admin signs in, register the recovery email in **Admin profile → Password recovery email**. The Forgot password flow sends a single-use reset link only to this stored address through Resend. The random token expires after 20 minutes; PostgreSQL stores only its SHA-256 hash. Recovery requests are rate-limited; a successful reset updates the persistent PostgreSQL bcrypt hash, revokes all admin sessions, invalidates outstanding links, and records an audit event. Staff should contact the administrator for password resets. If `RESEND_API_KEY`, `RECOVERY_EMAIL_FROM`, or `APP_URL` is missing, the API returns a configuration error naming the required variables instead of claiming an email was sent.

If Resend is unavailable or not configured, the UI reports that email recovery requires owner assistance. The owner must verify the administrator through a separate trusted channel. To prepare SQL without connecting to the database, set `RECOVERY_NEW_PASSWORD` through a secure secret manager and set `RECOVERY_SQL_OUTPUT` to a restricted temporary file path, then run `node scripts/owner-admin-recovery.mjs <admin-username>`. Inspect and execute the generated transaction in an owner-controlled PostgreSQL session. It updates only an active admin, revokes their sessions, invalidates their outstanding reset links, and records an audit event. Never use a shared/default password or send credentials by email. Clear the secret-manager variable and securely delete the SQL file after use.

Never commit `.env`, database credentials, or uploaded user files. Use `.env.example` as a variable checklist, and set real secrets in your host's secret/environment settings. Existing SQLite records must be imported separately; adding `DATABASE_URL` does not copy them.

## Checks

- `npm test` runs the isolated unit tests. The legacy bus-duty integration harness is skipped because it targets an ignored SQLite path and writes to PostgreSQL.
- `npm run lint` runs Oxlint.
- `npm run build` creates the production frontend in `dist/`.
