# District Line isolated staging setup (prepared, not executed)

**Status: preparation only.** No Supabase/Vercel project was created or connected, no secrets were copied, no migrations or fixture inserts were run, and nothing was deployed. Production must remain untouched. The owner must approve the target projects, setup window and fixture cleanup plan before execution.

**Phase 4 update:** the owner selected reuse of an existing test project. Repository evidence identifies a separate populated restore project, but it contains a restored copy of application data and is not safe for synthetic test fixtures. The earlier “create new project” path is superseded pending an owner-identified clean isolated target. See the [existing-project assessment](phase-4-existing-project-review.md). Do not use the restore project for staging.

## Safety goals

Staging must be a separate application environment backed by a new empty Supabase project and a separate Vercel project. Never restore/clone production data into staging for this workload. Never use the existing root `.env` for staging commands: prior safe inspection showed that local file points to the documented production Supabase project. Use a clean, separately approved checkout/environment with only staging credentials.

The app reads its database URL at startup and does not have an internal staging-to-production DB allowlist. Separation therefore depends on using a distinct staging Supabase project, never placing production credentials in the staging Vercel project or process environment, and confirming both project identities before deploying. The host-name guard in the k6 script is an additional accidental-target check, not proof of the backend database identity.

## 1. Database schema and initialization

### Migration inventory

Normal explicit migration startup registers only:

| Version | File | Effect |
|---:|---|---|
| 1 | `server/migrations/001_initial_postgres.sql` | Application schema, constraints, indexes, booking seat uniqueness and a trigger. It also inserts two bus-contact rows with phone-like values. |
| 2 | `server/migrations/002_auth_sessions.sql` | Persistent hashed-cookie sessions and indexes. |
| 3 | `server/migrations/003_password_recovery.sql` | Recovery tokens, rate-limit table/index, recovery email column. |
| 4 | `server/migrations/004_admin_email_recovery.sql` | Baseline administrator recovery-email support. |

Versions 5 and 6 (`005_admin_username_recovery.sql`, `006_admin_recovery_email_verification.sql`) are manual, unregistered and feature-gated. They are not automatically needed for the 10–50 staff workload, but excluding them means staging will not match deployments where either recovery feature is enabled. Migration 005 creates administrator username-recovery tokens/limits, indexes and an invalidation trigger; it records version 5 and is required only if `ENABLE_ADMIN_USERNAME_RECOVERY=true`. Migration 006 adds verified recovery-email state, canonical/unique email constraints and verification/limit tables; it records version 6 and is required only if `ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=true`. It builds on the v4 recovery-email column. Both need separate compatibility/security review and explicit staging migration approval before use. Do not enable the matching frontend flags without the corresponding backend migration.

The active production feature flags could not be verified from this workspace, so whether staging must include versions 5/6 to match production is unresolved. For the initial isolated performance staging target, the safest minimal profile is versions 1–4 with both optional recovery features off; confirm that this reduced feature scope is acceptable before creation. If functional parity for either recovery feature is required, add the relevant manual migration to a separate approved staging migration plan rather than silently omitting or applying it.

Versions 8 and 9 (login throttling and MFA) are prepared candidates, not registered. The source bundle named `scripts/security/007_internal_application_security.sql` is a separate production-specific security operation; its header identifies the production project and expects schema version 6 with 7 absent. **Do not run or adapt it for staging.** Staging must get its own reviewed table-access policy and verification.

### Safe future initialization sequence

