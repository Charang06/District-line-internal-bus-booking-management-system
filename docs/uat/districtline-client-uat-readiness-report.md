# District Line client UAT readiness report

Date: 2026-11-12 (Asia/Colombo)

## Status

**BLOCKED - DATABASE VERIFICATION**

The responsive source changes and latest mobile drawer passed the fresh synthetic Chrome checks at the requested dashboard widths. A separate isolated UAT database/storage deployment does not exist, so the client must not be given access. Real PostgreSQL, provider, and client acceptance gates remain pending.

## 1. Executive summary

Local preparation is complete: the latest responsive navigation source is in place; the fresh synthetic browser suite and offline selections pass; a fresh 74-file sanitized candidate was generated and verified; and client UAT checklist, guide, feedback form, and sign-off template have been created. The current staged/unstaged Git work from earlier tasks was preserved.

No production or Preview deployment, provider request, PostgreSQL connection, credential/account creation, client test, commit, or push occurred. No UAT URL exists. Client access is not ready.

## 2. Mobile Dashboard issues and fixes

The latest responsive handover records these changes:

- The mobile/tablet menu now supports Escape, focus restoration, body scroll locking, and `aria-hidden`/`inert` closed state.
- The open navigation drawer is bounded to the viewport and scrolls internally on short screens.
- Dashboard KPI/filter/chart grids and contained ledger scrolling were already responsive; no booking, financial, or permission business rules changed.

The release browser suite was extended with the requested viewport matrix, drawer interaction checks, and permission checks. A fresh Chrome run against the current candidate passed all 75 checks. Older results remain historical and are not included in this count.

## 3. Screenshots and screen widths

Existing synthetic screenshots are in `artifacts/dashboard-ui-review/` for 320, 390, 768, and 1440px, with before/after dashboard, mobile full dashboard, profit, empty, loading, and error states. They predate this UAT run and are not evidence of physical-device behavior.

The updated release harness targets 320, 360, 375, 390, 430, 768, 1024, and 1440px for all six admin pages and Accounts View/Manage, with dashboard navigation checked for admin, manager, view-only, and no-Accounts roles. Login remains at 320, 390, 768, and 1440px. No portrait/landscape rotation or physical phone has been tested.

## 4. Database integration status

**Real PostgreSQL: pending; zero connections or integration scenarios executed in this task.** The file `docs/handover/districtline-real-postgresql-integration-results.md` does not exist. The latest available database security report states that the approved dedicated disposable local PostgreSQL instance and independent isolation attestation were unavailable; it recorded the opt-in real database test as skipped, not passed.

This task's bounded local inspection found no `psql`, `postgres`, `pg_ctl`, Docker, or Podman command available and no listener on ports 5432 or 5549. No disposable test variables were present. This does not prove no installation exists anywhere. No environment files, credentials, production Supabase, protected backup, or private browser profile were inspected. Do not substitute production for the missing disposable database.

Required database cases remain duplicate/concurrent seat prevention, cancellation/rebooking, rollback, financial persistence, duty finalization, staff permission enforcement, schema constraints, and database-backed browser acceptance. Follow the attestation procedure in `districtline-database-security-release-verification.md`; if the local instance is unavailable, owner setup and independent isolation evidence are required before running the opt-in suite.

## 5. UAT environment requirements

No isolated environment is deployed or created. Before client access, the existing project owner/provider operator must approve and verify:

- A separate URL and isolated Vercel Preview for the existing project, with the existing project/team/domain identity verified.
- A separate least-privilege UAT PostgreSQL database and separately isolated storage, with TLS verification enabled.
- Synthetic-only records, dedicated UAT credentials, and no shared production sessions, secrets, customer records, or protected backup linkage.
- Mocked/disabled SMS and email delivery, verified by configuration and test behavior.
- Approved feature-flag states with no unapproved MFA, login limiter, or recovery activation.
- Clean sanitized source publication, effective build/runtime configuration, native package/function trace checks, cookie/origin/storage behavior, API routes, and candidate integrity.
- Immutable Preview identity, database/provider results, and a verified compatible same-project rollback deployment before client access.

Vercel configuration review in the historical reports confirms the local Vite build/output and API-before-SPA rewrite structure. It does not prove a Preview is isolated or that provider configuration/runtime is correct. No Vercel settings, deployment, cloud resource, or external API was accessed here.

## 6. Test-account readiness

No accounts exist or were created for UAT. After an isolated environment is independently verified and creation is separately authorized, prepare four synthetic identities:

| Label | Intended role | Scope |
|---|---|---|
| `UAT Administrator` | Administrator | Admin operations and staff/permission review |
| `UAT Accounts Manager` | Staff: Accounts View + Manage | Authorized revenue, expense, and duty management |
| `UAT Accounts Viewer` | Staff: Accounts View only | Read-only Accounts verification |
| `UAT Operations Staff` | Staff without Accounts access | Booking/operations only, Accounts denied |

