# District Line internal database hardening — review package

**Superseded readiness:** the urgent all-22-table candidate and its open release
gates are tracked in [urgent-security-remediation-status.md](urgent-security-remediation-status.md).
The historical 17-table test results below do not approve the expanded migration.

Prepared 8 November 2026. No production permissions, application code, accounts,
deployments or backup schedules were changed. Only the test-support harness was
extended; all new scripts are standalone and unregistered in application startup.

## Identity and confirmed exposure

The owner confirmed that the inspected database is the live application's database.
Its project reference hashes to `868295d24a51`; the distinct existing restore project
hashes to `3ae16e4ead10`. Both connections were verified against the pinned Supabase
CA with normal hostname verification. Production inspection used enforced read-only
transactions. No connection string, password, API key, token or customer row is in
these reports. Vercel authentication/project linking is unavailable, so the deployed
DATABASE_URL mapping is owner-confirmed rather than independently read from Vercel.

**Count correction:** 17 tables, not the previously reported 18, have RLS disabled
and client-role grants. Five more application tables are already protected.

Affected inventory:

```
audit_logs                  auth_sessions                 bookings
bus_contacts                bus_duties                    buses
cargo                       crew_members                  daily_expenses
duty_adjustments            expense_submissions           password_recovery_rate_limits
password_recovery_tokens    revenue_entries               schema_meta
sms_attempts                trips
```

Catalog checks confirm anon/authenticated read/write grants and disabled RLS.
34 transaction-local-role SELECT probes (17 tables × 2 roles), each with WHERE
false, succeeded and returned zero rows. This proves SQL-role read access. Catalog
privilege inspection proves write authorization; production writes were not tried.

The updated publishable-key HTTP check sent GET select=*&limit=0 for each affected
table. **All 17 returned HTTP 200 with empty arrays; none were denied.** The locally
loaded key matched the single definition in .env, had plausible publishable-key
format, and was accepted at the project endpoint derived from DATABASE_URL. This
establishes that the key is usable for that project; opaque publishable keys cannot
be independently project-decoded offline. These results supersede the earlier
API_KEY_REJECTED/401 attempt. Zero customer rows were returned. The combination of
endpoint acceptance, disabled RLS and the catalog grants confirms anonymous read
exposure. No actual customer-row retrieval, HTTP writes, account-JWT probe or data
exfiltration test was performed. Never substitute a secret/service-role key.

Evidence:

- `artifacts/internal-table-security/inspection.json`
- `artifacts/internal-table-security/http-exposure.json`
- `artifacts/internal-table-security/rehearsal.json`
- `artifacts/internal-table-security/rollback-catalog.json`
- `artifacts/internal-table-security/rollback-test.json`

## Smallest proposed fix

`scripts/security/internal-tables.sql` explicitly targets only the 17 tables and
their 15 owned identity/serial sequences. It enables RLS and revokes table, column
and sequence privileges from PUBLIC, anon and authenticated. It adds no permissive
browser policies and does not FORCE RLS, change owners, alter rows or rewrite accounts.

The caller must set `district_security.runtime_role` to the confirmed Express role
inside its transaction. The inspected role is postgres and owns the tables; its
ordinary owner access survives RLS. The SQL rejects a runtime that would require new
RLS policies, checks inherited browser privileges, and asserts preservation of every
runtime/service_role table and sequence privilege. service_role grants remain intact.
No API rewrite, login implementation or booking behavior changes are required.

Existing default grants on future tables remain a recurrence risk. Keep their change
separate from this minimal fix: review the creating roles and narrowly revoke browser
defaults for those roles after compatibility testing. Do not blanket-revoke Supabase
managed defaults/functions or service_role privileges. Audit new migrations for RLS
and explicit grants before release. Disabling the Data API is an optional later
containment measure only after confirming no REST/GraphQL integration needs it.

## Isolated results

