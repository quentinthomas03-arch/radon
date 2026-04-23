// plan.js — Vue Plan interactif
// Panneau de gestion Bâtiment/ZCS au-dessus du canvas
// Modale capteur simplifiée (données capteur uniquement)
// Bouton verrouillage (🔒) : désactive le pan 1-doigt/souris tout en conservant
//   le zoom (molette, pinch, boutons) et le tap pour placer/éditer les capteurs.
import * as State from './state.js';
import { MissionDB, PlanDB, PointDB, ZoneDB, BatimentDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

// ── État ──────────────────────────────────────────────────────
let _img = null, _cx = 0, _cy = 0, _scale = 1, _rot = 0;
let _planIdx = 0;
let _pts = [], _ptsMid = null;
let _selBatId = null, _selZoneId = null;
let _locked = false;                // ← NEW : verrouillage du plan (pan désactivé)

// Touch state
let _t1 = null, _p0 = null, _tap = null, _md = null;

// ── HTML ──────────────────────────────────────────────────────
export function renderPlan() {
  return `
    <div class="plan-toolbar" id="plan-toolbar">
      <div class="plan-file-wrap">
        <span class="btn btn-sm btn-secondary" style="pointer-events:none;">📷 Plan</span>
        <input type="file" id="plan-file-input" accept="image/*,application/pdf"
          style="position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);opacity:0;cursor:pointer;">
      </div>
      <button id="btn-rot-l" class="btn btn-sm btn-secondary" title="Rotation −90°">↺ −90°</button>
      <button id="btn-rot-r" class="btn btn-sm btn-secondary" title="Rotation +90°">↻ +90°</button>
      <button id="btn-lock" class="btn btn-sm btn-secondary" title="Verrouiller le plan">🔓</button>
      <div class="plan-zoom">
        <button id="btn-zi" class="btn-icon" title="Zoom +">＋</button>
        <button id="btn-zf" class="btn-icon" title="Recadrer">⟲</button>
        <button id="btn-zo" class="btn-icon" title="Zoom −">－</button>
      </div>
    </div>
    <div id="plan-tabs-bar" class="plan-tabs-bar"></div>
    <div id="plan-mgmt" class="plan-mgmt"></div>
    <div id="plan-status" class="plan-status"></div>
    <div class="plan-canvas-wrap" id="plan-canvas-wrap">
      <canvas id="plan-canvas"></canvas>
      <div class="plan-empty" id="plan-empty">
        <div class="plan-empty-icon">📂</div>
        <p style="font-weight:600;margin:4px 0;">Appuyer ici pour charger un plan</p>
        <p class="text-sm" style="margin:0;">JPG · PNG · PDF</p>
        <p class="text-sm" style="margin:4px 0;opacity:.7;">Puis tapez sur le plan pour placer les capteurs</p>
      </div>
    </div>`;
}

// ── Init ──────────────────────────────────────────────────────
export function initPlan() {
  _img=null;_cx=0;_cy=0;_scale=1;_rot=0;_planIdx=0;
  _pts=[];_ptsMid=null;_t1=null;_p0=null;_tap=null;_md=null;
  _selBatId=null;_selZoneId=null;_locked=false;

  b('btn-rot-l', 'click', () => { if(_locked) return; _rot -= Math.PI/2; draw(); });
  b('btn-rot-r', 'click', () => { if(_locked) return; _rot += Math.PI/2; draw(); });
  b('btn-zi', 'click', () => doZoom(1.5));
  b('btn-zo', 'click', () => doZoom(1/1.5));
  b('btn-zf', 'click', () => { if(_locked) return; fitToView(); draw(); });
  b('btn-lock', 'click', toggleLock);
  b('btn-back-plan', 'click', () => { State.clearMission(); State.navigate('home'); });
  $$('.mission-nav-tab').forEach(t => t.addEventListener('click', () => State.navigate(t.dataset.navView)));

  b('plan-file-input', 'change', async e => {
    const f = e.target.files?.[0]; if (!f) return;
    e.target.value = ''; await loadImage(f);
  });
  b('plan-empty', 'click', () => $('#plan-file-input')?.click());

  const cv = $('#plan-canvas');
  if (cv) {
    cv.addEventListener('mousedown',  onMD);
    cv.addEventListener('mousemove',  onMM);
    cv.addEventListener('mouseup',    onMU);
    cv.addEventListener('mouseleave', () => { _md = null; });
    cv.addEventListener('wheel', e => {
      e.preventDefault(); doZoom(e.deltaY < 0 ? 1.15 : 0.87, e.offsetX, e.offsetY);
    }, { passive: false });
    cv.addEventListener('touchstart',  onTS, { passive: false });
    cv.addEventListener('touchmove',   onTM, { passive: false });
    cv.addEventListener('touchend',    onTE, { passive: false });
    cv.addEventListener('touchcancel', onTE, { passive: false });
    new ResizeObserver(() => { resizeCanvas(); draw(); }).observe(cv.parentElement);
  }

  requestAnimationFrame(async () => {
    await buildTabs();
    await buildMgmt();
    resizeCanvas();
    await loadFromDB();
  });
}

function b(id, ev, fn) {
  const el = $(`#${id}`);
  if (el) el.addEventListener(ev, fn);
}

// ── Verrouillage ──────────────────────────────────────────────
function toggleLock() {
  _locked = !_locked;
  const btn = $('#btn-lock');
  if (btn) {
    btn.textContent = _locked ? '🔒' : '🔓';
    btn.title = _locked ? 'Déverrouiller le plan' : 'Verrouiller le plan';
    btn.classList.toggle('btn-lock-on', _locked);
  }
  const cv = $('#plan-canvas');
  if (cv) cv.style.cursor = _locked ? 'pointer' : 'crosshair';
  State.toast(_locked ? '🔒 Plan verrouillé (zoom et tap toujours actifs)' : '🔓 Plan déverrouillé', 'info', 1800);
}

// ══════════════════════════════════════════════════════════════
// PANNEAU DE GESTION BÂTIMENT / ZONE
// ══════════════════════════════════════════════════════════════

async function buildMgmt() {
  const bar = $('#plan-mgmt'); if (!bar) return;
  const mid = State.get('currentMissionId'); if (!mid) { bar.innerHTML=''; return; }
  const cfg = State.getConfig(); if (!cfg) return;
  const isCT = cfg.type === 'CT';
  const zLabel = isCT ? 'ZCS' : 'Zone Homogène';

  const bats = await BatimentDB.getByMission(mid);
  // Auto-select first batiment if none selected
  if (!_selBatId && bats.length) _selBatId = bats[0].id;
  // If selected bat no longer exists, reset
  if (_selBatId && !bats.find(b=>b.id===_selBatId)) _selBatId = bats[0]?.id || null;

  const zones = _selBatId ? await ZoneDB.getByBatiment(_selBatId) : [];
  if (!_selZoneId && zones.length) _selZoneId = zones[0].id;
  if (_selZoneId && !zones.find(z=>z.id===_selZoneId)) _selZoneId = zones[0]?.id || null;

  const batOpts = bats.map(b =>
    `<option value="${b.id}"${b.id===_selBatId?' selected':''}>${b.data?.nom||'Bâtiment '+(b.order+1)}</option>`
  ).join('');
  const zoneOpts = zones.map(z => {
    const lbl = isCT ? (z.data?.nom||'') : (z.data?.numero||'');
    const niv = z.data?.niveau ? ' — '+z.data.niveau : '';
    return `<option value="${z.id}"${z.id===_selZoneId?' selected':''}>${lbl}${niv}</option>`;
  }).join('');

  bar.innerHTML = `
    <div class="mgmt-row">
      <div class="mgmt-group">
        <label class="mgmt-label">🏢 Bâtiment</label>
        <select id="mgmt-bat" class="mgmt-select">${bats.length ? batOpts : '<option value="">—</option>'}</select>
        <button id="mgmt-bat-add" class="mgmt-btn mgmt-btn-add" title="Ajouter un bâtiment">＋</button>
        <button id="mgmt-bat-edit" class="mgmt-btn" title="Modifier le bâtiment" ${!_selBatId?'disabled':''}>✏️</button>
        <button id="mgmt-bat-del" class="mgmt-btn mgmt-btn-danger" title="Supprimer le bâtiment" ${bats.length<=1?'disabled':''}>🗑</button>
      </div>
      <div class="mgmt-group">
        <label class="mgmt-label">${isCT?'📋 ZCS':'📋 Zone'}</label>
        <select id="mgmt-zone" class="mgmt-select">${zones.length ? zoneOpts : '<option value="">—</option>'}</select>
        <button id="mgmt-zone-add" class="mgmt-btn mgmt-btn-add" title="Ajouter une ${zLabel}" ${!_selBatId?'disabled':''}>＋</button>
        <button id="mgmt-zone-edit" class="mgmt-btn" title="Modifier la ${zLabel}" ${!_selZoneId?'disabled':''}>✏️</button>
        <button id="mgmt-zone-del" class="mgmt-btn mgmt-btn-danger" title="Supprimer la ${zLabel}" ${zones.length<=1?'disabled':''}>🗑</button>
      </div>
    </div>`;

  // Events
  $('#mgmt-bat', bar).addEventListener('change', async e => {
    _selBatId = e.target.value; _selZoneId = null;
    await buildMgmt(); draw();
  });
  $('#mgmt-zone', bar).addEventListener('change', e => {
    _selZoneId = e.target.value; draw();
  });
  $('#mgmt-bat-add', bar).addEventListener('click', async () => {
    const bats = await BatimentDB.getByMission(mid);
    const nb = bats.length + 1;
    const bat = await BatimentDB.create(mid, { data: { nom: 'Bâtiment ' + nb } });
    _selBatId = bat.id; _selZoneId = null;
    await buildMgmt();
    State.toast('Bâtiment ajouté', 'success', 1500);
  });
  $('#mgmt-zone-add', bar).addEventListener('click', async () => {
    if (!_selBatId) return;
    const zones = await ZoneDB.getByBatiment(_selBatId);
    const nb = zones.length + 1;
    const z = await ZoneDB.create(_selBatId, mid, { data: isCT ? { nom: String(nb) } : { numero: String(nb) } });
    _selZoneId = z.id;
    await buildMgmt();
    State.toast((isCT?'ZCS':'Zone') + ' ajoutée', 'success', 1500);
  });
  $('#mgmt-bat-edit', bar).addEventListener('click', () => {
    if (_selBatId) openBatModal(_selBatId);
  });
  $('#mgmt-zone-edit', bar).addEventListener('click', () => {
    if (_selZoneId) openZoneModal(_selZoneId);
  });
  $('#mgmt-bat-del', bar).addEventListener('click', async () => {
    if (!_selBatId) return;
    const bats = await BatimentDB.getByMission(mid);
    if (bats.length <= 1) { State.toast('Au moins un bâtiment requis', 'warning'); return; }
    if (!confirm('Supprimer ce bâtiment et toutes ses zones / capteurs ?')) return;
    await BatimentDB.delete(_selBatId);
    _selBatId = null; _selZoneId = null; _ptsMid = null;
    await syncPts(); await buildMgmt(); draw();
    State.toast('Bâtiment supprimé', 'info');
  });
  $('#mgmt-zone-del', bar).addEventListener('click', async () => {
    if (!_selZoneId) return;
    const zones = await ZoneDB.getByBatiment(_selBatId);
    if (zones.length <= 1) { State.toast('Au moins une zone requise', 'warning'); return; }
    if (!confirm('Supprimer cette zone et ses capteurs ?')) return;
    await ZoneDB.delete(_selZoneId);
    _selZoneId = null; _ptsMid = null;
    await syncPts(); await buildMgmt(); draw();
    State.toast('Zone supprimée', 'info');
  });
}

// ── Modale édition Bâtiment ──────────────────────────────────
async function openBatModal(batId) {
  const cfg = State.getConfig(); if (!cfg) return;
  const bat = await BatimentDB.getById(batId); if (!bat) return;
  const fields = cfg.tableau.batiment.fields;

  const el = document.createElement('div');
  el.className = 'modal-overlay'; el.id = 'bat-modal';
  el.innerHTML = `
    <div class="modal-content plan-modal">
      <div class="plan-modal-header">
        <span class="plan-modal-badge">🏢</span>
        <h3 style="flex:1;font-size:1rem;margin:0;">Données Bâtiment</h3>
        <button class="btn-icon" id="bm-x">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px;">
        ${fields.map(f => fld(f, bat.data?.[f.id] ?? '', 'b-')).join('')}
      </div>
      <div class="plan-modal-actions">
        <button class="btn btn-secondary btn-sm" id="bm-no">Annuler</button>
        <button class="btn btn-primary btn-sm" id="bm-ok">💾 Enregistrer</button>
      </div>
    </div>`;

  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) closeBM(); });
  $('#bm-x', el).addEventListener('click', closeBM);
  $('#bm-no', el).addEventListener('click', closeBM);
  $('#bm-ok', el).addEventListener('click', async () => {
    const d = {};
    fields.forEach(f => { const i = $(`[name="b-${f.id}"]`, el); if (i) d[f.id] = i.value; });
    await BatimentDB.update(batId, { data: d });
    closeBM(); await buildMgmt();
    State.toast('Bâtiment enregistré ✓', 'success', 1500);
  });
}
function closeBM() { $('#bat-modal')?.remove(); }

