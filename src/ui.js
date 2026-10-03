// ===== UI v2: customer mode + team mode =====
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=(v,d=0)=>(v===null||v===undefined||v===''||isNaN(v))?'–':(+v).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:d});
const BUILTIN=JSON.parse(document.getElementById('catalog').textContent);
let CAT=BUILTIN, CATMETA={version:ENG.settings(BUILTIN).Catalog_Version,source:'Built-in catalog',publishedAt:null};
const SET=()=>ENG.settings(CAT);
const nid=()=>'L'+Math.random().toString(36).slice(2,8);
const DEFAULT=()=>{ const T=SET(); return {project:{name:'',region:'Americas',taa:false,psuRed:true,dualUplink:true,dualCore:true,basis:'line',oversub:+T.Default_Oversubscription||1,spare:+T.Default_Spare_Pct||10,poeHead:+T.Default_PoE_Headroom_Pct||20,voltage:110,gateway:true,support:'',family:'Auto',mdfPatch:3,coreOverride:'Auto',islRule:'half',psuScope:'all',gwLink:'best',upSpeed:'',priority:'best',ptpMode:'bc'},
  endpoints:CAT.Endpoints.map(e=>({...e})),
  locations:[{id:nid(),name:'Main equipment room',type:'MDF',distance:3,media:'MMF',override:'Auto',eps:[{ep:'EP-1G-TX',qty:16},{ep:'EP-10G-TX',qty:4},{ep:'EP-DANTE',qty:8}]},
    {id:nid(),name:'Closet 1',type:'IDF',distance:150,media:'MMF',override:'Auto',eps:[{ep:'EP-1G-RX',qty:24},{ep:'EP-PTZ',qty:4},{ep:'EP-WBE758',qty:4}]},
    {id:nid(),name:'Closet 2',type:'IDF',distance:600,media:'SMF',override:'Auto',eps:[{ep:'EP-1G-RX',qty:12},{ep:'EP-10G-FX',qty:4},{ep:'EP-PANEL',qty:6}]}]}; };
let state; try{ state=JSON.parse(localStorage.getItem('ntgr-bom-v2')||'null'); }catch(e){ state=null; }
if(!state||!state.project||!state.locations) state=DEFAULT();
state.project={...DEFAULT().project,...state.project}; fixSupport(state.project);
// a saved session keeps its own device library; pick up devices and fields added to the catalog since, without overwriting edits
CAT.Endpoints.forEach(e=>{ const i=state.endpoints.findIndex(x=>x.Endpoint_ID===e.Endpoint_ID); if(i>=0) state.endpoints[i]={...e,...state.endpoints[i]}; else state.endpoints.push({...e}); });
let result=null, tab='diagram', view='customer', canTeam=false, advOpen=false, libOpen=false;
// Optional shared-backend hooks. They remain null in the standalone browser build.
let DB=null, UID=null, REQS=[], staged=null;
const save=()=>{ try{ localStorage.setItem('ntgr-bom-v2',JSON.stringify(state)); }catch(e){} };
const team=()=>canTeam; // editors see advanced controls inline; admin tools live on the admin page

function swOpts(sel){ return `<option value="Auto"${sel==='Auto'?' selected':''}>Automatic</option>`+CAT.Products.filter(p=>p.Category==='Switch').map(p=>`<option value="${esc(p.Product_ID)}"${sel===p.Product_ID?' selected':''}>${esc(p.Model_Name)}</option>`).join(''); }
function epOpts(sel){ const groups={}; state.endpoints.forEach(e=>(groups[e.Category||'Other']=groups[e.Category||'Other']||[]).push(e));
  return Object.entries(groups).map(([g,es])=>`<optgroup label="${esc(g)}">${es.map(e=>`<option value="${esc(e.Endpoint_ID)}"${e.Endpoint_ID===sel?' selected':''}>${esc(e.Name)}</option>`).join('')}</optgroup>`).join(''); }

// Support contracts: Sprint (24x5), Overdrive (24x7, 2h P1), Fastlane (24x7, L3). Only tiers offered for a product in the design are listed.
const SUP_TIERS=[['SPR','Sprint','24x5, advance RMA'],['DRV','Overdrive','24x7, 2h SLA, NBD RMA'],['FLS','Fastlane','24x7, L3, NBD RMA']];
// older projects stored OnCall years as a number; OnCall was 24x7, so it maps to Overdrive
function fixSupport(p){ if(typeof p.support==='number'||/^\d+$/.test(String(p.support))) p.support=+p.support?'DRV:'+(+p.support):''; }
function supportSel(){
  const P=state.project, pids=new Set();
  if(result){ result.accessNodes.forEach(n=>pids.add(n.pid)); if(result.core&&result.core.p) pids.add(result.core.p.Product_ID);
    if(P.gateway) pids.add(SET().Gateway_Product_ID||'PR460X'); state.locations.forEach(L=>L.eps.forEach(e=>{ const ep=state.endpoints.find(z=>z.Endpoint_ID===e.ep); if(ep&&ep.NETGEAR_Product_ID) pids.add(ep.NETGEAR_Product_ID); })); }
  const prods=CAT.Products.filter(p=>pids.has(p.Product_ID));
  const avail=t=>!prods.length||prods.some(p=>new RegExp('\\b'+t+'\\b','i').test(p.Support_Tiers||''));
  const cur=String(P.support||'');
  return `<select data-p="support"><option value=""${cur?'':' selected'}>Not included</option>${SUP_TIERS.filter(([,n])=>avail(n)||cur.startsWith(n)).map(([c,n,d])=>`<optgroup label="${n} (${d})">${[1,3,5].map(y=>`<option value="${c}:${y}"${cur===c+':'+y?' selected':''}>${n}, ${y} year${y>1?'s':''}</option>`).join('')}</optgroup>`).join('')}</select>`;
}
function renderInputs(){
  const P=state.project;
  const sel=(k,opts)=>`<select data-p="${k}">${opts.map(([v,l])=>`<option value="${v}"${String(P[k])===String(v)?' selected':''}>${l}</option>`).join('')}</select>`;
  const tog=(k,l,h)=>`<label class="tog"><input type="checkbox" data-p="${k}"${P[k]?' checked':''}><span class="sw"></span><span><b>${l}</b>${h?`<small>${h}</small>`:''}</span></label>`;
  const num=(k,l,u,min,max)=>`<label class="fld"><span>${l}</span><span class="nu"><input type="number" data-p="${k}" value="${esc(P[k])}" min="${min}" max="${max}"><i>${u}</i></span></label>`;
  $('#project').innerHTML=`
    <label class="fld wide"><span>Project name</span><input type="text" data-p="name" value="${esc(P.name)}" placeholder="e.g. Riverside campus AV upgrade"></label>
    <div class="grid2">
      <label class="fld"><span>Country / region</span>${sel('region',[['Americas','Americas'],['Europe','Europe'],['APAC','Asia Pacific'],['China','China']])}</label>
      <label class="fld"><span>Mains power</span>${sel('voltage',[[110,'110–120 V'],[220,'220–240 V']])}</label>
    </div>
    <div class="togs">
      ${tog('psuRed','Redundant power supplies','Keeps PoE running if a PSU fails')}
      ${tog('dualCore','Redundant core network','Two core switches, dual uplinks')}
      ${tog('taa','TAA-compliant products','For US federal and government projects')}
      ${tog('gateway','Include internet gateway','NETGEAR PR460X Pro Router')}
    </div>
    ${P.psuRed?`<fieldset class="seg"><legend>Redundant power applies to</legend>
      ${[['all','All switches'],['mdf','Main equipment room only']].map(([v,l])=>`<label><input type="radio" name="psuScope" data-p="psuScope" value="${v}"${(P.psuScope||'all')===v?' checked':''}><span>${l}</span></label>`).join('')}
    </fieldset>${P.psuScope==='mdf'?'<p class="hint">Core and main equipment room switches get redundant power supplies. Closet switches use a single power supply.</p>':''}`:''}
    <fieldset class="seg"><legend>Switch series</legend>
      ${[['Auto','Best fit'],['M4250','M4250 only'],['M4350','M4350 only']].map(([v,l])=>`<label><input type="radio" name="family" data-p="family" value="${v}"${P.family===v?' checked':''}><span>${l}</span></label>`).join('')}
    </fieldset>
    ${P.family==='M4250'?`<p class="hint">M4250 has 1G PoE access ports, SFP+ uplinks and no 2.5G/10G PoE ports.${P.psuRed?' With redundant power on, only the M4250 PoE++ models (multiple PSUs) qualify.':''}${P.taa?' No M4250 model has a TAA SKU.':''}</p>`:''}`;
  $('#adv').innerHTML=advOpen?`<div class="grid2">
      <label class="fld"><span>Design basis</span>${sel('basis',[['line','Line-rate (full link speed)'],['stream','Actual stream bandwidth']])}</label>
      <label class="fld"><span>Uplink oversubscription</span>${sel('oversub',[[1,'1:1 non-blocking'],[2,'2:1'],[3,'3:1'],[4,'4:1']])}</label>
      ${num('spare','Spare ports','%',0,100)}${num('poeHead','PoE headroom','%',0,100)}
      ${num('mdfPatch','Patch length in main room','m',1,20)}
      <label class="fld"><span>Uplink speed</span>${sel('upSpeed',[['','Automatic (lowest cost)'],['10','Prefer 10G'],['25','Prefer 25G'],['100','Prefer 100G']])}</label>
      ${state.locations.some(L=>L.eps.some(e=>{ const ep=state.endpoints.find(z=>z.Endpoint_ID===e.ep); return ep&&ep.Timing==='PTP-BC'&&+e.qty>0; }))?`<label class="fld"><span>ST 2110 / AES67 timing</span>${sel('ptpMode',[['bc','Boundary clock (recommended)'],['tc','Transparent clock allowed']])}</label>`:''}
      <label class="fld"><span>Core-to-core link sizing</span>${sel('islRule',[['failover','Busiest switch (failover)'],['half','Half of all traffic'],['full','All traffic (non-blocking)']])}</label>
      ${P.gateway?`<label class="fld"><span>Router link</span>${sel('gwLink',[['best','Best available in main room'],['10g','10G required']])}</label>`:''}
      <label class="fld"><span>Support contract</span>${supportSel()}</label>
      ${team()?`<label class="fld"><span>Design priority (internal)</span>${sel('priority',[['best','Best design (fewest switches)'],['cost','Lowest cost']])}</label>`:''}
      ${team()?`<label class="fld"><span>Core model</span><select data-p="coreOverride">${swOpts(P.coreOverride||'Auto')}</select></label>
      <label class="fld"><span>Separate dual uplinks</span>${sel('dualUplink',[['true','Always 2+ uplinks'],['false','Single uplink allowed']])}</label>`:''}
    </div>`:'';
  $('#advbtn').setAttribute('aria-expanded',advOpen);
  $('#locs').innerHTML=state.locations.map((L,li)=>{
    const nodes=result?result.accessNodes.filter(a=>a.loc===L.name):[], err=result?result.errors.find(e=>e.loc===L.name):null;
    const total=L.eps.reduce((s,e)=>s+(+e.qty||0),0);
    return `<section class="loc${L.type==='MDF'?' mdf':''}" data-l="${li}">
      <header><input class="lname" data-lf="name" value="${esc(L.name)}" aria-label="Room name">
        <span class="kind">${L.type==='MDF'?'MDF':'IDF'}</span>
        ${L.type==='IDF'?`<button class="ghost x" data-act="dell" aria-label="Remove ${esc(L.name)}">×</button>`:''}</header>
      ${L.type==='IDF'?`<div class="grid2 tight"><label class="fld"><span>Fiber run to main room</span><span class="nu"><input type="number" data-lf="distance" value="${esc(L.distance)}" min="1"><i>m</i></span></label>
        <label class="fld"><span>Fiber type</span><select data-lf="media"><option value="MMF"${L.media==='MMF'?' selected':''}>Multimode (OM3/OM4)</option><option value="SMF"${L.media==='SMF'?' selected':''}>Single mode</option></select></label></div>`:''}
      <div class="eph"><span>Device</span><span>Qty</span></div>
      <div class="eps">${L.eps.map((e,ei)=>`<div class="ep" data-e="${ei}"><select data-ef="ep" aria-label="Device type">${epOpts(e.ep)}</select>
        <input type="number" min="0" data-ef="qty" value="${esc(e.qty)}" aria-label="Quantity"><button class="ghost x" data-act="dele" aria-label="Remove device">×</button></div>`).join('')}</div>
      <div class="lfoot"><button class="ghost add" data-act="adde">Add device</button><span class="mut">${fmt(total)} devices</span></div>
      <label class="fld wide"><span>Connectors</span><select data-lf="conn"><option value=""${L.conn?'':' selected'}>Default (RJ45 and LC fiber)</option><option value="neutrik"${L.conn==='neutrik'?' selected':''}>Neutrik (etherCON)</option></select></label>
      ${L.conn==='neutrik'?`<label class="fld wide"><span>Uplink card (M4350-16M4V)</span><select data-lf="card"><option value=""${L.card?'':' selected'}>APM414V: 4 × SFP28, LC fiber (included)</option><option value="quad"${L.card==='quad'?' selected':''}>opticalCON QUAD (APM414SD multimode / APM414LD single mode)</option></select></label>`:''}
      ${team()?`<label class="fld wide"><span>Access switch</span><select data-lf="override">${swOpts(L.override||'Auto')}</select></label>`:''}
      ${err?`<p class="err">${esc(err.msg)}</p>`:''}
      ${nodes.length?`<div class="pick">${nodes.map(n=>`<p><b>${n.n} × ${esc(n.model)}</b> <span>${n.up.u?(state.project.dualCore&&result.core?`${n.up.u/2} × ${n.up.speed}G to each core${n.n>1?', per switch':''}`:`${n.up.u} × ${n.up.speed}G uplinks ${n.n>1?'each':''}`):'standalone'}</span></p>
        ${team()&&n.alts.length>1?`<p class="alts">Also fits: ${n.alts.filter(a=>a.pid!==n.pid).slice(0,3).map(a=>`<button class="chip" data-act="use" data-pid="${esc(a.pid)}">${esc(a.name)} × ${a.n}</button>`).join('')}</p>`:''}`).join('')}</div>`:''}
    </section>`;}).join('');
  $('#libwrap').hidden=!team();
  $('#lib').innerHTML=team()&&libOpen?`<div class="libt"><div class="lr lh"><span>Device</span><span>Link</span><span>Media</span><span>PoE W</span><span>Mb/s</span><span>Timing</span><span></span></div>
    ${state.endpoints.map((e,i)=>`<div class="lr" data-i="${i}"><input data-xf="Name" value="${esc(e.Name)}" aria-label="Device name">
      <select data-xf="Link_Speed_Gbps">${String(SET().Endpoint_Speeds_Gbps||'1,2.5,10,25').split(',').map(Number).map(v=>`<option value="${v}"${+e.Link_Speed_Gbps===v?' selected':''}>${v}G</option>`).join('')}</select>
      <select data-xf="Media">${['Copper','Fiber'].map(v=>`<option${e.Media===v?' selected':''}>${v}</option>`).join('')}</select>
      <input type="number" min="0" max="90" data-xf="PoE_W" value="${esc(e.PoE_W??0)}" aria-label="PoE watts"><input type="number" min="0" data-xf="Stream_Mbps" value="${esc(e.Stream_Mbps??'')}" aria-label="Stream Mbps">
      <select data-xf="Timing" aria-label="Timing requirement">${[['','Any'],['PTP-BC','PTP BC'],['AVB','AVB']].map(([v,l])=>`<option value="${v}"${(e.Timing||'')===v?' selected':''}>${l}</option>`).join('')}</select>
      <button class="ghost x" data-act="delx" aria-label="Remove device type">×</button></div>`).join('')}
    <button class="ghost add" data-act="addx">Add device type</button><p class="mut small">Session-only. Make permanent changes in the Endpoints sheet and publish the catalog.</p></div>`:'';
  $('#libbtn').textContent=libOpen?'Hide device library':'Edit device library';
}

