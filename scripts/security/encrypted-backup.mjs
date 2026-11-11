// One explicitly requested read-only production backup. Ciphertext only on disk.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {createHash} from 'node:crypto'
import {createRequire} from 'node:module'
import {spawnSync} from 'node:child_process'
import {loadEnv} from '../../server/env.js'
import {projectFingerprint} from '../../server/test-support/isolated-postgres.js'
import {encryptedDump} from '../backups/run.mjs'
const require=createRequire(import.meta.url)
const {verifiedPostgresConfig,certificatePath}=require('../lib/supabase-verified-tls.cjs')
loadEnv(process.cwd())
if(!process.argv.includes('--requested-encrypted-backup'))throw Error('Explicit backup argument required')
if(projectFingerprint(process.env.DATABASE_URL)!=='868295d24a51')throw Error('Production project mismatch')
const recipient=process.env.BACKUP_AGE_RECIPIENT
if(!/^age1[0-9a-z]{58}$/.test(recipient||''))throw Error('Owner-controlled public age recipient required; no private key is accepted')
const connection=verifiedPostgresConfig(process.env.DATABASE_URL)
const base={}
for(const key of ['SystemRoot','WINDIR','TEMP','TMP','USERPROFILE'])if(process.env[key])base[key]=process.env[key]
const installedAge=path.join(process.env.LOCALAPPDATA||'', 'Microsoft/WinGet/Packages/FiloSottile.age_Microsoft.Winget.Source_8wekyb3d8bbwe/age')
base.PATH=[installedAge,path.join(process.cwd(),'.private-security/tools/age/age'),path.join(os.tmpdir(),'district-pg17-portable'),process.env.PATH].join(path.delimiter)
const ageVersion=spawnSync('age',['--version'],{env:base,encoding:'utf8',timeout:10000,windowsHide:true})
if(ageVersion.status!==0||!String(ageVersion.stdout).includes('1.3.2'))throw Error('Verified installed age 1.3.2 required')
const pgVersion=spawnSync('pg_dump',['--version'],{env:base,encoding:'utf8',timeout:10000,windowsHide:true})
if(pgVersion.status!==0||!/PostgreSQL\) 17\./.test(pgVersion.stdout))throw Error('PostgreSQL 17 client required')
const synthetic=spawnSync('age',['--encrypt','--recipient',recipient],{env:base,input:'District Line synthetic recipient validation',timeout:10000,windowsHide:true})
if(synthetic.status!==0||!synthetic.stdout?.toString().startsWith('age-encryption.org/v1'))throw Error('Public recipient encryption validation failed')
console.log(JSON.stringify({recipientConfigured:true,recipientEncryptionValidated:true,ageVersion:'1.3.2',postgresClientMajor:17,privateKeyAccessed:false}))
const pgEnv={...base,PGHOST:connection.host,PGPORT:String(connection.port),PGDATABASE:connection.database,PGUSER:connection.user,PGPASSWORD:connection.password,
 PGSSLMODE:'verify-full',PGSSLROOTCERT:certificatePath,PGCONNECT_TIMEOUT:'15',PGAPPNAME:'district-approved-encrypted-backup',PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=900000 -c lock_timeout=5000'}
const directory=path.resolve('.private-security/backups/'+new Date().toISOString().replaceAll(':','-'))
if(!directory.startsWith(path.resolve('.private-security')+path.sep))throw Error('Unsafe output path')
fs.mkdirSync(directory,{recursive:true})
const archive=path.join(directory,'database.dump.age')
try{
 console.log(JSON.stringify({stage:'streaming-encrypted-production-backup',plaintextArchiveWritten:false}))
 await encryptedDump({pgEnv,base,recipient},archive,undefined,{allSchemas:true,validateFullArchive:true})
 const fd=fs.openSync(archive,'r');const header=Buffer.alloc(22);fs.readSync(fd,header);fs.closeSync(fd)
 if(!header.toString().startsWith('age-encryption.org/v1'))throw Object.assign(Error('Invalid encrypted header'),{code:'ENCRYPTED_HEADER_INVALID'})
 const hash=createHash('sha256');for await(const chunk of fs.createReadStream(archive))hash.update(chunk)
 const report={at:new Date().toISOString(),projectFingerprint:'868295d24a51',scope:'Full pg_dump logical database archive, excluding external Storage bytes and role/provider credentials',
  archiveSha256:hash.digest('hex'),bytes:fs.statSync(archive).size,encrypted:true,plaintextArchiveWritten:false,archiveTocValidated:true,archiveFullReadbackValidated:true,restorationVerified:false,productionWrites:false,
  recipientSha256:createHash('sha256').update(recipient).digest('hex'),archiveRelativePath:path.relative(process.cwd(),archive)}
 fs.writeFileSync(path.join(directory,'backup-report.json'),JSON.stringify(report,null,2)+'\n')
 fs.mkdirSync('artifacts/internal-table-security',{recursive:true})
 fs.writeFileSync('artifacts/internal-table-security/fresh-encrypted-backup.json',JSON.stringify(report,null,2)+'\n')
 console.log(JSON.stringify(report))
}catch(e){console.error(JSON.stringify({backup:'FAILED',code:e.code||'BACKUP_FAILED',incompleteArchiveNotUsable:true,productionWrites:false}));process.exitCode=1}