1. Owner creates a new Supabase project specifically for staging and confirms it is empty. Record the project reference/fingerprint through a trusted owner channel; compare it with the production project and the separate populated restore project. Stop if it matches either or if any application rows already exist.
2. In project setup, choose the Data API option that does not automatically expose new tables. Supabase documents the setting for projects created under its 2026 Data API change; still verify actual role/table/sequence grants after initialization. Keep the District Line browser pointed only at Express. The frontend does not need a Supabase service key.
3. Create a separate staging-only database credential. Prefer a dedicated least-privilege runtime role after its grants are reviewed; do not reuse the production `DATABASE_URL` or owner credential. The current application baseline has historically used a powerful role, so creating a least-privilege role may require a separate reviewed SQL plan before deploying. Do not assume a missing Data API grant makes the SQL runtime role least privilege.
4. Use an isolated, clean local process with only the staging database URL. The current checkout's `.env` is production-targeted and must not be loaded. Confirm `VERCEL`/`VERCEL_ENV` are absent for the one-time local maintenance command and `NODE_ENV` is non-production; the maintenance helper rejects hosted/production operation.
5. Compute the `DATABASE_MAINTENANCE_TARGET_SHA256` from the staging URL with the existing `databaseTargetDigest` helper. This digest covers hostname, port, database path and username, not the password. Keep the URL/password in the approved secret manager; print/report only the digest and non-secret project identity.
6. After separate owner approval, set only the exact migration marker `DATABASE_MIGRATION_APPROVAL=apply-001-004-to-approved-disposable-target` and run the migration operation `node server/server.js --approved-database-operation=migrate` in that isolated environment. This applies registered versions 1–4 in a transaction. It does not seed users or buses. Do not set a seed marker or run `--approved-database-operation=seed`.
7. Migration 001 inserts two starter `bus_contacts` rows containing phone-like values. Before staff use, inspect and replace/deactivate those rows in staging using synthetic placeholders. They are not passenger records, but must never be used for messaging.
8. Verify schema versions 1–4, expected tables/indexes/constraints, and that `anon`/`authenticated` cannot read or mutate application tables through the Data API. Review default and explicit grants, RLS state, sequences, and runtime role permissions. If the project’s settings/grants do not meet the expected deny-by-default outcome, do not deploy; prepare a staging-specific hardening plan and obtain approval.
9. Remove the one-time target digest and migration marker from the process/secret store. Run the API in its normal read-only baseline mode only after verifying that the staging runtime URL still identifies the staging project.

Do not use the built-in seed routine: source inspection shows it creates predictable `admin123`/`staff123` accounts and demo bus/crew contact values. Create synthetic accounts and records only through a dedicated staging fixture plan below, after approval.

## 2. Separate Vercel staging API

Use a **new Vercel project** connected to the approved repository, not a Preview deployment that inherits the production project's environment variables. Vercel configuration in `vercel.json` already builds Vite to `dist`, routes `/api/*` through `api/`, includes the migration SQL and pinned CA helper, and selects `sin1`; it does not need a production configuration edit for this plan.

1. Owner creates a separately named Vercel project (for example `district-line-staging`) and links a protected staging branch. Confirm its Git production branch/deployment policy cannot promote a production deployment or attach the production domain.
2. Assign a dedicated staging HTTPS hostname. Keep access restricted to the test team. If Vercel Deployment Protection is enabled, plan an authorized test access method; do not publish a bypass secret in this repository or test output.
3. Add only the values listed in [staging.env.template](staging.env.template) to this staging project's environment. Confirm any team-level shared variables are not injecting production database, storage, Resend or SMS secrets. Do not pull production env into a local file.
4. Set `CORS_ORIGIN` to the exact staging origin; keep same-origin API routing where possible and `SESSION_COOKIE_SAME_SITE=lax`. Keep all recovery, MFA, and SMS features disabled.
5. Use a separate Vercel staging project's deployment environment and its own domain. Set `NODE_ENV=production` for deployed runtime cookie/TLS behavior. Vercel supplies its own runtime markers. The local migration operation is separate and must not be performed by a Vercel function.
6. Deploy only after the staging database is initialized, grants are checked, and stage-only credentials are reviewed. This step is pending approval; no deployment occurred.

## 3. Staging-only environment template

Use the accompanying template as a checklist, not as a root `.env` file. All credentials are intentionally blank. Never copy values from production, `.env`, team-wide production settings, or the populated restore project. Enter secrets only into the staging project’s secret environment settings after approval. The app must fail closed if `DATABASE_URL` is absent.

Storage credentials are omitted by default: in Vercel, uploads then fail before making a storage request. If image-upload testing is required, create a separate staging bucket and supply only that project's URL and service-role key. The app's current storage code uses a service-role key for writes/deletes and generates public image URLs, so only synthetic images may be uploaded; never point it at the production bucket.

## 4. Synthetic account and fixture plan

Minimum for the planned 50-VU test: **50 unique synthetic staff accounts**, one account per VU. Do not reuse real staff accounts or a common password.

