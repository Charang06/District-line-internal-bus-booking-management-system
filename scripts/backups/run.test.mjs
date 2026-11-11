import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Readable, Writable } from 'node:stream'
import { configuration, encryptedDump } from './run.mjs'
const ref='syntheticproject'
const env={BACKUPS_APPROVED:'true',BACKUP_DATABASE_ROLE:'district_backup',BACKUP_DATABASE_URL:`postgresql://district_backup.${ref}:private-password@aws-0-test.pooler.supabase.com:6543/postgres`,
 BACKUP_PROJECT_FINGERPRINT:createHash('sha256').update(ref).digest('hex').slice(0,12),BACKUP_AGE_RECIPIENT:'age1'+'a'.repeat(58),
 BACKUP_S3_BUCKET:'private-test-backups',BACKUP_S3_ENDPOINT:'https://storage.example.test',AWS_ACCESS_KEY_ID:'synthetic-access',AWS_SECRET_ACCESS_KEY:'synthetic-secret'}
test('backup rejects missing approval, wrong project, unsafe TLS options and unsafe storage endpoints',()=>{
 for(const overrides of [{BACKUPS_APPROVED:'false'},{BACKUP_PROJECT_FINGERPRINT:'000000000000'},
  {BACKUP_DATABASE_ROLE:'postgres'},{BACKUP_DATABASE_URL:env.BACKUP_DATABASE_URL.replace('district_backup.','postgres.')},
  {BACKUP_DATABASE_URL:env.BACKUP_DATABASE_URL+'?sslmode=require'},{BACKUP_S3_ENDPOINT:'http://storage.example.test'},
  {BACKUP_S3_ENDPOINT:'https://user:password@storage.example.test'},{BACKUP_S3_PREFIX:'../escape'},
  {BACKUP_DATABASE_URL:env.BACKUP_DATABASE_URL.replace(ref,'differentproject')},{BACKUP_AGE_RECIPIENT:'private-age-key'}])
  assert.throws(()=>configuration({...env,...overrides}))
})
test('backup isolates database credentials from encryption/storage tools and verifies TLS over session pooling',()=>{
 const c=configuration(env)
 assert.equal(c.pgEnv.PGPORT,'5432');assert.equal(c.pgEnv.PGSSLMODE,'verify-full')
 assert.match(c.pgEnv.PGOPTIONS,/default_transaction_read_only=on/)
 assert.equal(c.pgEnv.PGPASSWORD,'private-password')
 assert.equal(c.awsEnv.PGPASSWORD,undefined);assert.equal(c.base.PGPASSWORD,undefined)
 assert.equal(c.pgEnv.AWS_SECRET_ACCESS_KEY,undefined);assert.equal(c.awsEnv.BACKUP_DATABASE_URL,undefined)
})
function mockTools(destination,{dumpCode=0,ageCode=0,tocCode=0}={}){
 return(command,args,_toolEnv,_stdio)=>{
  const chunks=[]
  let finish
  const finished=new Promise(resolve=>{finish=resolve})
  const p={exitCode:null,kill(){this.exitCode=-1;finish(-1)}}
  if(command==='pg_dump'){
   assert.ok(args.includes('--schema=public'));assert.ok(!args.some(x=>x.includes('private-password')))
   assert.ok(args.includes('--enable-row-security'))
   p.stdout=Readable.from([Buffer.from('synthetic-private-archive')]);p.stdout.on('end',()=>{p.exitCode=dumpCode;finish(dumpCode)})
  }else{
   // Tests model external tools; they do not claim to implement/validate age cryptography.
   const fd=command==='age'?fs.openSync(destination,'a'):null
   p.stdin=new Writable({write(chunk,encoding,done){chunks.push(Buffer.from(chunk));done()},final(done){
    const code=command==='age'?ageCode:tocCode
    if(fd!==null){fs.writeSync(fd,'age-encryption.org/v1\n'+Buffer.concat(chunks).toString('base64'));fs.closeSync(fd)}
    p.exitCode=code;finish(code);done()
   }})
  }
  return{p,finished}
 }
}
test('streaming path writes only encryptor output and fails closed when dump, encryption or archive validation fails',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'district-backup-test-'))
 try{
  for(const [index,codes]of [{},{dumpCode:1},{ageCode:1},{tocCode:1}].entries()){
   const file=path.join(dir,index+'.age')
   const launch=mockTools(file,codes)
   const run=encryptedDump(configuration(env),file,(command,args,...rest)=>{
    if(command==='pg_restore')assert.deepEqual(args,['--file=-'])
    return launch(command,args,...rest)
   },{validateFullArchive:true})
   if(index===0){await run;const content=fs.readFileSync(file,'utf8');assert.match(content,/^age-encryption.org/);assert.ok(!content.includes('synthetic-private-archive'))}
   else await assert.rejects(run,/DUMP_ENCRYPTION_OR_TOC_VALIDATION_FAILED/)
  }
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
})
