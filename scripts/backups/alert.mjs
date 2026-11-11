// Optional generic JSON webhook. No account/customer/secret fields are sent.
const raw=process.env.ALERT_WEBHOOK_URL
if(!raw){console.log('No webhook configured. Use GitHub Actions failure notifications.');process.exit(0)}
try{
 const url=new URL(raw)
 if(url.protocol!=='https:'||url.username||url.password)throw Error('Invalid alert URL')
 const response=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(10000),headers:{'Content-Type':'application/json'},
  body:JSON.stringify({event:'district_line_backup_failed',runUrl:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`})})
 if(!response.ok)throw Error('Alert rejected')
}catch{console.error('Failure alert delivery failed; inspect GitHub Actions.');process.exitCode=1}
