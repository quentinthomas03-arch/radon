// ============================================================
// plan.js — Vue Plan interactif
// Multi-plans · Rotation · Zoom · Verrou · Capteurs
// ============================================================

import * as State from './state.js';
import { MissionDB, PlanDB, PointDB, ZoneDB, BatimentDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

// ── État du module ───────────────────────────────────────────
let _img          = null;
let _tr           = { cx: 0, cy: 0, scale: 1, rot: 0 };
let _locked       = false;
let _planIdx      = 0;

// Pointeurs actifs (Pointer Events API)
const _ptrs       = new Map();   // pointerId → {x,y} en coords canvas CSS
let _dragBase     = null;        // {startCx, startCy, startX, startY}
let _pinchBase    = null;        // {dist, midX, midY, startScale, startCx, startCy}
let _tapCand      = null;        // {x, y, time}

// ── HTML ─────────────────────────────────────────────────────

export function renderPlan() {
  return `
    <div class="plan-toolbar">
      <div class="plan-file-wrap">
        <button class="btn btn-sm btn-secondary" style="pointer-events:none;">📷 Plan</button>
        <input type="file" id="plan-file-input" accept="image/*,application/pdf"
          style="position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);opacity:0;cursor:pointer;z-index:10;">
      </div>
      <button class="btn btn-sm btn-secondary" id="btn-rot-l">↺</button>
      <button class="btn btn-sm btn-secondary" id="btn-rot-r">↻</button>
      <button class="btn btn-sm btn-secondary" id="btn-lock">🔓 Verrouiller</button>
      <div class="plan-zoom">
        <button class="btn-icon" id="btn-zi">＋</button>
        <button class="btn-icon" id="btn-zr">⟲</button>
        <button class="btn-icon" id="btn-zo">－</button>
      </div>
    </div>
    <div class="plan-tabs-bar" id="plan-tabs-bar"></div>
    <div class="plan-status"   id="plan-status"></div>
    <div class="plan-canvas-wrap" id="plan-canvas-wrap">
      <canvas id="plan-canvas"></canvas>
      <div class="plan-empty" id="plan-empty">
        <div class="plan-empty-icon">📂</div>
        <p style="font-weight:600;margin:0 0 4px;">Appuyer pour charger un plan</p>
        <p class="text-sm" style="margin:0;">Image JPG / PNG · PDF</p>
      </div>
    </div>`;
}

// ── Init ─────────────────────────────────────────────────────

export function initPlan() {
  _img = null; _tr = { cx:0, cy:0, scale:1, rot:0 };
  _locked = false; _planIdx = 0;
  _ptrs.clear(); _dragBase = _pinchBase = _tapCand = null;

  setTimeout(() => {
    buildTabs();
    resizeCanvas();
    bindEvents();
    loadFromDB();
  }, 60);
}

// ── Onglets multi-plans ───────────────────────────────────────

async function buildTabs() {
  const bar = $('#plan-tabs-bar'); if (!bar) return;
  const mid = State.get('currentMissionId'); if (!mid) { bar.innerHTML=''; return; }
  const m   = await MissionDB.getById(mid);
  const n   = Math.max(1, parseInt(m?.entree?.nb_plans||'1', 10));
  if (n <= 1) { bar.innerHTML = ''; return; }

  bar.innerHTML = `<div class="plan-tabs">${
    Array.from({length:n},(_,i)=>
      `<button class="plan-tab${i===_planIdx?' active':''}" data-i="${i}">Plan ${i+1}</button>`
    ).join('')
  }</div>`;

  $$('.plan-tab', bar).forEach(btn => btn.addEventListener('click', () => {
    _planIdx = +btn.dataset.i;
    _img = null;
    buildTabs();
    loadFromDB();
  }));
}

// ── Binding ──────────────────────────────────────────────────

function bindEvents() {
  const canvas = $('#plan-canvas'), wrap = $('#plan-canvas-wrap');
  if (!canvas || !wrap) return;

  $('#btn-back-plan')?.addEventListener('click', () => { State.clearMission(); State.navigate('home'); });
  $$('.mission-nav-tab').forEach(t => t.addEventListener('click', () => State.navigate(t.dataset.navView)));

  // Fichier
  $('#plan-file-input')?.addEventListener('change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = ''; await loadImage(f);
  });
  $('#plan-empty')?.addEventListener('click', () => $('#plan-file-input')?.click());

  // Rotation
  $('#btn-rot-l')?.addEventListener('click', () => { if (!_locked) { _tr.rot -= Math.PI/2; redraw(); } });
  $('#btn-rot-r')?.addEventListener('click', () => { if (!_locked) { _tr.rot += Math.PI/2; redraw(); } });

  // Verrou
  $('#btn-lock')?.addEventListener('click', () => toggleLock());

  // Zoom boutons
  $('#btn-zi')?.addEventListener('click', () => { if (!_locked) zoom(1.3); });
  $('#btn-zo')?.addEventListener('click', () => { if (!_locked) zoom(1/1.3); });
  $('#btn-zr')?.addEventListener('click', () => { if (!_locked) { fitToView(); redraw(); } });

  // Pointer Events (souris + touch unifiés — la clé)
  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown',   onDown);
  canvas.addEventListener('pointermove',   onMove);
  canvas.addEventListener('pointerup',     onUp);
  canvas.addEventListener('pointercancel', onUp);

  // Molette
  canvas.addEventListener('wheel', e => {
    e.preventDefault();
    if (!_locked) zoom(e.deltaY < 0 ? 1.12 : 0.89, cpos(e));
  }, { passive: false });

  new ResizeObserver(() => { resizeCanvas(); redraw(); }).observe(wrap);
}

