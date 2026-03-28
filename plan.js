// ============================================================
// terrain.js — Saisie terrain : arborescence + formulaires
// Bâtiment > Zone (ZCS/ZH) > Point de mesure
// ============================================================

import * as State from './state.js';
import { BatimentDB, ZoneDB, PointDB, MissionDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

// ── Rendu principal ─────────────────────────────────────────

export function renderTerrain() {
  const config = State.getConfig();
  if (!config) return '<p>Aucune mission chargée</p>';

  return `
    <div class="view-header">
      <button class="btn-back" id="btn-back-terrain">←</button>
      <h2>${config.label} — Terrain</h2>
    </div>
    ${renderMissionNav('terrain')}
    <div id="terrain-content" class="terrain-content">
      <div class="terrain-loading">Chargement…</div>
    </div>
  `;
}

// Appelé après renderTerrain via un MutationObserver ou setTimeout
setTimeout(() => {
  if ($('#terrain-content')) loadTerrainData();
}, 50);

// On écoute la navigation pour recharger
State.on('navigate', ({ view }) => {
  if (view === 'terrain') {
    setTimeout(loadTerrainData, 50);
  }
});

async function loadTerrainData() {
  const container = $('#terrain-content');
  if (!container) return;

  const missionId = State.get('currentMissionId');
  const config = State.getConfig();
  if (!missionId || !config) return;

  try {
    const batiments = await BatimentDB.getByMission(missionId);
    const zones     = await ZoneDB.getByMission(missionId);
    const points    = await PointDB.getByMission(missionId);

    container.innerHTML = renderTree(config, batiments, zones, points) +
      `<div class="terrain-actions">
        <button class="btn btn-primary" id="btn-add-batiment">
          + Ajouter un bâtiment
        </button>
      </div>`;

    bindTerrainEvents(config);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur : ${err.message}</p></div>`;
  }
}

// ── Arborescence ────────────────────────────────────────────

function renderTree(config, batiments, zones, points) {
  if (batiments.length === 0) {
    return `
      <div class="empty-state">
        <p>Aucun bâtiment défini</p>
        <p class="text-sm">Ajoutez un bâtiment ou placez des capteurs sur le plan</p>
      </div>
    `;
  }

  const zoneLabel = config.type === 'CT' ? 'ZCS' : 'Zone Homogène';
  const selectedBat   = State.get('currentBatimentId');
  const selectedZone  = State.get('currentZoneId');
  const selectedPoint = State.get('currentPointId');

  return batiments.map(bat => {
    const batZones = zones.filter(z => z.batimentId === bat.id);
    const isOpen = selectedBat === bat.id || batZones.some(z =>
      z.id === selectedZone || points.some(p => p.zoneId === z.id && p.id === selectedPoint)
    );

    const zonesHtml = batZones.map(zone => {
      const zonePoints = points.filter(p => p.zoneId === zone.id);
      const zoneIsOpen = selectedZone === zone.id || zonePoints.some(p => p.id === selectedPoint);

      const pointsHtml = zonePoints.map(point => {
        const isSelected = selectedPoint === point.id;
        const numDosi = point.data?.num_detecteur || point.data?.num_dosimetrie || '(sans n°)';
        const lieu = point.data?.lieu_pose || point.data?.nom_piece || '';

        return `
          <div class="tree-point ${isSelected ? 'selected' : ''}"
               data-point-id="${point.id}" data-zone-id="${zone.id}" data-bat-id="${bat.id}">
            <div class="tree-point-header" data-action="toggle-point">
              <span class="tree-icon">📍</span>
              <span class="tree-label">${numDosi}${lieu ? ' — ' + lieu : ''}</span>
              <span class="tree-chevron">${isSelected ? '▾' : '▸'}</span>
            </div>
            ${isSelected ? renderPointForm(config, point) : ''}
          </div>
        `;
      }).join('');

      const zoneName = zone.data?.nom || zone.data?.numero || `Zone ${zone.order + 1}`;

      return `
        <div class="tree-zone ${zoneIsOpen ? 'open' : ''}"
             data-zone-id="${zone.id}" data-bat-id="${bat.id}">
          <div class="tree-zone-header" data-action="toggle-zone">
            <span class="tree-icon">📦</span>
            <span class="tree-label">${zoneLabel} ${zoneName}</span>
            <span class="tree-badge">${zonePoints.length} pt${zonePoints.length > 1 ? 's' : ''}</span>
            <span class="tree-chevron">${zoneIsOpen ? '▾' : '▸'}</span>
          </div>
          <div class="tree-zone-body" ${zoneIsOpen ? '' : 'style="display:none"'}>
            ${zoneIsOpen ? renderZoneForm(config, zone) : ''}
            ${pointsHtml}
            <button class="btn btn-sm btn-add-in-tree" data-action="add-point"
              data-zone-id="${zone.id}" data-bat-id="${bat.id}">
              + Ajouter un point
            </button>
          </div>
        </div>
      `;
    }).join('');

    const batName = bat.data?.nom || `Bâtiment ${bat.order + 1}`;

    return `
      <div class="tree-batiment ${isOpen ? 'open' : ''}" data-bat-id="${bat.id}">
        <div class="tree-bat-header" data-action="toggle-bat">
          <span class="tree-icon">🏢</span>
          <span class="tree-label">${batName}</span>
          <span class="tree-badge">${batZones.length} zone${batZones.length > 1 ? 's' : ''}</span>
          <span class="tree-chevron">${isOpen ? '▾' : '▸'}</span>
          <button class="btn-icon btn-delete-tree" data-action="delete-bat" data-bat-id="${bat.id}"
            title="Supprimer">🗑</button>
        </div>
        <div class="tree-bat-body" ${isOpen ? '' : 'style="display:none"'}>
          ${isOpen ? renderBatimentForm(config, bat) : ''}
          ${zonesHtml}
          <button class="btn btn-sm btn-add-in-tree" data-action="add-zone"
            data-bat-id="${bat.id}">
            + Ajouter une ${config.type === 'CT' ? 'ZCS' : 'zone homogène'}
          </button>
        </div>
      </div>
    `;
  }).join('');
}

// ── Formulaires inline ──────────────────────────────────────

function renderBatimentForm(config, bat) {
  const fields = config.tableau.batiment.fields;
  return `
    <div class="inline-form" data-form-type="batiment" data-id="${bat.id}">
      ${fields.map(f => renderInlineField(f, bat.data?.[f.id])).join('')}
      <button class="btn btn-sm btn-save-inline" data-action="save-bat" data-id="${bat.id}">
        💾 Enregistrer
      </button>
    </div>
  `;
}

function renderZoneForm(config, zone) {
  const zoneKey = config.type === 'CT' ? 'zcs' : 'zone_homogene';
  const fields = config.tableau[zoneKey].fields;
  return `
    <div class="inline-form" data-form-type="zone" data-id="${zone.id}">
      ${fields.map(f => renderInlineField(f, zone.data?.[f.id])).join('')}
      <button class="btn btn-sm btn-save-inline" data-action="save-zone" data-id="${zone.id}">
        💾 Enregistrer
      </button>
    </div>
  `;
}

function renderPointForm(config, point) {
  const fields = config.tableau.point.fields.filter(f => f.phase === 'terrain');
  return `
    <div class="inline-form" data-form-type="point" data-id="${point.id}">
      ${fields.map(f => renderInlineField(f, point.data?.[f.id])).join('')}
      <div class="inline-form-actions">
        <button class="btn btn-sm btn-save-inline" data-action="save-point" data-id="${point.id}">
          💾 Enregistrer
        </button>
        <button class="btn btn-sm btn-danger" data-action="delete-point" data-id="${point.id}">
          🗑 Supprimer
        </button>
      </div>
    </div>
  `;
}

function renderInlineField(field, value) {
  let input = '';
  const val = value !== undefined && value !== null ? value : (field.default ?? '');

  if (field.type === 'select') {
    const opts = (field.options || []).map(o => {
      const selected = String(val) === String(o) ? 'selected' : '';
      return `<option value="${o}" ${selected}>${o}</option>`;
    }).join('');
    input = `
      <select name="${field.id}" class="form-input" ${field.required ? 'required' : ''}>
        <option value="">— Choisir —</option>
        ${opts}
      </select>`;
  } else if (field.type === 'date') {
    input = `<input type="date" name="${field.id}" class="form-input" value="${val}"
      ${field.required ? 'required' : ''}>`;
  } else if (field.type === 'number') {
    input = `<input type="number" name="${field.id}" class="form-input" inputmode="numeric"
      step="any" value="${val}" ${field.required ? 'required' : ''}>`;
  } else {
    input = `<input type="text" name="${field.id}" class="form-input" value="${val}"
      ${field.required ? 'required' : ''}>`;
  }

  return `
    <div class="form-group-inline ${field.required ? 'required' : ''}">
      <label class="form-label-inline">${field.label}</label>
      ${input}
    </div>
  `;
}

// ── Events ──────────────────────────────────────────────────

function bindTerrainEvents(config) {
  const container = $('#terrain-content');
  if (!container) return;

  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;

    const action = btn.dataset.action;
    const missionId = State.get('currentMissionId');

    switch (action) {
      case 'toggle-bat': {
        const batEl = btn.closest('.tree-batiment');
        const batId = batEl?.dataset.batId;
        if (State.get('currentBatimentId') === batId) {
          State.selectBatiment(null);
        } else {
          State.selectBatiment(batId);
        }
        loadTerrainData();
        break;
      }

      case 'toggle-zone': {
        const zoneEl = btn.closest('.tree-zone');
        const zoneId = zoneEl?.dataset.zoneId;
        const batId = zoneEl?.dataset.batId;
        State.selectBatiment(batId);
        if (State.get('currentZoneId') === zoneId) {
          State.selectZone(null);
        } else {
          State.selectZone(zoneId);
        }
        loadTerrainData();
        break;
      }

      case 'toggle-point': {
        const pointEl = btn.closest('.tree-point');
        const pointId = pointEl?.dataset.pointId;
        const zoneId = pointEl?.dataset.zoneId;
        const batId = pointEl?.dataset.batId;
        State.selectBatiment(batId);
        State.selectZone(zoneId);
        if (State.get('currentPointId') === pointId) {
          State.selectPoint(null);
        } else {
          State.selectPoint(pointId);
        }
        loadTerrainData();
        break;
      }

      case 'save-bat': {
        const form = btn.closest('.inline-form');
        const batId = btn.dataset.id;
        const data = extractFormData(form);
        await BatimentDB.update(batId, { data });
        State.toast('Bâtiment enregistré', 'success', 1500);
        break;
      }

      case 'save-zone': {
        const form = btn.closest('.inline-form');
        const zoneId = btn.dataset.id;
        const data = extractFormData(form);
        await ZoneDB.update(zoneId, { data });
        State.toast('Zone enregistrée', 'success', 1500);
        break;
      }

      case 'save-point': {
        const form = btn.closest('.inline-form');
        const pointId = btn.dataset.id;
        const data = extractFormData(form);
        await PointDB.update(pointId, { data });
        State.toast('Point enregistré', 'success', 1500);
        break;
      }

      case 'delete-bat': {
        const batId = btn.dataset.batId;
        if (confirm('Supprimer ce bâtiment et toutes ses zones/points ?')) {
          await BatimentDB.delete(batId);
          State.selectBatiment(null);
          State.toast('Bâtiment supprimé', 'info');
          loadTerrainData();
        }
        break;
      }

      case 'delete-point': {
        const pointId = btn.dataset.id;
        if (confirm('Supprimer ce point de mesure ?')) {
          await PointDB.delete(pointId);
          State.selectPoint(null);
          State.toast('Point supprimé', 'info');
          loadTerrainData();
        }
        break;
      }

      case 'add-zone': {
        const batId = btn.dataset.batId;
        const zones = await ZoneDB.getByBatiment(batId);
        const num = String(zones.length + 1);
        const zoneData = config.type === 'CT' ? { nom: num } : { numero: num };
        const zone = await ZoneDB.create(batId, missionId, { data: zoneData });
        State.selectBatiment(batId);
        State.selectZone(zone.id);
        State.toast('Zone ajoutée', 'success', 1500);
        loadTerrainData();
        break;
      }

      case 'add-point': {
        const zoneId = btn.dataset.zoneId;
        const batId = btn.dataset.batId;
        const point = await PointDB.create(zoneId, batId, missionId);
        State.selectBatiment(batId);
        State.selectZone(zoneId);
        State.selectPoint(point.id);
        State.toast('Point ajouté', 'success', 1500);
        loadTerrainData();
        break;
      }
    }
  });

  // Bouton ajouter bâtiment
  $('#btn-add-batiment')?.addEventListener('click', async () => {
    const missionId = State.get('currentMissionId');
    const bats = await BatimentDB.getByMission(missionId);
    const bat = await BatimentDB.create(missionId, {
      data: { nom: `Bâtiment ${bats.length + 1}` }
    });
    State.selectBatiment(bat.id);
    State.toast('Bâtiment ajouté', 'success', 1500);
    loadTerrainData();
  });

  // Bouton retour
  $('#btn-back-terrain')?.addEventListener('click', () => {
    State.clearMission();
    State.navigate('home');
  });

  // Nav tabs
  $$('.mission-nav-tab', container.parentElement).forEach(tab => {
    tab.addEventListener('click', () => State.navigate(tab.dataset.navView));
  });
}

function extractFormData(formEl) {
  const data = {};
  if (!formEl) return data;
  const inputs = formEl.querySelectorAll('input, select, textarea');
  inputs.forEach(input => {
    if (input.name && input.value !== '') {
      data[input.name] = input.value;
    }
  });
  return data;
}

// ── Helper pour le nav (réutilisé) ──────────────────────────

function renderMissionNav(activeId) {
  const views = [
    { id: 'entree',    label: 'Entrée',    icon: '📝' },
    { id: 'plan',      label: 'Plan',       icon: '🗺' },
    { id: 'terrain',   label: 'Terrain',    icon: '📍' },
    { id: 'resultats', label: 'Résultats',  icon: '📊' },
    { id: 'export',    label: 'Export',      icon: '📤' },
  ];

  return `
    <nav class="mission-nav">
      ${views.map(v => `
        <button class="mission-nav-tab ${v.id === activeId ? 'active' : ''}"
          data-nav-view="${v.id}">
          <span class="nav-icon">${v.icon}</span>
          <span class="nav-label">${v.label}</span>
        </button>
      `).join('')}
    </nav>
  `;
}
