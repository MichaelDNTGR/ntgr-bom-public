// Builds index.html from src/template.html, the catalog and the scripts in src/.
// Usage: node tools/build.js
const fs=require('fs'), path=require('path'), R=p=>path.join(__dirname,'..',p), read=p=>fs.readFileSync(R(p),'utf8');
const html=read('src/template.html')
  .replace('@@CATALOG@@',()=>read('data/catalog.json').trim())
  .replace('/*@@LOGOS@@*/',()=>read('src/logos.js'))
  .replace('/*@@ENGINE@@*/',()=>read('src/engine.js'))
  .replace('/*@@UI@@*/',()=>read('src/ui.js'));
fs.writeFileSync(R('index.html'),html); console.log('index.html built,',html.length,'bytes');