// ── Modale édition Zone ──────────────────────────────────────
async function openZoneModal(zoneId) {
  const cfg = State.getConfig(); if (!cfg) return;
  const isCT = cfg.type === 'CT';
  const zone = await ZoneDB.getById(zoneId); if (!zone) return;
  const zk = isCT ? 'zcs' : 'zone_homogene';
  const fields = cfg.tableau[zk]?.fields || [];

  const el = document.createElement('div');
  el.className = 'modal-overlay'; el.id = 'zone-modal';
  el.innerHTML = `
    <div class="modal-content plan-modal">
      <div class="plan-modal-header">
        <span class="plan-modal-badge">📋</span>
        <h3 style="flex:1;font-size:1rem;margin:0;">${isCT ? 'Données ZCS' : 'Données Zone Homogène'}</h3>
        <button class="btn-icon" id="zm-x">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:12px 16px;">
        ${fields.map(f => fld(f, zone.data?.[f.id] ?? '', 'z-')).join('')}
      </div>
      <div class="plan-modal-actions">
        <button class="btn btn-secondary btn-sm" id="zm-no">Annuler</button>
        <button class="btn btn-primary btn-sm" id="zm-ok">💾 Enregistrer</button>
      </div>
    </div>`;

  document.body.appendChild(el);
  el.addEventListener('click', e => { if (e.target === el) closeZM(); });
  $('#zm-x', el).addEventListener('click', closeZM);
  $('#zm-no', el).addEventListener('click', closeZM);
  $('#zm-ok', el).addEventListener('click', async () => {
    const d = {};
    fields.forEach(f => { const i = $(`[name="z-${f.id}"]`, el); if (i) d[f.id] = i.value; });
    await ZoneDB.update(zoneId, { data: d });
    closeZM(); await buildMgmt();
    State.toast((isCT ? 'ZCS' : 'Zone') + ' enregistrée ✓', 'success', 1500);
  });
}
function closeZM() { $('#zone-modal')?.remove(); }