- Usernames: `stage_load_001` through `stage_load_050`.
- Display names: `Synthetic Staff 001` through `Synthetic Staff 050`.
- Unique, random, staging-only passwords generated/stored in a secret manager; persist only bcrypt hashes in `users.password_hash`. Never print passwords or commit a JSON credential file.
- All 50 can view `home`, `log`, `dashboard`, and `customers` for the current read workload. Give only the subset required for a specific test the additional `accounts` view or passenger/cargo manage grants. Keep Staff Management admin-only. Save the intended permission matrix with the run record.
- Optionally create one separate staging-only administrator for administrative checks; not needed for the baseline VU script. No production admin profile, recovery email, or password is copied.
- Keep test contacts synthetic. Disable delivery (next section); do not enter real passenger contact details. Use synthetic names and tagged references such as `STAGE-BOOKING-*`.

Suggested minimal representative fixture set, created only after approval:

| Fixture | Quantity and purpose |
|---|---|
| Bus | 1 active synthetic bus, e.g. `STAGE-BUS-001`, using the supported 49-seat layout. |
| Read trip | 1 scheduled trip on an owner-selected future date and supported route (`KTY_CMB` or `CMB_KTY`) for reads/dashboard. Set `STAGING_TRIP_ID` and `STAGING_TRIP_DATE` to this exact record. |
| Concurrency trip | 1 separate scheduled synthetic trip with 49 known-free seats reserved for controlled 2/10-way same-seat and different-seat tests. Reset between test cases. |
| Cancellation fixture | 1 confirmed synthetic booking on a separate seat/trip, reserved for the race/rollback plan. |
| Read bookings | 20–40 synthetic bookings across the read trip with unique seats and synthetic names. Repeat synthetic contacts across two trips only if customer analytics needs non-empty repeat-customer output. |
| Cargo | 10–20 synthetic cargo rows linked to the read trip/date for list/filter workload. |
| Accounts (optional) | A few synthetic expense/revenue rows only if authorized Accounts-view load is included. Do not create or copy live financial records. |

Do not use the application startup seed as a shortcut. The fixture generator should be staging-only, require an exact project fingerprint, tag every row with known prefixes, and refuse unknown/non-empty targets. It must create users with bcrypt hashes and current permission JSON, create only the above future-date trips, and save only non-secret fixture IDs/counts to the run manifest. This generator is a future approved artifact; it was not created or executed here.

## 5. External service isolation

### SMS

Set `SMS_PROVIDER=disabled` and leave `SMS_USER_ID`, `SMS_API_KEY`, and `SMS_SENDER_ID` blank. `sendSms()` checks provider and credentials before making a fetch; without them, it returns locally as not configured. Do not call SMS confirmation/cancellation endpoints during load or fixture validation. SMS balance requests must also remain out of scope. Confirm the staging `/api/health` reports SMS `configured: false` before staff tests.

### Email and recovery

Leave `RESEND_API_KEY` and `RECOVERY_EMAIL_FROM` blank; keep `ENABLE_ADMIN_USERNAME_RECOVERY=false`, `ENABLE_ADMIN_RECOVERY_EMAIL_VERIFICATION=false`, and corresponding `VITE_` flags false. Keep MFA enrollment/build flags off and `ADMIN_MFA_MODE=off` unless separately reviewed. The password recovery endpoint checks email configuration before issuing/delivering mail; username/recovery-email services report not ready without sender credentials. Do not test email delivery in this stage plan.

### Storage and production APIs

Omit `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` if image behavior is not required. If enabled later, both must point to the new staging project and a distinct staging bucket. Do not put any production Supabase anon, service-role, database, Resend, or SMS secret in this Vercel project or its team-wide environment.

These controls prevent the inspected app integrations from authenticating to the real messaging/storage services when their credentials are absent or staging-scoped. The repository does **not** define an outbound network firewall, so it cannot prove that a Vercel function has no network route to production hosts. If strict network-level denial is required, verify available Vercel/Supabase egress/network controls with the owners before deployment. Never treat missing credentials as proof of network isolation.

## 6. Fixture cleanup plan

