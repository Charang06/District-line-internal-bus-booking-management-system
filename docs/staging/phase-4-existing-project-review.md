# Phase 4 — existing Supabase project reuse review

**Review type: read-only documentation/source review.** No `.env` was opened, no database connection was made, and no project settings, data, migrations, deployments, or tests were changed or run.

## Required report

| Item | Finding |
|---|---|
| Existing isolated project identified | **YES, historically:** repository records identify an original development/test source and a separate restore project. **No currently verified clean project is safe to reuse.** |
| Non-secret project reference | Only a truncated SHA-256 project fingerprint is documented for the restore project: `3ae16e4ead10`. The actual Supabase project reference is not present in approved docs. Do not reconstruct or guess it. |
| Production isolation | **Historically verified:** prior owner-approved restore records say the restore target's fingerprint differed from the source project. No live recheck was performed. |
| Existing data | **Populated and important:** it contains a restored copy of the source application's data/schema, with row-count/checksum comparisons documented. It is not a synthetic or empty database. Preserve it. |
| Current schema/migrations | **Not currently verified.** Historical restore reports include application schema copies and migration histories at different stages. The target was later described as populated with the required baseline incomplete and explicitly rejected for fixtures. Do not apply migrations to reconcile it. |
| Suitable for 10–50 user testing | **NO.** Existing data is not known to be synthetic, the target is not empty, exact current schema/security state is unverified, and the documented safety status rejects it for fixtures. |
| Final recommendation | **NOT SAFE TO REUSE.** Keep it as a protected restore/recovery target. Use a newly owner-approved empty synthetic-data project or another independently verified isolated project. |

## Project lineage from repository evidence

1. The original project was owner-confirmed as a development/test project containing only test data in the 6 November 2026 recovery rollout notes. Migration 005 was later applied to that original test database.
2. Later November 2026 security and production runbooks identify the same source fingerprint as the live production database and report production security work against it. The Phase 2 safe local metadata check also established that the root `.env` points to that documented production fingerprint. It must not be used for this task.
3. A separate restore project is documented with fingerprint `3ae16e4ead10`. It was used to restore/compare a logical copy of the source application data. The restore reports explicitly state that the project became populated and that it is not an empty fixture target. Its Supabase-managed schemas, Storage files, role passwords and platform secrets were not a complete platform clone.
4. A 9 November readiness report explicitly says the existing restore target is populated, its required baseline is incomplete, and it was rejected for fixtures; the instruction is to **not clear, migrate or repurpose it**. Later restore drills verified preservation of captured baseline state, not that this database is a safe synthetic staging environment.

The repository does not document the raw Supabase project reference, current owner account, current plan, current project state, or current schema after the last restore drill. Those facts cannot be established without approved account metadata. The fingerprints and histories above are not a substitute for a current Supabase dashboard identity check.

## Data protection and suitability

The separate restore target contains data copied from an application backup that matched source row counts/checksums at the time of restore. It must be treated as sensitive and protected, not as synthetic, disposable, or an empty test fixture. Existing data purpose is recovery/restore verification. It should be preserved intact.

It could technically accept SQL reads/writes, but doing so would risk mixing synthetic test records with restored application data, changing recovery evidence, using real account/session state, and confounding cleanup. It is therefore unsuitable for:

- 50 synthetic staff accounts or account permission fixtures.
- synthetic buses/trips/passenger/cargo booking writes.
- concurrent booking/cancellation race tests.
- load tests whose endpoints can read broader customer/account records.
- schema migrations or cleanup/reset operations.

Do not attempt a “non-destructive” subset test on this project: the current API has broad dashboard reads, login/session cleanup, duty-state maintenance in a dashboard path, and no per-request staging data namespace. Read-only database statistics would still reveal operational metadata about a protected restore target and are outside this reuse approval.

## Migration compatibility (no migrations run)