// ══════════════════════════════════════════════════════════════
// MODALE CAPTEUR (SIMPLIFIÉE — données capteur uniquement)
// ══════════════════════════════════════════════════════════════

async function openModal(point) {
  const cfg = State.getConfig(); if (!cfg) return;
  const isCT = cfg.type === 'CT';
  const mid = State.get('currentMissionId');
  const bat = await BatimentDB.getById(point.batimentId);
  const zone = await ZoneDB.getById(point.zoneId);
  const allBats = await BatimentDB.getByMission(mid);

  // Préparer les zones du bâtiment sélectionné
  let allZones = await ZoneDB.getByBatiment(point.batimentId);

  const tF = cfg.tableau.point.fields.filter(f => f.phase === 'terrain');
  const num = point.data?.num_detecteur || point.data?.num_dosimetrie || `#${point.order + 1}`;

  const batOpts = allBats.map(b =>
    `<option value="${b.id}"${b.id === bat?.id ? ' selected' : ''}>${b.data?.nom || 'Bâtiment ' + (b.order + 1)}</option>`
  ).join('');
  const buildZoneOpts = (zones, selId) => zones.map(z => {
    const lbl = isCT ? (z.data?.nom || '') : (z.data?.numero || '');
    const niv = z.data?.niveau ? ' — ' + z.data.niveau : '';
    return `<option value="${z.id}"${z.id === selId ? ' selected' : ''}>${isCT ? 'ZCS ' : 'Zone '}${lbl}${niv}</option>`;
  }).join('');

  const el = document.createElement('div');
  el.className = 'modal-overlay'; el.id = 'point-modal';
  el.innerHTML = `
    <div class="modal-content plan-modal">
      <div class="plan-modal-header">
        <span class="plan-modal-badge">${isCT ? 'CT' : 'CSP'}</span>
        <h3 style="flex:1;font-size:1rem;margin:0;">📍 Capteur ${num}</h3>
        <button class="btn-icon" id="m-x">✕</button>
      </div>
      <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;">
        <div class="plan-modal-attach">
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Bâtiment</label>
              <select id="m-bat" class="form-input form-input-sm">${batOpts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">${isCT ? 'ZCS' : 'Zone'}</label>
              <select id="m-zone" class="form-input form-input-sm">${buildZoneOpts(allZones, zone?.id)}</select>
            </div>
          </div>
        </div>
        <div class="plan-modal-section-body">
          ${tF.map(f => fld(f, point.data?.[f.id] ?? '', 'p-')).join('')}
        </div>
      </div>
      <div class="plan-modal-actions">
        <button class="btn btn-danger btn-sm" id="m-del">🗑 Supprimer</button>
        <button class="btn btn-secondary btn-sm" id="m-no">Annuler</button>
        <button class="btn btn-primary btn-sm" id="m-ok">💾 Enregistrer</button>
      </div>
    </div>`;

  document.body.appendChild(el);

  // Quand on change de bâtiment, recharger les zones
  $('#m-bat', el).addEventListener('change', async e => {
    const newBatId = e.target.value;
    const newZones = await ZoneDB.getByBatiment(newBatId);
    const sel = $('#m-zone', el);
    sel.innerHTML = buildZoneOpts(newZones, newZones[0]?.id);
  });

  el.addEventListener('click', e => { if (e.target === el) closeM(); });
  $('#m-x', el).addEventListener('click', closeM);
  $('#m-no', el).addEventListener('click', closeM);

  $('#m-del', el).addEventListener('click', async () => {
    if (!confirm('Supprimer ce capteur ?')) return;
    await PointDB.delete(point.id); _ptsMid = null; await syncPts(); closeM(); draw();
    State.toast('Capteur supprimé', 'info');
  });

  $('#m-ok', el).addEventListener('click', async () => {
    const zid = $('#m-zone', el)?.value || zone?.id;
    const bid = $('#m-bat', el)?.value || bat?.id;
    const pd = {};
    tF.forEach(f => { const i = $(`[name="p-${f.id}"]`, el); if (i) pd[f.id] = i.value; });
    const mv = zid !== point.zoneId || bid !== point.batimentId;
    await PointDB.update(point.id, { ...(mv ? { zoneId: zid, batimentId: bid } : {}), data: pd });
    _ptsMid = null; await syncPts(); closeM(); draw();
    State.toast('Capteur enregistré ✓', 'success', 1500);
  });
}

