import test from 'node:test'
import assert from 'node:assert/strict'
import { auditSql, assertBackupDatabaseAudit } from './database-audit.mjs'
const safe = {role:'district_backup',serverMajor:17,backendTls:true,elevatedRole:false,roleMembership:false,schemaCreate:false,
  tableCount:22,unreadableTables:0,ownedTables:0,writableTables:0,unsafeSequences:0,unsafeRls:0,callableSecurityDefiners:0}
test('backup metadata gate rejects powerful roles, partial RLS dumps, write grants and plaintext backend transport',()=>{
  assert.doesNotThrow(()=>assertBackupDatabaseAudit(safe))
  for(const [key,value] of Object.entries(safe)) {
    const unsafe=typeof value==='boolean'?!value:typeof value==='number'?(key==='tableCount'?0:value+1):'postgres'
    assert.throws(()=>assertBackupDatabaseAudit({...safe,[key]:unsafe}))
  }
  assert.match(auditSql,/pg_stat_ssl/);assert.match(auditSql,/pg_policy/)
  assert.doesNotMatch(auditSql.replace(/'(?:''|[^'])*'/g,"''"),/\b(GRANT|REVOKE|ALTER|INSERT|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/)
})
