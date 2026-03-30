// ============================================================
// plan.js — Vue Plan interactif
// Charger un plan, placer des capteurs, cliquer pour ouvrir la fiche
// ============================================================

import * as State from './state.js';
import { PlanDB, PointDB, ZoneDB, BatimentDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

let _planImage = null;    // Image object chargée
let _transform = { x: 0, y: 0, scale: 1 };
let _dragging = false;
let _dragStart = { x: 0, y: 0 };
let _placeMode = false;

// ── Rendu HTML ───────────────────────────────────────────

export function renderPlan() {
  const config = State.getConfig();
  if (!config) return '<p>Aucune mission chargée</p>';

  return `
    <div class="plan-toolbar">
      <label class="btn btn-sm btn-secondary" for="plan-file-input" style="cursor:pointer;margin:0;">
        📷 Charger plan
      </label>
      <input type="file" id="plan-file-input" accept="image/*,application/pdf" style="display:none">
      <button class="btn btn-sm btn-secondary" id="btn-place-mode">📌 Placer capteur</button>
      <span id="plan-info" class="plan-info" style="flex:1;text-align:right;font-size:.78rem;color:var(--text-dim)"></span>
      <div class="plan-zoom">
        <button class="btn-icon" id="btn-zoom-in" title="Zoom +">+</button>
        <button class="btn-icon" id="btn-zoom-reset" title="Réinitialiser">⟲</button>
        <button class="btn-icon" id="btn-zoom-out" title="Zoom −">−</button>
      </div>
    </div>
    <div class="plan-canvas-wrap" id="plan-canvas-wrap">
      <canvas id="plan-canvas"></canvas>
      <div class="plan-empty" id="plan-empty">
        <div class="plan-empty-icon">📐</div>
        <div>Aucun plan chargé</div>
        <div class="text-sm">Cliquez « Charger plan » pour importer une image</div>
      </div>
    </div>
  `;
}

// ── Initialisation après rendu ──────────────────────────

export function initPlan() {
  setTimeout(() => {
    resizeCanvas();
    bindPlanEvents();
    loadPlanFromDB();
  }, 50);
}

function bindPlanEvents() {
  const canvas = $('#plan-canvas');
  const wrap = $('#plan-canvas-wrap');
  if (!canvas || !wrap) return;

  // Retour
  $('#btn-back-plan')?.addEventListener('click', () => {
    State.clearMission();
    State.navigate('home');
  });

  // Tabs navigation
  $$('.mission-nav-tab').forEach(tab => {
    tab.addEventListener('click', () => State.navigate(tab.dataset.navView));
  });

  // Charger un plan (image ou PDF)
  $('#plan-file-input')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Réinitialiser l'input pour permettre de recharger le même fichier
    e.target.value = '';
    await loadPlanImage(file);
  });

  // Mode placement
  $('#btn-place-mode')?.addEventListener('click', () => {
    _placeMode = !_placeMode;
    const btn = $('#btn-place-mode');
    btn.classList.toggle('active', _placeMode);
    btn.textContent = _placeMode ? '✋ Annuler placement' : '📌 Placer capteur';
    canvas.style.cursor = _placeMode ? 'crosshair' : 'grab';
  });

  // Zoom
  $('#btn-zoom-in')?.addEventListener('click', () => { _transform.scale *= 1.3; redraw(); });
  $('#btn-zoom-out')?.addEventListener('click', () => { _transform.scale /= 1.3; redraw(); });
  $('#btn-zoom-reset')?.addEventListener('click', () => { fitToView(); redraw(); });

  // Canvas interactions
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Touch-friendly
  canvas.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

  // Resize
  const ro = new ResizeObserver(() => {
    resizeCanvas();
    redraw();
  });
  ro.observe(wrap);
}

// ── Charger l'image du plan ─────────────────────────────