// Rend un champ de formulaire : supporte le flag `numeric:true` pour
// afficher le clavier numérique tout en conservant un input text (saisie libre)
function fld(f, val, pfx) {
  const nm = pfx + f.id; let inp;
  if (f.options?.length || f.type === 'select') {
    inp = `<select name="${nm}" class="form-input form-input-sm"><option value="">—</option>${
      (f.options || []).map(o => `<option value="${o}"${String(val) === String(o) ? ' selected' : ''}>${o}</option>`).join('')
    }</select>`;
  } else if (f.type === 'date') {
    inp = `<input type="date" name="${nm}" class="form-input form-input-sm" value="${val}">`;
  } else if (f.type === 'number') {
    inp = `<input type="number" name="${nm}" class="form-input form-input-sm" inputmode="decimal" step="any" value="${val}">`;
  } else if (f.numeric) {
    // type text + inputmode="numeric" → clavier numérique mobile, mais saisie libre (lettres autorisées)
    inp = `<input type="text" name="${nm}" class="form-input form-input-sm" inputmode="numeric" pattern="[0-9]*" value="${val}">`;
  } else {
    inp = `<input type="text" name="${nm}" class="form-input form-input-sm" value="${val}">`;
  }
  return `<div class="form-group${f.required ? ' required' : ''}">
    <label class="form-label">${f.label}${f.required ? ' *' : ''}</label>${inp}</div>`;
}
function closeM() { $('#point-modal')?.remove(); }