function run(){ result=ENG.design(CAT,state); save(); renderInputs(); renderResults(); }
let tmr; const later=()=>{ clearTimeout(tmr); tmr=setTimeout(run,300); };
document.addEventListener('input',ev=>{
  const t=ev.target; if(!t.dataset||t.closest('#modal')||t.closest('#adminpage')) return;
  const val=t.type==='checkbox'?t.checked:(t.type==='number'?(t.value===''?'':+t.value):t.value);
  if(t.dataset.p){ let v=val; if(['dualUplink'].includes(t.dataset.p)&&t.tagName==='SELECT') v=(val==='true'); if(['voltage','oversub'].includes(t.dataset.p)) v=+val;
    state.project[t.dataset.p]=v; if(t.dataset.p==='dualCore'){ state.project.dualUplink=v; } }
  else if(t.dataset.lf){ state.locations[+t.closest('.loc').dataset.l][t.dataset.lf]=val; }
  else if(t.dataset.ef){ state.locations[+t.closest('.loc').dataset.l].eps[+t.closest('.ep').dataset.e][t.dataset.ef]=val; }
  else if(t.dataset.xf){ const e=state.endpoints[+t.closest('.lr').dataset.i]; e[t.dataset.xf]=t.dataset.xf==='Link_Speed_Gbps'?+val:val; }
  else return;
  if(t.tagName==='SELECT'||t.type==='checkbox'||t.type==='radio') run(); else { save(); later(); } // typing: one design run 300 ms after the last keystroke
});
document.addEventListener('click',ev=>{
  const b=ev.target.closest('[data-act],[data-tab]'); if(!b) return;
  if(b.dataset.tab){ tab=b.dataset.tab; renderResults(); return; }
  const loc=b.closest('.loc'), li=loc?+loc.dataset.l:-1, a=b.dataset.act;
  switch(a){
    case 'adde': state.locations[li].eps.push({ep:state.endpoints[0].Endpoint_ID,qty:1}); break;
    case 'dele': state.locations[li].eps.splice(+b.closest('.ep').dataset.e,1); break;
    case 'dell': state.locations.splice(li,1); break;
    case 'use': state.locations[li].override=b.dataset.pid; break;
    case 'addl': { const n=state.locations.filter(l=>l.type==='IDF').length+1; state.locations.push({id:nid(),name:'Closet '+n,type:'IDF',distance:100,media:'MMF',override:'Auto',eps:[{ep:'EP-1G-RX',qty:8}]}); break; }
    case 'adv': advOpen=!advOpen; break;
    case 'lib': libOpen=!libOpen; break;
    case 'addx': state.endpoints.push({Endpoint_ID:'EP-CUSTOM-'+Date.now().toString(36),Name:'Custom device',Category:'Custom',Link_Speed_Gbps:1,Media:'Copper',PoE_W:0,Stream_Mbps:100}); break;
    case 'delx': { const i=+b.closest('.lr').dataset.i, id=state.endpoints[i].Endpoint_ID; if(state.locations.some(L=>L.eps.some(e=>e.ep===id))){ toast('That device type is used in a room. Remove it there first.'); return; } state.endpoints.splice(i,1); break; }
    case 'reset': if(!confirmReset()) return; state=DEFAULT(); break;
    case 'xlsx': return exportXlsx(); case 'csv': return exportCsv(); case 'svg': return exportSvg(); case 'pdf': return exportPdf();
    case 'reqpdf': return reqPdf(b.dataset.u,b.dataset.r);
    case 'json': return packProject(state).then(b=>saveFile(`${slug()}${PJ_EXT}`,b));
    case 'loadjson': return $('#fjson').click();
    case 'request': return openModal();
    case 'close': return closeModal();
    case 'package': return buildPackage();
    case 'dlzip': if(PKG){ saveFile(PKG.name,PKG.blob); track('package'); } return;
    case 'addatt': return $('#rq-files').click();
    case 'delatt': ATT.splice(+b.dataset.i,1); return renderAtt();
    case 'pickcat': return $('#fcat').click();
    case 'publishcat': return publishCatalog();
    case 'discard': staged=null; return renderAdmin();
    case 'dlpkg': markViewed([[b.dataset.u,b.dataset.r]]); return downloadStored(b.dataset.u,b.dataset.r);
    case 'viewreq': { const r=b.dataset.r; if(OPEN.has(r)) OPEN.delete(r); else { OPEN.add(r); markViewed([[b.dataset.u,r]]); } return renderAdmin(); }
    case 'viewall': return markViewed(allReqs().filter(isNew).map(r=>[r.uid,r.rid]));
    case 'openreq': markViewed([[b.dataset.u,b.dataset.r]]); return openReq(b.dataset.u,b.dataset.r);
    case 'revert': CAT=BUILTIN; CATMETA={version:ENG.settings(BUILTIN).Catalog_Version,source:'Built-in catalog'}; catInfo(); break;
    default: return;
  }
  run();
});
let resetArmed=0; function confirmReset(){ if(Date.now()-resetArmed<4000) return true; resetArmed=Date.now(); toast('Press Start over again to clear every room.'); return false; }

// ---------- results ----------
const CATORDER=['Switches','Power','Optics','Cabling','Wireless','Gateway','Support'];
// BoM grouped by brand: NETGEAR first, then other suppliers (e.g. optic.ca) alphabetically, then third-party parts, then placeholders
const brandKey=r=>r.brand||'To be confirmed';
const brandRank=b=>b==='NETGEAR'?0:(b==='Third party'?2:(b==='To be confirmed'?3:1));
const BRAND_NOTE={'NETGEAR':'','optic.ca':'NETGEAR-certified modules and cables (KB 000066694). Order from optic.ca.','Third party':'Not in the NETGEAR catalog: buy separately and confirm compatibility with the ProAV Design team.','To be confirmed':'Not in the catalog yet: the ProAV Design team will confirm the part.'};
const brandNote=b=>BRAND_NOTE[b]!==undefined?BRAND_NOTE[b]:'Third-party supplier: order from the supplier and confirm compatibility.';
function rollup(){ const m={}; for(const b of result.bom){ if(!m[b.sku]) m[b.sku]={...b,locs:new Set()}; else m[b.sku].qty+=b.qty; m[b.sku].locs.add(b.loc); }
  return Object.values(m).sort((a,b)=>brandRank(brandKey(a))-brandRank(brandKey(b))||brandKey(a).localeCompare(brandKey(b))||CATORDER.indexOf(a.cat)-CATORDER.indexOf(b.cat)||a.sku.localeCompare(b.sku)); }
const brandsOf=rows=>[...new Set(rows.map(brandKey))];
function roomPower(l){ const V=state.project.voltage, r=result.power.filter(p=>p.loc===l); const w=r.reduce((s,p)=>s+p.est*p.n,0), mx=r.reduce((s,p)=>s+p.max*p.n,0), ru=r.reduce((s,p)=>s+(p.half?p.ru/2:p.ru)*p.n,0);
  const amps=w/V, cA=V>=200?16:20; return {w,mx,ru,amps,cA,circ:Math.max(1,Math.ceil(amps/(cA*0.8))),btu:w*3.412,va:w/0.9}; }
function stats(){ return {sw:result.bom.filter(b=>b.cat==='Switches').reduce((s,b)=>s+b.qty,0),eps:result.totalEps,poe:result.power.reduce((s,p)=>s+p.poe*p.n,0),est:result.power.reduce((s,p)=>s+p.est*p.n,0),ru:result.power.reduce((s,p)=>s+(p.half?p.ru/2:p.ru)*p.n,0)}; }
function renderResults(){
  const s=stats(), T=result.settings;
  $('#disc').innerHTML=`<div><b>Estimate for planning only.</b> ${esc(T.Disclaimer||'This bill of materials is generated automatically as a budgetary estimate. It must be validated by the ProAV Design team before ordering.')}<br>Please click <b>Request validation</b> to download the design file.</div><button class="btn" data-act="request">Request validation</button>`;
  $('#stats').innerHTML=`<div><b>${fmt(s.eps)}</b><span>devices</span></div><div><b>${fmt(s.sw)}</b><span>switches</span></div><div><b>${fmt(s.poe)} W</b><span>PoE load</span></div><div><b>${fmt(s.est/1000,1)} kW</b><span>estimated power</span></div><div><b>${fmt(s.ru,1)} U</b><span>rack space</span></div>`;
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-selected',b.dataset.tab===tab));
  const warn=result.notes.filter(n=>n.lvl==='warn').length+result.errors.length;
  $('#tabchecks').textContent=warn?`Checks (${warn})`:'Checks';
  const out=$('#out');
  if(tab==='diagram') out.innerHTML=errs()+`<div class="scroll">${diagram(false)}</div><p class="cap">Green lines are uplinks, labelled with link count, speed and the optic or cable used. With a redundant core, every switch has its own full-capacity link group to each core, so either core can carry all traffic alone.</p>`;
  if(tab==='bom'){ const rows=rollup();
    out.innerHTML=errs()+`<div class="scroll"><table class="t"><thead><tr><th>Part number</th><th>Brand</th><th>Description</th><th class="r">Qty</th><th>Where</th>${team()?'<th>Notes</th>':''}</tr></thead><tbody>${
      brandsOf(rows).map(br=>{ const br_=rows.filter(r=>brandKey(r)===br), nc=team()?6:5;
        return `<tr class="brand"><td colspan="${nc}">${esc(br)}${brandNote(br)?`<small>${esc(brandNote(br))}</small>`:''}</td></tr>`+
      CATORDER.filter(c=>br_.some(r=>r.cat===c)).map(c=>`<tr class="grp"><td colspan="${nc}">${c}</td></tr>`+br_.filter(r=>r.cat===c).map(r=>`<tr class="${/^TBD/.test(r.sku)?'tbd':''}"><td class="sku">${/^TBD/.test(r.sku)?'To be confirmed':esc(r.sku)}</td><td>${esc(r.brand||'')}</td><td>${esc(r.desc)}</td><td class="r"><b>${fmt(r.qty)}</b></td><td>${esc([...r.locs].join(', '))}</td>${team()?`<td class="mut">${esc(r.note)}</td>`:''}</tr>`).join('')).join(''); }).join('')}</tbody></table></div>
      <p class="cap">Part numbers are for ${esc(state.project.region)}${state.project.taa?', TAA-compliant where available':''}. Pricing and availability are provided by NETGEAR or your distributor after validation.</p>`; }
  if(tab==='power'){ const P=state.project, locs=[...new Set(result.power.map(p=>p.loc))], eff=+T.PSU_Efficiency||0.9;
    out.innerHTML=`<div class="closets">${locs.map(l=>{ const r=roomPower(l);
        return `<div class="closet"><h4>${esc(l)}</h4><dl><dt>Estimated draw</dt><dd>${fmt(r.w)} W</dd><dt>Datasheet maximum</dt><dd>${fmt(r.mx)} W</dd><dt>Heat load</dt><dd>${fmt(r.btu)} BTU/hr</dd><dt>Current at ${P.voltage} V</dt><dd>${fmt(r.amps,1)} A</dd><dt>Circuits</dt><dd>${r.circ} × ${r.cA} A</dd><dt>UPS size</dt><dd>${fmt(r.va)} VA or more</dd><dt>Rack space</dt><dd>${fmt(r.ru,1)} U</dd></dl></div>`;}).join('')}</div>
      <h3>Power supplies per switch</h3><div class="scroll"><table class="t"><thead><tr><th>Room</th><th>Device</th><th class="r">Qty</th><th class="r">PoE load each</th><th>Power supplies</th><th class="r">PoE available${P.psuRed?' (after a PSU failure)':''}</th><th class="r">Headroom</th><th class="r">Est. draw each</th></tr></thead><tbody>${
      result.power.map(p=>`<tr><td>${esc(p.loc)}</td><td>${esc(p.model)}</td><td class="r">${p.n}</td><td class="r">${p.poe?fmt(p.poe)+' W':'–'}</td><td>${esc(p.cfg)}</td><td class="r">${p.budget?fmt(p.budget)+' W':'–'}</td><td class="r">${p.head!==null?fmt(p.head*100)+'%':'–'}</td><td class="r">${fmt(p.est)} W</td></tr>`).join('')}</tbody></table></div>
      <p class="cap">Estimated draw = datasheet maximum without PoE + PoE load ÷ ${eff} (PSU efficiency). Circuits assume 80% continuous load. ${P.psuRed?'Feed each power supply from a separate circuit or UPS.':''}</p>`; }
  if(tab==='checks') out.innerHTML=errs()+`<ul class="notes">${result.notes.map(n=>`<li class="${n.lvl}"><span>${n.lvl==='warn'?'!':'i'}</span>${esc(n.msg)}</li>`).join('')}</ul>
     <h3>Uplink plan</h3><div class="scroll"><table class="t"><thead><tr><th>Room</th><th>Switch</th><th class="r">Units</th><th class="r">Uplinks each</th><th>Speed</th><th>Run</th><th>Optic / cable</th></tr></thead><tbody>${result.links.map(l=>`<tr><td>${esc(l.loc)}</td><td>${esc(l.model)}</td><td class="r">${l.n}</td><td class="r">${l.u}</td><td>${l.speed}G</td><td>${esc(l.media)}${l.media!=='in-rack'?`, ${l.dist} m`:''}</td><td class="sku">${/^TBD/.test(l.optic)?'To be confirmed':esc(l.optic)}</td></tr>`).join('')||'<tr><td colspan="7" class="mut">Single switch, no uplinks needed.</td></tr>'}</tbody></table></div>`;
}
const errs=()=>result.errors.map(e=>`<p class="err"><b>${esc(e.loc)}:</b> ${esc(e.msg)}</p>`).join('');