// ── Verrou ───────────────────────────────────────────────────

function toggleLock() {
  _locked = !_locked;
  const btn = $('#btn-lock');
  if (btn) { btn.textContent = _locked ? '🔒 Verrouillé' : '🔓 Verrouiller'; btn.classList.toggle('active', _locked); }
  const c = $('#plan-canvas'); if (c) c.style.cursor = _locked ? 'crosshair' : 'grab';
  ['btn-rot-l','btn-rot-r','btn-zi','btn-zo','btn-zr'].forEach(id => {
    const el = $(`#${id}`); if (el) el.disabled = _locked;
  });
  redraw();
}

// ── Transforms ───────────────────────────────────────────────

function i2c(ix, iy) {         // image → canvas (px CSS)
  if (!_img) return {x:0,y:0};
  const dx = ix - _img.naturalWidth/2, dy = iy - _img.naturalHeight/2;
  const c = Math.cos(_tr.rot), s = Math.sin(_tr.rot);
  return { x: _tr.cx + (dx*c - dy*s)*_tr.scale, y: _tr.cy + (dx*s + dy*c)*_tr.scale };
}

function c2i(cx, cy) {         // canvas → image
  if (!_img) return {x:0,y:0};
  const dx = (cx-_tr.cx)/_tr.scale, dy = (cy-_tr.cy)/_tr.scale;
  const c = Math.cos(-_tr.rot), s = Math.sin(-_tr.rot);
  return { x: dx*c - dy*s + _img.naturalWidth/2, y: dx*s + dy*c + _img.naturalHeight/2 };
}

function cpos(e) {             // event → canvas coords
  const r = $('#plan-canvas').getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}

function zoom(f, pivot) {
  const c = $('#plan-canvas');
  const px = pivot?.x ?? (c ? c.width/devicePixelRatio/2 : 0);
  const py = pivot?.y ?? (c ? c.height/devicePixelRatio/2 : 0);
  const ns = Math.max(0.05, Math.min(20, _tr.scale * f));
  const r  = ns / _tr.scale;
  _tr.cx = px + (_tr.cx - px) * r;
  _tr.cy = py + (_tr.cy - py) * r;
  _tr.scale = ns;
  redraw();
}

// ── Canvas ───────────────────────────────────────────────────

function resizeCanvas() {
  const c = $('#plan-canvas'), w = $('#plan-canvas-wrap'); if (!c||!w) return;
  const r = w.getBoundingClientRect();
  c.width  = r.width  * devicePixelRatio; c.height = r.height * devicePixelRatio;
  c.style.width = r.width+'px'; c.style.height = r.height+'px';
}

