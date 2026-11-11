# Urgent production remediation — backup and isolated checks complete; approval pending

**Superseded:** the owner subsequently approved the exact version-7 hash, it was
applied once, and production security checks passed. See
[production-v7-security-report.md](production-v7-security-report.md). Live browser
confirmation is the remaining operational sign-off.

8 November 2026. This status supersedes earlier readiness claims for the narrower
17-table candidate. Production contents and permissions have NOT been modified.

**Final readiness update:** authenticated decryption and the application restore
drill passed at 15:44:43 Asia/Colombo. All 22 data comparisons, 18 sequence checks,
strict schema/permission comparisons, exact version-7/rollback checks and original
isolated-target preservation passed. The 15:46:11 read-only production review passed:
versions remain 1–6 and security metadata is unchanged. See
[production-v7-runbook.md](production-v7-runbook.md) and the final-readiness.json /
encrypted-restore-drill.json evidence. Only explicit production approval is now
required for this application security release; live HTTP denial is a post-apply check.

## Exact candidate

- File: `scripts/security/007_internal_application_security.sql`.
- SHA-256: `5f725e7d9765326691c0bc5c21d9af522a7d0897379c0ef61298371099670bde`.
- Embedded security body SHA-256:
  `ae06b51315b72ef202ba6a7c4d69f68f7f0ddecacc46c50224fd0c9c6e22f261`.
- Explicitly covers all 22 application tables, including the 17 confirmed exposed
  tables and the five previously hardened users/recovery tables. Revokes browser
  table/column privileges and every associated identity/serial sequence privilege.
- Enables RLS with no new browser policies; rejects unexpected existing policies
  or inventory drift rather than silently preserving a permissive policy.
- Revokes public/anon/authenticated schema CREATE. Shared schema USAGE is retained
  because it is not table access and removing it could affect other Supabase services.
- Preserves runtime/service_role table and sequence privileges with before/after
  assertions, preserves their existing schema CREATE capabilities and requires
  runtime schema USAGE. Does not FORCE RLS or change table ownership.
- Single bounded transaction, expected postgres runtime/database, baseline version
  6 and version 7 absent, advisory lock, then only metadata version 7 is recorded.
  No automatic startup registration or application deployment is included.

## Evidence and current results

The owner-confirmed production project fingerprint is `868295d24a51`; the distinct
restore project is `3ae16e4ead10`. Earlier verified-TLS catalog and public-key HTTP
checks established 17 anonymous endpoints returning HTTP 200 for GET limit=0, with
zero customer records returned. The live configuration was owner-confirmed, not
independently retrieved from Vercel.

The earlier 17-table candidate passed isolated administrator/staff login, bookings,
expenses/revenue, recovery flows and rollback tests. Those results are historical
evidence only; they are NOT represented as approval for this new migration.

After connectivity recovered, the expanded isolated test **passed**: all 22 tables
deny browser-role reads; schema CREATE, all sequence permissions and absence of
browser policies were checked. Synthetic administrator/staff login, staff booking
create/confirm/read/cancel, cargo create/read/delete, administrator expenses/revenue,
email verification, username/password recovery, logout, reset revocation, and idle/
absolute session expiry passed with mail/SMS mocked. The original catalog and
sequence baseline matched after automatic rollback. One expiry fixture was corrected
to use the rollback transaction's clock; production authentication code was unchanged.

The refreshed production rollback metadata now covers 22 tables, 18 sequences and
relevant schema CREATE grants. The **exact release file/hash above** and refreshed
rollback passed a separate isolated test, including version 7 insertion/removal and
restoration of effective ACLs/RLS/schema grants. Original restore state was preserved.
Evidence is in rehearsal.json, rollback-test.json and rollback-catalog.json under
artifacts/internal-table-security. Earlier timeout attempts are superseded by these
successful runs; no failed attempt was committed.

Node syntax/lint and three focused backup guard/stream-failure tests passed. Actual
isolated Supabase HTTP denial remains untested without the restore project's own
publishable/anon key. SQL-role denial is not mislabelled as an HTTP result. Live HTTP
denial can be verified only after an explicitly approved production change.

## Fresh encrypted backup — completed and independently checked

Update: the owner supplied the public age recipient and installed age 1.3.2.
The recipient passed actual synthetic encryption validation without accessing the
private identity. The requested full logical production backup completed on
8 November 2026 at **15:07:45 Asia/Colombo** (09:37:45 UTC).

