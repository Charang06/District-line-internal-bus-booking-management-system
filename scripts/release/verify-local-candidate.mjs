// Offline verification only: no server startup, env files, providers or database.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { builtinModules } from 'node:module'
const manifestPath=process.argv[3]||'docs/handover/districtline-final-candidate-manifest.json'
const meta=JSON.parse(fs.readFileSync(manifestPath,'utf8'))
const candidateRoot=path.resolve(meta.candidate),releaseRoot=path.resolve('release-candidates')+path.sep
if(!candidateRoot.startsWith(releaseRoot)||fs.realpathSync(candidateRoot)!==candidateRoot)throw Error('Candidate root escapes release workspace or is redirected')
const expected=new Set(meta.files.map(f=>f.path)), actual=[]
if(expected.size!==74||meta.files.length!==74)throw Error('Unexpected reviewed manifest membership')
const forbidden=/(^|\/)(?:\.git|\.env[^/]*|node_modules|artifacts|uploads|ops|backups|chrome-profile|dist|dist-ssr|test-support)(\/|$)|\.(?:db|sqlite|zip|7z|bak|test\.js)$/i
for(const name of expected)if(forbidden.test(name)||path.posix.normalize(name)!==name||name.startsWith('../')||path.isAbsolute(name)||(name.endsWith('.sql')&&!/^server\/migrations\/00[1-4]_/.test(name)))throw Error('Forbidden candidate path')
function walk(dir,prefix='') { for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
 const name=prefix+entry.name, full=path.join(dir,entry.name)
 if(entry.isSymbolicLink()||fs.realpathSync(full)!==full)throw Error('Candidate symlink or redirected path: '+name)
 if(entry.isDirectory())walk(full,name+'/');else actual.push(name)
} }
walk(meta.candidate)
if(actual.length!==expected.size||actual.some(p=>!expected.has(p)))throw Error('Unexpected/missing candidate files')
const missing=[],syntax=[],sourceDifferences=[]
for(const f of meta.files) {
 const full=path.join(meta.candidate,f.path),data=fs.readFileSync(full)
 if(data.length!==f.bytes||createHash('sha256').update(data).digest('hex')!==f.sha256)throw Error('Checksum/size mismatch: '+f.path)
 if(!data.equals(fs.readFileSync(f.path))){sourceDifferences.push(f.path);if(!process.argv.includes('--historical'))throw Error('Source drift: '+f.path)}
 if(/\.(?:js|jsx|cjs)$/.test(f.path)) {
  const source=data.toString()
  for(const m of source.matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"](\.[^'"]+)['"]/g)) {
   const base=path.posix.normalize(path.posix.join(path.posix.dirname(f.path),m[1]))
   if(![base,base+'.js',base+'.jsx',base+'/index.js'].some(p=>expected.has(p)))missing.push({file:f.path,import:m[1]})
  }
 }
 if(/\.(?:js|cjs)$/.test(f.path)) {
  const checked=spawnSync(process.execPath,['--check',full],{encoding:'utf8',windowsHide:true})
  if(checked.status!==0)throw Error(checked.stderr)
  syntax.push(f.path)
 }
}
if(missing.length)throw Error(JSON.stringify(missing))
const pkg=JSON.parse(fs.readFileSync(path.join(meta.candidate,'package.json'))),lock=JSON.parse(fs.readFileSync(path.join(meta.candidate,'package-lock.json')))
for(const key of ['dependencies','devDependencies'])if(JSON.stringify(pkg[key])!==JSON.stringify(lock.packages[''][key]))throw Error('Lock root drift')
const declared=new Set([...Object.keys(pkg.dependencies),...Object.keys(pkg.devDependencies)]),externals=new Set()
for(const name of expected)if(/\.(?:js|jsx|cjs)$/.test(name))for(const match of fs.readFileSync(path.join(candidateRoot,name),'utf8').matchAll(/(?:from\s*|import\s*\(|require\s*\()\s*['"]([^.'"][^'"]*)['"]/g)){
 const spec=match[1];if(spec.startsWith('node:')||builtinModules.includes(spec))continue
 const root=spec.startsWith('@')?spec.split('/').slice(0,2).join('/'):spec.split('/')[0]
 if(!declared.has(root))throw Error('Undeclared import: '+spec)
 externals.add(root)
}
const result={files:actual.length,checksumsVerified:true,sourceMatches:sourceDifferences.length===0,sourceDifferences,unexpectedFiles:0,missingRelativeImports:0,candidateSyntaxChecks:syntax.length,lockRootMatches:true,manifestSha256:createHash('sha256').update(fs.readFileSync(manifestPath)).digest('hex')}
result.noSymlinkEscape=true;result.prohibitedPaths=0;result.declaredExternalImports=[...externals].sort()
const evidencePath=process.argv[2]||'docs/handover/districtline-final-verification.json'
const evidence=fs.existsSync(evidencePath)?JSON.parse(fs.readFileSync(evidencePath,'utf8')):{}
evidence[process.argv.includes('--historical')?'historicalCandidateVerification':'candidateVerification']=result
fs.writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n')
console.log(JSON.stringify(result))