function fitToView() {
  const c = $('#plan-canvas'); if (!c || !_img) return;
  const cw = c.width/devicePixelRatio, ch = c.height/devicePixelRatio;
  const iw = _img.naturalWidth, ih = _img.naturalHeight;
  const rn = ((_tr.rot%(2*Math.PI))+2*Math.PI)%(2*Math.PI);
  const sw = (rn>Math.PI/4&&rn<3*Math.PI/4)||(rn>5*Math.PI/4&&rn<7*Math.PI/4);
  _tr.scale = Math.min(cw/(sw?ih:iw), ch/(sw?iw:ih)) * 0.92;
  _tr.cx = cw/2; _tr.cy = ch/2;
}

// ── Dessin ───────────────────────────────────────────────────

async function redraw() {
  const c = $('#plan-canvas'); if (!c) return;
  const ctx = c.getContext('2d'), dpr = devicePixelRatio;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,c.width,c.height);

  if (_img) {
    ctx.save();
    ctx.translate(_tr.cx, _tr.cy);
    ctx.rotate(_tr.rot);
    ctx.scale(_tr.scale, _tr.scale);
    ctx.drawImage(_img, -_img.naturalWidth/2, -_img.naturalHeight/2);
    ctx.restore();

    if (_locked) {
      const cw = c.width/dpr, ch = c.height/dpr;
      ctx.strokeStyle = 'rgba(212,165,32,.7)'; ctx.lineWidth = 3;
      ctx.setLineDash([10,5]); ctx.strokeRect(2,2,cw-4,ch-4); ctx.setLineDash([]);
    }
  }

  await drawSensors(ctx);
  await updateStatus();
}

async function drawSensors(ctx) {
  const mid = State.get('currentMissionId'); if (!mid) return;
  const pts = await PointDB.getByMission(mid);
  const isCT = State.getConfig()?.type === 'CT';

  for (const pt of pts) {
    if (!pt.planPosition) continue;
    if ((pt.planPosition.planIdx??0) !== _planIdx) continue;
    const {x:px, y:py} = i2c(pt.planPosition.x, pt.planPosition.y);
    const val   = parseFloat(pt.resultats?.[isCT?'activite_bqm3':'concentration']||'');
    const color = isNaN(val)?'#4a9eff':val<300?'#27ae60':val<1000?'#f39c12':'#e74c3c';

    ctx.beginPath(); ctx.arc(px+2,py+2,15,0,2*Math.PI); ctx.fillStyle='rgba(0,0,0,.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(px,py,15,0,2*Math.PI); ctx.fillStyle=color; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=2.5; ctx.stroke();

    const num = pt.data?.num_detecteur||pt.data?.num_dosimetrie||String(pt.order+1);
    ctx.fillStyle='#fff'; ctx.font='bold 11px sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(String(num).slice(0,5), px, py);

    const lieu = pt.data?.lieu_pose||pt.data?.nom_piece||'';
    if (lieu) {
      ctx.font='10px sans-serif';
      const tw = ctx.measureText(lieu).width+8;
      ctx.fillStyle='rgba(0,0,0,.75)';
      if (ctx.roundRect) ctx.roundRect(px-tw/2,py+18,tw,16,3); else ctx.rect(px-tw/2,py+18,tw,16);
      ctx.fill(); ctx.fillStyle='#fff'; ctx.fillText(lieu,px,py+26);
    }
  }
}

async function updateStatus() {
  const bar = $('#plan-status'); if (!bar||!_img) { if(bar) bar.innerHTML=''; return; }
  const mid = State.get('currentMissionId');
  const pts = mid ? await PointDB.getByMission(mid) : [];
  const n = pts.filter(p => p.planPosition && (p.planPosition.planIdx??0)===_planIdx).length;
  bar.innerHTML = _locked
    ? `<span class="status-locked">🔒 Verrouillé · ${n} capteur(s) · Tapez pour placer</span>`
    : `<span class="status-nav">🔓 Navigation · ${n} capteur(s) · Verrouillez pour placer</span>`;
}

// ── Pointer Events ────────────────────────────────────────────

