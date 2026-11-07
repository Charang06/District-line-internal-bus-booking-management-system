const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const {copyField,validateCopyData}=require('./migration006-source-deploy.cjs');
const md5=x=>createHash('md5').update(x).digest('hex');

test('archive COPY decoding preserves null, literal backslashes, delimiters and Unicode',()=>{
  assert.equal(copyField('\\N'),null);
  assert.equal(copyField('\\\\N'),'\\N');
  assert.equal(copyField('line\\nnext\\tfield\\r\\b\\f\\v'),'line\nnext\tfield\r\b\f\v');
  assert.equal(copyField('\\141\\x62'),'ab');
  assert.equal(copyField('සිංහල'),'සිංහල');
});
test('full archive data readback is compared with snapshot counts, columns and row fingerprints',()=>{
  const rows=[['7','සිංහල',null],['8','line\nnext','\\N']];
  const expected={schema:'public',name:'example',columns:['id','name','value'],rows:'2',copyChecksum:md5(rows.map(x=>md5(JSON.stringify(x))).sort().join(''))};
  const archive="COPY public.example (id, name, value) FROM stdin;\r\n7\tසිංහල\t\\N\r\n8\tline\\nnext\t\\\\N\r\n\\.\r\nSELECT pg_catalog.setval('public.example_id_seq', 8, true);\r\n";
  const result=validateCopyData(archive,[expected]);
  assert.equal(result.passed,true);assert.deepEqual(result.sequences,{example_id_seq:{last_value:'8',is_called:true}});
  assert.equal(validateCopyData(archive.replace('7\t','9\t'),[expected]).passed,false);
  assert.equal(validateCopyData('',[expected]).passed,false);
});
test('missing application data or partial COPY blocks fail; empty managed extension omissions are explicit',()=>{
  const empty={schema:'public',name:'required',rows:'0',columns:['id'],copyChecksum:md5('')};
  assert.equal(validateCopyData('',[empty]).passed,false);
  assert.throws(()=>validateCopyData('COPY public.required (id) FROM stdin;\n1\n',[empty]),/Incomplete/);
  const managed={...empty,schema:'managed'};
  const result=validateCopyData('',[managed]);assert.equal(result.passed,true);assert.deepEqual(result.omittedEmptyManaged,['managed.required']);
});