The final revision passed on the existing distinct restore project. That project
had migrations 1–4. The rehearsal checked the reviewed hashes of migrations 005/006
and temporarily ran their transaction bodies inside the outer rollback transaction.
It did not permanently upgrade the restore project or touch original accounts.

- All 22 application tables deny anon/authenticated reads after the fix; denial
  probes use WHERE false. Table/column/sequence catalog checks verify write denial.
- Runtime and service-role table/sequence privilege preservation assertions passed.
- Synthetic staff cookie login, administrator-finance denial and logout invalidation passed.
- Synthetic staff booking create, confirm, trip-filtered read and cancel passed.
- Synthetic administrator login, expense creation and locked revenue creation passed.
- Real PostgreSQL adapters for verification, username recovery and password reset
  passed with mocked delivery. Confirmation replay was rejected; password reset
  revoked sessions, rejected replay and allowed login with the new synthetic password.
- Automatic rollback completed. An independent read-only comparison matched the
  original public object/column/function catalogs, migration history and sequence
  states. Temporary sequence RESTARTs protected original counters from nextval drift.
- The separately prepared exact ACL/RLS rollback was also tested in a rollback-only
  isolated transaction. Effective grants, grant options, grantors, ownership and RLS
  flags matched the captured pre-change state; the original restore catalog was then
  independently verified again. ACL array ordering was normalized for this comparison.

This verifies server compatibility, not deployed UI behavior, actual email delivery,
every possible business edge case or a fresh encrypted-backup restoration. Those
unrelated tests were not rerun. The first attempt stopped on a missing test-pool
method and rolled back; the final recorded attempt passed after fixing the adapter.

## One implementation order

1. Matching-public-key zero-record HTTP check is complete: 17/17 HTTP 200. Privately compare deployed
   Vercel Production DATABASE_URL to the confirmed project when hosting access is
   available. Record the deployment/runtime role without copying its credentials.
2. Present the final SQL SHA-256, metadata snapshot and rollback file for explicit
   **production permission approval**. Take a fresh protected application backup
   with a verified recovery candidate before applying; the new S3 backup is not yet
   an established recovery source.
3. In a bounded production transaction, recheck the exact inventory, role ownership,
   policies, grants and service access for drift. Set the runtime role setting and
   run only the reviewed SQL. Inspect postconditions before COMMIT; failure must ROLLBACK.
   Do not register an automatic startup migration or deploy unrelated source changes.
4. Re-run zero-row HTTP checks with the valid public key: require permission denial
   rather than merely an empty result. Run separately authorized controlled live
   smoke checks without altering existing customer bookings/accounts. Monitor API
   errors. Preserve ordinary browser/mobile cookie login and bookings.
5. Separately select private S3-compatible storage and review the encrypted backup
   package. Obtain approval for one backup/restore drill, then separately approve
   workflow publication and the daily schedule. No paid resource creation is included.

## Rollback and recovery

- **Before COMMIT:** ROLLBACK restores the transaction; do not attempt ad-hoc grants.
- **After COMMIT, API error:** verify actual runtime role/ownership first. Prefer a
  narrow runtime grant or reviewed policy while retaining browser-role denial.
- `artifacts/internal-table-security/rollback-baseline.sql.review` is generated from
  current production ACLs/RLS and includes the 15 sequences. It requires a separate
  `district_security.approve_insecure_rollback` setting. It restores the insecure
  baseline and therefore requires explicit security-downgrade approval; it is not
  an automatic fallback. It leaves the five already-protected tables unchanged.
- Refresh that snapshot immediately before an approved change. Stop on owner,
  grantor, column-grant, inventory or runtime drift. Exact restoration of unrelated
  changes made since capture is outside this rollback's scope.
- Do not restore the entire live database for a permission-only failure. A data
  recovery must first restore into an isolated target, verify records, sequences,
  ACL/RLS and application behavior, then obtain explicit cutover approval. Preserve
  subsequent live bookings and provider/Storage assets outside the database archive.

References: [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api),
[Supabase backup scope](https://supabase.com/docs/guides/platform/backups).