- **001–004:** current normal startup's required baseline for core app tables, persistent sessions, password recovery and recovery email. Historical restore copies include this application baseline, but the target's current live catalog was not checked.
- **005:** administrator username-recovery token/limit tables, indexes, invalidation trigger and version 5. This was historically applied to the original development/test source. It is not registered for automatic migration. It is required only if the matching username-recovery backend/build flags are enabled.
- **006:** recovery-email verification columns/constraints/index/tables and version 6, feature-gated and manually reviewed. Repository documents conflict over its historical activation status on the original source, while later production records expect schema version 6. The restore target's current version is not verified. Do not infer its state from a different project's migration ledger.
- **007:** production-specific hardening bundle; excluded from reuse and not to be run/adapted here.
- **008/009:** login-rate-limit and MFA candidates, not normal startup migrations; excluded absent separate approval.

For performance testing alone, the smallest planned profile remains the core app baseline 001–004 with optional recovery features disabled. If recovery parity is required, the owner must specify whether 005 and/or 006 is in scope and approve a migration plan for a clean staging target. The existing restore target must not be migrated to reach that profile.

## Staging application and external-service isolation

A separate Vercel project is still needed, even if an acceptable test database is later identified. It must have its own staging hostname, CORS origin, environment-variable scope and deployment policy; it must not inherit production secrets. The current staging template leaves database and storage secrets blank and disables SMS/Resend. A runtime must receive only the selected isolated staging database credential and, if separately approved, only that same environment's storage URL/key. No staging Vercel environment is configured or deployed now.

The existing restore project's fingerprint must not be put in the staging template. Neither the production project nor the restore project may be used as `DATABASE_URL` for load/concurrency testing. Keep SMS and email credentials absent; no real delivery. Keep Storage absent until an independent staging bucket is approved.

## Exact owner checks needed to find a safe reuse candidate

Through the Supabase account dashboard (read-only):

1. List projects and identify a candidate by its actual project reference, owner organization and region. Do not send any secret URL/password/key.
2. Compare its actual project reference to the production and protected restore project references privately. Confirm it is a separate project, not a branch, linked database, replica or alias of either.
3. Confirm the candidate is intended for development/test and that its existing rows/assets have an owner-approved purpose. Do not assume empty/disposable. Obtain only aggregate row counts, schema version list, and high-level storage object counts as needed; do not expose records.
4. Confirm project plan, active-project quota, pause/compute behavior, spend ceiling and no paid upgrade requirement.
5. Review Data API exposure, role grants, RLS/policies and current migration versions in the dashboard. A migration version count alone is not proof of schema compatibility.
6. Confirm SMS/Resend values are not shared with production and confirm whether a distinct staging Storage bucket exists. Do not reveal the secrets themselves.

If no separate clean project is available, stop and request a new staging project under a separately approved project-creation/cost review. Do not repurpose the restore target.

## Approval gates before any later action

1. Owner supplies/approves the exact non-secret Supabase project reference and confirms ownership, purpose, plan and spend ceiling.
2. Owner confirms a separate Vercel project and HTTPS staging hostname, no production domain, no inherited production variables, and restricted test-team access.
3. Approve non-destructive schema/security review against the selected candidate. Separate approval is required before opening any database connection.
4. Explicitly approve any migrations (including 005/006 choice), staging environment variable configuration, deployment, fixture creation, cleanup, load test, or booking concurrency test. None are authorized by this review.

## Source documentation reviewed

- `docs/admin-username-recovery-rollout.md` — original test project and version 5 history.
- `docs/migration-006-review.md` — restore project identity, populated restored application data and later restore comparisons.
- `docs/security-continuation-readiness.md` — restore target rejected for fixtures; do not clear, migrate or repurpose.
- `docs/production-v7-runbook.md` and `docs/urgent-security-remediation-status.md` — later production/source and separate restore fingerprints.
- `docs/phase-2-safe-verification.md` — current workspace's production-target warning and absence of live account verification.
