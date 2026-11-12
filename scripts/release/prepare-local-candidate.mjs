// Offline allowlist-only copy. Never runs application/startup or reads environment files.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
const root=process.cwd()
const report=fs.readFileSync('docs/handover/phase-14-technical-release-fixes.md','utf8')
const section=report.slice(report.indexOf('**74 runtime paths'))
const names=section.split('~~~text\n')[1].split('\n~~~')[0].trim().split('\n').map(p=>p.trim())
if(names.length!==74||new Set(names).size!==74)throw Error('Unexpected reviewed manifest')
const deny=/(^|\/)(?:\.git|\.env[^/]*|node_modules|artifacts|uploads|ops|backups|chrome-profile|dist|dist-ssr|test-support)(\/|$)|\.(?:db|sqlite|zip|7z|bak|test\.js)$/i
for(const p of names){
 if(deny.test(p)||p.split('/').includes('..')||path.isAbsolute(p))throw Error('Forbidden release path')
 if(p.endsWith('.sql')&&!/^server\/migrations\/00[1-4]_/.test(p))throw Error('Unapproved SQL')
 const full=path.resolve(root,p)
 if(!fs.lstatSync(full).isFile()||fs.realpathSync(full)!==full)throw Error('Nonregular or redirected allowlist asset')
}
// Complete validation happens before any source is copied.
const stamp=new Date().toISOString().replace(/[:.]/g,'-')
const candidate=path.join(root,'release-candidates','districtline-'+stamp)
fs.mkdirSync(candidate,{recursive:true})
const files=names.map(p=>{
 const data=fs.readFileSync(path.join(root,p)),sha256=createHash('sha256').update(data).digest('hex')
 const dest=path.join(candidate,p);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,data,{flag:'wx'})
 return {path:p,bytes:data.length,sha256}
})
const metadata={candidate,sourceHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceBranch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),createdAt:new Date().toISOString(),files}
const manifestPath=process.argv[2]||'docs/handover/districtline-final-candidate-manifest.json'
fs.writeFileSync(manifestPath,JSON.stringify(metadata,null,2)+'\n')
console.log(JSON.stringify({candidate,files:files.length,checksums:manifestPath}))
