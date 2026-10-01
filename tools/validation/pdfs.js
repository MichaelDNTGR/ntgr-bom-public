// Writes one PDF design report per scenario to docs/examples/validation, using the app's own report builder in headless Chrome.
// Needs Google Chrome and puppeteer-core: npm i --no-save puppeteer-core, then node tools/validation/pdfs.js

const puppeteer=require('puppeteer-core'), fs=require('fs');
const SC=require('./scenarios.js'), OUT=require('path').join(__dirname,'../../docs/examples/validation');
(async()=>{
  const b=await puppeteer.launch({executablePath:process.env.CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
  const pg=await b.newPage(); pg.on('pageerror',e=>console.log('PAGEERR',e.message));
  await pg.goto('file://'+require('path').join(__dirname,'../../index.html'),{waitUntil:'networkidle0'});
  await pg.waitForFunction('window.jspdf && window.jspdf.jsPDF.API.autoTable');
  for(const s of SC){
    const b64=await pg.evaluate(async s=>{
      state={project:{...DEFAULT().project,...s.project},endpoints:[...CAT.Endpoints,...s.extraEndpoints].map(e=>({...e})),locations:s.locations}; run();
      const blob=await buildPdf(); const u=new Uint8Array(await blob.arrayBuffer()); let x=''; for(let i=0;i<u.length;i+=0x8000) x+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(x);
    },s);
    const f=`${OUT}/${s.id}-${s.title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/-$/,'')}.pdf`;
    fs.writeFileSync(f,Buffer.from(b64,'base64')); console.log('wrote',f.split('/').pop());
  }
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