// ---------- diagram ----------
const PRINT={page:'#FFFFFF',bg:'#F8FAFC',box:'#E2E8F0',line:'#16A35E',txt:'#101520',mut:'#64748B',gw:'#64748B'};
function diagram(forExport,pal){
  const cv=n=>getComputedStyle(document.documentElement).getPropertyValue(n).trim(); // export uses the colours currently on screen
  const C=pal||(forExport?{page:cv('--bg')||'#101520',bg:cv('--bg2')||'#161d2b',box:cv('--box')||'#2B3749',line:cv('--accent')||'#26E880',txt:cv('--fg')||'#FFFFFF',mut:cv('--mut')||'#94A3B8',gw:cv('--mut')||'#94A3B8'}:{bg:'var(--bg2)',box:'var(--box)',line:'var(--accent)',txt:'var(--fg)',mut:'var(--mut)',gw:'var(--mut)'});
  const F="Outfit, Arial, sans-serif", nodes=result.accessNodes, locs=state.locations.filter(L=>nodes.some(n=>n.loc===L.name));
  if(!locs.length) return `<p class="empty">Add devices to a room to see the network.</p>`;
  const core=result.core, cc=!!(core&&core.collapsed), coreRoom=cc?locs.find(L=>L.name===core.loc):null, row=cc?locs.filter(L=>L!==coreRoom):locs;
  const colW=250, gap=24, W=Math.max(760,row.length*(colW+gap)+gap), gwOn=state.project.gateway, gwRoom=result.gateway&&result.gateway.loc!=='core'?result.gateway:null;
  const G=result.gateway, gwLbl=G?[`1 × ${G.speed||10}G`+(G.via==='copper'?' copper':''),G.via==='copper'?`${(G.speed||10)>=10?'Cat6a':'Cat6'}, ${G.dist} m`:`${G.sku}${G.dist&&G.loc!=='core'?`, ${G.dist} m`:''}`]:null;
  // core box lists what plugs into it, so it grows with the number of room groups
  // one row per room, speed and part (a room with two switch groups shows its total)
  const cports=core&&core.ports&&!cc?Object.values(core.ports.reduce((m,r)=>{ const k=[r.loc,r.speed,r.sku,!!r.isl,!!r.first].join('|'); (m[k]=m[k]||{...r,perCore:0}).perCore+=r.perCore; return m; },{})):[], CL=15, coreH=core?(cports.length?84+cports.length*CL:62):0;
  const yGw=30, yCore=core?140:0, cx=W/2;
  const box=(x,y,w,h,f,st)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${f}"${st?` stroke="${st}" stroke-width="1.5"`:''}/>`;
  const text=(x,y,t,o={})=>`<text x="${x}" y="${y}" fill="${o.c||C.txt}" font-size="${o.s||13}" font-weight="${o.w||400}" text-anchor="${o.a||'middle'}" font-family="${F}">${esc(t)}</text>`;
  const UH=34, UG=6, EL=15; const unitH=(un,n)=>UH+un.eps.length*EL+8+(n.up.u?34:18);
  // a collapsed core lists the links it terminates inside the main-room box
  const ccRows=cc&&core.ports?Object.values(core.ports.reduce((m,r)=>{ const k=[r.loc,r.speed,r.sku].join('|'); (m[k]=m[k]||{...r,perCore:0}).perCore+=r.perCore; return m; },{})):[];
  const roomH=L=>{ const ns=nodes.filter(n=>n.loc===L.name); return 44+ns.reduce((a,n)=>a+16+n.units.reduce((b,un)=>b+unitH(un,n)+UG,0),0)+(result.links.some(l=>l.loc===L.name)?52:36)+8+(L===coreRoom?20+ccRows.length*15:0); };
  const hCoreRoom=coreRoom?roomH(coreRoom):0, yLoc=core?yCore+(cc?hCoreRoom:coreH)+98:(gwOn?170:40);
  const cb=[]; if(cc) cb.push({x:cx-colW/2,y:yCore,w:colW,h:hCoreRoom}); else if(core){ const bw=cports.length?260:190, cg=cports.length?100:40, tot=core.k*bw+(core.k-1)*cg; for(let i=0;i<core.k;i++) cb.push({x:cx-tot/2+i*(bw+cg),y:yCore,w:bw,h:coreH}); }
  const hs=row.map(roomH);
  const H=yLoc+Math.max(0,...hs)+(forExport?60:30);
  let s='', lines='', labels='';
  const x0=(W-(row.length*(colW+gap)+gap))/2;
  let gwCounted=false;
  const drawRoom=(L,x,y,h,isCore)=>{ const ns=nodes.filter(n=>n.loc===L.name), up=result.links.filter(l=>l.loc===L.name), tx=x+colW/2;
    if(core&&!isCore) cb.forEach((c,ci)=>{ const t=c.x+c.w/2; lines+=`<path d="M${tx} ${y} C ${tx} ${y-70}, ${t} ${c.y+c.h+70}, ${t} ${c.y+c.h}" fill="none" stroke="${C.line}" stroke-width="2" opacity="${ci?0.55:1}"/>`; });
    else if(gwOn&&!gwRoom) lines+=`<line x1="${tx}" y1="${y}" x2="${cx}" y2="${yGw+48}" stroke="${C.gw}" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    // router on a room switch (the core has no free 10G port): draw it to that room
    if(gwRoom&&gwRoom.loc===L.name&&(!core||isCore)&&Math.abs(tx-cx)<colW/2){ // room right under the router (standalone): straight line with a label box
      lines+=`<line x1="${cx}" y1="${yGw+48}" x2="${cx}" y2="${y}" stroke="${C.gw}" stroke-width="1.5"/>`;
      labels+=box(cx-95,(yGw+48+y)/2-15,190,30,C.bg)+text(cx,(yGw+48+y)/2-3,gwLbl[0],{s:11.5,w:600,c:C.mut})+text(cx,(yGw+48+y)/2+10,gwLbl[1],{s:10.5,c:C.mut}); }
    else if(gwRoom&&gwRoom.loc===L.name){ // around the core: out of the router's side, across, then down the column edge
      const left=tx<=cx, sx=left?cx-95:cx+95, ex=left?x+18:x+colW-18, ly=yGw+24;
      lines+=`<path d="M${sx} ${ly} H${ex} V${y}" fill="none" stroke="${C.gw}" stroke-width="1.5"/>`;
      labels+=text((sx+ex)/2,ly-19,gwLbl[0],{s:11,w:600,c:C.mut})+text((sx+ex)/2,ly-6,gwLbl[1],{s:10,c:C.mut}); }
    if(up.length&&core){ const o=up[0]; labels+=box(tx-95,y-38,190,30,C.bg)+text(tx,y-26,(()=>{ const dc=result.dualCore&&core.k>1, m={}; up.forEach(l=>m[l.speed]=(m[l.speed]||0)+(dc?l.u/2:l.u)*l.n); return Object.entries(m).sort((a,b)=>b[0]-a[0]).map(([s,q])=>`${q} × ${s}G`).join(' + ')+(dc?' to each core':''); })(),{s:11.5,w:600,c:C.line})+text(tx,y-13,`${/^TBD/.test(o.optic)?'third-party module needed':o.optic}${o.media==='in-rack'?', in-rack':`, ${o.dist} m ${o.media}`}`,{s:10.5,c:C.mut}); }
    s+=box(x,y,colW,h,C.box,isCore?C.line:null)+text(x+14,y+24,L.name,{a:'start',s:15,w:700})+text(x+colW-14,y+24,L.type,{a:'end',s:11,c:C.mut});
    const line=state.project.basis!=='stream'; const gb=v=>(v>=100?Math.round(v):Math.round(v*10)/10).toLocaleString()+' Gbps';
    const cut=(t,m)=>t.length>m?t.slice(0,m-1)+'…':t;
    let yy=y+38, sw=0, tot=0, upCap=0;
    ns.forEach(n=>{ s+=text(x+14,yy+11,n.group,{a:'start',s:10,c:C.mut}); yy+=16;
      n.units.forEach(un=>{ sw++; const dc=result.dualCore&&core&&core.k>1, per=dc?n.up.u/2:n.up.u, h=unitH(un,n), cap=per*n.up.speed; tot+=un.bw; upCap+=cap;
        s+=box(x+12,yy,colW-24,h,C.bg,C.line)+text(x+22,yy+15,n.model,{a:'start',s:12,w:600})+text(x+colW-22,yy+15,`SW${sw}`,{a:'end',s:10.5,w:600,c:C.line});
        // port usage gauge: devices + uplinks against the switch's total ports
        // the router's port counts on the first unit of the switch it lands on
        const gwHere=gwRoom&&gwRoom.loc===L.name&&gwRoom.model===n.model&&!gwCounted?(gwCounted=true,1):0;
        const tp=n.ports||0, usedP=Math.min(tp,un.count+(n.up.u||0)+gwHere+(n.coreLinks||0)), gw=110;
        if(tp){ s+=`<rect x="${x+22}" y="${yy+21}" width="${gw}" height="6" rx="3" fill="${C.mut}" opacity="0.25"/><rect x="${x+22}" y="${yy+21}" width="${Math.max(3,gw*usedP/tp)}" height="6" rx="3" fill="${C.line}"/>`+text(x+22+gw+8,yy+27,`${usedP} of ${tp} ports used`,{a:'start',s:9.5,c:C.mut}); }
        let ly=yy+UH+10; un.eps.forEach(ep=>{ s+=text(x+22,ly,cut(`${ep.qty} × ${ep.name}`,29),{a:'start',s:10.5,c:C.mut})+text(x+colW-22,ly,gb(ep.bw),{a:'end',s:10.5,c:C.mut}); ly+=EL; });
        ly-=4; s+=`<line x1="${x+20}" y1="${ly}" x2="${x+colW-20}" y2="${ly}" stroke="${C.mut}" stroke-width="1" opacity="0.5"/>`;
        s+=text(x+22,ly+14,'Switch total',{a:'start',s:10.5,w:600})+text(x+colW-22,ly+14,gb(un.bw),{a:'end',s:10.5,w:700});
        if(cap){ const r=un.bw/cap; s+=text(x+22,ly+28,`${dc?`${per} × ${n.up.speed}G per core`:`Uplink ${per} × ${n.up.speed}G`}${r<=1?'':` (${r.toFixed(1)}:1)`}`,{a:'start',s:10.5,c:C.mut})+text(x+colW-22,ly+28,gb(cap),{a:'end',s:10.5,w:600,c:r<=(state.project.oversub||1)+1e-9?C.line:C.txt}); }
        yy+=h+UG; }); });
    yy+=4; s+=`<line x1="${x+14}" y1="${yy}" x2="${x+colW-14}" y2="${yy}" stroke="${C.mut}" stroke-width="1" opacity="0.6"/>`;
    s+=text(x+16,yy+17,line?'Room total at line-rate':'Room total stream bandwidth',{a:'start',s:11.5,w:600})+text(x+colW-16,yy+17,gb(tot),{a:'end',s:11.5,w:700});
    if(upCap){ const ratio=tot/upCap; s+=text(x+16,yy+33,`${result.dualCore&&core&&core.k>1?'Room uplink per core':'Room uplink capacity'}${ratio<=1?'':` (${ratio.toFixed(1)}:1)`}`,{a:'start',s:11,c:C.mut})+text(x+colW-16,yy+33,gb(upCap),{a:'end',s:11,w:600,c:ratio<=(state.project.oversub||1)+1e-9?C.line:C.txt}); }
    if(isCore&&ccRows.length){ let ry=yy+40; s+=text(x+16,ry,'Core for',{a:'start',s:11,w:600,c:C.line}); ccRows.forEach(r=>{ ry+=15; s+=text(x+16,ry,`${r.perCore} × ${r.speed}G ${r.sku}`,{a:'start',s:10,c:C.mut})+text(x+colW-16,ry,r.loc.length>18?r.loc.slice(0,17)+'…':r.loc,{a:'end',s:10,c:C.mut}); }); }
  };
  if(coreRoom) drawRoom(coreRoom,cb[0].x,yCore,hCoreRoom,true);
  row.forEach((L,i)=>drawRoom(L,x0+gap+i*(colW+gap),yLoc,hs[i],false));
  if(core&&!cc){ cb.forEach((c,i)=>{ s+=box(c.x,c.y,c.w,c.h,C.box,C.line)+text(c.x+c.w/2,c.y+24,core.p.Model_Name,{s:13.5,w:700})+text(c.x+c.w/2,c.y+42,core.k>2?`Aggregation ${i+1}`:(core.k>1?`Core ${i?'B':'A'}`:'Core'),{s:11,c:C.mut})+text(c.x+c.w/2,c.y+56,core.psu.label,{s:10,c:C.mut});
      // port gauge and the optics/cables in this core (gateway on the first core only)
      const rows=cports.filter(r=>!r.first||i===0); if(!rows.length) return;
      const used=rows.reduce((a,r)=>a+r.perCore,0), tp=core.p.Total_Ports||0, gw=110, gx=c.x+12, gy=c.y+66;
      if(tp) s+=`<rect x="${gx}" y="${gy}" width="${gw}" height="6" rx="3" fill="${C.mut}" opacity="0.25"/><rect x="${gx}" y="${gy}" width="${Math.max(3,gw*Math.min(1,used/tp))}" height="6" rx="3" fill="${C.line}"/>`+text(gx+gw+8,gy+6,`${used} of ${tp} ports used`,{a:'start',s:9.5,c:C.mut});
      rows.forEach((r,j)=>{ const ry=gy+24+j*CL, where=r.isl?(core.k>1?(i?'Core A':'Core B'):''):r.loc;
        s+=text(gx,ry,`${r.perCore} × ${r.speed}G ${r.sku}`,{a:'start',s:10,c:C.mut})+text(c.x+c.w-12,ry,where.length>18?where.slice(0,17)+'…':where,{a:'end',s:10,c:C.mut}); }); });
    for(let i=0;i<cb.length-1;i++){ const a=cb[i],b=cb[i+1]; lines+=`<line x1="${a.x+a.w}" y1="${a.y+22}" x2="${b.x}" y2="${b.y+22}" stroke="${C.line}" stroke-width="3"/><line x1="${a.x+a.w}" y1="${a.y+36}" x2="${b.x}" y2="${b.y+36}" stroke="${C.line}" stroke-width="3"/>`; labels+=text((a.x+a.w+b.x)/2,a.y+58,`${core.isl} × ${core.islSpeed}G`,{s:10.5,w:600,c:C.line})+text((a.x+a.w+b.x)/2,a.y+71,`needs ${Math.round(core.islReq)} Gbps`,{s:9.5,c:C.mut}); }
    if(gwOn&&!gwRoom){ const gx=cb[0].x+cb[0].w/2; lines+=`<line x1="${gx}" y1="${yCore}" x2="${cx}" y2="${yGw+48}" stroke="${C.gw}" stroke-width="1.5"/>`;
      if(gwLbl) labels+=box((gx+cx)/2-95,yGw+64,190,30,C.bg)+text((gx+cx)/2,yGw+76,gwLbl[0],{s:11.5,w:600,c:C.mut})+text((gx+cx)/2,yGw+89,gwLbl[1],{s:10.5,c:C.mut}); } }
  if(gwOn) s+=box(cx-95,yGw,190,48,C.box)+text(cx,yGw+21,'PR460X Pro Router',{s:13,w:700})+text(cx,yGw+37,'Internet gateway',{s:10.5,c:C.mut});
  const foot=forExport&&!pal?text(20,H-22,`${state.project.name||'Project'}: estimate only, must be validated by the ProAV Design team before ordering. Catalog ${CATMETA.version}.`,{a:'start',s:11,c:C.mut}):'';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Network diagram">${forExport?`<style>@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&amp;display=swap');</style><rect width="100%" height="100%" fill="${C.page}"/>`:''}${lines}${s}${labels}${foot}</svg>`;
}

// ---------- request validation ----------
let ATT=[];
const MAIL=()=>result.settings.Validation_Contact_Email||'ProAVDesign@netgear.com';
const subj=()=>`Design validation: ${state.project.name||'Untitled project'}`;
let PKG=null;
function openModal(){ ATT=[]; PKG=null;
  $('#modal').innerHTML=`<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Request validation</h2>
    <p>The ProAV Design team reviews the design and confirms the bill of materials.</p>
    <p>Please fill in the form below, and forward the ZIP file to <b>${esc(MAIL())}</b>.</p>
    <label class="fld wide"><span>Name</span><input type="text" id="rq-name" autocomplete="name"></label>
    <label class="fld wide"><span>Company name</span><input type="text" id="rq-co" autocomplete="organization"></label>
    <label class="fld wide"><span>Email</span><input type="email" id="rq-email" autocomplete="email" required></label>
    <label class="fld wide"><span>Anything else we should know?</span><textarea id="rq-notes" rows="3"></textarea></label>
    <div class="fld wide"><span>Attachments (you can add several files)</span>
      <button type="button" class="ghost" data-act="addatt">Upload files</button><input type="file" id="rq-files" multiple hidden>
      <ul class="att" id="rq-att"></ul></div>
    <p class="note-next">Next version will allow auto-sending the data through this form.</p>
    <div class="mfoot"><button class="ghost" data-act="close">Cancel</button><button class="btn" data-act="package">Generate</button></div></div>`;
  $('#modal').hidden=false;
  $('#rq-files').addEventListener('change',ev=>{ for(const f of ev.target.files) if(!ATT.some(a=>a.name===f.name&&a.size===f.size)) ATT.push(f); ev.target.value=''; renderAtt(); });
  setTimeout(()=>$('#rq-name').focus(),30);
}
function readyStep(){ const m=PKG.meta, s=stats();
  const body=`Hello ProAV Design team,\n\nPlease validate the attached design.\n\nProject: ${state.project.name||'Untitled project'}\nName: ${m.name||''}\nCompany: ${m.company||''}\nEmail: ${m.email}\nRequest ID: ${m.rid}\nDevices: ${s.eps}, switches: ${s.sw}\n${m.notes?`\nNotes:\n${m.notes}\n`:''}\nThe design file (ZIP) is attached.\n\nThank you`;
  const href=`mailto:${MAIL()}?subject=${encodeURIComponent(subj())}&body=${encodeURIComponent(body)}`;
  $('#modal').innerHTML=`<div class="mbox" role="dialog" aria-modal="true" aria-labelledby="mt"><h2 id="mt">Your design file is ready</h2>
    <p>Download the ZIP file, then email it to the ProAV Design team.</p>
    <div class="steps">
      <div class="step"><span>1</span><div><b>Download the design file</b><p class="mut small">${esc(PKG.name)} (${PKG.blob.size<1048576?fmt(Math.max(1,PKG.blob.size/1024))+' KB':fmt(PKG.blob.size/1048576,1)+' MB'})</p>
        <button class="btn dl" data-act="dlzip">Download ZIP</button></div></div>
      <div class="step"><span>2</span><div><b>Email it to ProAV Design</b><p class="mut small">Opens a new email with the address and subject filled in. Attach the ZIP file before sending.</p>
        <a class="btn" href="${esc(href)}" target="_blank" rel="noopener">Click to email</a></div></div>
    </div>
    <p class="mut small">If your email doesn't open, send the ZIP file to <b>${esc(MAIL())}</b> with the subject <b>${esc(subj())}</b>.</p>
    <div class="mfoot"><button class="ghost" data-act="close">Done</button></div></div>`;
}
function renderAtt(){ const tot=ATT.reduce((s,f)=>s+f.size,0);
  $('#rq-att').innerHTML=ATT.map((f,i)=>`<li><span>${esc(f.name)}</span><span class="mut">${f.size<1048576?fmt(Math.max(1,f.size/1024))+' KB':fmt(f.size/1048576,1)+' MB'}</span><button class="ghost x" data-act="delatt" data-i="${i}" aria-label="Remove ${esc(f.name)}">×</button></li>`).join('')+(tot>20*1048576?`<li class="err">Attachments total ${fmt(tot/1048576,1)} MB. Many mail systems reject messages over 20–25 MB.</li>`:''); }
function closeModal(){ $('#modal').hidden=true; }
document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!$('#modal').hidden) closeModal(); });
const b64=buf=>{ const b=new Uint8Array(buf); let s=''; for(let i=0;i<b.length;i+=0x8000) s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000)); return btoa(s); };
const wrap76=s=>s.replace(/.{1,76}/g,'$&\r\n');
const encHdr=s=>/^[\x20-\x7e]*$/.test(s)?s:'=?UTF-8?B?'+btoa(unescape(encodeURIComponent(s)))+'?=';
function summaryText(meta){ const P=state.project, s=stats(), L=[];
  const line=(a='')=>L.push(a);
  line(`DESIGN VALIDATION REQUEST`); line(`Project: ${P.name||'Untitled project'}`); line(`Request ID: ${meta.rid}`); line(`Created: ${meta.at}`);
  line(`Requested by: ${meta.name||'-'} <${meta.email}>${meta.company?`, ${meta.company}`:''}`); line(`Catalog version: ${CATMETA.version}`); line();
  line('ESTIMATE ONLY: '+(result.settings.Disclaimer||'')); line();
  line('SETTINGS'); line(`Region: ${P.region}   Mains: ${P.voltage} V   TAA: ${P.taa?'Yes':'No'}`);
  line(`Redundant power: ${P.psuRed?(P.psuScope==='mdf'?'main equipment room only':'all switches'):'No'}   Redundant core: ${P.dualCore?'Yes':'No'}   Gateway: ${P.gateway?'PR460X':'No'}`);
  line(`Switch series: ${P.family==='Auto'?'Best fit':P.family+' only'}   Design basis: ${P.basis==='stream'?'stream bandwidth':'line-rate'}   Oversubscription: ${P.oversub}:1   Spare ports: ${P.spare}%   PoE headroom: ${P.poeHead}%`); line();
  line(`TOTALS: ${s.eps} devices, ${s.sw} switches, ${fmt(s.poe)} W PoE, ${fmt(s.est)} W estimated draw, ${fmt(s.ru,1)} U`); line();
  const dc=result.dualCore&&result.core&&result.core.k>1;
  state.locations.forEach(Lc=>{ const ns=result.accessNodes.filter(n=>n.loc===Lc.name); if(!ns.length) return;
    line(`${Lc.name.toUpperCase()} (${Lc.type}${Lc.type==='IDF'?`, ${Lc.distance} m ${Lc.media} to main room`:''})`);
    let sw=0; ns.forEach(n=>n.units.forEach(un=>{ sw++; line(`  SW${sw} ${n.model}`); un.eps.forEach(ep=>line(`     ${ep.qty} x ${ep.name}  ${fmt(ep.bw,1)} Gbps`));
      line(`     Switch total ${fmt(un.bw,1)} Gbps; uplink ${n.up.u?(dc?`${n.up.u/2} x ${n.up.speed}G to each core`:`${n.up.u} x ${n.up.speed}G`):'none (standalone)'}`); }));
    line(); });
  if(result.core){ line(`CORE: ${result.core.k} x ${result.core.p.Model_Name} (${result.core.psu.label})${result.core.isl?`; core-to-core ${result.core.isl} x ${result.core.islSpeed}G, needs ${Math.round(result.core.islReq)} Gbps`:''}`); line(); }
  line('BILL OF MATERIALS'); let lastBr=null; rollup().forEach(r=>{ const br=brandKey(r); if(br!==lastBr){ line(`  ${br}${brandNote(br)?': '+brandNote(br):''}`); lastBr=br; } line(`  ${String(r.qty).padStart(4)}  ${r.sku.padEnd(20)} ${r.desc}`); }); line();
  if(result.errors.length||result.notes.length){ line('CHECKS'); result.errors.forEach(x=>line(`  ! ${x.loc}: ${x.msg}`)); result.notes.forEach(n=>line(`  ${n.lvl==='warn'?'!':'-'} ${n.msg}`)); line(); }
  if(meta.notes){ line('NOTES FROM REQUESTER'); line(meta.notes); line(); }
  if(ATT.length){ line('ATTACHMENTS'); ATT.forEach(f=>line(`  ${f.name}`)); }
  return L.join('\r\n'); }
