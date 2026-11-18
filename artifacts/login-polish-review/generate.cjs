const fs = require('node:fs');
let s = fs.readFileSync('artifacts/developer-branding-review/check.mjs','utf8').split('async function check(')[0];
s=s.replaceAll('developer-branding-review','login-polish-review').replaceAll('9359','9360').replaceAll('district-branding-','district-polish-');
s=s.replace('plugins: [react()]', `define: { 'import.meta.env.VITE_ENABLE_ADMIN_USERNAME_RECOVERY': process.argv.includes('--flag-off') ? '"false"' : '"true"' }, plugins: [{ name: 'before-css', load(id) { if (process.argv.includes('--before') && id.replaceAll('\\\\', '/').endsWith('/src/App.css')) return fs.readFileSync(path.join(output, 'before.css'), 'utf8') } }, react()]`);
const start=s.indexOf("  if (name.startsWith('api/')) {"); const end=s.indexOf('  const data = files.get',start);
s=s.slice(0,start)+`  requests.push({name,method:req.method});
  if(name.startsWith('api/')) {
    const data = name==='api/me' ? {message:'Synthetic signed out'} : name==='api/login' ? {message:'Synthetic invalid credentials'} : {message:'Synthetic recovery request accepted'};
    res.writeHead(name==='api/me'||name==='api/login'?401:200,{'Content-Type':'application/json'});res.end(JSON.stringify(data));return;
  }
  if(name==='login-tropical-sunset-v2.webp'&&imageMode==='failure'){res.writeHead(404);res.end();return;}
`+s.slice(end);
s=s.replace('let authenticated = false',"let imageMode = 'normal', requests = [];\nlet authenticated = false");
s=s.replace('async function page(width) {','async function page(width, height = 844, setup) {');
s=s.replace('height: width < 768 ? 844 : 1000','height');
s=s.replace("  await call('Page.navigate', { url: origin })", "  if (setup) await setup(call);\n  await call('Page.navigate', { url: origin })");
s=s.replace("const r = await call('Page.captureScreenshot', { captureBeyondViewport: true })", "const r = await call('Page.captureScreenshot')");
fs.writeFileSync('artifacts/login-polish-review/check.mjs',s+fs.readFileSync('artifacts/login-polish-review/cases.txt','utf8'));