Use unique synthetic usernames and non-real contact addresses. The account owner must issue separate temporary credentials through an approved secure handoff channel; no passwords are stored in repository docs or shared accounts. Confirm logout/session isolation and remove test identities only through an approved UAT cleanup process. Do not create any account in production.

## 7. Client documentation created

- `docs/uat/districtline-client-uat-checklist.md` — pending role-based test cases for authentication, admin, booking, Accounts, and mobile.
- `docs/uat/districtline-client-testing-guide.md` — access steps, safe synthetic-data rules, navigation, issue reporting, and known limitations.
- `docs/uat/districtline-uat-feedback-template.md` — per-issue reproduction and environment fields.
- `docs/uat/districtline-uat-signoff-template.md` — blank client/project, results, decision, and signature fields.

All client scenarios are marked Blocked pending an actual isolated UAT environment and approved accounts. No unexecuted client case is represented as passed.

Final tested candidate: `release-candidates/districtline-2026-11-12T16-52-50-275Z` (74 files). UAT candidate manifest SHA-256: `852ee9ce5d6d99b582edf81a6a72284761577c501099d4f664c86b50c3dbe436`.

## 8. Automated results

Historical evidence only (not rerun in this task):

- Responsive task: build passed; 154 offline tests passed, 6 skipped; its report notes the latest browser drawer checks were not authoritative.
- Final blocker report: 58 synthetic browser checks passed; real PostgreSQL remained 0 executed / 1 skipped. This is older and does not cover the latest mobile change.
- Database security report: 30 distinct offline tests passed, zero failed, one real database test skipped; no Preview/provider tests ran.

Fresh verification for this UAT-preparation task:

- Candidate integrity: fresh candidate has 74/74 matching files and source, 25 syntax checks, zero missing relative imports, prohibited paths, or symlink escapes. Manifest SHA-256 is `852ee9ce5d6d99b582edf81a6a72284761577c501099d4f664c86b50c3dbe436`.
- New isolated synthetic Chrome suite: 75 passed, 0 failed. Candidate build transformed 50 modules and rendered 3 outputs. Admin pages and Accounts View/Manage were checked at all eight requested widths; drawer keyboard/focus/scroll/selection behavior, permission-filtered navigation, booking/cancellation, synthetic financial workflows, loading/error states, console errors and resource/network errors were checked. Console errors 0; failed local resources 0; unexpected network errors 0. APIs were mocked; this is not PostgreSQL/provider acceptance.
- Offline selection: 21 passed, 0 failed, 1 real-PostgreSQL test skipped; isolated-harness preparation: 9 passed, 0 failed, 0 skipped.
- Syntax: 62 JavaScript/MJS/CJS files checked, 0 failed. `git diff --check` passed.
- PostgreSQL: 0 executed; 1 skipped for absent independent instance/attestation; pending.
- Vercel/Preview: 0 executed; deployment intentionally not authorized.
- Client UAT: 0 executed; client access not provisioned.

## 9. Git security status

The latest blocker report records 136 tracked Chrome-profile paths and nine tracked artifact profile-image copies; their contents were not opened. Repository visibility, collaborators/forks, prior downloads, and historical credential exposure remain unknown. A sanitized candidate excludes Git history and prohibited artifacts, but does not remediate repository history. Do not push the existing repository/history or the candidate without separate owner review and approval.

During this task, pre-existing staged and unstaged changes were observed and left intact. No staging, commit, push, merge, history rewrite, deletion, or reset was performed.

## 10. Deployment and rollback prerequisites

Before any Preview deployment, an authorized owner must verify existing Vercel project/team ownership, current and last-known-good immutable deployment IDs, effective Node/root/install/build/output/region settings, isolated database/storage and delivery configuration, approved feature flags, and a clean sanitized publication route. Then obtain separate explicit approval for Preview deployment.

Before client access, verify the exact Preview candidate digest, runtime/database/browser/provider results, client accounts and secure credential delivery, and same-project rollback eligibility/compatibility. Preview approval is not production promotion approval. No production action is authorized by UAT readiness documentation.

## 11. Remaining blockers

1. **Database:** provision/identify only an owner-approved disposable local PostgreSQL instance; independently verify storage/network/identity/TLS isolation and provide a fresh attestation. Run the prepared integration suite without weakening gates.

2. **UAT environment:** separately authorize and configure existing-project isolated Preview plus independent database/storage and mocked delivery. Do not deploy before this isolation review.
3. **Security/release:** resolve owner review of repository exposure and approve sanitized source publication; confirm current/rollback identities and runtime compatibility.
4. **Accounts/client:** create the four synthetic UAT roles only after isolated environment verification and separate authorization; securely distribute credentials; then execute the client checklist and record defects/sign-off.

## 12. Exact next action

Have the owner provide independently verified disposable-local PostgreSQL isolation evidence and a fresh attestation; then run `node --experimental-vm-modules --test server/disposable-local-integration.test.js`. Keep client access blocked until database integration, isolated Preview/provider checks, secure test-account delivery, and rollback prerequisites are complete.

