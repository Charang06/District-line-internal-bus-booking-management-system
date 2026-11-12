// Loopback-only CDP diagnostic. Creates its own profile; never opens application/private data.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {spawn} from 'node:child_process'
const executable=process.argv[2]||'C:/Program Files/Google/Chrome/Application/chrome.exe'
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'district-cdp-probe-'))
const child=spawn(executable,['--headless=new','--no-first-run','--disable-background-networking','--disable-sync','--disable-component-update','--disable-default-apps','--disable-extensions','--no-proxy-server','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']})
let stderr='',error,ws;child.stderr.on('data',b=>{stderr=(stderr+b).slice(-5000)});child.on('error',e=>error=e)
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),pending=new Map();let next=0
async function command(method,params={},sessionId){return new Promise((resolve,reject)=>{
 const id=++next,timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+method))},5000)
 pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(sessionId?{sessionId}:{})}))
})}
try {
 for(let i=0;i<100&&!fs.existsSync(path.join(profile,'DevToolsActivePort'));i++){if(error)throw error;if(child.exitCode!==null)throw Error('Browser exited '+child.exitCode);await sleep(100)}
 const [port,browserPath]=fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').trim().split(/\r?\n/)
 ws=new WebSocket('ws://127.0.0.1:'+port+browserPath)
 ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){clearTimeout(p.timer);pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result)}}
 await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j})
 console.log('version',JSON.stringify(await command('Browser.getVersion')))
 console.log('targets',JSON.stringify(await command('Target.getTargets')))
 const {targetId}=await command('Target.createTarget',{url:'about:blank'})
 const {sessionId}=await command('Target.attachToTarget',{targetId,flatten:true})
 console.log('attached',targetId)
 try {console.log('page',JSON.stringify(await command('Page.enable',{},sessionId)))}catch(e){console.log(e.message)}
 console.log('targetsAfter',JSON.stringify(await command('Target.getTargets')))
 console.log('evaluate',JSON.stringify(await command('Runtime.evaluate',{expression:'1+1',returnByValue:true},sessionId)))
}catch(e){console.log('probeError',e.message);process.exitCode=1}
finally{
 console.log('stderr',stderr)
 if(ws?.readyState===WebSocket.OPEN)await command('Browser.close').catch(()=>{})
 ws?.close();if(child.exitCode===null)child.kill()
 for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('Probe closed'))}pending.clear()
}