function onDown(e) {
  e.preventDefault();
  e.currentTarget.setPointerCapture(e.pointerId);
  const pos = cpos(e);
  _ptrs.set(e.pointerId, pos);

  if (_ptrs.size === 1) {
    _tapCand  = { x: pos.x, y: pos.y, time: Date.now() };
    _dragBase = { startCx: _tr.cx, startCy: _tr.cy, startX: pos.x, startY: pos.y };
    _pinchBase = null;
  } else if (_ptrs.size === 2 && !_locked) {
    _tapCand = null; _dragBase = null;
    const [p0, p1] = [..._ptrs.values()];
    _pinchBase = {
      dist: Math.hypot(p1.x-p0.x, p1.y-p0.y),
      midX: (p0.x+p1.x)/2, midY: (p0.y+p1.y)/2,
      startScale: _tr.scale, startCx: _tr.cx, startCy: _tr.cy,
    };
  }
}

function onMove(e) {
  e.preventDefault();
  if (!_ptrs.has(e.pointerId)) return;
  const pos = cpos(e);
  _ptrs.set(e.pointerId, pos);

  if (_ptrs.size === 2 && _pinchBase && !_locked) {
    const [p0,p1] = [..._ptrs.values()];
    const dist = Math.hypot(p1.x-p0.x, p1.y-p0.y);
    const midX = (p0.x+p1.x)/2, midY = (p0.y+p1.y)/2;
    const ratio = dist/_pinchBase.dist;
    const ns = Math.max(0.05, Math.min(20, _pinchBase.startScale*ratio));
    const sr = ns/_pinchBase.startScale;
    _tr.scale = ns;
    _tr.cx = midX + (_pinchBase.startCx - _pinchBase.midX)*sr;
    _tr.cy = midY + (_pinchBase.startCy - _pinchBase.midY)*sr;
    redraw();
  } else if (_ptrs.size === 1 && _dragBase && !_locked) {
    const dx = pos.x - _dragBase.startX, dy = pos.y - _dragBase.startY;
    if (_tapCand && Math.hypot(dx,dy) > 8) _tapCand = null;
    _tr.cx = _dragBase.startCx + dx;
    _tr.cy = _dragBase.startCy + dy;
    redraw();
  } else if (_tapCand) {
    if (Math.hypot(pos.x-_tapCand.x, pos.y-_tapCand.y) > 8) _tapCand = null;
  }
}

async function onUp(e) {
  e.preventDefault();
  _ptrs.delete(e.pointerId);

  if (_ptrs.size === 0) {
    if (_tapCand && Date.now()-_tapCand.time < 400) {
      await tap(_tapCand.x, _tapCand.y);
    }
    _tapCand = _dragBase = _pinchBase = null;
  } else if (_ptrs.size === 1) {
    _pinchBase = _tapCand = null;
    const rem = [..._ptrs.values()][0];
    _dragBase = { startCx: _tr.cx, startCy: _tr.cy, startX: rem.x, startY: rem.y };
  }
}

// ── Tap ───────────────────────────────────────────────────────

async function tap(cx, cy) {
  const hit = await findPoint(cx, cy);
  if (hit) { openModal(hit); return; }
  if (_locked && _img) {
    const ip = c2i(cx, cy);
    await placePoint(ip.x, ip.y);
  }
}

async function findPoint(cx, cy) {
  const mid = State.get('currentMissionId'); if (!mid) return null;
  const pts = await PointDB.getByMission(mid);
  for (const pt of pts) {
    if (!pt.planPosition || (pt.planPosition.planIdx??0)!==_planIdx) continue;
    const p = i2c(pt.planPosition.x, pt.planPosition.y);
    if (Math.hypot(cx-p.x, cy-p.y) < 24) return pt;
  }
  return null;
}

