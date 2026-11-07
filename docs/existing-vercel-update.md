# Update the existing District Line Vercel deployment

Target domain: `districtlinebooking.com`. Never create or import another project.

## Prepared locally

- Git remote: `https://github.com/charangopi172-max/District-Line-Internal-bus-booking-system`.
- Local branch: `main`, tracking `origin/main`; current base `43e35f6`.
- Updated frontend, API router and confirmation entry are present, including required untracked source files. They are not committed yet.
- Production build passed with `VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=false`. Backend and API handler syntax checks passed.
- Existing Vercel configuration uses `npm run build`, output `dist`, API rewrite `/api/:path*` to `/api?path=:path*`, followed by the SPA fallback to `/index.html`.
- Local database configuration matches approved development fingerprint `868295d24a51`; provider key and sender are present. Both local verification flags are disabled.
- Local APP_URL is still localhost. Do not upload the local `.env` or use it as production configuration.

## Blocking checks before publishing

No Vercel authentication or local project link is available. In the existing Vercel project, confirm domain assignment, connected repository, Production Branch, and deployment revision. Do not assume the production branch is main merely because the local branch is main.

Privately compare the deployed DATABASE_URL with the approved development project and confirm existing RECOVERY_EMAIL_FROM and secret RESEND_API_KEY. Their deployed values are not visible locally. Preserve all existing session, storage, SMS, CORS and administrator settings.

Inspect production startup compatibility before release: `seedDatabase()` can create/rename a bootstrap administrator or deactivate a legacy staff account with the demo password. Confirm those branches cannot apply to the existing accounts under the deployed ADMIN_USERNAME settings, or prepare an explicitly reviewed startup fix. Do not start the full server against the source database as a diagnostic. Startup checks registered migration versions 1–4 and skips them when installed; 005/006 are not in that registry. Do not execute any migration command.

Review the release diff deliberately: the workspace also contains changes to booking-related UI, staff management and other files. Do not use `git add .` or include backup artifacts, logs, local credentials, or unrelated changes without reviewing scope. Ensure all required new production modules/styles/assets are included in the selected commit.

## Exact intended initial-deployment settings — not applied

```dotenv
APP_URL=https://districtlinebooking.com
ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=false
VITE_ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=false
```

Retain the existing secret database/provider configuration. Correct APP_URL only after approval. The VITE flag must be false in the Vercel build environment, not just the local shell. No verification email may be sent.

## Publish only after explicit approval

1. Open the existing project's Settings → Domains and Settings → Git; record its project/team and confirmed production branch.
2. Confirm the environment and startup checks above, and review the exact selected release diff.
3. Obtain approval for the selected commit, any APP_URL/disabled-flag environment changes, and publication to that existing project.
4. Commit the reviewed production source files, including new modules. If the project's confirmed production branch is `main`, the publish command is:

   ```powershell
   git push origin HEAD:main
   ```

   This command can immediately trigger production deployment. If the existing production branch differs, use that confirmed branch instead. Alternatively, merge the reviewed PR into the project's configured production branch. Do not create another Vercel project.
5. In that same Vercel project, confirm the resulting deployment is Ready and serves the existing domain. If auto-deploy is disabled, deploy the selected commit using the existing project's deployment controls with its verified environment settings.
6. After publication, inspect the page/assets for the confirmation entry and verification API calls, and check anonymous GET `/api/recovery-email-verification/status` returns the expected disabled response. Do not call recovery POST endpoints or submit successful logins without approval for their database writes. These public checks do not prove full administrator/staff login or booking behavior.
7. Prepare activation separately: change both verification flags to true and rebuild/redeploy only after approval; email delivery to the confirmed controlled administrator requires separate authorization. No further migration is needed.

Status: local build/routing ready; publication blocked by unverified hosting target/environment, release scope, and startup account-preservation checks. Nothing has been published or activated.