- Ciphertext size: **476,689 bytes**.
- Location: `.private-security/backups/2026-11-08T09-36-35.844Z/database.dump.age`.
- SHA-256: `49e3653609c3b2d128acaf1094bdc9a0de4f3c6a6baeb45bc8e615f08fc013b2`.
- pg_dump and age exited successfully. A parallel pg_restore --file=- read the
  entire unencrypted archive stream with output sent to the null device, validating
  full archive readback without writing or displaying plaintext data.
- The encrypted header, size and SHA-256 were independently checked by reopening
  only the ciphertext. The recomputed checksum matched the backup report.
- No production writes, permissions changes, private-identity access or plaintext
  dump file. The archive remains in the ignored, access-restricted local directory;
  no external storage upload or schedule was enabled.
- Subsequent owner-authorized age decryption authenticated successfully. No private
  identity was copied and no plaintext archive or SQL was written. The application
  restore, its data/security/sequence comparisons, version 7 and exact rollback all
  passed. Managed Supabase schemas and external Storage files were not replayed.
- Evidence: `artifacts/internal-table-security/fresh-encrypted-backup.json` and
  `artifacts/internal-table-security/fresh-encrypted-backup-validation.json`, plus
  `artifacts/internal-table-security/encrypted-restore-drill.json`.

The following paragraphs retain the earlier preparation limitations as history:

The one-off `scripts/security/encrypted-backup.mjs` is prepared to stream a full
logical pg_dump directly through age encryption to an ignored local directory.
It uses verified TLS, read-only connections and no plaintext archive. This backup
necessarily copies database contents but does not display individual records.
External Storage bytes, role passwords and provider settings are outside pg_dump.

At the earlier failed attempt, BACKUP_AGE_RECIPIENT was not configured. The owner was asked to supply only an age1 public
recipient and keep the private identity offline. No private identity was generated
or requested. The official age Windows release was identified with its published
digest, but download did not complete; no downloaded executable was trusted/run.
The ignored local .private-security directory was restricted for backup preparation.
No database archive, customer records or credentials were written to it by this task.

That earlier attempt produced no fresh encrypted archive. The completed archive
and successful application restore above supersede that state. A full managed
Supabase platform reconstruction is not claimed.
The earlier daily backup workflow remains outside .github/workflows and inactive.

## Required order to finish

1. Completed: verified-TLS connectivity, fresh source rollback metadata, isolated
   baseline preservation and expanded rollback capture. Recheck drift immediately
   before any approved production operation.
2. Completed: exact candidate/rollback and the focused administrator/staff, booking,
   cargo, finance, recovery and session matrix. Recovery schema prerequisites were
   temporary target-only setup inside the rollback test, not production migrations.
3. For real isolated Supabase HTTP denial, configure the restore project's own
   publishable/anon key as SECURITY_RESTORE_SUPABASE_PUBLIC_API_KEY. An external
   PostgREST request cannot observe uncommitted DDL; prepare and recover a bounded
   committed isolated test only after its baseline and exact recovery are verified.
   SQL SET ROLE denial is useful evidence but is not labelled as an HTTP result.
4. Completed: owner recipient validated, age 1.3.2 used, fresh encrypted production
   archive created, full archive readback and independent ciphertext checksum passed.
   Keep the private key offline. Authenticated decryption and encrypted restoration
   have passed for application scope; the exact permission rollback has also passed
   and is the normal ACL recovery path.
5. Present the exact migration/rollback hashes, finished tests and fresh backup
   evidence. Obtain explicit production approval for this specific release only.
   Until then, do NOT execute it, deploy, change accounts or modify live permissions.
6. After approved application, recheck all 22 public endpoints using GET limit=0;
   require genuine permission denial/unavailable routes. Verify grants, RLS,
   sequences, version 7 and runtime access. Production denial cannot be confirmed
   before the user-approved production permission change has actually happened.

## Remaining risks

The last successful production evidence showed anonymous access; the exposure is
not remediated. Lack of an approved write is not evidence of containment. No write
exploit, customer-row retrieval, key rotation or unrelated migration was attempted.
This work cannot determine whether earlier access/exfiltration occurred.

The runtime is still a powerful owner/BYPASSRLS connection; this release preserves
its existing function rather than redesigning it. Default grants for future objects
remain unchanged and need explicit security review on subsequent migrations.
Rollback to the original ACLs would reopen exposure and requires separate explicit
approval. Production execution is awaiting explicit owner approval for the exact
reviewed migration; post-apply live checks remain required.