async function buildPackage(){
  const name=(state.project.name||'').trim()||'Untitled project', email=$('#rq-email').value.trim();
  if(!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)){ toast('Enter a valid work email.'); $('#rq-email').focus(); return; }
  if(!window.JSZip){ toast('ZIP library did not load.'); return; }
  const meta={rid:'NTGR-'+Date.now().toString(36).toUpperCase(),at:new Date().toISOString(),name:$('#rq-name').value.trim(),email,company:$('#rq-co').value.trim(),notes:$('#rq-notes').value.trim()};
  const xl=buildXlsx(); if(!xl) return;
  let pdf=null; try{ pdf=await buildPdf({rid:meta.rid}); }catch(e){ console.error(e); } // package still builds if the PDF fails
  const base=slug(), s=stats(), summary=summaryText(meta);
  const files=[
    {n:'Design summary.txt',d:summary,t:'text/plain; charset=UTF-8'},
    {n:`${base}-bom.xlsx`,d:await xl.arrayBuffer(),t:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},
    {n:`${base}-network.svg`,d:diagram(true),t:'image/svg+xml'},
    ...(pdf?[{n:`${base}-report.pdf`,d:await pdf.arrayBuffer(),t:'application/pdf'}]:[]),
    {n:`${base}${PJ_EXT}`,d:await (await packProject(state)).arrayBuffer(),t:'application/octet-stream'},
    {n:'request.json',d:JSON.stringify({type:'design_validation',requestId:meta.rid,createdAt:meta.at,to:MAIL(),subject:subj(),requester:{name:meta.name,email,company:meta.company},
      project:{name,region:state.project.region,taa:!!state.project.taa,redundantPower:state.project.psuRed?(state.project.psuScope==='mdf'?'mdf':'all'):'none',redundantCore:!!state.project.dualCore,family:state.project.family},
      totals:{devices:s.eps,switches:s.sw,poeW:Math.round(s.poe),estDrawW:Math.round(s.est),rackU:s.ru},bom:rollup().map(r=>({sku:r.sku,qty:r.qty,category:r.cat})),catalogVersion:CATMETA.version,notes:meta.notes,attachments:ATT.map(f=>f.name)},null,2),t:'application/json'}];
  const att=[]; for(const f of ATT) att.push({n:f.name,d:await f.arrayBuffer(),t:f.type||'application/octet-stream'});
  // ready-to-send email (opens as a draft in Outlook / Apple Mail)
  const B='=_ntgr_'+Math.random().toString(36).slice(2);
  const body=`Hello ProAV Design team,\r\n\r\nPlease validate the attached design.\r\n\r\nProject: ${name}\r\nRequested by: ${meta.name||''} <${email}>${meta.company?` (${meta.company})`:''}\r\nRequest ID: ${meta.rid}\r\nDevices: ${s.eps}, switches: ${s.sw}, catalog ${CATMETA.version}\r\n${meta.notes?`\r\nNotes:\r\n${meta.notes}\r\n`:''}\r\n${pdf?'The design report (PDF), design summary':'The design summary'}, bill of materials, network diagram and project file are attached.\r\n\r\nThank you`;
  let eml=`X-Unsent: 1\r\nTo: ${MAIL()}\r\nSubject: ${encHdr(subj())}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/mixed; boundary="${B}"\r\n\r\n--${B}\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(btoa(unescape(encodeURIComponent(body))))}`;
  for(const f of [...files,...att]){ const data=typeof f.d==='string'?b64(new TextEncoder().encode(f.d)):b64(f.d);
    eml+=`--${B}\r\nContent-Type: ${f.t}; name="${encHdr(f.n)}"\r\nContent-Disposition: attachment; filename="${encHdr(f.n)}"\r\nContent-Transfer-Encoding: base64\r\n\r\n${wrap76(data)}`; }
  eml+=`--${B}--\r\n`;
  const readme=`HOW TO SEND THIS DESIGN FOR VALIDATION\r\n\r\n1. Double-click "Send this email.eml". It opens a ready-made email with every file attached.\r\n2. Check it and press Send.\r\n\r\nOr send it yourself:\r\n  To:      ${MAIL()}\r\n  Subject: ${subj()}\r\n  Attach:  this ZIP file\r\n\r\nContents\r\n  Design summary.txt       Settings, rooms, switches, bandwidth per switch, BoM, checks\r\n  ${base}-bom.xlsx     Bill of materials, per room, power, checks\r\n  ${base}-network.svg  Network diagram\r\n${pdf?`  ${base}-report.pdf   Design report (cover, summary, diagram, BoM, power, checks)\r\n`:''}  ${base}${PJ_EXT} Reopen in the BoM builder with "Open saved project"\r\n  request.json             Machine-readable request (for automated intake)\r\n  Attachments/             Files you added\r\n\r\nRequest ID: ${meta.rid}\r\nThis is an estimate and must be validated by the ProAV Design team before ordering.\r\n`;
  const zip=new JSZip(), root=zip.folder(`Design validation - ${name.replace(/[\\/:*?"<>|]/g,'-')}`);
  root.file('README - how to send.txt',readme); root.file('Send this email.eml',eml);
  files.forEach(f=>root.file(f.n,f.d)); if(att.length){ const a=root.folder('Attachments'); att.forEach(f=>a.file(f.n,f.d)); }
  const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});
  if(blob.size>16*1048576) toast('The package is large; some mail systems may reject it.');
  PKG={blob,meta,name:`design-validation-${base}-${meta.at.slice(0,10)}.zip`};
  readyStep();
  if(DB&&UID){ try{ let pkg=null; try{ pkg=await storePackage(blob,meta.rid); }catch(e){}
    const ref=DB.doc('requests/'+UID); const cur=await ref.get(); const items=cur.exists?JSON.parse(cur.data().items||'[]'):[];
    items.unshift({rid:meta.rid,at:meta.at,email,name:meta.name,company:meta.company,notes:meta.notes,project:name,devices:s.eps,switches:s.sw,catalog:CATMETA.version,status:'New',design:JSON.stringify(state),pkg,attachments:ATT.map(f=>f.name)});
    await ref.set({items:JSON.stringify(items.slice(0,25)),updated:meta.at}); }catch(e){} }
}