// ══════════════════════════════════════════════════════════════
// ZOOM & PAN, TRANSFORMS, CANVAS
// ══════════════════════════════════════════════════════════════

function doZoom(f, px, py) {
  const cv = $('#plan-canvas'); if (!cv) return;
  const ppx = px ?? cv.clientWidth / 2, ppy = py ?? cv.clientHeight / 2;
  const ns = Math.max(0.05, Math.min(20, _scale * f));
  const r = ns / _scale;
  _cx = ppx + (_cx - ppx) * r; _cy = ppy + (_cy - ppy) * r; _scale = ns;
  draw();
}

function i2c(ix, iy) {
  if (!_img) return { x: 0, y: 0 };
  const dx = ix - _img.naturalWidth / 2, dy = iy - _img.naturalHeight / 2;
  const c = Math.cos(_rot), s = Math.sin(_rot);
  return { x: _cx + (dx * c - dy * s) * _scale, y: _cy + (dx * s + dy * c) * _scale };
}
function c2i(cx, cy) {
  if (!_img) return { x: 0, y: 0 };
  const dx = (cx - _cx) / _scale, dy = (cy - _cy) / _scale;
  const c = Math.cos(-_rot), s = Math.sin(-_rot);
  return { x: dx * c - dy * s + _img.naturalWidth / 2, y: dx * s + dy * c + _img.naturalHeight / 2 };
}