async function placePoint(ix, iy) {
  const mid = State.get('currentMissionId'); if (!mid) return;
  let bats = await BatimentDB.getByMission(mid);
  if (!bats.length) bats = [await BatimentDB.create(mid, { data:{nom:'Bâtiment 1'} })];
  let zones = await ZoneDB.getByBatiment(bats[0].id);
  if (!zones.length) {
    const isCT = State.getConfig()?.type==='CT';
    zones = [await ZoneDB.create(bats[0].id, mid, { data: isCT?{nom:'1'}:{numero:'1'} })];
  }
  const today = new Date().toISOString().slice(0,10);
  const pt = await PointDB.create(zones[zones.length-1].id, bats[0].id, mid, {
    planPosition: { x:ix, y:iy, planIdx:_planIdx },
    data: { date_pose: today },
  });
  await redraw();
  openModal(pt);
}

// ── Modal fiche capteur ───────────────────────────────────────

async function openModal(point) {
  const cfg = State.getConfig(); if (!cfg) return;
  const isCT = cfg.type==='CT';
  const zone     = await ZoneDB.getById(point.zoneId);
  const bat      = await BatimentDB.getById(point.batimentId);
  const allBats  = await BatimentDB.getByMission(State.get('currentMissionId'));
  const allZones = await ZoneDB.getByBatiment(point.batimentId);
  const zk       = isCT?'zcs':'zone_homogene';
  const zFields  = (cfg.tableau[zk]?.fields||[]).filter(f=>!['nom','numero'].includes(f.id));
  const tFields  = cfg.tableau.point.fields.filter(f=>f.phase==='terrain');
  const num      = point.data?.num_detecteur||point.data?.num_dosimetrie||`#${point.order+1}`;

  const batOpts  = allBats.map(b=>`<option value="${b.id}"${b.id===bat?.id?' selected':''}>${b.data?.nom||'Bât.'}</option>`).join('');
  const zoneOpts = allZones.map(z=>{
    const lbl = isCT?`ZCS ${z.data?.nom||''}`:`Zone ${z.data?.numero||''}`;
    return `<option value="${z.id}"${z.id===zone?.id?' selected':''}>${lbl}${z.data?.niveau?' — '+z.data.niveau:''}</option>`;
  }).join('');

  const el = document.createElement('div');
  el.className='modal-overlay'; el.id='point-modal';
  el.innerHTML=`
    <div class="modal-content plan-modal">
      <div class="plan-modal-header">
        <span class="plan-modal-badge">${isCT?'CT':'CSP'}</span>
        <h3 style="flex:1;font-size:1rem;margin:0;">📍 Capteur ${num}</h3>
        <button class="btn-icon" id="m-close">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;">
        <details class="plan-modal-section" open>
          <summary class="plan-modal-section-title">${isCT?'Zone à Caractéristiques Similaires (ZCS)':'Zone Homogène'}</summary>
          <div class="plan-modal-section-body">
            <div class="form-row-2">
              <div class="form-group"><label class="form-label">Bâtiment</label>
                <select id="m-bat" class="form-input form-input-sm">${batOpts}</select></div>
              <div class="form-group"><label class="form-label">${isCT?'ZCS':'Zone'}</label>
                <select id="m-zone" class="form-input form-input-sm">${zoneOpts}</select></div>
            </div>
            ${zFields.map(f=>fld(f,zone?.data?.[f.id]??'','z-')).join('')}
          </div>
        </details>
        <details class="plan-modal-section" open>
          <summary class="plan-modal-section-title">Dosimètre / Détecteur</summary>
          <div class="plan-modal-section-body">
            ${tFields.map(f=>fld(f,point.data?.[f.id]??'','p-')).join('')}
          </div>
        </details>
      </div>
      <div class="plan-modal-actions">
        <button class="btn btn-danger btn-sm" id="m-del">🗑</button>
        <button class="btn btn-secondary btn-sm" id="m-cancel">Annuler</button>
        <button class="btn btn-primary btn-sm" id="m-save">💾 Enregistrer</button>
      </div>
    </div>`;

  document.body.appendChild(el);
  el.addEventListener('click', e=>{ if(e.target===el) closeM(); });
  $('#m-close',el).addEventListener('click', closeM);
  $('#m-cancel',el).addEventListener('click', closeM);
  $('#m-del',el).addEventListener('click', async()=>{
    if(!confirm('Supprimer ce capteur ?')) return;
    await PointDB.delete(point.id); closeM(); redraw(); State.toast('Capteur supprimé','info');
  });
  $('#m-save',el).addEventListener('click', async()=>{
    const zid = $('#m-zone',el)?.value||zone?.id;
    const bid = $('#m-bat',el)?.value||bat?.id;
    const zd={};
    zFields.forEach(f=>{ const i=$(`[name="z-${f.id}"]`,el); if(i) zd[f.id]=i.value; });
    if(zid) await ZoneDB.update(zid,{data:zd});
    const pd={};
    tFields.forEach(f=>{ const i=$(`[name="p-${f.id}"]`,el); if(i) pd[f.id]=i.value; });
    const mv = zid!==point.zoneId||bid!==point.batimentId;
    await PointDB.update(point.id,{...(mv?{zoneId:zid,batimentId:bid}:{}),data:pd});
    closeM(); redraw(); State.toast('Capteur enregistré ✓','success',1500);
  });
}