async function loadPlanImage(file) {
  State.toast('Chargement du plan…', 'info', 0);

  try {
    let dataUrl;

    if (file.type === 'application/pdf') {
      dataUrl = await pdfToDataUrl(file);
    } else {
      dataUrl = await fileToDataUrl(file);
    }

    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Image invalide'));
      img.src = dataUrl;
    });

    _planImage = img;
    $('#plan-empty')?.classList.add('hidden');

    // Sauvegarder dans IndexedDB
    const missionId = State.get('currentMissionId');
    if (missionId) {
      const plans = await PlanDB.getByMission(missionId);
      const planData = {
        imageData: dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        name: file.name,
      };
      if (plans.length > 0) {
        await PlanDB.update(plans[0].id, planData);
      } else {
        await PlanDB.create(missionId, planData);
      }
    }

    fitToView();
    redraw();
    State.toast('Plan chargé ✓', 'success', 2000);
  } catch (err) {
    console.error('loadPlanImage:', err);
    State.toast('Erreur : ' + err.message, 'error', 3000);
  }
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Lecture fichier impossible'));
    reader.readAsDataURL(file);
  });
}

async function pdfToDataUrl(file) {
  // Chargement dynamique de pdf.js
  if (!window.pdfjsLib) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('pdf.js non disponible'));
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2.0 }); // résolution x2 pour la qualité
  const canvas = document.createElement('canvas');
  canvas.width  = viewport.width;
  canvas.height = viewport.height;

  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
  return canvas.toDataURL('image/png');
}

async function loadPlanFromDB() {
  const missionId = State.get('currentMissionId');
  if (!missionId) return;

  const plans = await PlanDB.getByMission(missionId);
  if (plans.length === 0 || !plans[0].imageData) return;

  const plan = plans[0];
  const img = new Image();
  img.onload = () => {
    _planImage = img;
    $('#plan-empty')?.classList.add('hidden');
    fitToView();
    redraw();
  };
  img.src = plan.imageData;
}

// ── Canvas sizing ───────────────────────────────────────

function resizeCanvas() {
  const canvas = $('#plan-canvas');
  const wrap = $('#plan-canvas-wrap');
  if (!canvas || !wrap) return;

  const rect = wrap.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
}

function fitToView() {
  const canvas = $('#plan-canvas');
  if (!canvas || !_planImage) return;

  const cw = canvas.width / window.devicePixelRatio;
  const ch = canvas.height / window.devicePixelRatio;
  const iw = _planImage.naturalWidth;
  const ih = _planImage.naturalHeight;

  const scale = Math.min(cw / iw, ch / ih) * 0.9;
  _transform.scale = scale;
  _transform.x = (cw - iw * scale) / 2;
  _transform.y = (ch - ih * scale) / 2;
}

// ── Dessin ──────────────────────────────────────────────

