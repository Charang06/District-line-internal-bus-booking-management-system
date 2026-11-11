// PREPARED ONLY. No cron or deployment wiring. Encrypt before any archive reaches disk.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { auditSql, assertBackupDatabaseAudit } from './database-audit.mjs'
import { encryptedDump } from './stream-encrypted-dump.mjs'
export { encryptedDump } from './stream-encrypted-dump.mjs'
const require=createRequire(import.meta.url)
const {certificatePath,loadVerifiedRoot}=require('../lib/supabase-verified-tls.cjs')
const sha=value=>createHash('sha256').update(value).digest('hex')
export function configuration(env){
 if(env.BACKUPS_APPROVED!=='true')throw Error('BACKUP_NOT_APPROVED')
 const u=new URL(env.BACKUP_DATABASE_URL)
 if(!['postgres:','postgresql:'].includes(u.protocol)||u.pathname!=='/postgres'||u.hash)throw Error('INVALID_DATABASE')
 for(const [key,value]of u.searchParams)if(key!=='sslmode'||value!=='verify-full')throw Error('UNREVIEWED_DATABASE_OPTION')
 const hostRef=u.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1]
 if(env.BACKUP_DATABASE_ROLE!=='district_backup')throw Error('DEDICATED_BACKUP_ROLE_REQUIRED')
 const username=decodeURIComponent(u.username)
 const userRef=username.match(/^district_backup\.([a-z0-9]+)$/)?.[1]
 if(!hostRef&&(!u.hostname.endsWith('.pooler.supabase.com')||!userRef))throw Error('INVALID_HOST')
 if(hostRef&&username!=='district_backup')throw Error('DEDICATED_BACKUP_ROLE_REQUIRED')
 if(hostRef&&userRef&&hostRef!==userRef)throw Error('PROJECT_MISMATCH')
 const fingerprint=sha(hostRef||userRef).slice(0,12)
 if(fingerprint!==env.BACKUP_PROJECT_FINGERPRINT||!/^[a-f0-9]{12}$/.test(env.BACKUP_PROJECT_FINGERPRINT||''))throw Error('PROJECT_MISMATCH')
 if(!u.username||!u.password)throw Error('MISSING_DATABASE_CREDENTIALS')
 if(!/^age1[0-9a-z]{58}$/.test(env.BACKUP_AGE_RECIPIENT||''))throw Error('INVALID_PUBLIC_RECIPIENT')
 if(!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.BACKUP_S3_BUCKET||''))throw Error('INVALID_BUCKET')
 const endpoint=new URL(env.BACKUP_S3_ENDPOINT)
 if(endpoint.protocol!=='https:'||endpoint.username||endpoint.password||endpoint.search||endpoint.hash)throw Error('INVALID_STORAGE_ENDPOINT')
 const prefix=env.BACKUP_S3_PREFIX||'district-line'
 if(!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,100}$/.test(prefix)||prefix.includes('..'))throw Error('INVALID_PREFIX')
 const base={}
 for(const k of ['PATH','HOME','TMPDIR','SystemRoot','WINDIR','LANG','LC_ALL'])if(env[k])base[k]=env[k]
 const pgEnv={...base,PGHOST:u.hostname,PGPORT:u.hostname.endsWith('.pooler.supabase.com')&&u.port==='6543'?'5432':u.port||'5432',
  PGUSER:decodeURIComponent(u.username),PGPASSWORD:decodeURIComponent(u.password),PGDATABASE:'postgres',
  PGSSLMODE:'verify-full',PGSSLROOTCERT:certificatePath,PGCONNECT_TIMEOUT:'15',PGAPPNAME:'district-encrypted-backup',
  PGOPTIONS:'-c default_transaction_read_only=on -c statement_timeout=900000 -c lock_timeout=5000'}
 const awsEnv={...base,AWS_EC2_METADATA_DISABLED:'true',AWS_PAGER:'',AWS_DEFAULT_REGION:env.AWS_DEFAULT_REGION||'auto'}
 for(const k of ['AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY','AWS_SESSION_TOKEN'])if(env[k])awsEnv[k]=env[k]
 if(!awsEnv.AWS_ACCESS_KEY_ID||!awsEnv.AWS_SECRET_ACCESS_KEY)throw Error('MISSING_STORAGE_CREDENTIALS')
 return {fingerprint,recipient:env.BACKUP_AGE_RECIPIENT,bucket:env.BACKUP_S3_BUCKET,endpoint:endpoint.href,prefix,base,pgEnv,awsEnv}
}
function child(command,args,env,stdio=['ignore','pipe','pipe']){
 const p=spawn(command,args,{env,stdio,windowsHide:true})
 // Provider/database diagnostics may include private identifiers. Never echo them.
 p.stderr?.resume()
 const finished=new Promise(resolve=>{p.once('error',()=>resolve(-1));p.once('close',code=>resolve(code))})
 return {p,finished}
}
async function command(command,args,env){
 const {p,finished}=child(command,args,env);let output=''
 for await(const bytes of p.stdout)output+=bytes.toString()
 if(await finished!==0)throw Error('TOOL_FAILED_'+command)
 return output
}
async function hashFile(file){const hash=createHash('sha256');for await(const bytes of fs.createReadStream(file))hash.update(bytes);return hash.digest('hex')}
async function putAndVerify(config,file,key){
 const checksum=await hashFile(file),size=fs.statSync(file).size
 const common=['--endpoint-url',config.endpoint,'--no-cli-pager','s3api']
 await command('aws',[...common,'put-object','--bucket',config.bucket,'--key',key,'--body',file,'--metadata',`sha256=${checksum}`],config.awsEnv)
 const copy=file+'.download-check'
 try{
  await command('aws',[...common,'get-object','--bucket',config.bucket,'--key',key,copy],config.awsEnv)
  if(fs.statSync(copy).size!==size||await hashFile(copy)!==checksum)throw Error('REMOTE_CHECKSUM_MISMATCH')
 }finally{if(fs.existsSync(copy))fs.rmSync(copy)}
 return {key,sha256:checksum,bytes:size,remoteDownloadVerified:true}
}
export async function main(env=process.env){
 const config=configuration(env);loadVerifiedRoot()
 const version=await command('pg_dump',['--version'],config.base)
 if(!/PostgreSQL\) 17\./.test(version))throw Error('POSTGRESQL_17_CLIENT_REQUIRED')
 const audit=JSON.parse(await command('psql',['--no-psqlrc','--no-password','--tuples-only','--no-align','--set','ON_ERROR_STOP=1','--command',auditSql],config.pgEnv))
 assertBackupDatabaseAudit(audit)
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'district-backup-'));fs.chmodSync(directory,0o700)
 try{
  const file=path.join(directory,'application.dump.age')
  await encryptedDump(config,file,child,{validateFullArchive:true})
  const fd=fs.openSync(file,'r');const header=Buffer.alloc(22);fs.readSync(fd,header);fs.closeSync(fd)
  if(!header.toString().startsWith('age-encryption.org/v1'))throw Error('ENCRYPTED_HEADER_MISSING')
  const now=new Date(),id=now.toISOString().replaceAll(':','-')+'-'+randomUUID()
  const key=`${config.prefix}/${config.fingerprint}/${now.toISOString().slice(0,10)}/${id}.dump.age`
  const object=await putAndVerify(config,file,key)
  const manifest={version:1,createdAt:now.toISOString(),projectFingerprint:config.fingerprint,scope:'public application schema/data/sequences/ACLs',
   encryption:'age X25519; private identity is kept offline',pgDumpVersion:version.trim(),archiveTocValidated:true,archivePayloadValidated:true,...object,
   exclusions:['Storage object bytes','managed schemas including auth/storage','role passwords','Vercel/provider secrets'],fullRestoreVerified:false}
  const manifestFile=path.join(directory,'manifest.json');fs.writeFileSync(manifestFile,JSON.stringify(manifest,null,2)+'\n',{mode:0o600})
  await putAndVerify(config,manifestFile,key+'.manifest.json')
  console.log(JSON.stringify({backup:'PASS',projectFingerprint:config.fingerprint,remoteDownloadVerified:true,archiveTocValidated:true,fullRestoreVerified:false}))
 }finally{fs.rmSync(directory,{recursive:true,force:true})}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 main().catch(()=>{console.error('Backup failed. No credential/provider diagnostics were printed. Inspect the controlled runner privately.');process.exitCode=1})
}
