// Validate explicit synthetic-target approval before constructing a PostgreSQL pool.
export function validateDisposableAttestation(proof, env={}, now=Date.now()) {
 if(!proof||typeof proof!=='object'||Array.isArray(proof))throw Error('Disposable attestation required')
 for(const key of ['ownerApproved','syntheticOnly','emptyDatabase','independentStorage','noProtectedProjects','noDeliveryIntegrations','syntheticDataLifecycleApproved'])
  if(proof[key]!==true)throw Error('Disposable approval missing: '+key)
 if(proof.host!=='127.0.0.1')throw Error('Only explicitly attested local targets are supported')
 if(!Number.isInteger(proof.port)||proof.port<1||proof.port>65535)throw Error('Invalid attested port')
 for(const key of ['database','user','processOrContainerId','isolationEvidence'])
  if(typeof proof[key]!=='string'||!proof[key].trim())throw Error('Missing isolation evidence: '+key)
 const age=now-Date.parse(proof.verifiedAt)
 if(!Number.isFinite(age)||age<0||age>=3600000)throw Error('Fresh attestation required')
 if(env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||env.PGSSLMODE==='disable'||env.PGSSLMODE==='no-verify')throw Error('Unsafe TLS override rejected')
 return {host:'127.0.0.1',port:proof.port,database:proof.database,user:proof.user,
  ssl:{rejectUnauthorized:true,servername:'localhost',minVersion:'TLSv1.2'},max:3,connectionTimeoutMillis:5000,
  application_name:'district-disposable-synthetic'}
}