async function redraw() {
  const canvas = $('#plan-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!_planImage) return;

  // Dessiner l'image
  ctx.save();
  ctx.translate(_transform.x, _transform.y);
  ctx.scale(_transform.scale, _transform.scale);
  ctx.drawImage(_planImage, 0, 0);
  ctx.restore();

  // Dessiner les points de mesure
  const missionId = State.get('currentMissionId');
  if (!missionId) return;

  const points = await PointDB.getByMission(missionId);
  const config = State.getConfig();
  const isCT = config?.type === 'CT';

  for (const point of points) {
    if (!point.planPosition) continue;

    const px = _transform.x + point.planPosition.x * _transform.scale;
    const py = _transform.y + point.planPosition.y * _transform.scale;

    // Couleur selon résultat
    const valKey = isCT ? 'activite_bqm3' : 'concentration';
    const val = parseFloat(point.resultats?.[valKey] || '');
    let color = '#4a9eff'; // bleu par défaut
    if (!isNaN(val)) {
      if (val < 300) color = '#27ae60';
      else if (val < 1000) color = '#f39c12';
      else color = '#e74c3c';
    }

    // Cercle
    ctx.beginPath();
    ctx.arc(px, py, 14, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Numéro
    const num = point.data?.num_detecteur || point.data?.num_dosimetrie || (point.order + 1);
    const label = String(num).slice(-4);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, px, py);

    // Nom de la pièce en dessous
    const lieu = point.data?.lieu_pose || point.data?.nom_piece || '';
    if (lieu) {
      ctx.fillStyle = 'rgba(0,0,0,.7)';
      const tw = ctx.measureText(lieu).width + 8;
      ctx.fillRect(px - tw / 2, py + 16, tw, 16);
      ctx.fillStyle = '#fff';
      ctx.font = '10px sans-serif';
      ctx.fillText(lieu, px, py + 24);
    }
  }

  // Info
  const info = $('#plan-info');
  if (info) {
    const placedCount = points.filter(p => p.planPosition).length;
    info.textContent = `${placedCount} / ${points.length} capteur(s) placé(s)`;
  }
}

// ── Interaction souris / touch ──────────────────────────

function getCanvasPos(e) {
  const canvas = $('#plan-canvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
  };
}

function canvasToImage(cx, cy) {
  return {
    x: (cx - _transform.x) / _transform.scale,
    y: (cy - _transform.y) / _transform.scale,
  };
}

async function onPointerDown(e) {
  const pos = getCanvasPos(e);

  if (_placeMode && _planImage) {
    // Placer un nouveau capteur
    const imgPos = canvasToImage(pos.x, pos.y);
    await placeNewPoint(imgPos.x, imgPos.y);
    return;
  }

  // Vérifier si on clique sur un point existant
  const clicked = await findPointAt(pos.x, pos.y);
  if (clicked) {
    openPointModal(clicked);
    return;
  }

  // Sinon, démarrer le déplacement
  _dragging = true;
  _dragStart = { x: pos.x - _transform.x, y: pos.y - _transform.y };
  e.target.style.cursor = 'grabbing';
}

function onPointerMove(e) {
  if (!_dragging) return;
  const pos = getCanvasPos(e);
  _transform.x = pos.x - _dragStart.x;
  _transform.y = pos.y - _dragStart.y;
  redraw();
}

function onPointerUp(e) {
  _dragging = false;
  e.target.style.cursor = _placeMode ? 'crosshair' : 'grab';
}

function onWheel(e) {
  e.preventDefault();
  const pos = getCanvasPos(e);
  const delta = e.deltaY > 0 ? 0.9 : 1.1;

  // Zoom centré sur le curseur
  const oldScale = _transform.scale;
  _transform.scale *= delta;
  _transform.scale = Math.max(0.1, Math.min(10, _transform.scale));

  const ratio = _transform.scale / oldScale;
  _transform.x = pos.x - (pos.x - _transform.x) * ratio;
  _transform.y = pos.y - (pos.y - _transform.y) * ratio;

  redraw();
}

// ── Actions plan ───────────────────────────────────────

async function findPointAt(cx, cy) {
  const missionId = State.get('currentMissionId');
  if (!missionId) return null;

  const points = await PointDB.getByMission(missionId);
  const hitRadius = 18;

  for (const point of points) {
    if (!point.planPosition) continue;
    const px = _transform.x + point.planPosition.x * _transform.scale;
    const py = _transform.y + point.planPosition.y * _transform.scale;
    const dist = Math.sqrt((cx - px) ** 2 + (cy - py) ** 2);
    if (dist < hitRadius) return point;
  }
  return null;
}

async function placeNewPoint(imgX, imgY) {
  const missionId = State.get('currentMissionId');
  if (!missionId) return;

  // S'assurer qu'il y a au moins un bâtiment et une zone
  let batiments = await BatimentDB.getByMission(missionId);
  if (batiments.length === 0) {
    const bat = await BatimentDB.create(missionId, { data: { nom: 'Bâtiment 1' } });
    batiments = [bat];
  }
  const bat = batiments[0];

  let zones = await ZoneDB.getByBatiment(bat.id);
  if (zones.length === 0) {
    const config = State.getConfig();
    const isCT = config?.type === 'CT';
    const zone = await ZoneDB.create(bat.id, missionId, {
      data: isCT ? { nom: '1' } : { numero: '1' },
    });
    zones = [zone];
  }
  const zone = zones[zones.length - 1]; // Dernière zone

  // Créer le point
  const point = await PointDB.create(zone.id, bat.id, missionId, {
    planPosition: { x: imgX, y: imgY },
  });

  // Ouvrir le formulaire
  openPointModal(point);

  _placeMode = false;
  const btn = $('#btn-place-mode');
  if (btn) {
    btn.classList.remove('active');
    btn.textContent = '📌 Placer capteur';
  }
  const canvas = $('#plan-canvas');
  if (canvas) canvas.style.cursor = 'grab';

  redraw();
  State.toast('Capteur placé — remplissez la fiche', 'info', 2000);
}

// ── Modal point de mesure ──────────────────────────────

async function openPointModal(point) {
  const config = State.getConfig();
  if (!config) return;

  const isCT = config.type === 'CT';

  // Récupérer zone et bâtiment
  const zone = await ZoneDB.getById(point.zoneId);
  const bat = await BatimentDB.getById(point.batimentId);
  const allZones = await ZoneDB.getByBatiment(point.batimentId);
  const allBats = await BatimentDB.getByMission(State.get('currentMissionId'));

  // Champs terrain
  const terrainFields = config.tableau.point.fields.filter(f => f.phase === 'terrain');

  // Champs zone
  const zoneKey = isCT ? 'zcs' : 'zone_homogene';
  const zoneFields = config.tableau[zoneKey]?.fields || [];

  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.id = 'point-modal';

  // Générer le HTML des champs zone
  const zoneFieldsHtml = zoneFields.map(f => {
    const val = zone?.data?.[f.id] ?? '';
    return renderModalField(f, val, 'zone-');
  }).join('');

  // Générer le HTML des champs point
  const pointFieldsHtml = terrainFields.map(f => {
    const val = point.data?.[f.id] ?? '';
    return renderModalField(f, val, 'point-');
  }).join('');

  modal.innerHTML = `
    <div class="modal-content" style="max-width:500px;max-height:90dvh;">
      <h3>📍 Point de mesure</h3>

      <div class="form-section-title" style="padding:0 0 8px;border:none;font-size:.82rem;">
        ${isCT ? 'Zone à Caractéristiques Similaires (ZCS)' : 'Zone Homogène (ZH)'}
      </div>
      ${zoneFieldsHtml}

      <div class="form-section-title" style="padding:12px 0 8px;border:none;font-size:.82rem;">
        Pièce instrumentée / Dosimètre
      </div>
      ${pointFieldsHtml}

      <div class="modal-actions">
        <button class="btn btn-danger" id="modal-delete">🗑</button>
        <button class="btn btn-secondary" id="modal-cancel">Annuler</button>
        <button class="btn btn-primary" id="modal-save">💾 Enregistrer</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Fermer
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePointModal();
  });
  $('#modal-cancel', modal).addEventListener('click', closePointModal);

  // Supprimer
  $('#modal-delete', modal).addEventListener('click', async () => {
    if (confirm('Supprimer ce point de mesure ?')) {
      await PointDB.delete(point.id);
      closePointModal();
      redraw();
      State.toast('Point supprimé', 'info');
    }
  });

  // Enregistrer
  $('#modal-save', modal).addEventListener('click', async () => {
    // Données zone
    const zoneData = {};
    for (const f of zoneFields) {
      const input = $(`[name="zone-${f.id}"]`, modal);
      if (input && input.value !== '') zoneData[f.id] = input.value;
    }
    if (Object.keys(zoneData).length > 0 && zone) {
      await ZoneDB.update(zone.id, { data: zoneData });
    }

    // Données point
    const pointData = {};
    for (const f of terrainFields) {
      const input = $(`[name="point-${f.id}"]`, modal);
      if (input && input.value !== '') pointData[f.id] = input.value;
    }
    await PointDB.update(point.id, { data: pointData });

    closePointModal();
    redraw();
    State.toast('Point enregistré', 'success', 1500);
  });
}

function renderModalField(field, value, prefix) {
  let input = '';
  const name = prefix + field.id;

  if (field.type === 'select') {
    const opts = (field.options || []).map(o => {
      const sel = String(value) === String(o) ? 'selected' : '';
      return `<option value="${o}" ${sel}>${o}</option>`;
    }).join('');
    input = `<select name="${name}" class="form-input form-input-sm"><option value="">—</option>${opts}</select>`;
  } else if (field.type === 'date') {
    input = `<input type="date" name="${name}" class="form-input form-input-sm" value="${value}">`;
  } else if (field.type === 'number') {
    input = `<input type="number" name="${name}" class="form-input form-input-sm" inputmode="numeric" step="any" value="${value}">`;
  } else {
    input = `<input type="${field.type || 'text'}" name="${name}" class="form-input form-input-sm" value="${value}">`;
  }

  return `
    <div class="form-group ${field.required ? 'required' : ''}" style="margin-bottom:8px;">
      <label class="form-label" style="font-size:.72rem;">${field.label}</label>
      ${input}
    </div>
  `;
}

function closePointModal() {
  const modal = $('#point-modal');
  if (modal) modal.remove();
}
