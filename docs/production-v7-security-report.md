# District Line production security report — 8 November 2026

The explicitly approved version-7 migration committed once on production project
fingerprint `868295d24a51`. No application code was deployed, keys rotated, accounts
changed or backup schedules enabled. No insecure rollback or unapproved production
permission adjustment was performed.

Migration SHA-256:
`5f725e7d9765326691c0bc5c21d9af522a7d0897379c0ef61298371099670bde`.

Before execution, the runner verified that exact checksum, verified-TLS production
identity, current version-6 baseline, encrypted archive checksum/availability,
authenticated restore evidence and matching tested rollback. The reviewed SQL was
executed exactly once with its own transaction and assertions; schema_meta now
contains versions 1–7.

## Completed production verification

| Check | Result |
| --- | --- |
| Internal application tables | 22/22 have RLS enabled; FORCE RLS is off; owners unchanged |
| Browser policies/column grants | No permissive browser policy or column grant remains |
| Effective anon/authenticated table access | Denied on all 22 tables |
| PUBLIC table/sequence grants | None on the targeted objects |
| Identity/serial sequences | 18/18 deny browser roles; backend access preserved |
| Schema | Browser CREATE denied; shared USAGE retained |
| Runtime and service-role privileges | Preserved against the recorded baseline |
| Anonymous Data API GET select=*&limit=0 | 22/22 return HTTP 401, SQLSTATE 42501 |
| Accessible/unverified endpoints | 0/0 |
| Customer records returned by HTTP tests | 0 |

The initial schema ACL comparison omitted the explicit postgres CREATE grant that
the approved SQL makes when preserving existing owner-derived CREATE capability.
Checks were paused for read-only diagnosis. The change matched the exact reviewed
SQL; anon/authenticated CREATE remained false and the backend gained no new effective
capability. Only the local verifier was corrected. All final catalog checks passed;
there was no further production adjustment or rollback.

## Compatibility and recovery evidence

The exact migration passed isolated administrator/staff login, booking, cargo,
finance, recovery verification/username/password reset, session revocation and
expiry checks. Mail/SMS were mocked. A fresh encrypted archive was authenticated
with the owner-provided identity using age, without copying the identity or writing
plaintext archives/SQL. All 22 application data comparisons, 18 sequences, strict
schema/permission comparison, exact migration and exact rollback checks passed.
The original isolated target was preserved.

**Live browser confirmation remains pending.** The agent has not claimed to sign
into existing production administrator/staff accounts or to perform production
booking/finance/recovery mutations. The owner has been asked to verify normal sign-in
and loading of booking/cargo, administrator finance and recovery settings without
sharing credentials or changing customer records. Preserved backend privileges plus
the isolated functional matrix provide compatibility evidence, not a fabricated live
browser result.

## Remaining risks

- Review grants/RLS on every future migration: creating-role default grants remain
  unchanged by this narrowly approved release.
- The runtime retains its existing powerful owner/BYPASSRLS connection.
- The restore rehearsal covers application recovery, not managed Supabase schemas,
  external Storage files or provider configuration.
- Removing current access does not establish whether historic exposure was abused.

The approved exposure remediation and production security checks are complete.
Live browser smoke-test confirmation is the remaining operational sign-off.

Evidence: `artifacts/internal-table-security/final-production-security-report.json`,
`production-deployment.json`, `post-deployment-catalog.json`,
`production-effective-permissions.json`, `post-deployment-http.json`,
`rehearsal.json`, and `encrypted-restore-drill.json`.
