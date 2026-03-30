// ============================================================
// plan.js — Vue Plan interactif
// Charger un plan · Pivoter · Zoomer · Verrouiller · Placer capteurs
// ============================================================

import * as State from './state.js';
import { PlanDB, PointDB, ZoneDB, BatimentDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

let _planImage = null;
// cx, cy = centre de l'image en coordonnées canvas (px CSS)
let _transform = { cx: 0, cy: 0, scale: 1, rotation: 0 };
let _locked    = false;   // verrouillé = mode placement ; déverrouillé = navigation
let _dragging  = false;
let _dragStart = { x: 0, y: 0 };
let _pinch     = null;    // état du pinch actif

// ── HTML ─────────────────────────────────────────────────────

export function renderPlan() {
  return `
    <div class="plan-toolbar">
      <div class="plan-file-btn-wrap">
        <button class="btn btn-sm btn-secondary" style="pointer-events:none;">📷 Plan</button>
        <input type="file" id="plan-file-input" accept="image/*,application/pdf"
          style="position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);opacity:0;cursor:pointer;z-index:10;">
      </div>
      <button class="btn btn-sm btn-secondary" id="btn-rotate-left"  title="Rotation −90°">↺</button>
      <button class="btn btn-sm btn-secondary" id="btn-rotate-right" title="Rotation +90°">↻</button>
      <button class="btn btn-sm btn-secondary" id="btn-lock">🔓 Verrouiller</button>
      <div class="plan-zoom">
        <button class="btn-icon" id="btn-zoom-in"    title="Zoom +">+</button>
        <button class="btn-icon" id="btn-zoom-reset" title="Recadrer">⟲</button>
        <button class="btn-icon" id="btn-zoom-out"   title="Zoom −">−</button>
      </div>
    </div>

    <div class="plan-status-bar" id="plan-status-bar"></div>

    <div class="plan-canvas-wrap" id="plan-canvas-wrap">
      <canvas id="plan-canvas"></canvas>
      <div class="plan-empty" id="plan-empty">
        <div class="plan-empty-icon">📂</div>
        <div style="font-weight:600;margin-bottom:4px;">Appuyer pour charger un plan</div>
        <div class="text-sm">Image JPG / PNG ou PDF</div>
      </div>
    </div>
  `;
}

// ── Init ─────────────────────────────────────────────────────

export function initPlan() {
  // Reset de l'état inter-vues
  _dragging = false;
  _pinch    = null;
  setTimeout(() => {
    resizeCanvas();
    bindPlanEvents();
    loadPlanFromDB();
  }, 50);
}

function bindPlanEvents() {
  const canvas = $('#plan-canvas');
  const wrap   = $('#plan-canvas-wrap');
  if (!canvas || !wrap) return;

  // Navigation hors plan
  $('#btn-back-plan')?.addEventListener('click', () => {
    State.clearMission(); State.navigate('home');
  });
  $$('.mission-nav-tab').forEach(tab =>
    tab.addEventListener('click', () => State.navigate(tab.dataset.navView))
  );

  // Chargement fichier
  $('#plan-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = '';
    await loadPlanImage(file);
  });
  $('#plan-empty')?.addEventListener('click', () => $('#plan-file-input')?.click());

  // Rotation (−90° / +90°)
  $('#btn-rotate-left')?.addEventListener('click', () => {
    if (_locked) return;
    _transform.rotation -= Math.PI / 2;
    redraw();
  });
  $('#btn-rotate-right')?.addEventListener('click', () => {
    if (_locked) return;
    _transform.rotation += Math.PI / 2;
    redraw();
  });

  // Verrou
  $('#btn-lock')?.addEventListener('click', () => setLocked(!_locked));

  // Zoom boutons
  $('#btn-zoom-in')?.addEventListener('click', () => {
    if (_locked) return;
    applyZoom(1.3, canvasCenterX(), canvasCenterY());
  });
  $('#btn-zoom-out')?.addEventListener('click', () => {
    if (_locked) return;
    applyZoom(1 / 1.3, canvasCenterX(), canvasCenterY());
  });
  $('#btn-zoom-reset')?.addEventListener('click', () => {
    if (_locked) return;
    fitToView(); redraw();
  });

  // Souris / stylet
  canvas.addEventListener('pointerdown',  onPointerDown);
  canvas.addEventListener('pointermove',  onPointerMove);
  canvas.addEventListener('pointerup',    onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Touch (pinch + tap)
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove',  onTouchMove,  { passive: false });
  canvas.addEventListener('touchend',   onTouchEnd,   { passive: false });

  // Resize observeur
  new ResizeObserver(() => { resizeCanvas(); redraw(); }).observe(wrap);
}

// ── Verrou ───────────────────────────────────────────────────

function setLocked(locked) {
  _locked = locked;
  const btn    = $('#btn-lock');
  const canvas = $('#plan-canvas');

  if (btn) {
    btn.textContent = locked ? '🔒 Verrouillé' : '🔓 Verrouiller';
    btn.classList.toggle('active', locked);
  }
  if (canvas) canvas.style.cursor = locked ? 'crosshair' : 'grab';

  // Désactiver rotation/zoom quand verrouillé
  ['btn-rotate-left','btn-rotate-right','btn-zoom-in','btn-zoom-out','btn-zoom-reset'].forEach(id => {
    const el = $(`#${id}`);
    if (el) el.disabled = locked;
  });

  redraw();
}

// ── Coordonnées ──────────────────────────────────────────────

function canvasCSSSize() {
  const c = $('#plan-canvas');
  if (!c) return { w: 0, h: 0 };
  return { w: c.width / window.devicePixelRatio, h: c.height / window.devicePixelRatio };
}
function canvasCenterX() { return canvasCSSSize().w / 2; }
function canvasCenterY() { return canvasCSSSize().h / 2; }

/** Image coords → canvas coords (CSS px) */
function imageToCanvas(imgX, imgY) {
  const img = _planImage; if (!img) return { x: 0, y: 0 };
  const dx  = imgX - img.naturalWidth  / 2;
  const dy  = imgY - img.naturalHeight / 2;
  const cos = Math.cos(_transform.rotation);
  const sin = Math.sin(_transform.rotation);
  const s   = _transform.scale;
  return {
    x: _transform.cx + (dx * cos - dy * sin) * s,
    y: _transform.cy + (dx * sin + dy * cos) * s,
  };
}

/** Canvas coords → image coords */
function canvasToImage(cx, cy) {
  const img = _planImage; if (!img) return { x: 0, y: 0 };
  const s   = _transform.scale;
  const dx  = (cx - _transform.cx) / s;
  const dy  = (cy - _transform.cy) / s;
  const rot = -_transform.rotation;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  return {
    x: dx * cos - dy * sin + img.naturalWidth  / 2,
    y: dx * sin + dy * cos + img.naturalHeight / 2,
  };
}

function getCanvasPos(e) {
  const rect = $('#plan-canvas').getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function applyZoom(factor, pivotX, pivotY) {
  const newScale = Math.max(0.1, Math.min(12, _transform.scale * factor));
  const ratio    = newScale / _transform.scale;
  _transform.cx  = pivotX + (_transform.cx - pivotX) * ratio;
  _transform.cy  = pivotY + (_transform.cy - pivotY) * ratio;
  _transform.scale = newScale;
  redraw();
}

// ── Canvas sizing ────────────────────────────────────────────

function resizeCanvas() {
  const canvas = $('#plan-canvas');
  const wrap   = $('#plan-canvas-wrap');
  if (!canvas || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  canvas.width  = rect.width  * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  canvas.style.width  = rect.width  + 'px';
  canvas.style.height = rect.height + 'px';
}

function fitToView() {
  const canvas = $('#plan-canvas'); if (!canvas || !_planImage) return;
  const { w: cw, h: ch } = canvasCSSSize();
  const iw = _planImage.naturalWidth;
  const ih = _planImage.naturalHeight;
  // Tenir compte de la rotation pour le fit
  const rot = ((_transform.rotation % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const swapped = (rot > Math.PI / 4 && rot < 3 * Math.PI / 4) ||
                  (rot > 5 * Math.PI / 4 && rot < 7 * Math.PI / 4);
  _transform.scale = Math.min(cw / (swapped ? ih : iw), ch / (swapped ? iw : ih)) * 0.90;
  _transform.cx = cw / 2;
  _transform.cy = ch / 2;
}

// ── Dessin ───────────────────────────────────────────────────

async function redraw() {
  const canvas = $('#plan-canvas'); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (_planImage) {
    const iw = _planImage.naturalWidth;
    const ih = _planImage.naturalHeight;
    ctx.save();
    ctx.translate(_transform.cx, _transform.cy);
    ctx.rotate(_transform.rotation);
    ctx.scale(_transform.scale, _transform.scale);
    ctx.drawImage(_planImage, -iw / 2, -ih / 2);
    ctx.restore();

    // Bordure dorée quand verrouillé
    if (_locked) {
      const { w: cw, h: ch } = canvasCSSSize();
      ctx.strokeStyle = 'rgba(212,165,32,0.7)';
      ctx.lineWidth   = 3;
      ctx.setLineDash([10, 6]);
      ctx.strokeRect(2, 2, cw - 4, ch - 4);
      ctx.setLineDash([]);
    }
  }

  // Capteurs
  await drawSensors(ctx);
  updateStatusBar();
}

async function drawSensors(ctx) {
  const missionId = State.get('currentMissionId'); if (!missionId) return;
  const points = await PointDB.getByMission(missionId);
  const isCT   = State.getConfig()?.type === 'CT';

  for (const point of points) {
    if (!point.planPosition) continue;
    const { x: px, y: py } = imageToCanvas(point.planPosition.x, point.planPosition.y);

    // Couleur selon résultat
    const val   = parseFloat(point.resultats?.[isCT ? 'activite_bqm3' : 'concentration'] || '');
    const color = isNaN(val) ? '#4a9eff' : val < 300 ? '#27ae60' : val < 1000 ? '#f39c12' : '#e74c3c';

    // Ombre portée
    ctx.beginPath();
    ctx.arc(px + 2, py + 2, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fill();

    // Cercle principal
    ctx.beginPath();
    ctx.arc(px, py, 15, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 2.5;
    ctx.stroke();

    // Numéro
    const num = point.data?.num_detecteur || point.data?.num_dosimetrie || String(point.order + 1);
    ctx.fillStyle     = '#fff';
    ctx.font          = 'bold 11px sans-serif';
    ctx.textAlign     = 'center';
    ctx.textBaseline  = 'middle';
    ctx.fillText(String(num).slice(0, 5), px, py);

    // Label pièce
    const lieu = point.data?.lieu_pose || point.data?.nom_piece || '';
    if (lieu) {
      ctx.font = '10px sans-serif';
      const tw = ctx.measureText(lieu).width + 8;
      ctx.fillStyle = 'rgba(0,0,0,.78)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px - tw / 2, py + 18, tw, 16, 3);
      else ctx.rect(px - tw / 2, py + 18, tw, 16);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(lieu, px, py + 26);
    }
  }
}

// ── Barre de statut ──────────────────────────────────────────

async function updateStatusBar() {
  const bar = $('#plan-status-bar'); if (!bar) return;
  if (!_planImage) { bar.innerHTML = ''; return; }

  const missionId = State.get('currentMissionId');
  const points    = missionId ? await PointDB.getByMission(missionId) : [];
  const placed    = points.filter(p => p.planPosition).length;

  if (_locked) {
    bar.innerHTML = `<span class="status-locked">🔒 Verrouillé — ${placed} capteur(s) — Tapez sur le plan pour en ajouter</span>`;
  } else {
    bar.innerHTML = `<span class="status-nav">🔓 Navigation — ${placed} capteur(s) — Verrouillez pour placer des capteurs</span>`;
  }
}

// ── Interactions souris ───────────────────────────────────────

async function onPointerDown(e) {
  if (e.pointerType === 'touch') return; // géré par les events touch
  const pos = getCanvasPos(e);
  await handleTap(pos.x, pos.y, e);
  if (!_locked) {
    _dragging  = true;
    _dragStart = { x: pos.x - _transform.cx, y: pos.y - _transform.cy };
    e.target.style.cursor = 'grabbing';
  }
}

function onPointerMove(e) {
  if (!_dragging || _locked) return;
  const pos     = getCanvasPos(e);
  _transform.cx = pos.x - _dragStart.x;
  _transform.cy = pos.y - _dragStart.y;
  redraw();
}

function onPointerUp(e) {
  _dragging = false;
  const c = $('#plan-canvas');
  if (c) c.style.cursor = _locked ? 'crosshair' : 'grab';
}

function onWheel(e) {
  e.preventDefault();
  if (_locked) return;
  const pos = getCanvasPos(e);
  applyZoom(e.deltaY > 0 ? 0.9 : 1.1, pos.x, pos.y);
}

// ── Interactions touch ────────────────────────────────────────

function touchPos(t) {
  const rect = $('#plan-canvas').getBoundingClientRect();
  return { x: t.clientX - rect.left, y: t.clientY - rect.top };
}

function pinchMid(t1, t2) {
  const p1 = touchPos(t1), p2 = touchPos(t2);
  return {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2,
    dist: Math.hypot(p2.x - p1.x, p2.y - p1.y),
  };
}

// Détection d'un tap (vs glissé) — seuil 10 px
let _touchStartPos  = null;
let _touchStartTime = 0;

async function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const pos = touchPos(e.touches[0]);
    _touchStartPos  = pos;
    _touchStartTime = Date.now();
    _pinch   = null;
    _dragging = false;
    _dragStart = { x: pos.x - _transform.cx, y: pos.y - _transform.cy };

  } else if (e.touches.length === 2 && !_locked) {
    _dragging = false;
    const mp = pinchMid(e.touches[0], e.touches[1]);
    _pinch = {
      dist:       mp.dist,
      midX:       mp.x,
      midY:       mp.y,
      startScale: _transform.scale,
      startCx:    _transform.cx,
      startCy:    _transform.cy,
    };
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 2 && _pinch && !_locked) {
    const mp    = pinchMid(e.touches[0], e.touches[1]);
    const ratio = mp.dist / _pinch.dist;
    const ns    = Math.max(0.1, Math.min(12, _pinch.startScale * ratio));
    const sr    = ns / _pinch.startScale;
    _transform.scale = ns;
    _transform.cx = mp.x + (_pinch.startCx - _pinch.midX) * sr + (mp.x - _pinch.midX);
    _transform.cy = mp.y + (_pinch.startCy - _pinch.midY) * sr + (mp.y - _pinch.midY);
    redraw();

  } else if (e.touches.length === 1 && !_locked && _touchStartPos) {
    const pos = touchPos(e.touches[0]);
    // Seuil pour distinguer tap vs drag
    if (Math.hypot(pos.x - _touchStartPos.x, pos.y - _touchStartPos.y) > 8) {
      _dragging  = true;
      _touchStartPos = null; // annule la détection de tap
    }
    if (_dragging) {
      _transform.cx = pos.x - _dragStart.x;
      _transform.cy = pos.y - _dragStart.y;
      redraw();
    }
  }
}

async function onTouchEnd(e) {
  e.preventDefault();
  if (e.touches.length < 2) _pinch = null;
  if (e.touches.length === 0) {
    const wasDragging = _dragging;
    _dragging = false;

    // C'est un tap si pas de glissé et < 300 ms
    if (!wasDragging && _touchStartPos && Date.now() - _touchStartTime < 300) {
      await handleTap(_touchStartPos.x, _touchStartPos.y, null);
    }
    _touchStartPos = null;
  }
}

// ── Logique commune tap (souris + touch) ─────────────────────

async function handleTap(cx, cy, pointerEvent) {
  // Toujours : clic sur un capteur existant = ouvrir la fiche
  const clicked = await findPointAt(cx, cy);
  if (clicked) {
    openPointModal(clicked);
    return true;
  }
  // Mode placement (verrouillé uniquement)
  if (_locked && _planImage) {
    const imgPos = canvasToImage(cx, cy);
    await placeNewPoint(imgPos.x, imgPos.y);
    return true;
  }
  return false;
}

// ── Recherche capteur au point cliqué ────────────────────────

async function findPointAt(cx, cy) {
  const missionId = State.get('currentMissionId'); if (!missionId) return null;
  const points    = await PointDB.getByMission(missionId);
  for (const point of points) {
    if (!point.planPosition) continue;
    const { x, y } = imageToCanvas(point.planPosition.x, point.planPosition.y);
    if (Math.hypot(cx - x, cy - y) < 22) return point;
  }
  return null;
}

// ── Placer un nouveau capteur ─────────────────────────────────

async function placeNewPoint(imgX, imgY) {
  const missionId = State.get('currentMissionId'); if (!missionId) return;

  let bats = await BatimentDB.getByMission(missionId);
  if (!bats.length) bats = [await BatimentDB.create(missionId, { data: { nom: 'Bâtiment 1' } })];
  const bat = bats[0];

  let zones = await ZoneDB.getByBatiment(bat.id);
  if (!zones.length) {
    const isCT = State.getConfig()?.type === 'CT';
    zones = [await ZoneDB.create(bat.id, missionId, { data: isCT ? { nom: '1' } : { numero: '1' } })];
  }
  const zone = zones[zones.length - 1];

  const today = new Date().toISOString().slice(0, 10);
  const point = await PointDB.create(zone.id, bat.id, missionId, {
    planPosition: { x: imgX, y: imgY },
    data: { date_pose: today },
  });

  await redraw();
  openPointModal(point);
}

// ── Modal fiche capteur ───────────────────────────────────────

async function openPointModal(point) {
  const config = State.getConfig(); if (!config) return;
  const isCT = config.type === 'CT';

  const zone     = await ZoneDB.getById(point.zoneId);
  const bat      = await BatimentDB.getById(point.batimentId);
  const allBats  = await BatimentDB.getByMission(State.get('currentMissionId'));
  const allZones = await ZoneDB.getByBatiment(point.batimentId);

  const zoneKey      = isCT ? 'zcs' : 'zone_homogene';
  const zoneFields   = (config.tableau[zoneKey]?.fields || []).filter(f => f.id !== 'nom' && f.id !== 'numero');
  const terrainFields = config.tableau.point.fields.filter(f => f.phase === 'terrain');
  const num = point.data?.num_detecteur || point.data?.num_dosimetrie || `#${point.order + 1}`;

  // Options bâtiments
  const batOpts = allBats.map(b =>
    `<option value="${b.id}" ${b.id === bat?.id ? 'selected' : ''}>${b.data?.nom || 'Bât.'}</option>`
  ).join('');

  // Options zones
  const zoneOpts = allZones.map(z => {
    const label = isCT
      ? `ZCS ${z.data?.nom || ''} ${z.data?.niveau ? '— ' + z.data.niveau : ''}`
      : `Zone ${z.data?.numero || ''} ${z.data?.niveau ? '— ' + z.data.niveau : ''}`;
    return `<option value="${z.id}" ${z.id === zone?.id ? 'selected' : ''}>${label}</option>`;
  }).join('');

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'point-modal';

  modal.innerHTML = `
    <div class="modal-content plan-modal">

      <div class="plan-modal-header">
        <div class="plan-modal-badge">${isCT ? 'CT' : 'CSP'}</div>
        <h3 style="flex:1;font-size:1rem;">📍 Capteur ${num}</h3>
        <button class="btn-icon" id="modal-close-x" title="Fermer">✕</button>
      </div>

      <!-- Section Zone -->
      <details class="plan-modal-section" open>
        <summary class="plan-modal-section-title">
          ${isCT ? 'Zone à Caractéristiques Similaires (ZCS)' : 'Zone Homogène'}
        </summary>
        <div class="plan-modal-section-body">
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label">Bâtiment</label>
              <select id="modal-bat-select" class="form-input form-input-sm">${batOpts}</select>
            </div>
            <div class="form-group">
              <label class="form-label">${isCT ? 'ZCS' : 'Zone'}</label>
              <select id="modal-zone-select" class="form-input form-input-sm">${zoneOpts}</select>
            </div>
          </div>
          ${zoneFields.map(f => renderModalField(f, zone?.data?.[f.id] ?? '', 'zone-')).join('')}
        </div>
      </details>

      <!-- Section Dosimètre -->
      <details class="plan-modal-section" open>
        <summary class="plan-modal-section-title">Dosimètre / Détecteur</summary>
        <div class="plan-modal-section-body">
          ${terrainFields.map(f => renderModalField(f, point.data?.[f.id] ?? '', 'point-')).join('')}
        </div>
      </details>

      <div class="plan-modal-actions">
        <button class="btn btn-danger btn-sm" id="modal-delete">🗑</button>
        <button class="btn btn-secondary btn-sm" id="modal-cancel">Annuler</button>
        <button class="btn btn-primary btn-sm" id="modal-save">💾 Enregistrer</button>
      </div>

    </div>
  `;

  document.body.appendChild(modal);

  // Fermeture
  modal.addEventListener('click', (e) => { if (e.target === modal) closePointModal(); });
  $('#modal-close-x', modal)?.addEventListener('click', closePointModal);
  $('#modal-cancel', modal)?.addEventListener('click', closePointModal);

  // Suppression
  $('#modal-delete', modal)?.addEventListener('click', async () => {
    if (confirm('Supprimer ce capteur ?')) {
      await PointDB.delete(point.id);
      closePointModal();
      redraw();
      State.toast('Capteur supprimé', 'info');
    }
  });

  // Enregistrement
  $('#modal-save', modal)?.addEventListener('click', async () => {
    // Données zone
    const zoneData = {};
    for (const f of zoneFields) {
      const el = $(`[name="zone-${f.id}"]`, modal);
      if (el) zoneData[f.id] = el.value;
    }
    const selZoneId = $('#modal-zone-select', modal)?.value || zone?.id;
    if (selZoneId) await ZoneDB.update(selZoneId, { data: zoneData });

    // Changer de zone si nécessaire
    const selBatId = $('#modal-bat-select', modal)?.value;
    const needsMove = selZoneId !== point.zoneId || selBatId !== point.batimentId;
    const patchBase = needsMove
      ? { zoneId: selZoneId, batimentId: selBatId || point.batimentId }
      : {};

    // Données capteur
    const pointData = {};
    for (const f of terrainFields) {
      const el = $(`[name="point-${f.id}"]`, modal);
      if (el) pointData[f.id] = el.value;
    }
    await PointDB.update(point.id, { ...patchBase, data: pointData });

    closePointModal();
    redraw();
    State.toast('Capteur enregistré ✓', 'success', 1500);
  });
}

function renderModalField(field, value, prefix) {
  const name = prefix + field.id;
  let input;

  if (field.type === 'select' || field.options?.length) {
    const opts = (field.options || []).map(o =>
      `<option value="${o}" ${String(value) === String(o) ? 'selected' : ''}>${o}</option>`
    ).join('');
    input = `<select name="${name}" class="form-input form-input-sm">
               <option value="">—</option>${opts}
             </select>`;
  } else if (field.type === 'date') {
    input = `<input type="date" name="${name}" class="form-input form-input-sm" value="${value}">`;
  } else if (field.type === 'number') {
    input = `<input type="number" name="${name}" class="form-input form-input-sm"
               inputmode="decimal" step="any" value="${value}">`;
  } else {
    input = `<input type="text" name="${name}" class="form-input form-input-sm" value="${value}">`;
  }

  return `
    <div class="form-group ${field.required ? 'required' : ''}">
      <label class="form-label">${field.label}${field.required ? ' *' : ''}</label>
      ${input}
    </div>
  `;
}

function closePointModal() { $('#point-modal')?.remove(); }

// ── Chargement image ─────────────────────────────────────────

async function loadPlanImage(file) {
  const tid = State.toast('Chargement…', 'info', 15000);
  try {
    const dataUrl = file.type === 'application/pdf'
      ? await pdfToDataUrl(file)
      : await fileToDataUrl(file);

    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });

    _planImage = img;
    _transform.rotation = 0;
    $('#plan-empty')?.classList.add('hidden');

    const missionId = State.get('currentMissionId');
    if (missionId) {
      const plans = await PlanDB.getByMission(missionId);
      const d = { imageData: dataUrl, width: img.naturalWidth, height: img.naturalHeight, name: file.name };
      if (plans.length) await PlanDB.update(plans[0].id, d);
      else await PlanDB.create(missionId, d);
    }
    fitToView();
    redraw();
    State.dismissToast(tid);
    State.toast('Plan chargé ✓', 'success', 2000);
  } catch (err) {
    console.error(err);
    State.dismissToast(tid);
    State.toast('Erreur : ' + err.message, 'error', 4000);
  }
}

async function loadPlanFromDB() {
  const missionId = State.get('currentMissionId'); if (!missionId) return;
  const plans = await PlanDB.getByMission(missionId);
  if (!plans.length || !plans[0].imageData) return;
  const img = new Image();
  img.onload = () => {
    _planImage = img;
    $('#plan-empty')?.classList.add('hidden');
    fitToView(); redraw();
  };
  img.src = plans[0].imageData;
}

function fileToDataUrl(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload  = e => res(e.target.result);
    r.onerror = ()  => rej(new Error('Lecture impossible'));
    r.readAsDataURL(file);
  });
}

async function pdfToDataUrl(file) {
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src    = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }
  const pdf  = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const page = await pdf.getPage(1);
  const vp   = page.getViewport({ scale: 2.0 });
  const cv   = document.createElement('canvas');
  cv.width = vp.width; cv.height = vp.height;
  await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
  return cv.toDataURL('image/png');
}