// ---------- admin page (separate page; hosted later behind a login) ----------
function route(){ const want=location.hash==='#admin'; document.body.dataset.page=want?'admin':'builder'; if(want) renderAdmin(); else window.scrollTo(0,0); }
window.addEventListener('hashchange',route);
function renderAdmin(){ const el=$('#adminpage'); if(document.body.dataset.page!=='admin') return;
  el.innerHTML=canTeam?adminPage():`<div class="adminhead"><div><h2>Admin</h2><p class="mut">This page is for the ProAV Design team. Ask the owner for editor access.</p></div><a class="ghost" href="#">Back to the BoM builder</a></div>`; }
const fmtSize=b=>b<1048576?fmt(Math.max(1,b/1024))+' KB':fmt(b/1048576,1)+' MB';
const CHUNK=180000, MAXSTORE=15*1048576;
async function storePackage(blob,rid){ // ZIP kept as base64 chunks under packages/<uid>/ (admin-readable only)
  if(!DB||!UID||blob.size>MAXSTORE) return null;
  const s=b64(await blob.arrayBuffer()), parts=Math.ceil(s.length/CHUNK);
  for(let i=0;i<parts;i++) await DB.doc(`packages/${UID}/parts/${rid}-${i}`).set({d:s.slice(i*CHUNK,(i+1)*CHUNK)});
  return {parts,size:blob.size,name:PKG.name}; }
async function downloadStored(u,r){ const d=REQS.find(x=>x.uid===u), it=d&&d.items.find(i=>i.rid===r); if(!it||!it.pkg) return;
  try{ toast('Preparing download…'); let s=''; for(let i=0;i<it.pkg.parts;i++){ const doc=await DB.doc(`packages/${u}/parts/${r}-${i}`).get(); if(!doc.exists) throw new Error('missing part'); s+=doc.data().d; }
    const bin=atob(s), a=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) a[i]=bin.charCodeAt(i);
    await saveFile(it.pkg.name||`design-validation-${r}.zip`,new Blob([a],{type:'application/zip'})); }
  catch(e){ toast('Could not load that design file.'); } }

// ---------- usage counter (proves the use case) ----------
let USAGE=[];
async function track(kind){ if(!DB||!UID) return;
  try{ const ref=DB.doc('usage/'+UID), cur=await ref.get(), d=cur.exists?cur.data():{};
    const day=new Date().toISOString().slice(0,10), days=JSON.parse(d.days||'{}'); days[day]=(days[day]||0)+(kind==='session'?1:0);
    const nd={sessions:(d.sessions||0)+(kind==='session'?1:0),boms:(d.boms||0)+(kind==='bom'?1:0),diagrams:(d.diagrams||0)+(kind==='diagram'?1:0),packages:(d.packages||0)+(kind==='package'?1:0),
      first:d.first||new Date().toISOString(),last:new Date().toISOString(),days:JSON.stringify(days)};
    await ref.set(nd); }catch(e){} }
function usagePanel(){
  if(!DB) return '<section><h3>Usage</h3><p class="mut">Usage is counted when the tool runs with shared storage.</p></section>';
  const now=Date.now(), d30=new Date(now-30*864e5).toISOString().slice(0,10);
  const t=USAGE.reduce((a,u)=>{ const days=JSON.parse(u.days||'{}'); const s30=Object.entries(days).filter(([k])=>k>=d30).reduce((x,[,v])=>x+v,0);
    a.users++; a.sessions+=u.sessions||0; a.boms+=u.boms||0; a.diagrams+=u.diagrams||0; a.packages+=u.packages||0; a.s30+=s30; if(s30) a.active30++; return a; },{users:0,sessions:0,boms:0,diagrams:0,packages:0,s30:0,active30:0});
  const byDay={}; USAGE.forEach(u=>Object.entries(JSON.parse(u.days||'{}')).forEach(([k,v])=>byDay[k]=(byDay[k]||0)+v));
  const days=[...Array(30)].map((_,i)=>new Date(now-(29-i)*864e5).toISOString().slice(0,10)), mx=Math.max(1,...days.map(k=>byDay[k]||0));
  return `<section><h3>Usage</h3><div class="stats us">
    <div><b>${t.users}</b><span>people</span></div><div><b>${t.active30}</b><span>active, last 30 days</span></div><div><b>${t.sessions}</b><span>sessions</span></div>
    <div><b>${t.boms}</b><span>BoM downloads</span></div><div><b>${t.packages}</b><span>validation packages</span></div></div>
    <div class="spark" role="img" aria-label="Sessions per day, last 30 days">${days.map(k=>`<i style="height:${Math.round((byDay[k]||0)/mx*100)}%" title="${k}: ${byDay[k]||0}"></i>`).join('')}</div>
    <p class="mut small">Sessions per day, last 30 days. Counted per signed-in person; no design content is stored for usage.</p></section>`;
}
// ---------- team panel ----------
const STATUSES=['New','Viewed','In review','Validated','Closed'];
let OPEN=new Set(), RFILTER='all';
const allReqs=()=>REQS.flatMap(d=>d.items.map(i=>({...i,uid:d.uid}))).sort((a,b)=>b.at.localeCompare(a.at));
const isNew=r=>!r.viewedAt&&(r.status||'New')==='New';
function reqDetail(r){ let P={}; try{ P=JSON.parse(r.design).project||{}; }catch(e){}
  const row=(k,v)=>v?`<dt>${k}</dt><dd>${v}</dd>`:'';
  return `<dl class="rdet">${row('Email',`<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>`)}${row('Request ID',esc(r.rid))}${row('Notes',esc(r.notes||'').replace(/\n/g,'<br>'))}
    ${row('Attachments',(r.attachments||[]).map(esc).join(', '))}${row('Region',esc(P.region||''))}${row('TAA',P.taa?'Yes':'No')}
    ${row('Redundant power',P.psuRed?(P.psuScope==='mdf'?'Main equipment room only':'All switches'):'No')}${row('Redundant core',P.dualCore?'Yes':'No')}
    ${row('Switch series',P.family&&P.family!=='Auto'?esc(P.family)+' only':'Best fit')}${row('Catalog',esc(r.catalog||''))}${row('Viewed',r.viewedAt?new Date(r.viewedAt).toLocaleString():'')}</dl>`; }
