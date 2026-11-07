const test=require('node:test');
const assert=require('node:assert/strict');
const {spawnSync}=require('node:child_process');
const path=require('node:path');
const {compareCatalogs,normalizeFunctionText,boundRestoreTimeouts,buildDiagnosticSQL,evaluateDiagnostics,auditRollback,diagnosticPrefix}=require('./verify-migration006-backup.cjs');

const definition="CREATE OR REPLACE FUNCTION public.example()\n RETURNS trigger\n LANGUAGE plpgsql\nAS $function$\nBEGIN\n RETURN NEW;\nEND;\n$function$\n";
const catalog=()=>({relations:[{name:'users',owner:'postgres',rls:true,force_rls:false,
  grants:['postgres=arwdDxtm/postgres'],columns:[{name:'id',type:'integer',grants:[],default:null}]}],
  functions:[{name:'public.example()',owner:'postgres',grants:['postgres=X/postgres'],definition}],
  constraints:[],indexes:[],triggers:[],policies:[{tablename:'users',policyname:'own',roles:['authenticated'],qual:'id = 1'}]});
const clone=x=>JSON.parse(JSON.stringify(x));
const sequences=Array.from({length:17},(_,i)=>({name:`test_${i}_id_seq`,last_value:String(i+1),is_called:i%2===0}));
const manifest=[{name:'users',rows:'0',data_checksum:'synthetic-checksum'}];
function output(actual=catalog(),edit=()=>{}) {
  const rows=[{kind:'catalog',name:'public',payload:actual},
    {kind:'data',name:'users',payload:{rows:'0',data_checksum:'synthetic-checksum'}},
    ...sequences.map(x=>({kind:'sequence',name:x.name,payload:{last_value:x.last_value,is_called:x.is_called}}))];
  edit(rows);return 'SET\n'+diagnosticPrefix+JSON.stringify(rows)+'\nROLLBACK\n';
}

test('reports exact object/property for owner, grants, RLS, column and policy changes',()=>{
  const a=catalog(),b=clone(a);b.relations[0].owner='other';b.relations[0].rls=false;
  b.relations[0].grants.push('anon=r/postgres');b.relations[0].columns[0].type='text';b.policies[0].roles=['anon'];
  const result=compareCatalogs(a,b);
  assert.equal(result.match,false);
  assert.deepEqual(result.differences.map(x=>[x.object,x.property]),[
    ['relations:users','columns.id.type'],['relations:users','grants'],['relations:users','owner'],['relations:users','rls'],['policies:users.own','roles']]);
});

test('function CRLF/LF is accepted with explicit normalization notice',()=>{
  const a=catalog(),b=clone(a);b.functions[0].definition=definition.replace(/\n/g,'\r\n');
  const r=compareCatalogs(a,b);assert.equal(r.match,true);assert.equal(r.normalizedFunctionLineEndings.length,1);
});

test('line endings inside single-quoted or nested dollar-quoted literals remain significant',()=>{
  for(const literal of ["'hello\nworld'",'$$hello\nworld$$','"hello\nworld"']) {
    const a=catalog(),b=catalog();a.functions[0].definition=definition.replace('RETURN NEW;',()=>`PERFORM ${literal};`);
    b.functions[0].definition=a.functions[0].definition.replace(/\n/g,'\r\n');
    assert.equal(compareCatalogs(a,b).match,false);
  }
});

test('apostrophes in comments do not hide meaningful multiline literal differences',()=>{
  const a=catalog(),b=catalog();
  a.functions[0].definition=definition.replace('RETURN NEW;',()=>"-- don't alter data\n/* don't /* nested */ */\nPERFORM 'hello\nworld';");
  b.functions[0].definition=a.functions[0].definition.replace(/\n/g,'\r\n');
  assert.equal(compareCatalogs(a,b).match,false);
});

test('SQL logic, function grants, policy text and non-function line endings stay strict',()=>{
  const a=catalog(),b=clone(a);b.functions[0].definition=definition.replace('RETURN NEW','RETURN OLD');
  b.functions[0].grants.push('anon=X/postgres');b.policies[0].qual='id =\r\n1';
  const r=compareCatalogs(a,b);assert.equal(r.match,false);
  assert.deepEqual(r.differences.map(x=>x.property),['definition','grants','qual']);
  assert.ok(!JSON.stringify(r).includes('RETURN OLD')); // report hashes SQL, private capture retains exact SQL
});

test('missing/extra constraints, indexes, triggers and overloads are named independently',()=>{
  const a=catalog(),b=clone(a);a.constraints=[{table_name:'users',name:'users_pkey',definition:'PRIMARY KEY (id)'}];
  b.indexes=[{tablename:'users',indexname:'extra',indexdef:'CREATE INDEX extra ON users(id)'}];
  b.triggers=[{table_name:'users',name:'extra_trigger',definition:'trigger text'}];
  b.functions.push({...b.functions[0],name:'public.example(integer)'});
  assert.deepEqual(compareCatalogs(a,b).differences.map(x=>x.object),[
    'constraints:users.users_pkey','indexes:users.extra','triggers:users.extra_trigger','functions:public.example(integer)']);
});

test('object order is ignored but column order and actual ACL entries stay strict',()=>{
  const a=catalog(),b=clone(a);a.relations[0].columns.push({name:'name',type:'text'});
  b.relations=clone(a.relations);b.relations[0].columns.reverse();
  assert.equal(compareCatalogs(a,b).differences[0].property,'columnOrder');
  assert.throws(()=>compareCatalogs(a,{...b,functions:[...b.functions,...b.functions]}),/Ambiguous/);
});