Preferred cleanup is to retain test reports and then delete the entire dedicated staging Supabase project and staging Vercel project after the test window, under owner approval. This avoids ad hoc deletion across foreign keys and identities. If the stage environment will be retained, prepare a separately reviewed, transaction-bounded cleanup that selects only `stage_load_*` users and `STAGE-*` buses/trips/bookings/cargo, verifies expected counts and ownership, then removes dependencies in FK-safe order. Revoke their sessions, remove staging object files if any, and verify all tagged counts are zero. Never run cleanup against a production or shared database.

Cleanup is a write/destructive action and is not authorized by this document. Preserve the test summary without passwords, tokens, phone-like fixture data, or connection strings.

## 7. Verification checklist before any staging deployment/test

- [ ] Owner approves creation and monthly/cost limits for a new Supabase project and new Vercel project.
- [ ] Supabase staging project reference/fingerprint is recorded and differs from documented production and restore fingerprints.
- [ ] Database is confirmed empty; no production dump/restore or customer records were imported.
- [ ] Data API automatic exposure is disabled; actual table, sequence, schema, RLS/policy, and role grants are reviewed. Anon/authenticated cannot read/write application tables.
- [ ] Versions 1–4 only are present; migrations 5/6/8/9 and production-only script 007 were not accidentally applied.
- [ ] Seed routine was not run; seeded phone-like bus-contact defaults from migration 001 were replaced/deactivated before use.
- [ ] Runtime `DATABASE_URL` and optional storage variables resolve to the staging project; no production or restore credentials appear in Vercel project or team-inherited variables.
- [ ] Separate Vercel project, staging domain, branch/deployment policy, exact CORS origin, and project-level env scope are reviewed.
- [ ] SMS health is configured false; all SMS credentials blank. Resend/recovery credentials blank and recovery flags disabled.
- [ ] Storage disabled or stage-only URL/key/bucket verified; no production storage key or URL present.
- [ ] 50 unique synthetic staff accounts and permission matrix are reviewed; synthetic trip IDs/date and fixtures are tagged.
- [ ] Cleanup owner and method approved; fixture manifest contains no secrets.
- [ ] Only after separate approvals: run isolated login/read smoke checks, then approved 10/20/50-VU k6 plan and separately approved booking concurrency tests.

## 8. Account and cost gate

Public plan documentation is not enough to authorize project creation. Current public Supabase pricing lists Free projects with limited Nano resources and a two-active-project limit; Free projects can pause after inactivity. Paid organizations are billed for project compute by active hours, with a dedicated Postgres instance per project; Micro is listed at about $10/month. If the organization has already used its included compute credit, a staging project can add that compute cost. Vercel's public limits list project quotas by plan; its current Pro plan lists a $20/month platform fee with one paid seat and $20 monthly usage credit, while additional paid seats are $20/month. These are published rates, not an estimate for this account.

Before project creation, the account owner must confirm current plan, unused project quota, whether this business application is eligible for the selected plan, current usage/spend limits, expected project runtime duration, compute size, included credits, additional seat needs and any domain/billing charges. If setup would require a paid upgrade or exceed an owner-approved ceiling, stop. No billing page/account data was available in this preparation, so actual availability and marginal cost remain unknown.

## Approval requested

Please review this guide and approve (or revise) the following before any setup action: (1) creation of one new Supabase staging project and one separate Vercel staging project, (2) the schema/security posture and whether stage storage is needed, (3) the synthetic fixture plan and project cleanup method, and (4) the cost/window owner. No projects, secrets, migrations, accounts, fixtures, deploys, or tests have been created or run.

## References

- Supabase's [Data API change for new projects](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically) documents opting out of automatic table exposure and notes that grants and RLS are separate controls.
- Supabase's [API security guide](https://supabase.com/docs/guides/api/securing-your-api) describes table grants and default privilege behavior.
- Vercel's [environment variable guide](https://vercel.com/docs/environment-variables) describes per-project environments and variable scope; verify team-level variables separately.
- Current public plan information: Supabase [pricing](https://supabase.com/pricing), [compute costs](https://supabase.com/docs/guides/platform/manage-your-usage/compute), and [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq); Vercel [plan limits](https://vercel.com/docs/limits) and [Pro plan](https://vercel.com/docs/plans/pro-plan). Confirm account-specific plan and current billing before creation.