function fld(f, val, pfx) {
  const nm = pfx+f.id;
  let inp;
  if (f.options?.length||f.type==='select') {
    inp=`<select name="${nm}" class="form-input form-input-sm"><option value="">—</option>${
      (f.options||[]).map(o=>`<option value="${o}"${String(val)===String(o)?' selected':''}>${o}</option>`).join('')
    }</select>`;
  } else if (f.type==='date') {
    inp=`<input type="date" name="${nm}" class="form-input form-input-sm" value="${val}">`;
  } else if (f.type==='number') {
    inp=`<input type="number" name="${nm}" class="form-input form-input-sm" inputmode="decimal" step="any" value="${val}">`;
  } else {
    inp=`<input type="text" name="${nm}" class="form-input form-input-sm" value="${val}">`;
  }
  return `<div class="form-group${f.required?' required':''}">
    <label class="form-label">${f.label}${f.required?' *':''}</label>${inp}</div>`;
}

function closeM() { $('#point-modal')?.remove(); }

// ── Chargement image ──────────────────────────────────────────

async function loadImage(file) {
  const tid = State.toast('Chargement…','info',15000);
  try {
    const url = file.type==='application/pdf' ? await pdfUrl(file) : await imgUrl(file);
    const im  = new Image();
    await new Promise((res,rej)=>{ im.onload=res; im.onerror=rej; im.src=url; });
    _img = im; _tr.rot = 0;
    $('#plan-empty')?.classList.add('hidden');
    const mid = State.get('currentMissionId');
    if (mid) {
      const all  = await PlanDB.getByMission(mid);
      const ex   = all.find(p=>(p.planIndex??0)===_planIdx);
      const d    = { imageData:url, width:im.naturalWidth, height:im.naturalHeight, name:file.name, planIndex:_planIdx };
      if (ex) await PlanDB.update(ex.id,d); else await PlanDB.create(mid,d);
    }
    fitToView(); redraw(); State.dismissToast(tid); State.toast('Plan chargé ✓','success',2000);
  } catch(err) {
    State.dismissToast(tid); State.toast('Erreur : '+err.message,'error',4000); console.error(err);
  }
}

async function loadFromDB() {
  const mid = State.get('currentMissionId'); if (!mid) return;
  const all = await PlanDB.getByMission(mid);
  const pl  = all.find(p=>(p.planIndex??0)===_planIdx);
  if (!pl?.imageData) { _img=null; redraw(); return; }
  const im = new Image();
  im.onload=()=>{ _img=im; $('#plan-empty')?.classList.add('hidden'); fitToView(); redraw(); };
  im.src = pl.imageData;
}

function imgUrl(file) {
  return new Promise((res,rej)=>{
    const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=()=>rej(new Error('Lecture impossible')); r.readAsDataURL(file);
  });
}

async function pdfUrl(file) {
  if (!window.pdfjsLib) {
    await new Promise((res,rej)=>{ const s=document.createElement('script');
      s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload=res; s.onerror=rej; document.head.appendChild(s); });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf=await window.pdfjsLib.getDocument({data:await file.arrayBuffer()}).promise;
  const pg=await pdf.getPage(1), vp=pg.getViewport({scale:2});
  const cv=document.createElement('canvas'); cv.width=vp.width; cv.height=vp.height;
  await pg.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
  return cv.toDataURL('image/png');
}
