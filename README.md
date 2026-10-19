# District Line Bus Booking

## Run locally

1. Create a PostgreSQL database and set `DATABASE_URL` in the root `.env` file. For this app, the Supabase schema is in `server/migrations/001_initial_postgres.sql`; startup applies it automatically.
2. Install dependencies with `npm ci`.
3. Start the frontend and API together with `npm run dev`.
4. Open the Vite address shown in the terminal. Local development seeds demo accounts (`admin_kt` / `admin123` and `staff_kt` / `staff123`) and demo buses.

## Deploy to Vercel

The React frontend builds as static files in `dist`; Express API routes run as Vercel Functions from `api/`. The Vercel routing config is in `vercel.json`. Uploaded images use a Supabase Storage bucket rather than the function's temporary filesystem.

1. Push the project to a private Git repository and import it into Vercel. Keep `.env` out of Git; `.gitignore` excludes it.
2. In Vercel Project Settings, use the repository root, `npm run build` as the build command, and `dist` as the output directory. `vercel.json` already defines these values.
3. In Supabase Storage, create a public bucket named `district-line-uploads` (or choose another name and set `SUPABASE_STORAGE_BUCKET` to match). Public access means uploaded images can be viewed by anyone with their URL; upload and delete operations remain server-side.
4. Add these in Vercel Project Settings → Environment Variables. Use **Secret** visibility for credentials and select the intended environments:
   - `DATABASE_URL`: Supabase transaction-pooler URI from the Connect panel.
   - `JWT_SECRET`: a random secret of at least 32 characters.
   - `ADMIN_USERNAME`, `ADMIN_PASSWORD` (at least 12 characters), and optionally `ADMIN_FULL_NAME` for the first production administrator.
   - `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `SUPABASE_STORAGE_BUCKET`. Mark the service role key as Secret; never expose it with a `VITE_` prefix.
   - `SMS_USER_ID`, `SMS_API_KEY`, `SMS_SENDER_ID`, and `SMS_HOTLINE` if SMS sending is required. Keep SMS credentials Secret.
   - `NODE_ENV=production` and `DATABASE_SSL=require`.
5. Deploy a Preview first. Confirm `/api/health`, login, booking, cargo, and image upload. Then deploy Production. Vercel environment-variable changes apply to new deployments, so redeploy after changing them.

Vercel Functions use temporary local storage. Do not switch uploads back to local filesystem paths. The server applies the PostgreSQL schema at startup; production does not seed demo accounts or buses. Set a strong production admin password before the first production deployment.

Production mode does not seed demo accounts or demo buses. It refuses to start without a strong JWT secret and initial admin password. If the database still has the default `admin_kt` / `admin123` account, set `ADMIN_PASSWORD` (and optionally `ADMIN_USERNAME`) to rotate it on startup.

Never commit `.env`, database credentials, or uploaded user files. Use `.env.example` as a variable checklist, and set real secrets in your host's secret/environment settings. Existing SQLite records must be imported separately; adding `DATABASE_URL` does not copy them.

## Checks

- `npm test` runs the bus-duty API test.
- `npm run lint` runs Oxlint.
- `npm run build` creates the production frontend in `dist/`.