test('new bounds follow disabled timeout header and precede restored DDL',()=>{
  const sql=boundRestoreTimeouts('SET statement_timeout = 0;\r\nSET lock_timeout = 0;\r\nSET row_security = off;\r\nCREATE TABLE example();');
  assert.ok(sql.indexOf("statement_timeout='60s'")>sql.indexOf('statement_timeout = 0'));
  assert.ok(sql.indexOf("lock_timeout='5s'")<sql.indexOf('CREATE TABLE'));
  assert.throws(()=>boundRestoreTimeouts('CREATE TABLE example();'),/Unrecognized/);
  assert.throws(()=>boundRestoreTimeouts('SET row_security = off;\nSET row_security = off;'),/Unrecognized/);
});

test('generated SQL captures catalog and all 17 sequences before unconditional rollback',()=>{
  const sql=buildDiagnosticSQL(manifest,sequences);
  for(const x of sequences)assert.ok(sql.includes(`FROM public."${x.name}"`));
  assert.equal((sql.match(/EXCEPTION WHEN OTHERS/g)||[]).length,19);
  assert.ok(sql.includes("jsonb_build_object('errorCode',SQLSTATE)"));
  assert.ok(!sql.includes('SQLERRM'));assert.ok(!sql.includes('RAISE EXCEPTION'));
  assert.ok(sql.indexOf(diagnosticPrefix)<sql.lastIndexOf('ROLLBACK;'));
  assert.ok(sql.endsWith('ROLLBACK;\n'));assert.ok(!/\bCOMMIT\s*;/.test(sql));
});

test('all 17 sequence results are evaluated despite schema mismatch and individual sequence failure',()=>{
  const a=catalog();a.relations[0].rls=false;
  const r=evaluateDiagnostics(output(a,rows=>{rows[2].payload={errorCode:'42P01'};rows[3].payload.last_value='999';}),manifest,sequences,catalog());
  assert.equal(r.pass,false);assert.equal(r.sequenceChecks.length,17);
  assert.equal(r.sequenceChecks.filter(x=>x.match).length,15);
  assert.equal(r.catalogComparison.differences[0].property,'rls');
  assert.equal(r.errors[0].errorCode,'42P01');
});

test('capture failure does not hide remaining checks; missing/duplicate output fails closed',()=>{
  const r=evaluateDiagnostics(output(catalog(),rows=>{rows[0].payload={errorCode:'57014'};rows.pop();}),manifest,sequences,catalog());
  assert.equal(r.pass,false);assert.equal(r.sequenceChecks.length,17);assert.equal(r.errors.length,2);
  assert.throws(()=>evaluateDiagnostics('ROLLBACK',manifest,sequences,catalog()),/Missing/);
  assert.throws(()=>evaluateDiagnostics(output()+output(),manifest,sequences,catalog()),/ambiguous/);
});

test('successful complete synthetic diagnostics pass',()=>{
  const r=evaluateDiagnostics(output(),manifest,sequences,catalog());
  assert.equal(r.pass,true);assert.equal(r.sequenceChecks.length,17);
  assert.equal(normalizeFunctionText(definition),definition);
});

test('sequence values larger than safe JS integers remain exact strings',()=>{
  const large=[{name:'large_id_seq',last_value:'9223372036854775806',is_called:false}];
  const rows=[{kind:'catalog',name:'public',payload:catalog()},
    {kind:'sequence',name:'large_id_seq',payload:{last_value:'9223372036854775807',is_called:false}}];
  const r=evaluateDiagnostics(diagnosticPrefix+JSON.stringify(rows),[],large,catalog());
  assert.equal(r.sequenceChecks[0].match,false);assert.equal(r.pass,false);
});

test('rollback audit checks data, schema, sequences, roles and default grants strictly',async()=>{
  const before={catalog:catalog(),tables:{users:{rows:'0',data_checksum:'x'}},
    sequences:{users_id_seq:{last_value:'1',is_called:false}},roles:[{rolname:'anon'}],memberships:[],defaults:[{grants:['postgres=rwU/postgres']}]};
  assert.equal((await auditRollback(before,async()=>clone(before))).verified,true);
  for(const property of Object.keys(before)) {
    const after=clone(before);after[property]=null;
    assert.equal((await auditRollback(before,async()=>after)).verified,false);
  }
  const lineEndingChange=clone(before);lineEndingChange.catalog.functions[0].definition=definition.replace(/\n/g,'\r\n');
  assert.equal((await auditRollback(before,async()=>lineEndingChange)).verified,false);
  await assert.rejects(auditRollback(before,async()=>{throw Error('synthetic unavailable audit');}),/unavailable/);
});

test('import and unflagged CLI cannot initialize a database client or load credentials',()=>{
  const modulePath=path.join(__dirname,'verify-migration006-backup.cjs');
  const imported=spawnSync(process.execPath,['-e',`const M=require('module');const load=M._load;M._load=function(n,...a){if(n==='pg')return {Client:class{constructor(){throw Error('CLIENT_MUST_NOT_BE_CREATED')}}};return load.call(this,n,...a)};require(${JSON.stringify(modulePath)});`],{encoding:'utf8'});
  assert.equal(imported.status,0);assert.equal(imported.stdout,'');
  const cli=spawnSync(process.execPath,[modulePath],{encoding:'utf8',env:{...process.env,DATABASE_URL:'DO_NOT_EXPOSE_THIS_SECRET'}});
  assert.equal(cli.status,1);assert.ok(!cli.stdout.includes('DO_NOT_EXPOSE'));assert.equal(cli.stderr,'');
});