function adminPage(){
  const all=allReqs(), nNew=all.filter(isNew).length;
  const reqs=all.filter(r=>RFILTER==='all'||(RFILTER==='new'?isNew(r):!isNew(r)));
  const act=(a,r,label)=>`<button class="ghost small" data-act="${a}" data-u="${esc(r.uid)}" data-r="${esc(r.rid)}">${label}</button>`;
  return `<div class="adminhead"><div><h2>Admin</h2><p class="mut">Validation requests, usage and catalog. This page will move to the hosted site behind a login.</p></div><a class="ghost" href="#">Back to the BoM builder</a></div>
  <div class="team">
  <section><div class="rbar"><h3>Validation requests ${nNew?`<span class="badge">${nNew} new</span>`:''}</h3>
    <div class="seg small">${[['all',`All (${all.length})`],['new',`New (${nNew})`],['viewed',`Viewed (${all.length-nNew})`]].map(([v,l])=>`<label><input type="radio" name="rfilter" data-rfilter="${v}"${RFILTER===v?' checked':''}><span>${l}</span></label>`).join('')}</div>
    ${nNew?'<button class="ghost small" data-act="viewall">Mark all as viewed</button>':''}</div>
  ${!DB?'<p class="mut">Requests appear here when the tool runs with shared storage.</p>':!reqs.length?'<p class="mut">No requests here.</p>':`<div class="scroll"><table class="t reqs"><thead><tr><th></th><th>Received</th><th>Project</th><th>Name</th><th>Company</th><th class="r">Devices</th><th class="r">Switches</th><th>Status</th><th></th></tr></thead><tbody>${
    reqs.map(r=>{ const n=isNew(r), o=OPEN.has(r.rid); return `<tr class="${n?'unread':''}"><td>${n?'<span class="dot" title="New"></span>':''}</td><td>${new Date(r.at).toLocaleString()}</td><td>${esc(r.project)}</td><td>${esc(r.name||'')}</td><td>${esc(r.company||'')}</td><td class="r">${fmt(r.devices)}</td><td class="r">${fmt(r.switches)}</td>
      <td><select data-rstat="${esc(r.uid)}|${esc(r.rid)}" aria-label="Status">${STATUSES.map(s=>`<option${s===(r.status||'New')?' selected':''}>${s}</option>`).join('')}</select></td>
      <td class="acts">${act('viewreq',r,o?'Hide':'View')}${r.pkg?act('dlpkg',r,'Download ZIP'):'<span class="mut small">No ZIP</span>'}${act('openreq',r,'Open design')}${act('reqpdf',r,(r.status==='Validated'?'PDF (validated)':'PDF report'))}</td></tr>
      ${o?`<tr class="sub"><td></td><td colspan="8">${reqDetail(r)}</td></tr>`:''}`; }).join('')}</tbody></table></div>`}
  </section>
  ${usagePanel()}
  <details class="catsec"${staged?' open':''}><summary>Catalog: <b>${esc(CATMETA.version)}</b> (${esc(CATMETA.source)}${CATMETA.publishedAt?`, published ${new Date(CATMETA.publishedAt).toLocaleDateString()}`:''})</summary>
    <p class="mut">To update hardware, edit NETGEAR_BoM_Catalog.xlsx, bump Catalog_Version in Tool_Settings, then publish it here. It's checked before anyone sees it.</p>
    ${staged?stagedView():`<button class="btn" data-act="pickcat">Choose updated catalog (.xlsx)</button>${CATMETA.source!=='Built-in catalog'?' <button class="ghost" data-act="revert">Preview built-in catalog</button>':''}`}
    ${DB?'':'<p class="err">Shared storage isn\'t available in this view, so a catalog loaded here applies to this session only.</p>'}</details>
  </div>`;
}
async function markViewed(pairs){ if(!pairs.length) return; const now=new Date().toISOString(), byU={};
  pairs.forEach(([u,r])=>(byU[u]=byU[u]||new Set()).add(r));
  for(const [u,set] of Object.entries(byU)){
    const loc=REQS.find(x=>x.uid===u); if(loc) loc.items.forEach(i=>{ if(set.has(i.rid)&&!i.viewedAt){ i.viewedAt=now; if((i.status||'New')==='New') i.status='Viewed'; } });
    if(DB){ try{ const ref=DB.doc('requests/'+u), d=await ref.get(); if(!d.exists) continue; const items=JSON.parse(d.data().items||'[]');
      items.forEach(i=>{ if(set.has(i.rid)&&!i.viewedAt){ i.viewedAt=now; if((i.status||'New')==='New') i.status='Viewed'; } }); await ref.update({items:JSON.stringify(items)}); }catch(e){ toast('Could not save viewed status.'); } }
  }
  renderAdmin(); adminBadge(); }
function adminBadge(){ const n=allReqs().filter(isNew).length; $('#adminlink').innerHTML=`Admin page${n?` <span class="badge">${n}</span>`:''}`; }
function stagedView(){ const v=staged.issues, errsN=v.filter(i=>i.lvl==='error').length;
  const oldIds=new Set(CAT.Products.map(p=>p.Product_ID)), newIds=new Set(staged.cat.Products.map(p=>p.Product_ID));
  const added=[...newIds].filter(x=>!oldIds.has(x)), removed=[...oldIds].filter(x=>!newIds.has(x));
  return `<div class="staged"><p><b>${esc(staged.name)}</b>: catalog ${esc(ENG.settings(staged.cat).Catalog_Version||'(no version)')}, ${staged.cat.Products.length} products, ${staged.cat.Accessories.length} accessories, ${staged.cat.Port_Types.length} port types.</p>
    <p>${added.length?`New: ${esc(added.join(', '))}. `:''}${removed.length?`Removed: ${esc(removed.join(', '))}.`:''}${!added.length&&!removed.length?'Same product list; values may have changed.':''}</p>
    ${v.length?`<ul class="notes">${v.map(i=>`<li class="${i.lvl==='error'?'warn':''}"><span>${i.lvl==='error'?'!':'i'}</span>${esc(i.msg)}</li>`).join('')}</ul>`:'<p>All checks passed.</p>'}
    <button class="btn" data-act="publishcat"${errsN?' disabled':''}>${errsN?'Fix errors before publishing':(DB?'Publish to everyone':'Use for this session')}</button> <button class="ghost" data-act="discard">Discard</button></div>`; }
document.addEventListener('change',async ev=>{ const t=ev.target; if(t.dataset&&t.dataset.rfilter){ RFILTER=t.dataset.rfilter; return renderAdmin(); } if(!t.dataset.rstat) return; const [u,r]=t.dataset.rstat.split('|');
  try{ const ref=DB.doc('requests/'+u), d=await ref.get(); const items=JSON.parse(d.data().items); const it=items.find(i=>i.rid===r); if(it){ it.status=t.value; if(t.value==='Validated'){ it.validatedAt=new Date().toISOString(); } if(!it.viewedAt) it.viewedAt=new Date().toISOString(); } const li=(REQS.find(x=>x.uid===u)||{items:[]}).items.find(i=>i.rid===r); if(li){ li.status=t.value; li.viewedAt=li.viewedAt||new Date().toISOString(); if(it&&it.validatedAt) li.validatedAt=it.validatedAt; } adminBadge(); await ref.update({items:JSON.stringify(items)}); toast('Status updated.'); }catch(e){ toast('Could not update status.'); } });
function openReq(u,r){ const d=REQS.find(x=>x.uid===u); const it=d&&d.items.find(i=>i.rid===r); if(!it) return; try{ state=JSON.parse(it.design); state.project={...DEFAULT().project,...state.project}; tab='diagram'; location.hash=''; run(); toast(`Opened ${it.project}.`); }catch(e){ toast('That design could not be opened.'); } }
function readSheet(wb,name){ const ws=wb.Sheets[name]; if(!ws) return []; return XLSX.utils.sheet_to_json(ws,{range:3,defval:null}).filter(r=>Object.values(r)[0]!==null).map(r=>Object.fromEntries(Object.entries(r).filter(([k,v])=>v!==null&&!/^__EMPTY/.test(k)))); }
$('#fcat').addEventListener('change',async ev=>{ const f=ev.target.files[0]; ev.target.value=''; if(!f) return;
  if(!window.XLSX){ toast('Spreadsheet library did not load.'); return; }
  try{ const wb=XLSX.read(await f.arrayBuffer(),{type:'array'}); const nc={};
    for(const n of ['Products','SKUs','Accessories','Compatibility','PSU_PoE_Matrix','Design_Rules','Endpoints','Port_Types','Tool_Settings']) nc[n]=readSheet(wb,n);
    const pcols=[...new Set(nc.Products.flatMap(p=>Object.keys(p)).filter(k=>/^Ports_/.test(k)))];
    nc.Products.forEach(p=>{ if(typeof p.Total_Ports!=='number') p.Total_Ports=pcols.reduce((s,k)=>s+(+p[k]||0),0); });
    nc.PSU_PoE_Matrix.forEach(r=>{ if(typeof r.PoE_Budget_Protected_W!=='number'){ const a=[r.PoE_If_Internal_PSU_Fails_W,r.PoE_If_One_Module_Fails_W].filter(v=>typeof v==='number'); if(a.length) r.PoE_Budget_Protected_W=Math.min(...a); else delete r.PoE_Budget_Protected_W; } });
    staged={cat:nc,name:f.name,issues:ENG.validate(nc)}; renderAdmin();
  }catch(e){ toast('Could not read that workbook: '+e.message); } });
async function publishCatalog(){ if(!staged) return; const nc=staged.cat, ver=String(ENG.settings(nc).Catalog_Version||new Date().toISOString().slice(0,10));
  if(!DB){ applyCatalog(nc,{version:ver,source:staged.name+' (this session)'}); staged=null; run(); toast('Catalog applied for this session.'); return; }
  try{ const json=JSON.stringify(nc), size=180000, parts=Math.ceil(json.length/size);
    for(let i=0;i<parts;i++) await DB.doc('catalog/c'+i).set({part:json.slice(i*size,(i+1)*size)});
    await DB.doc('catalog/meta').set({version:ver,parts,fileName:staged.name,publishedAt:new Date().toISOString(),products:nc.Products.length});
    staged=null; toast(`Catalog ${ver} published to everyone.`);
  }catch(e){ toast('Publish failed: '+(e.code||e.message)); } }
function applyCatalog(nc,meta){ CAT=nc; CATMETA=meta; const ids=new Set(state.endpoints.map(e=>e.Endpoint_ID)); (nc.Endpoints||[]).forEach(e=>{ const i=state.endpoints.findIndex(x=>x.Endpoint_ID===e.Endpoint_ID); if(i>=0) state.endpoints[i]={...e}; else state.endpoints.push({...e}); }); catInfo(); }

// ---------- files ----------
const slug=()=>String(state.project.name||'netgear-av-project').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'project';
// Standard browser download helper.
function browserDownload(name,data){ const blob=data instanceof Blob?data:new Blob([data],{type:'text/plain'}); const url=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); toast('Saved '+name); }
// ---------- project files (.ntgrbom) ----------
// Saved projects are packed so they do not open as readable text: compressed, masked, plus a check value.
// This is obfuscation, not encryption (the key ships with the page). The check rejects files edited outside the tool.
const PJ_MAGIC='NTGRBOM', PJ_KEY='NETGEAR AV Network BoM builder', PJ_EXT='-project.ntgrbom';
const pjEnc=t=>new TextEncoder().encode(t);
const pjMask=u=>{ const k=pjEnc(PJ_KEY); for(let i=0;i<u.length;i++) u[i]^=k[i%k.length]^((i*31)&255); return u; };
const pjHash=u=>{ let a=0x811c9dc5, b=0xcbf29ce4; const step=x=>{ a=Math.imul(a^x,0x01000193)>>>0; b=Math.imul(b^x,0x5bd1e995)>>>0; b=(b^(b>>>13))>>>0; };
  for(const x of pjEnc(PJ_KEY)) step(x); for(let i=0;i<u.length;i++) step(u[i]); const o=new Uint8Array(8), d=new DataView(o.buffer); d.setUint32(0,a); d.setUint32(4,b); return o; };
const pjZip=async(u,dir)=>new Uint8Array(await new Response(new Blob([u]).stream().pipeThrough(dir?new CompressionStream('gzip'):new DecompressionStream('gzip'))).arrayBuffer());
async function packProject(st){
  const json=pjEnc(JSON.stringify(st)), gz=!!window.CompressionStream, body=gz?await pjZip(json,true):json.slice(), head=pjEnc(PJ_MAGIC), H=head.length;
  const out=new Uint8Array(H+10+body.length); out.set(head); out[H]=1; out[H+1]=gz?1:0; out.set(pjHash(json),H+2); out.set(pjMask(body),H+10);
  return new Blob([out],{type:'application/octet-stream'});
}
async function unpackProject(buf){
  const u=new Uint8Array(buf), head=pjEnc(PJ_MAGIC), H=head.length;
  const first=u.findIndex(c=>c>32&&c!==0xEF&&c!==0xBB&&c!==0xBF);
  if(u[first]===0x7B) return JSON.parse(new TextDecoder().decode(u)); // older .json project files still open
  if(u.length<H+10||head.some((c,i)=>u[i]!==c)) throw new Error('this is not a BoM builder project file');
  if(u[H]!==1) throw new Error('it was saved by a newer version of the BoM builder');
  let body=pjMask(u.slice(H+10));
  if(u[H+1]===1){ if(!window.DecompressionStream) throw new Error('this browser cannot read it; use a current Chrome, Edge, Safari or Firefox');
    try{ body=await pjZip(body,false); }catch(e){ throw new Error('the file is damaged or was changed outside the BoM builder'); } }
  const h=u.slice(H+2,H+10); if(!pjHash(body).every((x,i)=>x===h[i])) throw new Error('the file is damaged or was changed outside the BoM builder');
  return JSON.parse(new TextDecoder().decode(body));
}
async function saveFile(name,data){
  try{ browserDownload(name,data); }
  catch(e){ console.error('Download failed',e); toast('Could not save the file.'); }
}
const discRow=()=>[['ESTIMATE ONLY: '+(result.settings.Disclaimer||'')],['Validation: '+(result.settings.Validation_Contact_Email||'')],['Catalog version: '+CATMETA.version],[]];
function exportCsv(){ const rows=[...discRow(),['Category','Part number','Brand','Description','Qty','Where'],...rollup().map(r=>[r.cat,r.sku,r.brand||'',r.desc,r.qty,[...r.locs].join('; ')])];
  track('bom'); saveFile(`${slug()}-bom.csv`,rows.map(r=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n')); }
function exportSvg(){ saveFile(`${slug()}-network.svg`,diagram(true)); track('diagram'); }
function buildXlsx(){ if(!window.XLSX){ toast('Spreadsheet library did not load.'); return null; }
  const wb=XLSX.utils.book_new(), P=state.project;
  const info=[...discRow(),['Project',P.name],['Created',new Date().toISOString().slice(0,10)],['Region',P.region],['TAA required',P.taa?'Yes':'No'],['Redundant power',P.psuRed?(P.psuScope==='mdf'?'Main equipment room only':'All switches'):'No'],['Redundant core',P.dualCore?'Yes':'No'],['Design basis',P.basis==='line'?'Line-rate':'Stream'],['Oversubscription',P.oversub+':1'],['Mains voltage',P.voltage],[],['Room','Type','Device','Qty','Link Gbps','Media','PoE W']];
  state.locations.forEach(L=>L.eps.forEach(e=>{ const ep=state.endpoints.find(z=>z.Endpoint_ID===e.ep)||{}; info.push([L.name,L.type,ep.Name,e.qty,ep.Link_Speed_Gbps,ep.Media,ep.PoE_W]); }));
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet(info),'Project');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([...discRow(),['Category','Part number','Brand','Description','Qty','Where','Notes'],...rollup().map(r=>[r.cat,r.sku,r.brand||'',r.desc,r.qty,[...r.locs].join('; '),r.note])]),'BoM');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Room','Category','Part number','Brand','Description','Qty'],...result.bom.map(b=>[b.loc,b.cat,b.sku,b.brand||'',b.desc,b.qty])]),'BoM by room');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Room','Device','Qty','PoE load each W','Power supplies','PoE available W','Headroom %','Est draw each W','Datasheet max each W'],...result.power.map(p=>[p.loc,p.model,p.n,Math.round(p.poe),p.cfg,p.budget,p.head===null?'':Math.round(p.head*100),Math.round(p.est),p.max])]),'Power');
  XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Level','Message'],...result.errors.map(e=>['error',e.loc+': '+e.msg]),...result.notes.map(n=>[n.lvl,n.msg])]),'Checks');
  return new Blob([XLSX.write(wb,{bookType:'xlsx',type:'array'})]); }
