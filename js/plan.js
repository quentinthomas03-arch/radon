// plan.js — Vue Plan interactif
import * as State from './state.js';
import { MissionDB, PlanDB, PointDB, ZoneDB, BatimentDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

// ── État ──────────────────────────────────────────────────────
let _img = null, _cx = 0, _cy = 0, _scale = 1, _rot = 0;
let _placing = false;   // mode placement actif
let _planIdx  = 0;

// Touch state
let _t1 = null;   // {id, x0, y0, cx0, cy0} premier doigt
let _p0 = null;   // {dist, mx, my, s, cx, cy} état début pinch
let _tap = null;  // {x, y, t} candidat tap

// Cache points pour dessin synchrone
let _pts = [], _ptsMid = null;

// ── HTML ──────────────────────────────────────────────────────
export function renderPlan() {
  return `
    <div class="plan-toolbar" id="plan-toolbar">
      <div class="plan-file-wrap">
        <span class="btn btn-sm btn-secondary" style="pointer-events:none;">📷 Plan</span>
        <input type="file" id="plan-file-input" accept="image/*,application/pdf"
          style="position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);opacity:0;cursor:pointer;">
      </div>
      <button id="btn-rot-l" class="btn btn-sm btn-secondary">↺ −90°</button>
      <button id="btn-rot-r" class="btn btn-sm btn-secondary">↻ +90°</button>
      <button id="btn-place" class="btn btn-sm btn-secondary">📌 Placer capteur</button>
      <button id="btn-zi" class="btn btn-sm btn-secondary">＋</button>
      <button id="btn-zo" class="btn btn-sm btn-secondary">－</button>
      <button id="btn-zf" class="btn btn-sm btn-secondary">⟲</button>
    </div>
    <div id="plan-tabs-bar" class="plan-tabs-bar"></div>
    <div id="plan-status" class="plan-status"></div>
    <div class="plan-canvas-wrap" id="plan-canvas-wrap">
      <canvas id="plan-canvas"></canvas>
      <div class="plan-empty" id="plan-empty">
        <div class="plan-empty-icon">📂</div>
        <p style="font-weight:600;margin:4px 0;">Appuyer ici pour charger un plan</p>
        <p class="text-sm" style="margin:0;">JPG · PNG · PDF</p>
      </div>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────
export function initPlan() {
  _img = null; _cx = 0; _cy = 0; _scale = 1; _rot = 0;
  _placing = false; _planIdx = 0;
  _t1 = null; _p0 = null; _tap = null;
  _pts = []; _ptsMid = null;

  // Bind boutons toolbar — chacun individuellement
  bind('btn-rot-l',  'click', () => { if (_placing) return; _rot -= Math.PI/2; draw(); State.toast('Rotation −90°','info',800); });
  bind('btn-rot-r',  'click', () => { if (_placing) return; _rot += Math.PI/2; draw(); State.toast('Rotation +90°','info',800); });
  bind('btn-place',  'click', () => togglePlace());
  bind('btn-zi',     'click', () => { if (_placing) return; doZoom(1.5);   State.toast(`Zoom ${Math.round(_scale*100)}%`,'info',600); });
  bind('btn-zo',     'click', () => { if (_placing) return; doZoom(1/1.5); State.toast(`Zoom ${Math.round(_scale*100)}%`,'info',600); });
  bind('btn-zf',     'click', () => { if (_placing) return; fitToView(); draw(); State.toast('Vue recadrée','info',800); });

  bind('btn-back-plan', 'click', () => { State.clearMission(); State.navigate('home'); });

  $$('.mission-nav-tab').forEach(t => t.addEventListener('click', () => State.navigate(t.dataset.navView)));

  // Fichier plan
  bind('plan-file-input', 'change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = ''; await loadImage(f);
  });
  bind('plan-empty', 'click', () => $('#plan-file-input')?.click());

  // Canvas
  const canvas = $('#plan-canvas');
  if (canvas) {
    canvas.addEventListener('mousedown',  onMD);
    canvas.addEventListener('mousemove',  onMM);
    canvas.addEventListener('mouseup',    onMU);
    canvas.addEventListener('mouseleave', () => { _t1 = null; });
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      if (!_placing) doZoom(e.deltaY < 0 ? 1.15 : 0.87, e.offsetX, e.offsetY);
    }, { passive: false });
    canvas.addEventListener('touchstart',  onTS, { passive: false });
    canvas.addEventListener('touchmove',   onTM, { passive: false });
    canvas.addEventListener('touchend',    onTE, { passive: false });
    canvas.addEventListener('touchcancel', onTE, { passive: false });
    new ResizeObserver(() => { resizeCanvas(); draw(); }).observe(canvas.parentElement);
  }

  requestAnimationFrame(async () => {
    await buildTabs();
    resizeCanvas();
    await loadFromDB();
  });
}

function bind(id, ev, fn) {
  const el = $(`#${id}`);
  if (el) el.addEventListener(ev, fn);
  else console.warn('[plan] element not found:', id);
}

// ── Mode placement ────────────────────────────────────────────
function togglePlace() {
  _placing = !_placing;
  const btn = $('#btn-place');
  if (btn) {
    btn.textContent = _placing ? '✋ Arrêter placement' : '📌 Placer capteur';
    btn.classList.toggle('active', _placing);
  }
  const canvas = $('#plan-canvas');
  if (canvas) canvas.style.cursor = _placing ? 'crosshair' : 'grab';

  // Désactiver nav quand en mode placement
  ['btn-rot-l','btn-rot-r','btn-zi','btn-zo','btn-zf'].forEach(id => {
    const el = $(`#${id}`); if (el) el.disabled = _placing;
  });

  State.toast(
    _placing ? '📌 Mode placement actif — tapez sur le plan' : '🔓 Navigation — glissez pour déplacer',
    'info', 2500
  );
  draw();
}

// ── Zoom ──────────────────────────────────────────────────────
function doZoom(f, px, py) {
  const canvas = $('#plan-canvas'); if (!canvas) return;
  const ppx = px ?? canvas.clientWidth/2, ppy = py ?? canvas.clientHeight/2;
  const ns = Math.max(0.05, Math.min(20, _scale * f));
  const r = ns / _scale;
  _cx = ppx + (_cx - ppx) * r; _cy = ppy + (_cy - ppy) * r; _scale = ns;
  draw();
}

// ── Transforms ────────────────────────────────────────────────
function i2c(ix, iy) {
  if (!_img) return {x:0,y:0};
  const dx = ix - _img.naturalWidth/2, dy = iy - _img.naturalHeight/2;
  const c = Math.cos(_rot), s = Math.sin(_rot);
  return { x: _cx + (dx*c - dy*s)*_scale, y: _cy + (dx*s + dy*c)*_scale };
}
function c2i(cx, cy) {
  if (!_img) return {x:0,y:0};
  const dx = (cx-_cx)/_scale, dy = (cy-_cy)/_scale;
  const c = Math.cos(-_rot), s = Math.sin(-_rot);
  return { x: dx*c - dy*s + _img.naturalWidth/2, y: dx*s + dy*c + _img.naturalHeight/2 };
}

// ── Canvas ────────────────────────────────────────────────────
function resizeCanvas() {
  const c = $('#plan-canvas'), w = $('#plan-canvas-wrap'); if (!c||!w) return;
  const r = w.getBoundingClientRect(); if (!r.width||!r.height) return;
  c.width  = r.width  * devicePixelRatio; c.height = r.height * devicePixelRatio;
  c.style.width = r.width+'px'; c.style.height = r.height+'px';
}
function fitToView() {
  const c = $('#plan-canvas'); if (!c||!_img) return;
  const cw = c.clientWidth, ch = c.clientHeight; if (!cw||!ch) return;
  const iw = _img.naturalWidth, ih = _img.naturalHeight;
  const rn = ((_rot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
  const sw = (rn>Math.PI/4&&rn<3*Math.PI/4)||(rn>5*Math.PI/4&&rn<7*Math.PI/4);
  _scale = Math.min(cw/(sw?ih:iw), ch/(sw?iw:ih))*0.92;
  _cx = cw/2; _cy = ch/2;
}

function draw() {
  const c = $('#plan-canvas'); if (!c) return;
  const ctx = c.getContext('2d'), dpr = devicePixelRatio;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,c.width,c.height);
  if (_img) {
    ctx.save();
    ctx.translate(_cx,_cy); ctx.rotate(_rot); ctx.scale(_scale,_scale);
    ctx.drawImage(_img,-_img.naturalWidth/2,-_img.naturalHeight/2);
    ctx.restore();
    if (_placing) {
      ctx.strokeStyle='#f39c12'; ctx.lineWidth=3; ctx.setLineDash([10,6]);
      ctx.strokeRect(2,2,c.clientWidth-4,c.clientHeight-4); ctx.setLineDash([]);
    }
  }
  drawSensors(ctx);
  updateStatus();
}

function drawSensors(ctx) {
  const isCT = State.getConfig()?.type==='CT';
  for (const pt of _pts) {
    if (!pt.planPosition||(pt.planPosition.planIdx??0)!==_planIdx) continue;
    const {x:px,y:py} = i2c(pt.planPosition.x, pt.planPosition.y);
    const val = parseFloat(pt.resultats?.[isCT?'activite_bqm3':'concentration']||'');
    const color = isNaN(val)?'#4a9eff':val<300?'#27ae60':val<1000?'#f39c12':'#e74c3c';
    ctx.beginPath(); ctx.arc(px+2,py+2,15,0,2*Math.PI); ctx.fillStyle='rgba(0,0,0,.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px,py,15,0,2*Math.PI); ctx.fillStyle=color; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; ctx.stroke();
    const num = pt.data?.num_detecteur||pt.data?.num_dosimetrie||String(pt.order+1);
    ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(String(num).slice(0,5),px,py);
    const lieu = pt.data?.lieu_pose||pt.data?.nom_piece||'';
    if (lieu) {
      ctx.font='10px sans-serif'; const tw=ctx.measureText(lieu).width+8;
      ctx.fillStyle='rgba(0,0,0,.75)';
      if(ctx.roundRect)ctx.roundRect(px-tw/2,py+18,tw,16,3);else ctx.rect(px-tw/2,py+18,tw,16);
      ctx.fill(); ctx.fillStyle='#fff'; ctx.fillText(lieu,px,py+26);
    }
  }
}

function updateStatus() {
  const bar=$('#plan-status'); if(!bar||!_img){if(bar)bar.innerHTML='';return;}
  const n = _pts.filter(p=>p.planPosition&&(p.planPosition.planIdx??0)===_planIdx).length;
  bar.innerHTML = _placing
    ? `<span class="status-placing">📌 Mode placement · ${n} capteur(s) · Tapez pour en ajouter</span>`
    : `<span class="status-nav">🔓 Navigation · ${n} capteur(s) placé(s)</span>`;
}

// ── Souris ────────────────────────────────────────────────────
let _md = null;
function onMD(e) {
  if (_placing) return;
  _md = { cx:_cx, cy:_cy, x:e.offsetX, y:e.offsetY };
  e.currentTarget.style.cursor='grabbing';
}
function onMM(e) {
  if (!_md) return;
  _cx = _md.cx + e.offsetX-_md.x; _cy = _md.cy + e.offsetY-_md.y; draw();
}
async function onMU(e) {
  if (_md && Math.hypot(e.offsetX-_md.x,e.offsetY-_md.y)<5) await tap(e.offsetX,e.offsetY);
  _md=null; e.currentTarget.style.cursor=_placing?'crosshair':'grab';
}

// ── Touch ─────────────────────────────────────────────────────
function tp(t,c){const r=c.getBoundingClientRect();return{x:t.clientX-r.left,y:t.clientY-r.top};}

function onTS(e){
  e.preventDefault(); const c=e.currentTarget;
  if(e.touches.length===1){
    const p=tp(e.touches[0],c);
    _t1={x0:p.x,y0:p.y,cx0:_cx,cy0:_cy}; _p0=null; _tap={x:p.x,y:p.y,t:Date.now()};
  }else if(e.touches.length===2){
    _tap=null;
    if(!_placing){
      const a=tp(e.touches[0],c),b=tp(e.touches[1],c);
      _p0={dist:Math.hypot(b.x-a.x,b.y-a.y),mx:(a.x+b.x)/2,my:(a.y+b.y)/2,s:_scale,cx:_cx,cy:_cy};
    }
  }
}
function onTM(e){
  e.preventDefault(); const c=e.currentTarget;
  if(e.touches.length===2&&_p0&&!_placing){
    const a=tp(e.touches[0],c),b=tp(e.touches[1],c);
    const dist=Math.hypot(b.x-a.x,b.y-a.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
    const ns=Math.max(0.05,Math.min(20,_p0.s*(dist/_p0.dist))),sr=ns/_p0.s;
    _scale=ns; _cx=mx+(_p0.cx-_p0.mx)*sr; _cy=my+(_p0.cy-_p0.my)*sr; draw();
  }else if(e.touches.length===1&&_t1&&!_placing){
    const p=tp(e.touches[0],c);
    const dx=p.x-_t1.x0,dy=p.y-_t1.y0;
    if(_tap&&Math.hypot(dx,dy)>8)_tap=null;
    _cx=_t1.cx0+dx; _cy=_t1.cy0+dy; draw();
  }
}
async function onTE(e){
  e.preventDefault();
  if(e.touches.length===0){
    if(_tap&&Date.now()-_tap.t<350) await tap(_tap.x,_tap.y);
    _t1=null;_p0=null;_tap=null;
  }else if(e.touches.length===1){
    _p0=null;_tap=null;
    const p=tp(e.touches[0],e.currentTarget);
    _t1={x0:p.x,y0:p.y,cx0:_cx,cy0:_cy};
  }
}

// ── Tap ───────────────────────────────────────────────────────
async function tap(cx,cy){
  // Chercher un capteur existant
  const hit = await findPt(cx,cy);
  if(hit){openModal(hit);return;}
  // Placer si mode actif
  if(_placing&&_img){
    const ip=c2i(cx,cy); await placePt(ip.x,ip.y);
  }
}

async function findPt(cx,cy){
  await loadPts();
  for(const pt of _pts){
    if(!pt.planPosition||(pt.planPosition.planIdx??0)!==_planIdx) continue;
    const p=i2c(pt.planPosition.x,pt.planPosition.y);
    if(Math.hypot(cx-p.x,cy-p.y)<24)return pt;
  }
  return null;
}

async function placePt(ix,iy){
  const mid=State.get('currentMissionId');if(!mid)return;
  let bats=await BatimentDB.getByMission(mid);
  if(!bats.length)bats=[await BatimentDB.create(mid,{data:{nom:'Bâtiment 1'}})];
  let zones=await ZoneDB.getByBatiment(bats[0].id);
  if(!zones.length){const isCT=State.getConfig()?.type==='CT';zones=[await ZoneDB.create(bats[0].id,mid,{data:isCT?{nom:'1'}:{numero:'1'}})];}
  const today=new Date().toISOString().slice(0,10);
  const pt=await PointDB.create(zones[zones.length-1].id,bats[0].id,mid,{
    planPosition:{x:ix,y:iy,planIdx:_planIdx},data:{date_pose:today}
  });
  _ptsMid=null; await loadPts(); draw(); openModal(pt);
}

async function loadPts(){
  const mid=State.get('currentMissionId');if(!mid){_pts=[];return;}
  if(mid===_ptsMid)return;
  _pts=await PointDB.getByMission(mid); _ptsMid=mid;
}

// ── Onglets ───────────────────────────────────────────────────
async function buildTabs(){
  const bar=$('#plan-tabs-bar');if(!bar)return;
  const mid=State.get('currentMissionId');if(!mid){bar.innerHTML='';return;}
  const m=await MissionDB.getById(mid);
  const n=Math.max(1,parseInt(m?.entree?.nb_plans||'1',10));
  if(n<=1){bar.innerHTML='';return;}
  bar.innerHTML=`<div class="plan-tabs">${Array.from({length:n},(_,i)=>`<button class="plan-tab${i===_planIdx?' active':''}" data-i="${i}">Plan ${i+1}</button>`).join('')}</div>`;
  $$('.plan-tab',bar).forEach(btn=>btn.addEventListener('click',async()=>{
    _planIdx=+btn.dataset.i;_img=null;_ptsMid=null;buildTabs();await loadFromDB();
  }));
}

// ── Modal capteur ─────────────────────────────────────────────
async function openModal(point){
  const cfg=State.getConfig();if(!cfg)return;
  const isCT=cfg.type==='CT';
  const zone=await ZoneDB.getById(point.zoneId);
  const bat=await BatimentDB.getById(point.batimentId);
  const allBats=await BatimentDB.getByMission(State.get('currentMissionId'));
  const allZones=await ZoneDB.getByBatiment(point.batimentId);
  const zk=isCT?'zcs':'zone_homogene';
  const zF=(cfg.tableau[zk]?.fields||[]).filter(f=>!['nom','numero'].includes(f.id));
  const tF=cfg.tableau.point.fields.filter(f=>f.phase==='terrain');
  const num=point.data?.num_detecteur||point.data?.num_dosimetrie||`#${point.order+1}`;
  const batOpts=allBats.map(b=>`<option value="${b.id}"${b.id===bat?.id?' selected':''}>${b.data?.nom||'Bât.'}</option>`).join('');
  const zoneOpts=allZones.map(z=>`<option value="${z.id}"${z.id===zone?.id?' selected':''}>${isCT?'ZCS ':'Zone '}${z.data?.nom||z.data?.numero||''}${z.data?.niveau?' — '+z.data.niveau:''}</option>`).join('');

  const el=document.createElement('div');el.className='modal-overlay';el.id='point-modal';
  el.innerHTML=`<div class="modal-content plan-modal">
    <div class="plan-modal-header">
      <span class="plan-modal-badge">${isCT?'CT':'CSP'}</span>
      <h3 style="flex:1;font-size:1rem;margin:0;">📍 Capteur ${num}</h3>
      <button class="btn-icon" id="m-x">✕</button>
    </div>
    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;">
      <details class="plan-modal-section" open>
        <summary class="plan-modal-section-title">${isCT?'Zone (ZCS)':'Zone Homogène'}</summary>
        <div class="plan-modal-section-body">
          <div class="form-row-2">
            <div class="form-group"><label class="form-label">Bâtiment</label><select id="m-bat" class="form-input form-input-sm">${batOpts}</select></div>
            <div class="form-group"><label class="form-label">${isCT?'ZCS':'Zone'}</label><select id="m-zone" class="form-input form-input-sm">${zoneOpts}</select></div>
          </div>
          ${zF.map(f=>fld(f,zone?.data?.[f.id]??'','z-')).join('')}
        </div>
      </details>
      <details class="plan-modal-section" open>
        <summary class="plan-modal-section-title">Dosimètre / Détecteur</summary>
        <div class="plan-modal-section-body">${tF.map(f=>fld(f,point.data?.[f.id]??'','p-')).join('')}</div>
      </details>
    </div>
    <div class="plan-modal-actions">
      <button class="btn btn-danger btn-sm" id="m-del">🗑</button>
      <button class="btn btn-secondary btn-sm" id="m-no">Annuler</button>
      <button class="btn btn-primary btn-sm" id="m-ok">💾 Enregistrer</button>
    </div>
  </div>`;
  document.body.appendChild(el);
  el.addEventListener('click',e=>{if(e.target===el)closeM();});
  $('#m-x',el).addEventListener('click',closeM);
  $('#m-no',el).addEventListener('click',closeM);
  $('#m-del',el).addEventListener('click',async()=>{
    if(!confirm('Supprimer ?'))return;
    await PointDB.delete(point.id);_ptsMid=null;await loadPts();closeM();draw();State.toast('Capteur supprimé','info');
  });
  $('#m-ok',el).addEventListener('click',async()=>{
    const zid=$('#m-zone',el)?.value||zone?.id,bid=$('#m-bat',el)?.value||bat?.id;
    const zd={};zF.forEach(f=>{const i=$(`[name="z-${f.id}"]`,el);if(i)zd[f.id]=i.value;});
    if(zid)await ZoneDB.update(zid,{data:zd});
    const pd={};tF.forEach(f=>{const i=$(`[name="p-${f.id}"]`,el);if(i)pd[f.id]=i.value;});
    const mv=zid!==point.zoneId||bid!==point.batimentId;
    await PointDB.update(point.id,{...(mv?{zoneId:zid,batimentId:bid}:{}),data:pd});
    _ptsMid=null;await loadPts();closeM();draw();State.toast('Capteur enregistré ✓','success',1500);
  });
}
function fld(f,val,pfx){
  const nm=pfx+f.id;let inp;
  if(f.options?.length||f.type==='select'){inp=`<select name="${nm}" class="form-input form-input-sm"><option value="">—</option>${(f.options||[]).map(o=>`<option value="${o}"${String(val)===String(o)?' selected':''}>${o}</option>`).join('')}</select>`;}
  else if(f.type==='date'){inp=`<input type="date" name="${nm}" class="form-input form-input-sm" value="${val}">`;}
  else if(f.type==='number'){inp=`<input type="number" name="${nm}" class="form-input form-input-sm" inputmode="decimal" step="any" value="${val}">`;}
  else{inp=`<input type="text" name="${nm}" class="form-input form-input-sm" value="${val}">`;}
  return `<div class="form-group${f.required?' required':''}"><label class="form-label">${f.label}${f.required?' *':''}</label>${inp}</div>`;
}
function closeM(){$('#point-modal')?.remove();}

// ── Chargement ────────────────────────────────────────────────
async function loadImage(file){
  const tid=State.toast('Chargement…','info',15000);
  try{
    const url=file.type==='application/pdf'?await pdfUrl(file):await imgUrl(file);
    const im=new Image();
    await new Promise((res,rej)=>{im.onload=res;im.onerror=rej;im.src=url;});
    _img=im;_rot=0;$('#plan-empty')?.classList.add('hidden');resizeCanvas();
    const mid=State.get('currentMissionId');
    if(mid){const all=await PlanDB.getByMission(mid);const ex=all.find(p=>(p.planIndex??0)===_planIdx);
      const d={imageData:url,width:im.naturalWidth,height:im.naturalHeight,name:file.name,planIndex:_planIdx};
      if(ex)await PlanDB.update(ex.id,d);else await PlanDB.create(mid,d);}
    fitToView();await loadPts();draw();State.dismissToast(tid);State.toast('Plan chargé ✓','success',2000);
  }catch(err){State.dismissToast(tid);State.toast('Erreur : '+err.message,'error',4000);console.error(err);}
}

async function loadFromDB(){
  const mid=State.get('currentMissionId');if(!mid)return;
  const all=await PlanDB.getByMission(mid);
  const plan=all.find(p=>(p.planIndex??0)===_planIdx);
  await loadPts();
  if(!plan?.imageData){draw();return;}
  const im=new Image();
  im.onload=()=>{_img=im;$('#plan-empty')?.classList.add('hidden');resizeCanvas();fitToView();draw();};
  im.src=plan.imageData;
}
function imgUrl(f){return new Promise((res,rej)=>{const r=new FileReader();r.onload=e=>res(e.target.result);r.onerror=()=>rej(new Error('Lecture impossible'));r.readAsDataURL(f);});}
async function pdfUrl(file){
  if(!window.pdfjsLib){await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=res;s.onerror=rej;document.head.appendChild(s);});window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';}
  const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const pg=await pdf.getPage(1),vp=pg.getViewport({scale:2});
  const cv=document.createElement('canvas');cv.width=vp.width;cv.height=vp.height;
  await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
  return cv.toDataURL('image/png');
}
