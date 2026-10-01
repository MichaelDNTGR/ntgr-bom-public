// Rebuilds data/catalog.json from catalog/NETGEAR_BoM_Catalog.xlsx, reading the sheets exactly as the
// tool's "publish catalog" upload does (SheetJS, header on row 4).
// Usage: npm i --no-save xlsx@0.18.5 && node tools/catalog_from_xlsx.js [--check]
const fs=require('fs'), path=require('path'), XLSX=require('xlsx');
const R=p=>path.join(__dirname,'..',p);
const SHEETS=['Products','SKUs','Accessories','Compatibility','PSU_PoE_Matrix','Design_Rules','Endpoints','Port_Types','Tool_Settings'];
const wb=XLSX.read(fs.readFileSync(R('catalog/NETGEAR_BoM_Catalog.xlsx')),{type:'buffer'});
const readSheet=name=>{ const ws=wb.Sheets[name]; if(!ws) return []; return XLSX.utils.sheet_to_json(ws,{range:3,defval:null}).filter(r=>Object.values(r)[0]!==null).map(r=>Object.fromEntries(Object.entries(r).filter(([k,v])=>v!==null&&!/^__EMPTY/.test(k)))); };
const cat=Object.fromEntries(SHEETS.map(n=>[n,readSheet(n)]));
const out=JSON.stringify(cat);
if(process.argv.includes('--check')){
  const cur=fs.readFileSync(R('data/catalog.json'),'utf8');
  if(cur===out){ console.log('data/catalog.json matches the workbook'); process.exit(0); }
  const a=JSON.parse(cur); for(const n of SHEETS){ const x=JSON.stringify(a[n]), y=JSON.stringify(cat[n]); if(x!==y){ const i=[...x].findIndex((c,j)=>c!==y[j]); console.log(`${n} differs near: ...${x.slice(Math.max(0,i-80),i+80)}\n   workbook: ...${y.slice(Math.max(0,i-80),i+80)}`); } }
  process.exit(1);
}
fs.writeFileSync(R('data/catalog.json'),out); console.log('data/catalog.json written from the workbook');
