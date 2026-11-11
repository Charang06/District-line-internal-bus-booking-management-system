# Phase 3 limited-approval status

**Stopped before account-bound setup.** The approved local preparation is complete; no external project action was taken.

| Requested item | Status | Evidence / blocker |
|---|---|---|
| Supabase staging project | Not created | Supabase account access is not connected; account ownership, available project quota, region, billing plan and current marginal charges cannot be inspected. |
| Vercel staging project | Not created | Vercel account access is not connected; team ownership, project availability, environment scoping and any plan restrictions/costs cannot be inspected. |
| Non-secret project identities | None | No project references exist because neither project was created. |
| Production isolation | Production untouched; staging isolation not yet verifiable | No production connection/settings were accessed. The repo's prior safe local metadata check identified the root `.env` as production-targeted; it was not used. |
| Staging env config | Prepared, not applied | See `staging.env.template`; secrets are blank and no credentials were copied. |
| Migration compatibility | Reviewed, parity decision pending | See the migration section in `README.md`: versions 1–4 are the minimal performance-test baseline; 5 and 6 are feature-specific manual migrations. Current production feature flags were not inspected, so exact functional parity is unknown. |
| Database security | Requirements prepared, not verified on a target | Fresh project must disable automatic Data API exposure and undergo table/sequence/schema/RLS/grant checks. Production-only script 007 is expressly excluded. |
| Cost and limits | Account-specific result unknown; public plan facts reviewed | Supabase Free currently lists up to two active projects and free Nano compute, with limited resources; Free projects may pause after inactivity. On paid organizations, compute is charged per active project/hour; official docs list Micro at about $10/month and state each project has its own Postgres instance. Vercel Hobby currently lists up to 200 projects (with other limits); Pro lists a $20/month platform fee including one paid seat and $20 monthly usage credit, with additional paid seats at $20/month. These public figures do not establish this account's eligibility, remaining quota, usage headroom, terms for this business workload, or marginal bill. No paid upgrade was accepted and no charge incurred. |
| Remaining preparation | Complete locally | Separate-project deployment checklist, stage-only env template, 50-account and fixture outline, external-service disabling, and cleanup plan are in `README.md`. |
| Approval before next actions | Required | Connect the owner-authorized Supabase and Vercel accounts, confirm project ownership and budget ceiling, then approve exact project identities/settings before creation. Migrations, deploy, fixtures, and tests need separate approvals as specified below. |

## Migration compatibility review

- **001–004:** Minimal schema needed by current normal startup/readiness and core booking, staff, cargo and finance workflows. Applying them on staging still requires a dedicated empty project and explicit migration approval. Version 001 includes two phone-like bus-contact seed rows; sanitize them in staging before staff use.
- **005:** Optional administrator username-recovery feature. It adds recovery token/limit tables, indexes and invalidation trigger; feature is disabled unless its environment flag is enabled. Not required for the planned staff load workload.
- **006:** Optional recovery-email verification feature. It adds verification state and token/limit structures plus canonical/unique admin recovery email constraints; requires the v4 recovery-email column. Not required for planned load workload unless parity for this feature is specifically requested.
- **007:** Production-identity-specific hardening bundle; not reusable for staging.
- **008/009:** Login-rate-limit and MFA candidates; not registered for normal startup and excluded from initial staging until separately reviewed/approved.

Do not infer whether versions 5/6 are enabled in production from `.env.example`; it only documents defaults. Ask the owner to state whether staging should model the optional recovery features, or approve the minimal v1–4 test profile.

## Exact next approvals

1. Connect the owner's Supabase and Vercel accounts through the approved account integrations, or have the owner perform project creation and provide only non-secret project references for verification. No passwords, service keys or database URLs should be pasted into chat.
2. Confirm account/team ownership and approve an explicit spend ceiling and region for each project. If a free/eligible plan is unavailable, stop; do not upgrade.
3. Confirm whether the staging test profile is v1–4 only or needs v5 and/or v6 for recovery parity. Approve the corresponding staging-only migration plan separately. This does not authorize running migrations now.
4. Approve creation of the named, empty Supabase project and separately named Vercel project only after plan/cost and ownership checks pass.
5. After creation, provide separate approval for migrations; then separately for reviewed stage-specific database grants/security and environment configuration.
6. Request separate approvals later for deployment, synthetic fixture creation, cleanup method, load tests and booking concurrency tests.

Until account access, ownership, cost and migration parity are resolved, project creation remains paused. This status is compatible with the limited approval: the approval permits creation only after these prerequisite checks; it does not waive them.

## Public pricing references (not account quotes)

- Supabase [pricing](https://supabase.com/pricing), [compute pricing](https://supabase.com/docs/guides/platform/manage-your-usage/compute), and [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq): each project has a dedicated database/compute instance; free and paid quotas differ, and active project compute can add marginal cost.
- Vercel [plan limits](https://vercel.com/docs/limits) and [Pro plan](https://vercel.com/docs/plans/pro-plan): project caps and usage/seat costs vary by plan. Check current account usage and billing before creation; this report did not access the account.