function exportXlsx(){ const b=buildXlsx(); if(b){ saveFile(`${slug()}-bom.xlsx`,b); track('bom'); } }
// ---------- NETGEAR AV offer (PDF report intro and support pages) ----------
// Sources: NETGEAR AV Overview (Apr 2026) and NETGEAR Premium Support and Warranty Guide (23 Mar 2026).
// Customer-facing copy: keep it in line with those documents; no partner pricing here.
const AV_OFFER={
  headline:['Networking engineered for','AV over IP'],
  intro:'NETGEAR AV switches, routers and WiFi access points are built specifically for networked media and AV, with out-of-the-box performance and easy setup for even the most complex installation. NETGEAR works with AV manufacturers and integration partners around the world, and supports the partners and associations that make the Pro AV and broadcast industries work.',
  benefits:[
    ['Optimized for AV over IP','Low-latency switching for audio, video and control, with PoE+ (30 W) and Ultra PoE++ (90 W) per port options.'],
    ['Certified AV profiles','NETGEAR AV OS with configuration profiles certified by leading AV manufacturers (Audinate, Crestron, Q-SYS, SMPTE ST 2110, NDI).'],
    ['Multicast that just works','NETGEAR IGMP Plus stops multicast flooding automatically, and Auto-LAG and Auto-Trunk connect switches without manual setup.'],
    ['Free central management','The NETGEAR Engage Controller manages switches, routers and WiFi 7 access points from one screen, and can set up the network before the hardware arrives.'],
    ['Scales with the project','From a single rack to redundant, active-active cores with 10G, 25G and 100G uplinks.'],
    ['Lower total cost','Energy-efficient hardware, a lifetime warranty on managed switches and less need for specialist IT resources.']],
  verticals:['Broadcast and live events','Corporate and commercial AV','Higher education','Medical','Unified communications','High-end residential'],
  help:'NETGEAR has a dedicated Pro AV and broadcast network design team, pre-sales support and technical assistance. Free on-demand training and certification at academy.netgear.com covers networking basics through in-depth troubleshooting, and the top courses are AVIXA-accredited for CTS renewal units.',
  supportIntro:'Every NETGEAR managed switch includes a lifetime hardware warranty and complimentary support to get you started. Premium Support tiers add guaranteed response times, longer support hours and faster hardware replacement, so you can match support to how critical the system is.',
  // [feature, warranty, Sprint, Overdrive, Fastlane]; true = included, false = not included
  tiers:[
    ['Complimentary setup support',true,true,true,true],
    ['AI-driven chat support',true,true,true,true],
    ['Direct access to support engineers',false,true,true,true],
    ['Support hours','','24/5','24/7','24/7'],
    ['Guaranteed response time (P1)','','8 hours','2 hours','Custom'],
    ['Priority case handling',false,false,true,true],
    ['Escalation to senior engineers','','','Level 2','Level 3'],
    ['Hardware replacement','Fast RMA','Advance replacement','Next business day','Custom'],
    ['Scheduled support calls',false,false,true,true],
    ['Operational reports','','','Quarterly','Custom'],
    ['Designated or dedicated engineer',false,false,false,true],
    ['Custom workflows and SLAs',false,false,false,true]],
  supportNote:'Managed and enterprise products include 90 days of complimentary phone, chat and online support. Fully managed switches include 3 years of Sprint Support. Sprint and Overdrive response times are engagement commitments for Priority 1 cases.',
  services:[
    ['Deployment services','Design validation, hands-on configuration and readiness testing, so the network is production-ready from day one. Remote, onsite or hybrid.'],
    ['Health checks and optimization','Proactive network audits that find issues before they become outages, with a clear remediation plan.'],
    ['Custom training and enablement','Training based on your deployed system: architecture walkthroughs, feature deep dives, best practices and troubleshooting.'],
    ['Interoperability, staging and migration','Multi-vendor compatibility checks, staged configurations and low-risk migrations to NETGEAR.'],
    ['Event services','Pre-event validation and real-time onsite or remote engineering support for live broadcasts, sporting events and other high-stakes shows.'],
    ['Fastlane professional engagement','A high-touch engagement with senior engineering access for organizations that need deeper collaboration.']],
  serviceSkus:[['PSP1104-10000S','On-site engineering assistance, full day'],['PRC0001-10000S','New remote configuration, full day']],
  servicesNote:'Pricing depends on project scope and the level of support, and includes travel and expenses. Ask your NETGEAR contact or distributor for a quote.'
};
// ---------- PDF report ----------
// Renders an SVG string to a PNG data URL (the diagram goes into the PDF as a sharp raster image).
function svgToPng(svg,w,h,scale){ return new Promise((ok,no)=>{ const img=new Image();
  img.onload=()=>{ const c=document.createElement('canvas'); c.width=Math.round(w*scale); c.height=Math.round(h*scale); const g=c.getContext('2d'); g.scale(scale,scale); g.drawImage(img,0,0,w,h); ok(c.toDataURL('image/png')); };
  img.onerror=()=>no(new Error('image render failed')); img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg); }); }
// Outfit (NETGEAR corporate typeface) is embedded in the PDF; falls back to Helvetica if it cannot be fetched.
let OUTFIT=null; const OUTFIT_URL={normal:'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4TC1C4E.ttf',bold:'https://fonts.gstatic.com/s/outfit/v15/QGYyz_MVcBeNP4NjuGObqx1XmO1I4deyC4E.ttf'};
async function loadOutfit(){ if(OUTFIT) return OUTFIT; const b64=buf=>{ let s=''; const u=new Uint8Array(buf); for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s); };
  const out={}; for(const [k,u] of Object.entries(OUTFIT_URL)){ const r=await fetch(u); if(!r.ok) throw new Error('font'); out[k]=b64(await r.arrayBuffer()); } return OUTFIT=out; }
