// Metadata only. Run with the BACKUP role before export; never grant privileges here.
export const auditSql = `
WITH actor AS (SELECT * FROM pg_roles WHERE rolname=current_user),
tables AS (SELECT c.* FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p'))
SELECT json_build_object(
  'role',current_user,
  'serverMajor',current_setting('server_version_num')::int / 10000,
  'backendTls',COALESCE((SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()),false),
  'elevatedRole',EXISTS(SELECT 1 FROM actor WHERE rolsuper OR rolbypassrls OR rolcreatedb OR rolcreaterole OR rolreplication),
  'roleMembership',EXISTS(SELECT 1 FROM pg_auth_members m JOIN actor a ON a.oid=m.member),
  'schemaCreate',has_schema_privilege(current_user,'public','CREATE'),
  'tableCount',(SELECT count(*) FROM tables),
  'unreadableTables',(SELECT count(*) FROM tables c WHERE NOT has_table_privilege(current_user,c.oid,'SELECT')),
  'ownedTables',(SELECT count(*) FROM tables c JOIN actor a ON c.relowner=a.oid),
  'writableTables',(SELECT count(*) FROM tables c WHERE has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_any_column_privilege(current_user,c.oid,'INSERT,UPDATE,REFERENCES')),
  'unsafeSequences',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='S' AND (NOT has_sequence_privilege(current_user,c.oid,'SELECT')
      OR has_sequence_privilege(current_user,c.oid,'USAGE,UPDATE'))),
  'unsafeRls',(SELECT count(*) FROM tables c WHERE NOT c.relrowsecurity OR NOT EXISTS(
    SELECT 1 FROM pg_policy p, actor a WHERE p.polrelid=c.oid AND p.polpermissive
      AND p.polcmd='r' AND a.oid=ANY(p.polroles) AND pg_get_expr(p.polqual,p.polrelid)='true')
    OR EXISTS(SELECT 1 FROM pg_policy p, actor a WHERE p.polrelid=c.oid AND NOT p.polpermissive
      AND p.polcmd IN ('r','*') AND (a.oid=ANY(p.polroles) OR 0::oid=ANY(p.polroles)))),
  'callableSecurityDefiners',(SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prosecdef AND has_function_privilege(current_user,p.oid,'EXECUTE'))
);`

export function assertBackupDatabaseAudit(report) {
  if (report.role !== 'district_backup' || report.serverMajor !== 17 || report.backendTls !== true
    || report.elevatedRole !== false || report.roleMembership !== false || report.schemaCreate !== false
    || !Number.isSafeInteger(report.tableCount) || report.tableCount < 22
    || ['unreadableTables','ownedTables','writableTables','unsafeSequences','unsafeRls','callableSecurityDefiners'].some(k=>report[k] !== 0))
    throw Error('BACKUP_DATABASE_LEAST_PRIVILEGE_OR_TLS_CHECK_FAILED')
}
