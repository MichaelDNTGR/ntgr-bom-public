// ===== NETGEAR BoM engine v2: catalog-driven, port types from Port_Types sheet =====
const ENG = (() => {
const N = v => (v === null || v === undefined || v === '' || isNaN(+v)) ? 0 : +v;
const ceil = Math.ceil, EPS=1e-9;
const yes = v => /^y/i.test(String(v||''));
function settings(cat){ const m={}; (cat.Tool_Settings||[]).forEach(r=>m[r.Key]=r.Value); return m; }
function portTypes(cat){
  return (cat.Port_Types||[]).map(r=>({col:r.Column_Name,name:r.Port_Type,media:String(r.Media||'Fiber'),cage:r.Cage,max:N(r.Max_Speed_Gbps),
    speeds:String(r.Supported_Speeds_Gbps||r.Max_Speed_Gbps).split(/[,; ]+/).map(Number).filter(x=>!isNaN(x)&&x>0),
    ep:yes(r.Endpoint_Capable),up:yes(r.Uplink_Capable),poe:yes(r.PoE_Capable)})).sort((a,b)=>a.max-b.max);
}
const supports=(t,s)=>t.speeds.some(x=>Math.abs(x-s)<EPS);
const isTAA = p => /^Yes/i.test(String(p.TAA_SKU||''));
// timing a device type needs from its switch (Endpoints.Timing): PTP boundary clock, or AVB
const hasBC = p => /boundary/i.test(String(p.PTP||''));
const hasAVB = p => /^yes/i.test(String(p.AVB||''));
const avbNoLag = p => /not on LAG/i.test(String(p.AVB||''));
function timingOk(p,D){ return (!D.needBC||hasBC(p)) && (!D.needAVB||hasAVB(p)); }
// relative cost of one uplink (two optics plus a fiber pair) when the catalog has no prices
const linkCost = s => 0.4 + s/40;
const CORE_PORT = 3; // "fastest uplinks" strategy: each uplink also uses a core port, so fewer, faster links win
const TBD_PENALTY = 40; // a part missing from the catalog makes the design unorderable: worth more than an extra switch
function candidates(cat,S,role){
  return cat.Products.filter(p=>p.Category==='Switch' && (p.Lifecycle_Status||'Active')==='Active'
    && (!S.taa || isTAA(p)) && (S.family==='Auto' || p.Family===S.family));
}
const modW = name => { const m=String(name).match(/(\d{3,4})W/); return m?+m[1]:0; };

function psuPick(cat,p,needW,S){
  const rows=cat.PSU_PoE_Matrix.filter(r=>r.Product_ID===p.Product_ID &&
    (/110-240/.test(r.Input_Voltage||'') || String(r.Input_Voltage||'').startsWith(String(S.voltage))));
  if(!rows.length){
    const eps=N(p.PoE_Budget_Base_W);
    if(S.psuRed || needW>eps) return null;
    return {label:'Internal PSU',eps,prot:null,budget:eps,modules:[],cost:0};
  }
  let best=null;
  for(const r of rows){
    const qty=N(r.Module_Qty), eps=N(r.PoE_Budget_EPS_W);
    const pv=r.PoE_Budget_Protected_W, prot=(pv===undefined||pv===null||pv==='')?null:N(pv);
    if(S.psuRed && qty===0) continue;
    if(S.psuRed && prot===null && needW>0) continue;
    const budget = S.psuRed ? (needW>0?prot:eps) : eps;
    if(needW>budget) continue;
    const internal=/internal PSUs/.test(r.PSU_Module||'');
    const cost=internal?qty*0.1:qty*modW(r.PSU_Module)/100+qty;
    const cand={label:r.Config_Label,eps,prot,budget,modules:(qty&&!internal)?[{base:r.PSU_Module,qty}]:[],cost};
    if(!best||cand.cost<best.cost) best=cand;
  }
  return best;
}
function scoreUnit(p,psu){
  const price=N(p.List_Price_USD);
  if(price) return price + (psu?psu.cost*150:0);
  return 10 + (N(p.Total_Ports)||1)*0.35 + N(p.Switching_Fabric_Gbps)/150 + N(p.PoE_Budget_Max_W)/150 + (p.Family==='M4350'?6:0) + (psu?psu.cost:0);
}
// greedy assign endpoint classes to port types; returns remaining counts or null
function assign(PT,avail,classes,cuMods){
  const rem={...avail}, mods={};
  const cls=[...classes].sort((a,b)=>b.speed-a.speed||(b.poe?1:0)-(a.poe?1:0));
  for(const c of cls){
    let need=c.q;
    const types=PT.filter(t=>t.ep && t.media===c.media && supports(t,c.speed));
    for(const t of types){ if(need<=0) break; const use=Math.min(need,rem[t.col]||0); rem[t.col]-=use; need-=use; }
    // copper device without PoE can sit in a fiber cage with an RJ45 transceiver (e.g. AXM765 / AGM734)
    if(need>0 && c.media==='Copper' && !c.poe && cuMods && cuMods[c.speed]){
      for(const t of PT.filter(t=>t.ep && t.media==='Fiber' && supports(t,c.speed))){ if(need<=0) break; const use=Math.min(need,rem[t.col]||0); rem[t.col]-=use; need-=use; mods[c.speed]=(mods[c.speed]||0)+use; }
    }
    if(need>0) return null;
  }
  return {rem,mods};
}
function copperModules(cat){ const m={}; cat.Accessories.filter(a=>a.Category==='Optic'&&/copper/i.test(a.Media||'')&&!/pack/i.test(a.Description||'')).forEach(a=>{ const s=N(a.Speed_Gbps); if(!m[s]) m[s]=a; }); return m; }
function lagSizes(S){ const base=(S.lagSizes&&S.lagSizes.length?S.lagSizes:[1,2,4,8]).filter(x=>x>=1).sort((a,b)=>a-b);
  if(S.dualCore) return [...new Set(base.map(x=>x*2))].filter(x=>x<=S.maxLag*2);
  return base.filter(x=>x<=S.maxLag && (x>1 || !S.dualUplink)); }
function hasOptic(cat,speed,media,dist,inRack,ends){ return !pickLink(cat,speed,media,dist,inRack,ends).tbd; }
// Compatibility sheet: a product or family with rows only takes the accessories listed for it ("Not compatible" rows excluded).
// Products and families without rows accept any catalog part.
function compatSet(cat,p){
  if(!cat._compat){ const m={}; for(const r of cat.Compatibility||[]){ if(/not compatible/i.test(r.Relationship||'')) continue; const k=r.Scope_Type+':'+r.Scope_Value; (m[k]=m[k]||new Set()).add(String(r.Accessory_Base)); } Object.defineProperty(cat,'_compat',{value:m,enumerable:false}); }
  const a=cat._compat['Product:'+p.Product_ID], b=cat._compat['Family:'+p.Family];
  return a||b?new Set([...(a||[]),...(b||[])]):null;
}
const fitsEnds=(cat,a,ends)=>(ends||[]).every(p=>{ const s=p&&compatSet(cat,p); return !s||s.has(String(a.Base_Model)); });

function evalN(cat,PT,p,D,n,S,ctx){
  const avail={}; PT.forEach(t=>avail[t.col]=N(p[t.col]));
  const classes=D.classes.map(c=>({...c,q:ceil(c.q/n)}));
  if(!timingOk(p,D)) return null;
  const poeAt=ceil(D.poeAt/n), poeBt=ceil(D.poeBt/n), poePorts=N(p.PoE_Ports), std=String(p.PoE_Standard||'');
  if(poeBt>0 && !/bt/.test(std)) return null;
  if(poeAt+poeBt>0 && !/at|bt|af/.test(std)) return null;
  if(poeAt+poeBt>poePorts) return null;
  const f1=classes.filter(c=>c.media==='Fiber'&&c.speed<=1).reduce((s,c)=>s+c.q,0);
  if(N(p.Max_1G_SFP_Modules) && f1>N(p.Max_1G_SFP_Modules)) return null;
  const A=assign(PT,avail,classes,ctx.cuMods); if(!A) return null; const rem=A.rem;
  let up;
  if(ctx.standalone) up={speed:0,u:0};
  else {
    // stream bandwidth is typical, not peak, so uplinks keep a margin over it (line-rate is already worst case)
    const bw=D.bw/n/S.oversub*(S.basis==='stream'?1+(S.streamHead||0)/100:1);
    const ups=PT.filter(t=>t.up&&rem[t.col]>0);
    const speeds=[...new Set(ups.flatMap(t=>t.speeds))].filter(s=>s>=Math.max(1,S.minUp||1));
    // AVB on this switch does not run over a LAG, so each core gets a single link
    const noLag=D.needAVB&&avbNoLag(p);
    const fits=[];
    for(const s of speeds){
      const av=ups.filter(t=>supports(t,s)).reduce((a,t)=>a+rem[t.col],0);
      // redundant core: each core link group must carry the switch's full load on its own
      const need=Math.max(1,ceil(bw/s-EPS));
      let u; if(noLag) u=need===1?(S.dualCore?2:1):0;
      else if(S.dualCore){ const per=S.lagSizes.filter(x=>x<=S.maxLag).sort((a,b)=>a-b).find(x=>x>=need); u=per?per*2:0; }
      else u=lagSizes(S).find(x=>x>=need);
      if(u && u<=av) fits.push({speed:s,u,tbd:!hasOptic(cat,s,ctx.media,ctx.dist,ctx.inRack,[p])});
    }
    // strategy: slowest speed that fits (low), fewest links (fewest) or fastest speed (fast); speeds with a catalog optic first
    const order={low:(a,b)=>a.speed-b.speed, fast:(a,b)=>b.speed-a.speed, fewest:(a,b)=>a.u-b.u||a.speed-b.speed}[S.upPref]||((a,b)=>a.speed-b.speed);
    fits.sort((a,b)=>(a.tbd?1:0)-(b.tbd?1:0)||order(a,b));
    up=fits[0]; if(!up) return null; if(!up.tbd) delete up.tbd;
  }
  const free={...rem}; if(up.u){ let q=up.u; for(const t of PT.filter(t=>t.up&&supports(t,up.speed))){ const k=Math.min(q,free[t.col]||0); free[t.col]-=k; q-=k; } }
  const needW=D.poeW/n*(1+S.poeHead/100);
  const psu=psuPick(cat,p,needW,S); if(!psu) return null;
  // RJ45 SFP modules are a fallback: a switch with native copper ports should win whenever one fits
  const modCost=Object.values(A.mods).reduce((a,b)=>a+b,0)*4;
  return {p,n,up,psu,mods:A.mods,free,pre:{...rem},poeLoadUnit:D.poeW/n,needW,score:n*(scoreUnit(p,psu)+modCost+(up.tbd?TBD_PENALTY:0)+up.u*(linkCost(up.speed)+(S.upPref==='fast'?CORE_PORT:0)))};
}
// Neutrik etherCON switches (e.g. M4350-16M4V) only when the room asks for them; a Neutrik room only gets them
const isNeutrik=p=>N(p.Neutrik_etherCON_Ports)>0;
function bestFor(cat,PT,D,S,ctx,forced){
  const list=forced?cat.Products.filter(p=>p.Product_ID===forced):candidates(cat,S,'access').filter(p=>isNeutrik(p)===!!ctx.neutrik);
  let best=null; const alts=[];
  const keep=r=>{ alts.push(r); if(!best||r.score<best.score) best=r; };
  for(const p of list){ let tbd=null;
    for(let n=1;n<=48;n++){ const r=evalN(cat,PT,p,D,n,S,ctx); if(!r) continue;
      if(!r.up.tbd){ keep(r); tbd=null; break; }
      // a placeholder optic (e.g. 25G beyond multimode reach) may be avoidable with more units at a lower speed
      if(!tbd) tbd=r; else if(n>tbd.n+2) break; }
    if(tbd) keep(tbd); }
  alts.sort((a,b)=>a.score-b.score);
  return best?{best,alts:alts.slice(0,4)}:null;
}
function demandOf(items,S,noSpare){
  const D={classes:[],poeAt:0,poeBt:0,poeW:0,bw:0,count:0}, map={};
  const sp=noSpare?1:1+S.spare/100;
  for(const it of items){
    const ep=it.ep, q=N(it.qty); if(!q||!ep) continue;
    const spd=N(ep.Link_Speed_Gbps)||1, media=/fiber/i.test(ep.Media||'')?'Fiber':'Copper', w=N(ep.PoE_W);
    const poe=w>0; const k=media+spd+(poe?'P':''); (map[k]=map[k]||{media,speed:spd,poe,q:0}).q+=q;
    if(w>30) D.poeBt+=q; else if(w>0) D.poeAt+=q;
    if(ep.Timing==='PTP-BC') D.needBC=true; if(ep.Timing==='AVB') D.needAVB=true;
    D.poeW+=w*q; D.count+=q; D.bw+= q*(S.basis==='stream'? N(ep.Stream_Mbps)/1000 : spd);
  }
  D.classes=Object.values(map).map(c=>({...c,q:ceil(c.q*sp)}));
  // spare ports apply to the port count only; PoE ports are sized to the devices actually listed
  return D;
}
function poolKey(it){ const f=/fiber/i.test(it.ep.Media||''), s=N(it.ep.Link_Speed_Gbps); return f?'Fiber endpoints':(s>2.5?'Multi-gig copper endpoints':'1G / 2.5G copper endpoints'); }
function solveLocation(cat,PT,items,S,ctx,forced){
  const nz=items.filter(i=>N(i.qty)>0&&i.ep);
  if(!nz.length) return {groups:[],err:null};
  const opts=[];
  const whole=bestFor(cat,PT,demandOf(nz,S),S,ctx,forced);
  if(whole) opts.push({groups:[{label:'All endpoints',items:nz,...whole}],score:whole.best.score});
  if(!forced){
    const pools={}; nz.forEach(i=>(pools[poolKey(i)]=pools[poolKey(i)]||[]).push(i));
    const keys=Object.keys(pools);
    const parts=[];
    if(keys.length>=2){ parts.push(keys.map(k=>pools[k])); if(keys.length===3){ parts.push([[...pools[keys[0]],...pools[keys[1]]],pools[keys[2]]]); parts.push([pools[keys[0]],[...pools[keys[1]],...pools[keys[2]]]]); } }
    for(const part of parts){ const gs=[]; let ok=true, sc=0;
      for(const x of part){ const r=bestFor(cat,PT,demandOf(x,S),S,ctx); if(!r){ok=false;break;} gs.push({label:x.map(poolKey).filter((v,i,a)=>a.indexOf(v)===i).join(' + '),items:x,...r}); sc+=r.best.score; }
      if(ok) opts.push({groups:gs,score:sc}); }
  }
  if(!opts.length) return {groups:[],err:forced?`The selected switch cannot serve this endpoint mix with the current settings.`:(ctx.neutrik?'No Neutrik etherCON switch fits this room. The M4350-16M4V has 16 x 2.5G PoE++ ports (8 etherCON) and 4 x 25G uplinks; split the devices over more rooms, or set Connectors to Standard RJ45.':noFitMsg(S,nz))};
  opts.sort((a,b)=>a.score-b.score); return {groups:opts[0].groups,err:null};
}
function noFitMsg(S,items){
  const h=[];
  if(S.family==='M4250'){
    if(S.taa) h.push('No M4250 model has a TAA-compliant SKU.');
    if(S.psuRed) h.push('Most M4250 models have one fixed power supply; with redundant power on, only the 26G4F-PoE++ and 40G8XF-PoE++ qualify. Turn off redundant power to use the rest.');
    if(items.some(i=>N(i.ep.Link_Speed_Gbps)>10)) h.push('M4250 has no 25G ports.');
    if(items.some(i=>N(i.ep.Link_Speed_Gbps)>1&&N(i.ep.Link_Speed_Gbps)<10&&!/fiber/i.test(i.ep.Media||''))) h.push('Only the M4250-12M2XF has 2.5G ports, and it has no PoE.');
    if(items.some(i=>N(i.ep.Link_Speed_Gbps)>=10&&N(i.ep.PoE_W)>0&&!/fiber/i.test(i.ep.Media||''))) h.push('M4250 has no PoE on 10G ports.');
  }
  if(S.family==='M4350' && S.taa) h.push('With TAA on, only M4350 models with -TAANES SKUs qualify.');
  return 'No '+(S.family==='Auto'?'':S.family+' ')+'switch fits this room with the current settings. '+(h.join(' ')||'Try turning off TAA or redundant power, or contact the Pro AV Design team.');
}
const ISL_RULES={failover:'largest single switch (one uplink group fails)',half:'half of all room traffic (active/active cores)',full:'all room traffic (fully non-blocking)'};
function islRequired(dem,S){
  const base=S.islRule==='full'?dem.total:(S.islRule==='failover'?0:dem.total/2);
  return Math.max(dem.maxSw,base)/(S.oversub||1);
}
function solveCore(cat,PT,dem,S,forced){
  const list=(forced?cat.Products.filter(p=>p.Product_ID===forced):candidates(cat,S,'core').filter(p=>!isNeutrik(p)&&PT.some(t=>t.up&&t.media==='Fiber'&&N(p[t.col])>0)))
    .filter(p=>timingOk(p,dem)&&!(dem.needAVB&&avbNoLag(p)&&dem.lagged));
  const cores=S.dualCore?2:1; let best=null, psuFail=false;
  const speeds=Object.keys(dem.links).map(Number).sort((a,b)=>b-a);
  for(const p of list){
    const ups=PT.filter(t=>t.up&&N(p[t.col])>0);
    for(let k=cores;k<=cores;k++){
      const rem={}; ups.forEach(t=>rem[t.col]=N(p[t.col]));
      let ok=true;
      const need={}; speeds.forEach(s=>need[s]=ceil(dem.links[s]/k));
      if(dem.gw) need[10]=(need[10]||0)+1;
      for(const s of Object.keys(need).map(Number).sort((a,b)=>b-a)){
        let q=need[s]; for(const t of ups.filter(t=>supports(t,s))){ const u=Math.min(q,rem[t.col]); rem[t.col]-=u; q-=u; }
        if(q>0){ ok=false; break; }
      }
      if(!ok) continue;
      let isl=0, islSpeed=0, islReq=0;
      if(k>1){
        islReq=islRequired(dem,S);
        const fits=[];
        for(const s of [...new Set(ups.flatMap(t=>t.speeds))].filter(s=>s>=10).sort((a,b)=>b-a)){
          const av=ups.filter(t=>supports(t,s)).reduce((a,t)=>a+rem[t.col],0);
          const n=S.lagSizes.filter(x=>x>=2&&x<=S.maxLag).sort((a,b)=>a-b).find(x=>x*s>=islReq-EPS);
          if(n && n<=av) fits.push({s,n});
        }
        if(!fits.length) continue;
        const pick=fits.find(f=>hasOptic(cat,f.s,'DAC',3,true,[p]))||fits[0]; islSpeed=pick.s; isl=pick.n; }
      const psu=psuPick(cat,p,0,S); if(!psu){ psuFail=true; continue; }
      // ports that cannot carry any link this design uses (e.g. 1/2.5G SFP when every uplink is 10G) are wasted
      const linkSpeeds=[...speeds,...(dem.gw?[10]:[]),...(islSpeed?[islSpeed]:[])];
      const wasted=PT.filter(t=>N(p[t.col])>0&&!(t.up&&linkSpeeds.some(s=>supports(t,s)))).reduce((a,t)=>a+N(p[t.col]),0);
      const sc=k*(scoreUnit(p,psu)+wasted*0.5);
      if(!best||sc<best.score) best={p,k,psu,islSpeed,isl,islReq,score:sc};
      break;
    }
  }
  return best||(psuFail?{fail:'psu'}:null);
}
function pickLink(cat,speed,media,dist,inRack,ends){
  const A=cat.Accessories.filter(a=>fitsEnds(cat,a,ends));
  // NETGEAR-branded parts before third-party (optic.ca, -OC) when both fit
  const brand=(a,b)=>(/-OC$/.test(a.Orderable_SKU)?1:0)-(/-OC$/.test(b.Orderable_SKU)?1:0);
  if(inRack){
    const d=A.filter(a=>/DAC|AOC/.test(a.Category)&&N(a.Speed_Gbps)===speed&&N(a.Reach_m)>=dist).sort((a,b)=>N(a.Reach_m)-N(b.Reach_m)||brand(a,b));
    if(d.length) return {sku:d[0].Orderable_SKU,desc:d[0].Description,perLink:1,cat:'Cabling'};
    if(media==='DAC') return {sku:`TBD-${speed}G-DAC`,desc:`${speed}G direct-attach cable (not in catalog)`,perLink:1,cat:'Cabling',tbd:true};
    media='MMF';
  }
  const o=A.filter(a=>a.Category==='Optic'&&N(a.Speed_Gbps)===speed&&String(a.Media)===media&&N(a.Reach_m)>=dist&&!/pack/i.test(a.Description||''))
    // LRM and PSM4 (8-fiber MPO trunk) only when nothing else reaches
    .sort((a,b)=>(/LRM|PSM4/.test(a.Description)?1:0)-(/LRM|PSM4/.test(b.Description)?1:0) || N(a.Reach_m)-N(b.Reach_m) || brand(a,b));
  if(o.length) return {sku:o[0].Orderable_SKU,desc:o[0].Description,perLink:2,cat:'Optics'};
  return {sku:`TBD-${speed}G-${media}`,desc:`${speed}G ${media} transceiver, ${dist} m (not in catalog)`,perLink:2,cat:'Optics',tbd:true};
}
const REG={Americas:['Americas','North America','US'],Europe:['Europe','Americas / Europe'],APAC:['Asia Pacific','Other APAC','Australia','Japan'],China:['China']};
function regionSku(cat,pid,S){
  const rows=cat.SKUs.filter(r=>r.Product_ID===pid);
  if(S.taa){ const t=rows.find(r=>r.TAA_Compliant==='Yes'); if(t) return t.Orderable_SKU; }
  for(const k of (REG[S.region]||REG.Americas)){ const r=rows.find(r=>String(r.Region)===k)||rows.find(r=>String(r.Region).startsWith(k)); if(r) return r.Orderable_SKU; }
  const r=rows.find(r=>String(r.Region).includes(S.region==='APAC'?'Asia':S.region)); if(r) return r.Orderable_SKU;
  return rows[0]?rows[0].Orderable_SKU:pid;
}
function psuSku(cat,base,S){
  const rows=cat.Accessories.filter(a=>a.Base_Model===base); if(rows.length===1) return rows[0];
  const want=S.region==='APAC'?/JP\/AU/:(S.region==='China'?/No cord/:/NA\/UK\/EU/);
  return rows.find(r=>want.test(r.Power_Cord||''))||rows[0]||{Orderable_SKU:base,Description:base};
}
// spread a group's devices evenly over its n switches (each type gets at most ceil(q/n) per switch, matching the port check)
function splitUnits(items,n,S){
  const units=Array.from({length:n},()=>({eps:[],bw:0,count:0}));
  const bwOf=ep=>S.basis==='stream'?N(ep.Stream_Mbps)/1000:N(ep.Link_Speed_Gbps);
  const sorted=[...items].filter(i=>N(i.qty)>0).sort((a,b)=>bwOf(b.ep)*N(b.qty)-bwOf(a.ep)*N(a.qty));
  for(const it of sorted){
    const q=N(it.qty), base=Math.floor(q/n), extra=q%n;
    const order=units.map((u,i)=>i).sort((a,b)=>units[a].bw-units[b].bw||units[a].count-units[b].count);
    const give=new Array(n).fill(base); for(let k=0;k<extra;k++) give[order[k]]++;
    give.forEach((g,i)=>{ if(!g) return; const bw=g*bwOf(it.ep); units[i].eps.push({id:it.ep.Endpoint_ID,name:it.ep.Name,qty:g,bw}); units[i].bw+=bw; units[i].count+=g; });
  }
  return units;
}
// Build the whole design with each uplink strategy and keep the cheapest one that works, core included.
const STRATEGIES=['low','fewest','fast'];
function design(cat,state){
  const runs=STRATEGIES.map(p=>({p,r:designOnce(cat,state,p)}));
  const ok=runs.filter(x=>!x.r.errors.length);
  if(!ok.length) return runs[0].r;
  // a faster strategy must be clearly cheaper to replace the slower one, so near-ties keep the slower uplinks
  const w=ok.reduce((b,x)=>x.r.score<b.r.score-0.5?x:b), low=runs[0].r;
  if(w.p!=='low'){
    if(low.errors.some(e=>e.loc==='Core')) w.r.notes.unshift({lvl:'info',msg:'Room switches were moved to faster uplinks (25G/40G/100G) so the core switches have enough ports to terminate every link.'});
    else w.r.notes.unshift({lvl:'info',msg:'Faster uplinks (fewer links) give a smaller overall design than the slowest uplink speed, so they were used.'});
  }
  // A room's cheapest switch can force a bigger core. Try each room's close alternatives on the whole design
  // and keep any that makes the total cheaper (one pass, rooms the user has not fixed, single switch group only).
  let best=w.r, cur=state;
  for(const L of state.locations){
    if(L.override&&L.override!=='Auto') continue;
    const nodes=best.accessNodes.filter(a=>a.loc===L.name); if(nodes.length!==1) continue;
    for(const a of nodes[0].alts.filter(a=>a.pid!==nodes[0].pid).slice(0,3)){
      const st={...cur,locations:cur.locations.map(x=>(x.id??x.name)===(L.id??L.name)?{...x,override:a.pid}:x)};
      const r=designOnce(cat,st,w.p);
      if(!r.errors.length&&r.score<best.score-0.5){ best=r; cur=st; }
    }
  }
  if(best!==w.r){
    // keep the "Also fits" list from the open search; a forced room only lists itself
    best.accessNodes.forEach(a=>{ const o=w.r.accessNodes.find(x=>x.loc===a.loc); if(o) a.alts=o.alts; });
    best.notes=[...w.r.notes.filter(n=>/faster uplinks/i.test(n.msg)),...best.notes.filter(n=>!/faster uplinks/i.test(n.msg))]; best.notes.unshift({lvl:'info',msg:'A different room switch was chosen where it allows a smaller core, so the whole design costs less.'}); }
  best.strategy=w.p; return best;
}
function designOnce(cat,state,upPref){
  const S={...state.project,upPref}, T=settings(cat), PT=portTypes(cat);
  S.maxLag=N(T.Max_LAG_Members)||8; S.minUp=N(T.Min_Uplink_Gbps)||1; S.streamHead=T.Stream_Uplink_Headroom_Pct===undefined?50:N(T.Stream_Uplink_Headroom_Pct); S.lagSizes=String(T.Uplink_LAG_Sizes||'1,2,4,8').split(/[,; ]+/).map(Number).filter(x=>x>0); const inRackMax=N(T.In_Rack_Max_m)||20, eff=N(T.PSU_Efficiency)||0.9;
  // support contract: "SPR:3" = Sprint 3 years (DRV = Overdrive, FLS = Fastlane); older projects stored OnCall years as a number (24x7, so Overdrive)
  const supPat=/\{tier\}/.test(T.Support_SKU_Pattern||'')?T.Support_SKU_Pattern:'{tier}-{pid}-{months}',
    [supTier,supYrs]=typeof S.support==='number'?(S.support?['DRV',S.support]:['',0]):String(S.support||'').split(':').map((x,i)=>i?+x:x), gwId=T.Gateway_Product_ID||'PR460X';
  const notes=[], bom=[], links=[], power=[];
  const epById=Object.fromEntries(state.endpoints.map(e=>[e.Endpoint_ID,e]));
  const add=(sku,desc,qty,catg,loc,note)=>{ if(!qty) return; let l=bom.find(b=>b.sku===sku&&b.loc===loc); if(!l){l={sku,desc,qty:0,cat:catg,loc,note:note||''}; bom.push(l);} l.qty+=qty; };
  const locs=state.locations.map(L=>({...L,items:L.eps.map(x=>({ep:epById[x.ep],qty:x.qty})).filter(x=>x.ep)}));
  const CUM=copperModules(cat), cuMods=Object.fromEntries(Object.keys(CUM).map(k=>[k,true]));
  const ctxFor=(L,standalone)=>{ const mdf=L.type==='MDF', dist=mdf?N(S.mdfPatch):N(L.distance); return {standalone,media:L.media||'MMF',dist,inRack:mdf&&dist<=inRackMax,cuMods,neutrik:L.conn==='neutrik'}; };
  const ovr=L=>L.override&&L.override!=='Auto'?L.override:null;
  let standalone=false;
  // redundant power can apply everywhere or only in the main equipment room (MDF + core)
  const SL=L=>({...S,psuRed:!!S.psuRed&&(S.psuScope!=='mdf'||L.type==='MDF')});
  const countUnits=rs=>rs.reduce((s,r)=>s+r.groups.reduce((a,g)=>a+g.best.n,0),0);
  const active=locs.filter(L=>L.items.some(i=>N(i.qty)>0)).length;
  let res=null;
  // a single room that fits on one switch needs no uplinks or core, so try that first
  if(active<=1){ const solo=locs.map(L=>({L,...solveLocation(cat,PT,L.items,SL(L),ctxFor(L,true),ovr(L))}));
    if(countUnits(solo)===1){ standalone=true; res=solo; } }
  if(!res) res=locs.map(L=>({L,...solveLocation(cat,PT,L.items,SL(L),ctxFor(L,false),ovr(L))}));
  const units=countUnits(res);
  const errors=res.filter(r=>r.err).map(r=>({loc:r.L.name,msg:r.err}));
  const coreDem={links:{},gw:S.gateway,total:0,maxSw:0,needBC:false,needAVB:false,lagged:false}; const accessNodes=[];
  let score=0; const uplinks=[];
  const TIERS={SPR:'Sprint',DRV:'Overdrive',FLS:'Fastlane'}, supIncl=new Set(), supMiss=new Set();
  const support=(p,qty,loc)=>{ if(!supTier||!p||!qty) return; const name=TIERS[supTier]; if(!name) return;
    // only tiers listed for the product; Sprint up to the included term needs no SKU
    if(!new RegExp('\\b'+name+'\\b','i').test(p.Support_Tiers||'')){ supMiss.add(p.Model_Name); return; }
    const inc=String(p.Included_Support||'').match(/Sprint\s*(\d+)/i); if(supTier==='SPR'&&inc&&supYrs<=+inc[1]){ supIncl.add(p.Model_Name); return; }
    const sku=supPat.replace('{tier}',supTier).replace('{pid}',p.Product_ID).replace('{months}',supYrs*12), a=cat.Accessories.find(x=>x.Orderable_SKU===sku);
    add(sku,a?a.Description:`${name} support, ${supYrs} year${supYrs>1?'s':''}`,qty,'Support',loc,`${name} ${supYrs} yr for ${p.Model_Name}`); };
  for(const r of res){
    const L=r.L, ctx=ctxFor(L,standalone);
    for(const g of r.groups){
      const b=g.best, p=b.p; score+=b.score;
      const Dg=demandOf(g.items,S,true); if(!standalone&&b.up.u>0){ coreDem.needBC=coreDem.needBC||!!Dg.needBC; coreDem.needAVB=coreDem.needAVB||!!Dg.needAVB; if(Dg.needAVB&&b.up.u/(S.dualCore?2:1)>1) coreDem.lagged=true; }
      add(regionSku(cat,p.Product_ID,S),`${p.Model_Name} switch`,b.n,'Switches',L.name);
      for(const m of b.psu.modules){ const a=psuSku(cat,m.base,S); add(a.Orderable_SKU,a.Description||m.base,m.qty*b.n,'Power',L.name,'PSU module'); }
      if(b.up.u>0){
        coreDem.links[b.up.speed]=(coreDem.links[b.up.speed]||0)+b.up.u*b.n;
        uplinks.push({L,p,b,ctx});
      }
      const D0=demandOf(g.items,S,true);
      for(const c of D0.classes.filter(c=>c.media==='Fiber')){ const o=pickLink(cat,c.speed,'MMF',100,false,[p]); add(o.sku,o.desc,c.q,'Optics',L.name,o.tbd?'Not in catalog yet':`Switch-side optic for ${c.speed}G fiber endpoints`); if(o.tbd) notes.push({lvl:'warn',msg:`${L.name}: no ${c.speed}G endpoint optic in the catalog.`}); }
      const DS=demandOf(g.items,S);
      for(const [spd,perUnit] of Object.entries(b.mods||{})){ const a=CUM[spd]; const cu=d=>d.classes.filter(c=>c.media==='Copper'&&!c.poe&&c.speed==spd).reduce((s,c)=>s+ceil(c.q/b.n)*b.n,0);
        // native copper ports take real devices first; modules only cover devices beyond them, never spare ports
        const native=cu(DS)-perUnit*b.n, actual=D0.classes.filter(c=>c.media==='Copper'&&!c.poe&&c.speed==spd).reduce((s,c)=>s+c.q,0);
        const q=Math.max(0,Math.min(perUnit*b.n,actual-native)); if(a&&q){ add(a.Orderable_SKU,a.Description,q,'Optics',L.name,`For ${spd}G copper devices on fiber ports${a.Reach_m?` (max ${a.Reach_m} m cable)`:''}`); notes.push({lvl:'info',msg:`${L.name}: ${q} × ${spd}G copper device(s) connect to SFP ports using ${a.Orderable_SKU} RJ45 modules (no PoE on these ports).`}); } }
      support(p,b.n,L.name);
      power.push({red:SL(L).psuRed,loc:L.name,model:p.Model_Name,n:b.n,poe:b.poeLoadUnit,cfg:b.psu.label,eps:b.psu.eps,prot:b.psu.prot,budget:b.psu.budget,
        head:b.psu.budget?((b.psu.budget-b.poeLoadUnit)/b.psu.budget):null,est:N(p.Power_Max_NoPoE_W)+b.poeLoadUnit/eff,max:N(p.Power_Max_FullPoE_W)||N(p.Power_Max_NoPoE_W),ru:N(p.Rack_Units),half:/Half/.test(p.Width_Class||'')});
      const units=splitUnits(g.items,b.n,S); if(b.up.u>0&&!standalone){ units.forEach(un=>{ coreDem.total+=un.bw; coreDem.maxSw=Math.max(coreDem.maxSw,un.bw); }); }
      accessNodes.push({loc:L.name,type:L.type,model:p.Model_Name,pid:p.Product_ID,n:b.n,ports:N(p.Total_Ports),units,group:g.label,up:b.up,alts:g.alts.map(a=>({pid:a.p.Product_ID,name:a.p.Model_Name,n:a.n}))});
      for(const it of g.items){ const pid=it.ep.NETGEAR_Product_ID; if(pid&&N(it.qty)){ add(regionSku(cat,pid,S),it.ep.Name,N(it.qty),'Wireless',L.name); support(cat.Products.find(x=>x.Product_ID===pid),N(it.qty),L.name); } }
    }
  }
  let core=null, gwOnCore=false, gateway=null; const mdfName=(locs.find(L=>L.type==='MDF')||{name:'MDF'}).name;
  if(!standalone && units>0 && !errors.length){
    const forcedCore=S.coreOverride&&S.coreOverride!=='Auto'?S.coreOverride:null;
    // collapsed core: one main-room switch with free ports for every closet link is the core itself (no extra switch)
    const collapse=()=>{
      const mr=res.find(r=>r.L.type==='MDF'&&r.groups.length===1&&r.groups[0].best.n===1);
      if(!mr||S.dualCore||forcedCore) return null;
      const others=uplinks.filter(u=>u.L!==mr.L); if(!others.length) return null;
      const g=mr.groups[0], b=g.best, p=b.p;
      if(!timingOk(p,coreDem)||(coreDem.needAVB&&avbNoLag(p)&&coreDem.lagged)) return null;
      const avail={...b.pre}, need={}; others.forEach(u=>need[u.b.up.speed]=(need[u.b.up.speed]||0)+u.b.up.u*u.b.n);
      for(const sp of Object.keys(need).map(Number).sort((a,b)=>b-a)){ let q=need[sp]; for(const t of PT.filter(t=>t.up&&supports(t,sp))){ const k=Math.min(q,avail[t.col]||0); avail[t.col]-=k; q-=k; } if(q>0) return null; }
      if(S.gateway&&S.gwLink==='10g'&&!PT.some(t=>supports(t,10)&&(avail[t.col]||0)>0&&(t.media==='Copper'||t.media==='Fiber'))) return null; // keep a 10G port for the router
      uplinks.splice(0,uplinks.length,...others); coreDem.links=need;
      g.best={...b,up:{speed:0,u:0},free:avail};
      const an=accessNodes.find(a=>a.loc===mr.L.name); an.up={speed:0,u:0}; an.coreLinks=others.reduce((a,u)=>a+u.b.up.u*u.b.n,0); an.isCore=true;
      return {p,k:1,psu:b.psu,isl:0,score:0,collapsed:true,loc:mr.L.name};
    };
    core=collapse();
    if(!core){ core=solveCore(cat,PT,coreDem,S,forcedCore); gwOnCore=!!(core&&core.p);
      // the router can also sit on a room switch, so a core without a spare 10G port still works
      if(S.gateway&&!(core&&core.p)){ const c2=solveCore(cat,PT,{...coreDem,gw:false},S,forcedCore); if(c2&&c2.p){ core=c2; gwOnCore=false; } } }
    if(core&&core.collapsed) notes.push({lvl:'info',msg:`The ${core.p.Model_Name} in ${core.loc} is also the core: the other rooms connect to its free ports, so no separate core switch is needed.`});
    else if(core&&core.fail==='psu'){ errors.push({loc:'Core',msg:`${forcedCore?cat.Products.find(p=>p.Product_ID===forcedCore).Model_Name+' has':'The core switches that fit have'} a single fixed power supply, so ${forcedCore?'it':'they'} cannot be used with redundant power on. Choose a core with a PSU module slot, or turn off redundant power.`}); core=null; }
    else if(core){ const p=core.p, loc=mdfName+' (core)'; score+=core.score;
      add(regionSku(cat,p.Product_ID,S),`${p.Model_Name} core switch`,core.k,'Switches',loc);
      for(const m of core.psu.modules){ const a=psuSku(cat,m.base,S); add(a.Orderable_SKU,a.Description,m.qty*core.k,'Power',loc,'PSU module (redundancy)'); }
      if(core.isl){ const lk=pickLink(cat,core.islSpeed,'DAC',1,true,[p]); add(lk.sku,lk.desc,core.isl*lk.perLink,'Cabling',loc,`Inter-core links (${core.isl} × ${core.islSpeed}G)`);
        notes.push({lvl:'info',msg:`Inter-core link sized for ${ISL_RULES[S.islRule||'half']}, and never below the busiest single switch: needs ${Math.round(core.islReq)} Gbps, provided ${core.isl} × ${core.islSpeed}G = ${core.isl*core.islSpeed} Gbps.`}); if(lk.tbd) notes.push({lvl:'warn',msg:`No ${core.islSpeed}G inter-core cable in the catalog. Placeholder added.`}); }
      support(p,core.k,loc);
      power.push({loc,model:p.Model_Name,n:core.k,poe:0,cfg:core.psu.label,eps:core.psu.eps,prot:core.psu.prot,budget:core.psu.budget,head:null,est:N(p.Power_Max_NoPoE_W),max:N(p.Power_Max_NoPoE_W),ru:N(p.Rack_Units),half:/Half/.test(p.Width_Class||'')});
    } else errors.push({loc:'Core',msg:'No '+(S.family==='Auto'?'':S.family+' ')+'core switch can terminate all uplinks with these settings. Each core needs '+Object.entries(coreDem.links).sort((a,b)=>b[0]-a[0]).map(([s,q])=>`${Math.ceil(q/(S.dualCore?2:1))} × ${s}G`).join(' + ')+' ports plus the core-to-core links.'+(S.family!=='Auto'?' Try Best fit.':'')+(S.family==='M4250'&&S.psuRed?' With redundant power on, the M4250-40G8XF-PoE++ is the only M4250 core option.':'')+((S.oversub||1)<2?' Or try 2:1 oversubscription.':'')+' A network this size may need an aggregation (spine/leaf) layer; contact the Pro AV Design team.'});
  }
  // uplink optics/cables: must suit the room switch and the core it lands on
  const coreLoc=mdfName+' (core)', corePorts=[];
  for(const {L,p,b,ctx} of uplinks){
    const lk=pickLink(cat,b.up.speed,ctx.inRack?'DAC':ctx.media,ctx.dist,ctx.inRack,core&&core.p?[p,core.p]:[p]), q=b.up.u*b.n;
    // optics: one at the room switch, one at the core, each booked where it is installed
    if(lk.perLink===2&&core&&core.p){ add(lk.sku,lk.desc,q,lk.cat,L.name,lk.tbd?'Not in catalog yet':'Room end of uplinks'); add(lk.sku,lk.desc,q,lk.cat,coreLoc,lk.tbd?'Not in catalog yet':'Core end of room uplinks'); }
    else add(lk.sku,lk.desc,q*lk.perLink,lk.cat,L.name,lk.tbd?'Not in catalog yet':(lk.perLink===2?'2 per link (both ends)':'1 per link'));
    if(core&&core.p) corePorts.push({loc:L.name,speed:b.up.speed,perCore:q/(core.k||1),sku:lk.sku,kind:lk.perLink===2?'optic':'cable'});
    if(lk.tbd){ const reach=Math.max(0,...cat.Accessories.filter(a=>a.Category==='Optic'&&N(a.Speed_Gbps)===b.up.speed&&String(a.Media)===ctx.media).map(a=>N(a.Reach_m)));
      notes.push({lvl:'warn',msg:`${L.name}: no ${b.up.speed}G ${ctx.inRack?'cable':'optic'} in the catalog for ${ctx.dist} m`+(core&&core.p?` that fits both the ${p.Model_Name} and the ${core.p.Model_Name}`:'')+'. Placeholder added.'+(!ctx.inRack&&reach?` ${b.up.speed}G ${ctx.media} optics reach ${reach} m; use single-mode fiber (SMF) for this room or a shorter run.`:'')}); }
    links.push({loc:L.name,model:p.Model_Name,n:b.n,speed:b.up.speed,u:b.up.u,optic:lk.sku,dist:ctx.dist,media:ctx.inRack?'in-rack':ctx.media});
  }
  if(S.gateway && units>0){ const gw=cat.Products.find(p=>p.Product_ID===gwId);
    if(gw){ add(regionSku(cat,gwId,S),`${gw.Model_Name}`,1,'Gateway',mdfName); support(gw,1,mdfName);
      if(gwOnCore){ const lk=pickLink(cat,10,'MMF',N(S.mdfPatch)||3,true,[core.p,gw]);
        add(lk.sku,lk.desc,lk.perLink,lk.cat,mdfName,lk.perLink===2?'Gateway to core: optic at both ends, plus an LC patch cord':'Gateway to core');
        gateway={loc:'core',model:core.p.Model_Name,via:lk.perLink===2?'fiber':'cable',sku:lk.sku,speed:10};
        corePorts.push({loc:gw.Model_Name,speed:10,perCore:1,sku:lk.sku,kind:lk.perLink===2?'optic':'cable',first:true});
        if(lk.perLink===2) notes.push({lvl:'info',msg:`${gw.Model_Name} does not take DAC/AOC cables, so it connects to the core with ${lk.sku} optics on both ends and a multimode LC patch cord.`}); }
      else if(units>0&&!errors.length){
        // no 10G port on the core (or standalone): place the router on a room switch, main room first, then the nearest closet.
        // "best" (default): the main room at any speed before a closet; "10g": a 10G port anywhere before a slower one.
        const cuMax=N(T.Copper_10G_Max_m)||100, rooms=[...res].sort((a,b)=>(a.L.type==='MDF'?0:1)-(b.L.type==='MDF'?0:1)||N(a.L.distance)-N(b.L.distance));
        const coreNote=core&&core.p&&!core.collapsed?` The ${core.p.Model_Name} core has no free 10G port.`:'';
        const place=(r,low)=>{ const mdf=r.L.type==='MDF', dist=mdf?(N(S.mdfPatch)||3):N(r.L.distance), media=r.L.media||'MMF';
          for(const g of r.groups){ const b=g.best, f=b.free||{}, sw=b.p;
            const cu=PT.some(t=>t.media==='Copper'&&supports(t,10)&&(f[t.col]||0)>0);
            // a free SFP28 port cannot run 10G next to 25G uplinks in the same 4-port block
            const fib=PT.some(t=>t.media==='Fiber'&&supports(t,10)&&(f[t.col]||0)>0&&!(t.cage==='SFP28'&&b.up.speed===25));
            if(cu&&dist<=cuMax){ gateway={loc:r.L.name,model:sw.Model_Name,via:'copper',dist,speed:10};
              notes.push({lvl:'info',msg:`${gw.Model_Name} connects to a free 10G copper port on the ${sw.Model_Name} in ${r.L.name} with Cat6a (${dist} m, max ${cuMax} m for 10GBASE-T). Use the router's 10G RJ45 port as LAN.`+coreNote}); return true; }
            if(fib){ const lk=pickLink(cat,10,media,dist,false,[sw,gw]);
              if(!lk.tbd){ add(lk.sku,lk.desc,lk.perLink,lk.cat,r.L.name,'Gateway link: optic at both ends');
                gateway={loc:r.L.name,model:sw.Model_Name,via:'fiber',sku:lk.sku,dist,speed:10};
                notes.push({lvl:'info',msg:`${gw.Model_Name} connects to a free 10G fiber port on the ${sw.Model_Name} in ${r.L.name} (${dist} m ${media}) with ${lk.sku} optics on both ends.`+coreNote}); return true; } }
            if(!low) continue;
            // slower: copper first (no parts), then a 1G SFP module on both ends
            const t=dist<=100&&PT.filter(t=>t.media==='Copper'&&(f[t.col]||0)>0).sort((a,b)=>b.max-a.max)[0];
            if(t){ const sp=Math.min(10,t.max); gateway={loc:r.L.name,model:sw.Model_Name,via:'copper',dist,speed:sp};
              notes.push({lvl:sp<2.5?'warn':'info',msg:`${gw.Model_Name} link is ${sp}G: it uses a free ${sp}G copper port on the ${sw.Model_Name} in ${r.L.name} (${dist} m, Cat6 or better), because no 10G port is free there. ${sp>=2.5?'Enough for most internet uplinks (the PR460X 2.5G WAN port runs up to 2.4 Gbps).':'Fine for most internet uplinks.'}${core&&core.collapsed&&S.gwLink!=='10g'?' Set "Router link" to 10G required to reserve a 10G port.':''}`}); return true; }
            if(PT.some(t=>t.media==='Fiber'&&supports(t,1)&&(f[t.col]||0)>0)){ const lk=pickLink(cat,1,media,dist,false,[sw,gw]); if(lk.tbd) continue;
              add(lk.sku,lk.desc,lk.perLink,lk.cat,r.L.name,'Gateway link (1G): module at both ends');
              gateway={loc:r.L.name,model:sw.Model_Name,via:'fiber',sku:lk.sku,dist,speed:1};
              notes.push({lvl:'warn',msg:`${gw.Model_Name} link is only 1G: no free 10G or copper port is left, so it uses ${lk.sku} 1G modules on both ends (free SFP port on the ${sw.Model_Name} in ${r.L.name}, ${dist} m ${media}). Confirm the PR460X SFP+ port accepts a 1G module.`}); return true; }
          } return false; };
        const mdfRooms=rooms.filter(r=>r.L.type==='MDF'), others=rooms.filter(r=>r.L.type!=='MDF');
        const order=S.gwLink==='10g'?[[rooms,false],[rooms,true]]:[[mdfRooms,true],[others,false],[others,true]];
        for(const [list,low] of order){ if(gateway) break; for(const r of list) if(place(r,low)) break; }
        if(!gateway&&!standalone) errors.push({loc:'Gateway',msg:`No free 10G port for the ${gw.Model_Name}: the ${core&&core.p?core.p.Model_Name+' core':'core'} has none, and no room switch has a free 10G copper port within ${cuMax} m or a 10G fiber port with a compatible optic. Contact the Pro AV Design team to place the router.`});
      }
      if(S.taa && !isTAA(gw)) notes.push({lvl:'warn',msg:`${gw.Model_Name} has no TAA-compliant SKU in the catalog.`});
      power.push({loc:mdfName,model:gw.Model_Name,n:1,poe:0,cfg:'Internal PSU',eps:null,prot:null,budget:null,head:null,est:156,max:156,ru:N(gw.Rack_Units)||1,half:false}); } }
  if(coreDem.needBC||locs.some(L=>L.items.some(i=>i.ep.Timing==='PTP-BC'&&N(i.qty)))) notes.push({lvl:'info',msg:'Some devices need a PTP boundary clock (e.g. SMPTE 2059-2 / AES67), so only switches with PTP boundary clock were used for them and for the core.'});
  if(locs.some(L=>L.items.some(i=>i.ep.Timing==='AVB'&&N(i.qty)))) notes.push({lvl:'info',msg:'AVB / Milan devices: only AVB-capable switches were used. M4250 does not run AVB over a LAG, so M4250 switches with AVB devices get one uplink per core.'});
  if(supIncl.size) notes.push({lvl:'info',msg:`Sprint ${supYrs} yr: ${[...supIncl].join(', ')} already include${supIncl.size>1?'':'s'} 3 years of Sprint, so no support SKU is added for ${supIncl.size>1?'them':'it'}.`});
  if(supMiss.size) notes.push({lvl:'warn',msg:`${TIERS[supTier]} is not listed for ${[...supMiss].join(', ')}, so no support SKU was added for ${supMiss.size>1?'them':'it'}. Choose another tier or check availability with NETGEAR.`});
  if(supTier) notes.push({lvl:'info',msg:'Support SKUs follow the NETGEAR pattern (SPR / DRV / FLS - model - months). Confirm each SKU and its price with NETGEAR or your distributor.'});
  if(S.taa) notes.push({lvl:'info',msg:'TAA: only switches with TAA-compliant SKUs were considered. TAA status of PSUs, optics and cables must be confirmed.'});
  if(locs.some(L=>L.items.some(i=>N(i.ep.PoE_W)>30&&N(i.qty)))) notes.push({lvl:'info',msg:'Devices above 30W need Ultra90 PoE++ (802.3bt) ports; only those switches were considered for them.'});
  notes.push({lvl:'info',msg:'Switches interconnect with LAG uplinks and IGMP Plus (no stacking), which keeps AVB and PTP available.'});
  notes.push({lvl:'info',msg:`Uplink LAGs use ${S.dualCore?'1, 2, 4 or 8 links to each core, and each core link group carries the switch\'s full load on its own so one core can fail':'1, 2, 4 or 8 links'} (sizes from Tool_Settings: ${S.lagSizes.join(', ')}), so LAG hashing spreads traffic evenly.`});
  if(S.family!=='Auto') notes.push({lvl:'info',msg:`Only ${S.family} switches were considered, for access and core.`});
  if(S.psuRed&&S.psuScope==='mdf') notes.push({lvl:'info',msg:'Redundant power applies to the main equipment room and core switches only. Closet switches use a single power supply; their PoE is sized to the full budget.'});
  if(S.psuRed) notes.push({lvl:'info',msg:'Redundant power: PoE is sized to the budget that remains if one power supply fails.'});
  for(const pw of power) if(pw.head!==null&&pw.head<0.1&&pw.poe>0) notes.push({lvl:'warn',msg:`${pw.loc}: ${pw.model} PoE headroom is only ${(pw.head*100).toFixed(0)}%.`});
  const totalEps=locs.reduce((s,L)=>s+L.items.reduce((a,i)=>a+N(i.qty),0),0);
  // what plugs into each core: room uplinks, core-to-core links, gateway (first core only)
  if(core&&core.p&&core.isl){ const lk=bom.find(b=>b.loc===coreLoc&&/Inter-core/.test(b.note)); corePorts.push({loc:core.k>1?'Other core':'',speed:core.islSpeed,perCore:core.isl,sku:lk?lk.sku:'',kind:'cable',isl:true}); }
  if(core&&core.p) core.ports=corePorts;
  return {dualCore:!!S.dualCore,bom,links,power,notes,errors,core,accessNodes,standalone,totalEps,settings:T,score,gateway};
}
// catalog validation used before publishing a new catalog
function validate(cat){
  const out=[], err=m=>out.push({lvl:'error',msg:m}), warn=m=>out.push({lvl:'warn',msg:m});
  for(const s of ['Products','SKUs','Accessories','PSU_PoE_Matrix','Port_Types','Endpoints']) if(!cat[s]||!cat[s].length) err(`Sheet ${s} is missing or empty.`);
  if(out.length) return out;
  const ids=new Set(); for(const p of cat.Products){ if(ids.has(p.Product_ID)) err(`Duplicate Product_ID ${p.Product_ID}.`); ids.add(p.Product_ID); }
  const ptc=new Set(cat.Port_Types.map(t=>t.Column_Name));
  const pcols=new Set(cat.Products.flatMap(p=>Object.keys(p)).filter(k=>/^Ports_/.test(k)));
  for(const c of pcols) if(!ptc.has(c)) err(`Products column ${c} has no row in Port_Types, so the tool cannot use it.`);
  for(const s of cat.SKUs) if(!ids.has(s.Product_ID)) warn(`SKU ${s.Orderable_SKU} points to unknown Product_ID ${s.Product_ID}.`);
  for(const r of cat.PSU_PoE_Matrix) if(!ids.has(r.Product_ID)) warn(`PSU_PoE_Matrix row points to unknown Product_ID ${r.Product_ID}.`);
  for(const p of cat.Products.filter(p=>p.Category==='Switch'&&(p.Lifecycle_Status||'Active')==='Active')) if(!cat.SKUs.some(s=>s.Product_ID===p.Product_ID)) warn(`${p.Model_Name} has no orderable SKU.`);
  for(const e of cat.Endpoints) if(!N(e.Link_Speed_Gbps)) warn(`Endpoint ${e.Name} has no link speed.`);
  return out;
}
return {design,demandOf,validate,settings,portTypes};
})();
if(typeof module!=='undefined') module.exports=ENG;
