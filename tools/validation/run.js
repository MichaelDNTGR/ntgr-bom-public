// Runs every validation scenario through the engine and prints the uplink and optic choices.
// Usage: node tools/validation/run.js [catalog.json]
const path=require('path'), ENG=require('../../src/engine.js'), SC=require('./scenarios.js');
const cat=require(path.resolve(process.argv[2]||path.join(__dirname,'../../data/catalog.json')));
for(const s of SC){
  const r=ENG.design(cat,{project:s.project,locations:s.locations,endpoints:cat.Endpoints});
  const core=r.core&&r.core.p?`${r.dualCore?'2 x ':''}${r.core.p.Model_Name}${r.core.isl?`, core-to-core ${r.core.isl} x ${r.core.islSpeed}G`:''}`:(r.standalone?'none (standalone)':'none');
  console.log(`\n${s.id} ${s.title}  [strategy: ${r.strategy||'-'}, score ${Math.round(r.score||0)}]\n  expect: ${s.expect}\n  core: ${core}`);
  r.accessNodes.forEach(a=>console.log(`  ${a.loc}: ${a.n} x ${a.model}${a.up.u?`, ${a.up.u} x ${a.up.speed}G`:''}${a.group!=='All endpoints'?` (${a.group})`:''}`));
  const opt=r.bom.filter(b=>/Optics|Cabling/.test(b.cat)); if(opt.length) console.log('  optics/cables: '+opt.map(b=>`${b.qty} x ${b.sku} (${b.loc})`).join(', '));
  r.errors.forEach(e=>console.log(`  ERROR ${e.loc}: ${e.msg}`));
  r.notes.filter(n=>n.lvl==='warn'||/faster|boundary|AVB/i.test(n.msg)).forEach(n=>console.log(`  ${n.lvl}: ${n.msg}`));
}