// v: {validated, by, at} when generated from the admin page; omitted for a customer download (always "not validated").
async function buildPdf(v={}){
  if(!window.jspdf||!window.jspdf.jsPDF.API.autoTable){ toast('PDF library did not load.'); return null; }
  const P=state.project, T=result.settings, s=stats(), fmtName=P.region==='Americas'?'letter':'a4';
  const doc=new window.jspdf.jsPDF({unit:'pt',format:fmtName,compress:true});
  let FONT='helvetica'; try{ const f=await loadOutfit(); doc.addFileToVFS('Outfit-Regular.ttf',f.normal); doc.addFont('Outfit-Regular.ttf','Outfit','normal'); doc.addFileToVFS('Outfit-Bold.ttf',f.bold); doc.addFont('Outfit-Bold.ttf','Outfit','bold'); FONT='Outfit'; }catch(e){}
  // NETGEAR AV palette: Gray 7 + AV green on the cover, Corporate Foundation grays inside
  const G7=[16,21,32], G6=[43,55,73], G5=[100,116,139], G4=[148,163,184], G3=[203,213,225], G1=[241,245,249], AV=[38,232,128], AVD=[22,163,94], WH=[255,255,255], INFO=[30,111,217], M=40;
  const INK=G7, MUT=G5, ok=!!v.validated;
  const pw=()=>doc.internal.pageSize.getWidth(), ph=()=>doc.internal.pageSize.getHeight();
  const name=P.name||'Untitled project', now=new Date(), when=v.at?new Date(v.at):now, longDate=d=>d.toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  const font=(w,sz,c)=>{ doc.setFont(FONT,w); doc.setFontSize(sz); doc.setTextColor(...c); };
  const tbl={theme:'plain',margin:{left:M,right:M,top:M+16,bottom:M+10},styles:{font:FONT,fontSize:8.5,textColor:INK,cellPadding:{top:4,bottom:4,left:5,right:5},lineColor:G3,overflow:'linebreak'},
    headStyles:{textColor:MUT,fontStyle:'normal',fontSize:7.5,lineWidth:{bottom:0.75}},bodyStyles:{lineWidth:{bottom:0.25}}};
  const at=o=>{ doc.autoTable({...tbl,...o,styles:{...tbl.styles,...(o.styles||{})}}); return doc.lastAutoTable.finalY; };
  let y=M;
  const need=h=>{ if(y+h>ph()-M-20){ doc.addPage(fmtName,'portrait'); y=M+16; } };
  const h2=t=>{ need(60); font('bold',15,INK); doc.text(t,M,y+14); doc.setDrawColor(...AVD); doc.setLineWidth(2); doc.line(M,y+21,M+28,y+21); y+=34; };
  const h3=t=>{ need(40); font('bold',8,MUT); doc.text(t.toUpperCase(),M,y+10,{charSpace:0.6}); y+=18; };
  const para=(t,o={})=>{ const sz=o.s||8.5; font('normal',sz,o.c||MUT); const L=doc.splitTextToSize(t,o.w||pw()-2*M); need(L.length*sz*1.35); doc.text(L,o.x||M,y+sz); y+=L.length*sz*1.35+(o.after??8); };
  const sku=x=>/^TBD/.test(x)?'To be confirmed':x;

  // --- cover: full-bleed Gray 7 (AV brand standard), logo, project, date, validation stamp ---
  doc.setFillColor(...G7); doc.rect(0,0,pw(),ph(),'F');
  try{ const lg=await svgToPng(atob(LOGO_AV_ONDARK.split(',')[1]),290,32,5); doc.addImage(lg,'PNG',M+8,M+12,190,190*32/290); }catch(e){}
  let cy=ph()*0.36;
  font('bold',9,AV); doc.text('AV NETWORK DESIGN REPORT',M+8,cy,{charSpace:1.2}); cy+=40;
  font('bold',34,WH); const tl=doc.splitTextToSize(name,pw()-2*M-16).slice(0,3); doc.text(tl,M+8,cy); cy+=tl.length*38+6;
  font('normal',14,WH); doc.text(longDate(now),M+8,cy); cy+=20;
  font('normal',10,G4); doc.text(`${P.region}${P.taa?', TAA-compliant':''}   ·   Catalog ${CATMETA.version}${v.rid?`   ·   Request ${v.rid}`:''}`,M+8,cy); cy+=40;
  // validation stamp (8 pt radius per brand)
  const sw=pw()-2*M-16, sh=62;
  if(ok){ doc.setFillColor(...AV); doc.roundedRect(M+8,cy,sw,sh,8,8,'F'); font('bold',13,G7); doc.text('VALIDATED BY THE PRO AV DESIGN TEAM',M+26,cy+26,{charSpace:0.4});
    font('normal',10,G7); doc.text(`${v.by?`Reviewed by ${v.by}, `:''}${longDate(when)}`,M+26,cy+44); }
  else { doc.setDrawColor(...AV); doc.setLineWidth(1.2); doc.roundedRect(M+8,cy,sw,sh,8,8,'S'); font('bold',13,AV); doc.text('NOT VALIDATED',M+26,cy+26,{charSpace:0.4});
    font('normal',10,WH); doc.text(doc.splitTextToSize('Estimate for planning only. Send this design to the Pro AV Design team for validation before ordering.',sw-36),M+26,cy+44); }
  // key figures along the bottom
  const tiles=[[fmt(s.eps),'DEVICES'],[fmt(s.sw),'SWITCHES'],[fmt(s.poe)+' W','POE LOAD'],[fmt(s.est/1000,1)+' kW','EST. POWER'],[fmt(s.ru,1)+' U','RACK SPACE']], tg=6, tw=(pw()-2*M-16-tg*4)/5, ty=ph()-M-70;
  tiles.forEach(([val,l],i)=>{ const x=M+8+i*(tw+tg); doc.setFillColor(...G6); doc.roundedRect(x,ty,tw,52,6,6,'F'); font('bold',16,WH); doc.text(val,x+10,ty+25); font('normal',7,G4); doc.text(l,x+10,ty+40,{charSpace:0.5}); });
  font('normal',7.5,G4); doc.text('Generated by the NETGEAR AV BoM builder',M+8,ph()-M+8);

  // --- page 2: NETGEAR AV introduction (copy from NETGEAR AV Overview, Apr 2026; see AV_OFFER) ---
  doc.addPage(fmtName,'portrait'); y=M+16;
  font('bold',8,AVD); doc.text('WHY NETGEAR AV',M,y+8,{charSpace:1}); y+=30;
  font('normal',22,INK); doc.text(AV_OFFER.headline[0],M,y); const hw=doc.getTextWidth(AV_OFFER.headline[0]+' '); font('bold',22,INK); doc.text(AV_OFFER.headline[1],M+hw,y); y+=20;
  para(AV_OFFER.intro,{s:10,c:INK,after:16});
  const bw2=(pw()-2*M-12)/2, bh2=74;
  AV_OFFER.benefits.forEach(([t,d],i)=>{ const x=M+(i%2)*(bw2+12), by=y+Math.floor(i/2)*(bh2+10);
    doc.setFillColor(...G1); doc.roundedRect(x,by,bw2,bh2,6,6,'F'); doc.setFillColor(...AVD); doc.circle(x+16,by+19,3,'F');
    font('bold',10.5,INK); doc.text(t,x+26,by+22); font('normal',8.5,G6); doc.text(doc.splitTextToSize(d,bw2-40).slice(0,3),x+26,by+37); });
  y+=Math.ceil(AV_OFFER.benefits.length/2)*(bh2+10)+12;
  // what this design uses, from the BoM
  const fam=[...new Set(result.bom.filter(b=>b.cat==='Switches').map(b=>(String(b.desc).match(/^(M\d{4})/)||[])[1]).filter(Boolean))].sort();
  const ap=[...new Set(result.bom.filter(b=>b.cat==='Wireless').map(b=>String(b.desc).replace(/^NETGEAR\s+/,'').replace(/\s+AP$/,'')))];
  const gw=result.bom.some(b=>b.cat==='Gateway');
  const uses=[fam.length?`${fam.join(' and ')} switches`:'',ap.length?`${ap.join(', ')} access points`:'',gw?'the PR460X Pro Router':''].filter(Boolean);
  if(uses.length){ h3('In this design');
    para(`This design uses ${uses.length>1?uses.slice(0,-1).join(', ')+' and '+uses.slice(-1):uses[0]}, all managed for free from one screen in the NETGEAR Engage Controller with NETGEAR AV OS.`,{s:10,c:INK,after:14}); }
  h3('Built for every space');
  para(AV_OFFER.verticals.join('   ·   '),{s:9.5,c:INK,after:14});
  h3('Help from design to deployment');
  para(AV_OFFER.help,{s:9.5,c:INK});

  // --- page 3: support and services ---
  doc.addPage(fmtName,'portrait'); y=M+16; h2('Support and services');
  para(AV_OFFER.supportIntro,{s:9.5,c:INK,after:12});
  const CK={content:'',ck:true}, tierCols=['Warranty (included)','Sprint','Overdrive','Fastlane'];
  y=at({startY:y,head:[['',...tierCols]],body:AV_OFFER.tiers.map(r=>r.map((v,i)=>v===true?CK:v===false?'':i?v:{content:v,styles:{textColor:G6}})),
    headStyles:{...tbl.headStyles,fontStyle:'bold',textColor:INK,halign:'center'},columnStyles:{0:{cellWidth:150},1:{halign:'center'},2:{halign:'center'},3:{halign:'center'},4:{halign:'center'}},
    didParseCell:d=>{ if(d.section==='head'&&d.column.index===0) d.cell.styles.halign='left'; if(d.section==='head'&&d.column.index>1) d.cell.styles.textColor=AVD; },
    didDrawCell:d=>{ if(d.section==='body'&&d.cell.raw&&d.cell.raw.ck){ const cx=d.cell.x+d.cell.width/2, cy=d.cell.y+d.cell.height/2; doc.setDrawColor(...AVD); doc.setLineWidth(1.4); doc.lines([[2.6,2.8],[5.4,-6]],cx-4,cy+0.4); } }})+8;
  para(AV_OFFER.supportNote,{after:18});
  h3('Professional services');
  y=at({startY:y,body:AV_OFFER.services.map(([t,d])=>[t,d]),columnStyles:{0:{cellWidth:150,fontStyle:'bold'},1:{textColor:G6}}})+8;
  y=at({startY:y,head:[['Part number','Service']],body:AV_OFFER.serviceSkus,columnStyles:{0:{cellWidth:150,fontStyle:'bold'}}})+8;
  para(AV_OFFER.servicesNote);

  // --- design summary ---
  doc.addPage(fmtName,'portrait'); y=M+16; h2('Design summary');
  const dis=ok?`This design was validated by the Pro AV Design team on ${longDate(when)}. Pricing and availability are provided by NETGEAR or your distributor.`
    :`Estimate for planning only. ${T.Disclaimer||'This bill of materials is generated automatically as a budgetary estimate. It must be validated by the Pro AV Design team before ordering.'} Validation: ${MAIL()}`;
  font('normal',8.5,INK); const dl=doc.splitTextToSize(dis,pw()-2*M-28), dh=dl.length*11.5+18;
  doc.setFillColor(...G1); doc.setDrawColor(...AVD); doc.setLineWidth(0.75); doc.roundedRect(M,y,pw()-2*M,dh,6,6,'FD'); doc.text(dl,M+14,y+17); y+=dh+12;
  if(result.errors.length) para(`${result.errors.length} issue${result.errors.length>1?'s':''} must be resolved before this design is complete. See Checks.`,{c:INFO});
  y+=6;
  h3('Rooms and devices');
  const rows=[]; state.locations.forEach(L=>{ const n=L.eps.reduce((a,e)=>a+(+e.qty||0),0);
    rows.push([{content:`${L.name}   ·   ${L.type==='MDF'?'MDF':`IDF, ${fmt(L.distance)} m ${L.media==='SMF'?'single mode':'multimode'} fiber`}   ·   ${n} devices`,colSpan:5,styles:{fontStyle:'bold',fillColor:G1}}]);
    L.eps.forEach(e=>{ const ep=state.endpoints.find(z=>z.Endpoint_ID===e.ep)||{}; rows.push([ep.Name||e.ep,ep.Category||'',fmt(e.qty),ep.Link_Speed_Gbps?ep.Link_Speed_Gbps+'G '+(ep.Media||''):'',ep.PoE_W?fmt(ep.PoE_W)+' W':'–']); }); });
  y=at({startY:y,head:[['Device','Category','Qty','Link','PoE each']],body:rows,columnStyles:{2:{halign:'right',cellWidth:40},3:{cellWidth:80},4:{halign:'right',cellWidth:60}}})+10;

  // --- diagram: landscape page, fitted ---
  doc.addPage(fmtName,'landscape'); y=M+16; h2('Network diagram');
  const svg=diagram(true,PRINT), m=svg.match(/width="(\d+(?:\.\d+)?)" height="(\d+(?:\.\d+)?)"/);
  if(m){ const W=+m[1], H=+m[2], bw=pw()-2*M, bh=ph()-y-M-56, k=Math.min(bw/W,bh/H);
    try{ const png=await svgToPng(svg,W,H,Math.min(3,6000/Math.max(W,H))); doc.addImage(png,'PNG',M+(bw-W*k)/2,y,W*k,H*k,undefined,'FAST'); y+=H*k+12; }
    catch(e){ para('The diagram could not be drawn in this browser. Download it as .svg instead.'); } }
  else para('Add devices to a room to see the network.');
  para('Green lines are uplinks, labelled with link count, speed and the optic or cable used. With a redundant core, every switch has its own full-capacity link group to each core, so either core can carry all traffic alone.');

  // --- bill of materials ---
  doc.addPage(fmtName,'portrait'); y=M+16; h2('Bill of materials');
  const R=rollup(), bom=[];
  brandsOf(R).forEach(br=>{ const RB=R.filter(r=>brandKey(r)===br);
    bom.push([{content:br+(brandNote(br)?`   ${brandNote(br)}`:''),colSpan:5,styles:{fontStyle:'bold',fontSize:9,textColor:INK,fillColor:G3}}]);
    CATORDER.filter(c=>RB.some(r=>r.cat===c)).forEach(c=>{ bom.push([{content:c.toUpperCase(),colSpan:5,styles:{fontStyle:'bold',fontSize:7.5,textColor:AVD,fillColor:G1}}]);
      RB.filter(r=>r.cat===c).forEach(r=>bom.push([sku(r.sku),r.brand||'',r.desc,{content:fmt(r.qty),styles:{fontStyle:'bold'}},[...r.locs].join(', ')])); }); });
  y=at({startY:y,head:[['Part number','Brand','Description','Qty','Where']],body:bom,columnStyles:{0:{cellWidth:96,fontStyle:'bold'},1:{cellWidth:52},3:{halign:'right',cellWidth:30},4:{cellWidth:104,textColor:MUT}},
    didParseCell:d=>{ if(d.section==='head'&&d.column.index===3) d.cell.styles.halign='right'; }})+12;
  para(`Part numbers are for ${P.region}${P.taa?', TAA-compliant where available':''}. Pricing and availability are provided by NETGEAR or your distributor after validation.`);

  // --- power ---
  y+=10; h2('Power and rack space');
  const locs=[...new Set(result.power.map(p=>p.loc))];
  y=at({startY:y,head:[['Room','Est. draw','Datasheet max','Heat load','Current','Circuits','UPS size','Rack']],
    body:locs.map(l=>{ const r=roomPower(l); return [l,fmt(r.w)+' W',fmt(r.mx)+' W',fmt(r.btu)+' BTU/hr',`${fmt(r.amps,1)} A at ${P.voltage} V`,`${r.circ} × ${r.cA} A`,fmt(r.va)+' VA+',fmt(r.ru,1)+' U']; }),
    columnStyles:{0:{fontStyle:'bold'}}})+18;
  h3('Power supplies per switch');
  y=at({startY:y,head:[['Room','Device','Qty','PoE load each','Power supplies',`PoE available${P.psuRed?' (1 PSU failed)':''}`,'Headroom','Est. draw each']],
    body:result.power.map(p=>[p.loc,p.model,p.n,p.poe?fmt(p.poe)+' W':'–',p.cfg,p.budget?fmt(p.budget)+' W':'–',p.head!==null?fmt(p.head*100)+'%':'–',fmt(p.est)+' W']),
    columnStyles:{2:{halign:'right'},3:{halign:'right'},4:{cellWidth:86},5:{halign:'right'},6:{halign:'right'},7:{halign:'right'}}})+12;
  para(`Estimated draw = datasheet maximum without PoE + PoE load ÷ ${+T.PSU_Efficiency||0.9} (PSU efficiency). Circuits assume 80% continuous load.${P.psuRed?' Feed each power supply from a separate circuit or UPS.':''}`);

  // --- checks ---
  doc.addPage(fmtName,'portrait'); y=M+16; h2('Checks');
  const chk=[...result.errors.map(e=>['ISSUE',`${e.loc}: ${e.msg}`]),...result.notes.map(n=>[n.lvl==='warn'?'CHECK':'NOTE',n.msg])];
  y=chk.length?at({startY:y,body:chk,columnStyles:{0:{cellWidth:46,fontStyle:'bold',fontSize:7}},didParseCell:d=>{ if(d.column.index===0) d.cell.styles.textColor=d.cell.raw==='ISSUE'?INFO:d.cell.raw==='CHECK'?AVD:G4; }})+22:(para('No issues found.'),y);
  h3('Uplink plan');
  y=result.links.length?at({startY:y,head:[['Room','Switch','Units','Uplinks each','Speed','Run','Optic / cable']],
    body:result.links.map(l=>[l.loc,l.model,l.n,l.u,l.speed+'G',l.media+(l.media!=='in-rack'?`, ${l.dist} m`:''),sku(l.optic)]),columnStyles:{2:{halign:'right'},3:{halign:'right'}}})+12:(para('Single switch, no uplinks needed.'),y);

  // --- footer on every page after the cover ---
  const n=doc.getNumberOfPages(), foot=ok?`${name}: validated by the Pro AV Design team, ${longDate(when)}.`:`${name}: estimate only, not validated. Must be validated by the Pro AV Design team before ordering.`;
  for(let i=2;i<=n;i++){ doc.setPage(i); doc.setDrawColor(...G3); doc.setLineWidth(0.5); doc.line(M,ph()-M+4,pw()-M,ph()-M+4);
    font('normal',7.5,MUT); doc.text(foot,M,ph()-M+16); doc.text(`Page ${i} of ${n}`,pw()-M,ph()-M+16,{align:'right'}); }
  doc.setProperties({title:`${name}: AV network design report`,subject:ok?'Validated NETGEAR AV network design':'NETGEAR AV network design estimate',creator:'NETGEAR AV BoM builder'});
  return doc.output('blob'); }
async function exportPdf(v){ toast('Building PDF report…'); try{ const b=await buildPdf(v); if(b){ saveFile(`${slug()}-report${v&&v.validated?'-validated':''}.pdf`,b); track('bom'); } }catch(e){ console.error(e); toast('Could not build the PDF report.'); } }
// Admin: report for a stored request; marked validated when its status is Validated.
async function reqPdf(u,r){ const d=REQS.find(x=>x.uid===u), it=d&&d.items.find(i=>i.rid===r); if(!it) return;
  const keep=[state,result]; try{ state=JSON.parse(it.design); state.project={...DEFAULT().project,...state.project}; result=ENG.design(CAT,state);
    await exportPdf({validated:it.status==='Validated',by:it.validatedBy,at:it.validatedAt,rid:it.rid}); }
  catch(e){ toast('That design could not be opened.'); } finally{ [state,result]=keep; } }
$('#fjson').addEventListener('change',async ev=>{ const f=ev.target.files[0]; ev.target.value=''; if(!f) return;
  try{ const s=await unpackProject(await f.arrayBuffer()); if(!s||!s.project||!s.locations) throw new Error('this is not a BoM builder project file'); state=s; state.project={...DEFAULT().project,...s.project}; fixSupport(state.project); run(); toast('Project opened.'); }catch(e){ toast('Could not open that file: '+e.message); } });
function catInfo(){ $('#catinfo').textContent=`Catalog ${CATMETA.version}`; }
let tt; function toast(m){ const t=$('#toast'); t.textContent=m; t.classList.add('on'); clearTimeout(tt); tt=setTimeout(()=>t.classList.remove('on'),3500); }

// ---------- browser initialization ----------
// This build is platform-independent: project state is stored locally and files
// are downloaded with standard browser APIs. Shared backend/admin services can
// be connected later without changing the BoM engine.
$('#adminlink').hidden=true;
$('#logo-d').src=LOGO_DARK; $('#logo-l').src=LOGO_LIGHT;
route();
document.body.dataset.view=view; catInfo(); run();