function resizeCanvas() {
  const cv = $('#plan-canvas'), w = $('#plan-canvas-wrap'); if (!cv || !w) return;
  const r = w.getBoundingClientRect(); if (!r.width || !r.height) return;
  cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio;
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
}
function fitToView() {
  const cv = $('#plan-canvas'); if (!cv || !_img) return;
  const cw = cv.clientWidth, ch = cv.clientHeight; if (!cw || !ch) return;
  const iw = _img.naturalWidth, ih = _img.naturalHeight;
  const rn = ((_rot % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const sw = (rn > Math.PI / 4 && rn < 3 * Math.PI / 4) || (rn > 5 * Math.PI / 4 && rn < 7 * Math.PI / 4);
  _scale = Math.min(cw / (sw ? ih : iw), ch / (sw ? iw : ih)) * 0.92;
  _cx = cw / 2; _cy = ch / 2;
}

function draw() {
  const cv = $('#plan-canvas'); if (!cv) return;
  const ctx = cv.getContext('2d'), dpr = devicePixelRatio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (_img) {
    ctx.save();
    ctx.translate(_cx, _cy); ctx.rotate(_rot); ctx.scale(_scale, _scale);
    ctx.drawImage(_img, -_img.naturalWidth / 2, -_img.naturalHeight / 2);
    ctx.restore();
  }
  drawPts(ctx);
  updateStatus();
}

function drawPts(ctx) {
  const isCT = State.getConfig()?.type === 'CT';
  for (const pt of _pts) {
    if (!pt.planPosition || (pt.planPosition.planIdx ?? 0) !== _planIdx) continue;
    const { x: px, y: py } = i2c(pt.planPosition.x, pt.planPosition.y);
    const val = parseFloat(pt.resultats?.[isCT ? 'activite_bqm3' : 'concentration'] || '');
    const isSelected = pt.zoneId === _selZoneId;
    const color = isNaN(val) ? (isSelected ? '#4a9eff' : '#6b7a90') : val < 300 ? '#27ae60' : val < 1000 ? '#f39c12' : '#e74c3c';
    const radius = isSelected ? 16 : 13;
    // Ombre
    ctx.beginPath(); ctx.arc(px + 2, py + 2, radius, 0, 2 * Math.PI); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
    // Cercle
    ctx.beginPath(); ctx.arc(px, py, radius, 0, 2 * Math.PI); ctx.fillStyle = color; ctx.fill();
    ctx.strokeStyle = isSelected ? '#fff' : 'rgba(255,255,255,.6)'; ctx.lineWidth = isSelected ? 2.5 : 1.5; ctx.stroke();
    // Numéro
    const num = pt.data?.num_detecteur || pt.data?.num_dosimetrie || String(pt.order + 1);
    ctx.fillStyle = '#fff'; ctx.font = `bold ${isSelected ? 11 : 10}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num).slice(0, 5), px, py);
    // Étiquette lieu
    const lieu = pt.data?.lieu_pose || pt.data?.nom_piece || '';
    if (lieu && isSelected) {
      ctx.font = '10px sans-serif';
      const tw = ctx.measureText(lieu).width + 8;
      ctx.fillStyle = 'rgba(0,0,0,.75)';
      if (ctx.roundRect) ctx.roundRect(px - tw / 2, py + 18, tw, 16, 3); else ctx.rect(px - tw / 2, py + 18, tw, 16);
      ctx.fill(); ctx.fillStyle = '#fff'; ctx.fillText(lieu, px, py + 26);
    }
  }
}

function updateStatus() {
  const bar = $('#plan-status'); if (!bar) return;
  if (!_img) { bar.innerHTML = ''; return; }
  const total = _pts.filter(p => p.planPosition && (p.planPosition.planIdx ?? 0) === _planIdx).length;
  const inZone = _selZoneId ? _pts.filter(p => p.planPosition && (p.planPosition.planIdx ?? 0) === _planIdx && p.zoneId === _selZoneId).length : 0;
  const zonePart = _selZoneId ? ` · ${inZone} dans la zone sélectionnée` : '';
  const lockPart = _locked ? ' · 🔒 verrouillé' : '';
  bar.innerHTML = `<span class="status-nav">${total > 0 ? total + ' capteur(s) placé(s)' + zonePart + lockPart : 'Tapez sur le plan pour placer un capteur' + lockPart}</span>`;
}

// ── Souris ────────────────────────────────────────────────────
// Le tap (clic simple) fonctionne TOUJOURS, même verrouillé.
// Seul le pan (drag) est désactivé.
function onMD(e) {
  _md = { cx: _cx, cy: _cy, x: e.offsetX, y: e.offsetY, moved: false };
  e.currentTarget.style.cursor = _locked ? 'pointer' : 'grabbing';
}
function onMM(e) {
  if (!_md) return;
  const dx = e.offsetX - _md.x, dy = e.offsetY - _md.y;
  if (Math.hypot(dx, dy) > 4) _md.moved = true;
  if (_locked) return;            // ← pas de pan si verrouillé
  _cx = _md.cx + dx; _cy = _md.cy + dy; draw();
}
async function onMU(e) {
  if (_md && !_md.moved) await tap(e.offsetX, e.offsetY);
  _md = null; e.currentTarget.style.cursor = _locked ? 'pointer' : 'crosshair';
}

// ── Touch ─────────────────────────────────────────────────────
// Pinch-zoom (2 doigts) reste TOUJOURS actif, verrouillé ou non.
// Pan 1 doigt → désactivé si _locked.
// Tap → toujours actif.
function tp(t, c) { const r = c.getBoundingClientRect(); return { x: t.clientX - r.left, y: t.clientY - r.top }; }

function onTS(e) {
  e.preventDefault(); const c = e.currentTarget;
  if (e.touches.length === 1) {
    const p = tp(e.touches[0], c);
    _t1 = { x0: p.x, y0: p.y, cx0: _cx, cy0: _cy }; _p0 = null; _tap = { x: p.x, y: p.y, t: Date.now() };
  } else if (e.touches.length === 2) {
    _tap = null;
    const a = tp(e.touches[0], c), bb = tp(e.touches[1], c);
    _p0 = { dist: Math.hypot(bb.x - a.x, bb.y - a.y), mx: (a.x + bb.x) / 2, my: (a.y + bb.y) / 2, s: _scale, cx: _cx, cy: _cy };
  }
}
function onTM(e) {
  e.preventDefault(); const c = e.currentTarget;
  if (e.touches.length === 2 && _p0) {
    // Pinch-zoom : toujours actif (même verrouillé)
    const a = tp(e.touches[0], c), bb = tp(e.touches[1], c);
    const dist = Math.hypot(bb.x - a.x, bb.y - a.y), mx = (a.x + bb.x) / 2, my = (a.y + bb.y) / 2;
    const ns = Math.max(0.05, Math.min(20, _p0.s * (dist / _p0.dist))), sr = ns / _p0.s;
    _scale = ns; _cx = mx + (_p0.cx - _p0.mx) * sr; _cy = my + (_p0.cy - _p0.my) * sr;
    draw();
  } else if (e.touches.length === 1 && _t1) {
    const p = tp(e.touches[0], c);
    const dx = p.x - _t1.x0, dy = p.y - _t1.y0;
    if (_tap && Math.hypot(dx, dy) > 8) _tap = null;
    if (_locked) return;          // ← pas de pan 1-doigt si verrouillé
    _cx = _t1.cx0 + dx; _cy = _t1.cy0 + dy; draw();
  }
}
async function onTE(e) {
  e.preventDefault();
  if (e.touches.length === 0) {
    if (_tap && Date.now() - _tap.t < 350) await tap(_tap.x, _tap.y);
    _t1 = null; _p0 = null; _tap = null;
  } else if (e.touches.length === 1) {
    _p0 = null; _tap = null;
    const p = tp(e.touches[0], e.currentTarget);
    _t1 = { x0: p.x, y0: p.y, cx0: _cx, cy0: _cy };
  }
}

// ── Tap : cœur de la logique ──────────────────────────────────
async function tap(cx, cy) {
  if (!_img) return;
  const hit = await findPt(cx, cy);
  if (hit) { openModal(hit); return; }
  const ip = c2i(cx, cy);
  await placePt(ip.x, ip.y);
}

async function findPt(cx, cy) {
  await syncPts();
  for (const pt of _pts) {
    if (!pt.planPosition || (pt.planPosition.planIdx ?? 0) !== _planIdx) continue;
    const p = i2c(pt.planPosition.x, pt.planPosition.y);
    if (Math.hypot(cx - p.x, cy - p.y) < 24) return pt;
  }
  return null;
}

async function placePt(ix, iy) {
  const mid = State.get('currentMissionId'); if (!mid) return;
  const isCT = State.getConfig()?.type === 'CT';

  // Utiliser le bâtiment/zone sélectionnés dans le panneau
  let batId = _selBatId;
  let zoneId = _selZoneId;

  // Si pas encore de bâtiment, en créer un
  if (!batId) {
    const bat = await BatimentDB.create(mid, { data: { nom: 'Bâtiment 1' } });
    batId = bat.id; _selBatId = batId;
  }
  // Si pas encore de zone, en créer une
  if (!zoneId) {
    const z = await ZoneDB.create(batId, mid, { data: isCT ? { nom: '1' } : { numero: '1' } });
    zoneId = z.id; _selZoneId = zoneId;
    await buildMgmt();
  }

  const today = new Date().toISOString().slice(0, 10);
  const pt = await PointDB.create(zoneId, batId, mid, {
    planPosition: { x: ix, y: iy, planIdx: _planIdx },
    data: { date_pose: today },
  });
  _ptsMid = null; await syncPts(); draw();
  openModal(pt);
}

async function syncPts() {
  const mid = State.get('currentMissionId');
  if (!mid) { _pts = []; return; }
  if (mid === _ptsMid) return;
  _pts = await PointDB.getByMission(mid); _ptsMid = mid;
}

// ── Onglets multi-plans ───────────────────────────────────────
async function buildTabs() {
  const bar = $('#plan-tabs-bar'); if (!bar) return;
  const mid = State.get('currentMissionId'); if (!mid) { bar.innerHTML = ''; return; }
  const m = await MissionDB.getById(mid);
  const n = Math.max(1, parseInt(m?.entree?.nb_plans || '1', 10));
  if (n <= 1) { bar.innerHTML = ''; return; }
  bar.innerHTML = `<div class="plan-tabs">${
    Array.from({ length: n }, (_, i) =>
      `<button class="plan-tab${i === _planIdx ? ' active' : ''}" data-i="${i}">Plan ${i + 1}</button>`
    ).join('')
  }</div>`;
  $$('.plan-tab', bar).forEach(btn => btn.addEventListener('click', async () => {
    _planIdx = +btn.dataset.i; _img = null; _ptsMid = null;
    buildTabs(); await loadFromDB();
  }));
}

// ── Chargement image ──────────────────────────────────────────
async function loadImage(file) {
  const tid = State.toast('Chargement…', 'info', 15000);
  try {
    const url = file.type === 'application/pdf' ? await pdfUrl(file) : await imgUrl(file);
    const im = new Image();
    await new Promise((res, rej) => { im.onload = res; im.onerror = rej; im.src = url; });
    _img = im; _rot = 0;
    $('#plan-empty')?.classList.add('hidden');
    resizeCanvas();
    const mid = State.get('currentMissionId');
    if (mid) {
      const all = await PlanDB.getByMission(mid);
      const ex = all.find(p => (p.planIndex ?? 0) === _planIdx);
      const d = { imageData: url, width: im.naturalWidth, height: im.naturalHeight, name: file.name, planIndex: _planIdx };
      if (ex) await PlanDB.update(ex.id, d); else await PlanDB.create(mid, d);
    }
    fitToView(); await syncPts(); draw();
    State.dismissToast(tid); State.toast('Plan chargé ✓', 'success', 2000);
  } catch (err) {
    State.dismissToast(tid); State.toast('Erreur : ' + err.message, 'error', 4000); console.error(err);
  }
}

async function loadFromDB() {
  const mid = State.get('currentMissionId'); if (!mid) return;
  const all = await PlanDB.getByMission(mid);
  const plan = all.find(p => (p.planIndex ?? 0) === _planIdx);
  await syncPts();
  if (!plan?.imageData) { draw(); return; }
  const im = new Image();
  im.onload = () => { _img = im; $('#plan-empty')?.classList.add('hidden'); resizeCanvas(); fitToView(); draw(); };
  im.src = plan.imageData;
}

function imgUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = () => rej(new Error('Lecture impossible')); r.readAsDataURL(file);
  });
}
async function pdfUrl(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej; document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 2 });
  const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
  await pg.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  return cv.toDataURL('image/png');
}
