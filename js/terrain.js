// ============================================================
// terrain.js — Vue Terrain (arborescence Bâtiment > Zone > Point)
// Ajout / édition / suppression des éléments de mesure
// ============================================================

import * as State from './state.js';
import { BatimentDB, ZoneDB, PointDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

// ── Rendu principal ─────────────────────────────────────

export function renderTerrain() {
  const config = State.getConfig();
  if (!config) return '<p>Aucune mission chargée</p>';

  return `
    <div class="view-header">
      <button class="btn-back" id="btn-back-terrain">←</button>
      <h2>${config.label} — Terrain</h2>
    </div>
    ${renderTerrainNav('terrain')}
    <div id="terrain-content" class="terrain-content">
      <div class="terrain-loading">Chargement…</div>
    </div>
  `;
}

// Charger après rendu
State.on('navigate', ({ view }) => {
  if (view === 'terrain') setTimeout(loadTerrain, 50);
});
setTimeout(() => {
  if ($('#terrain-content')) loadTerrain();
}, 50);

async function loadTerrain() {
  const container = $('#terrain-content');
  if (!container) return;

  const missionId = State.get('currentMissionId');
  const config = State.getConfig();
  if (!missionId || !config) return;

  try {
    const batiments = await BatimentDB.getByMission(missionId);
    const zones     = await ZoneDB.getByMission(missionId);
    const points    = await PointDB.getByMission(missionId);

    container.innerHTML = renderTree(config, batiments, zones, points) + `
      <div class="terrain-actions">
        <button class="btn btn-primary btn-block" id="btn-add-batiment">
          + Ajouter un bâtiment
        </button>
      </div>
    `;

    bindTerrainEvents(config);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur : ${err.message}</p></div>`;
  }
}

// ── Arborescence ────────────────────────────────────────

function renderTree(config, batiments, zones, points) {
  const isCT = config.type === 'CT';

  if (batiments.length === 0) {
    return `
      <div class="empty-state">
        <p>Aucun bâtiment défini</p>
        <p class="text-sm">Ajoutez un bâtiment pour commencer la saisie terrain</p>
      </div>`;
  }

  return batiments.map(bat => {
    const batZones = zones.filter(z => z.batimentId === bat.id);
    const batPointCount = points.filter(p => p.batimentId === bat.id).length;
    const batName = bat.data?.nom || 'Bâtiment';

    const zonesHtml = batZones.map(zone => {
      const zonePoints = points.filter(p => p.zoneId === zone.id);
      const zoneName = isCT
        ? `ZCS ${zone.data?.nom || '?'}`
        : `ZH ${zone.data?.numero || '?'}`;

      const pointsHtml = zonePoints.map(point => {
        const lieu = point.data?.lieu_pose || point.data?.nom_piece || '—';
        const numDosi = point.data?.num_detecteur || point.data?.num_dosimetrie || '—';

        // Couleur résultat
        const valKey = isCT ? 'activite_bqm3' : 'concentration';
        const val = parseFloat(point.resultats?.[valKey] || '');
        let colorStyle = '';
        if (!isNaN(val)) {
          if (val < 300)       colorStyle = 'border-left-color: var(--success);';
          else if (val < 1000) colorStyle = 'border-left-color: var(--warning);';
          else                 colorStyle = 'border-left-color: var(--danger);';
        }

        return `
          <div class="tree-point" data-point-id="${point.id}" style="${colorStyle}">
            <div class="tree-point-header">
              <span class="tree-icon">📍</span>
              <span class="tree-label">${lieu}</span>
              <span class="tree-badge">N°${numDosi}</span>
              <button class="btn-icon btn-delete-tree btn-delete-point" title="Supprimer">✕</button>
            </div>
            <div class="tree-point-body" id="point-body-${point.id}" style="display:none;padding:8px 12px;">
              ${renderPointForm(config, point)}
            </div>
          </div>`;
      }).join('');

      return `
        <div class="tree-zone" data-zone-id="${zone.id}">
          <div class="tree-zone-header">
            <span class="tree-icon">${isCT ? '🔲' : '🏠'}</span>
            <span class="tree-label">${zoneName}</span>
            <span class="tree-badge">${zonePoints.length} pt(s)</span>
            <button class="btn-icon btn-delete-tree btn-delete-zone" title="Supprimer">✕</button>
            <span class="tree-chevron">▾</span>
          </div>
          <div class="tree-zone-body" id="zone-body-${zone.id}">
            ${renderZoneForm(config, zone)}
            ${pointsHtml}
            <button class="btn btn-sm btn-add-in-tree btn-add-point"
              data-zone-id="${zone.id}" data-bat-id="${bat.id}">
              + Ajouter un point de mesure
            </button>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="tree-batiment" data-bat-id="${bat.id}">
        <div class="tree-bat-header">
          <span class="tree-icon">🏢</span>
          <span class="tree-label">${batName}</span>
          <span class="tree-badge">${batPointCount} capteur(s)</span>
          <button class="btn-icon btn-delete-tree btn-delete-bat" title="Supprimer">✕</button>
          <span class="tree-chevron">▾</span>
        </div>
        <div class="tree-bat-body" id="bat-body-${bat.id}">
          ${renderBatForm(config, bat)}
          ${zonesHtml}
          <button class="btn btn-sm btn-add-in-tree btn-add-zone" data-bat-id="${bat.id}">
            + Ajouter une ${isCT ? 'ZCS' : 'Zone Homogène'}
          </button>
        </div>
      </div>`;
  }).join('');
}

// ── Formulaires inline ─────────────────────────────────

function renderBatForm(config, bat) {
  const fields = config.tableau.batiment.fields;
  const fieldsHtml = fields.map(f => {
    const val = bat.data?.[f.id] ?? '';
    return renderInlineField(f, val, `bat-${bat.id}-`);
  }).join('');

  return `
    <div class="inline-form" data-bat-id="${bat.id}">
      ${fieldsHtml}
      <div class="inline-form-actions">
        <button class="btn btn-sm btn-primary btn-save-bat" data-bat-id="${bat.id}">💾 Sauver</button>
      </div>
    </div>
  `;
}

function renderZoneForm(config, zone) {
  const isCT = config.type === 'CT';
  const zoneKey = isCT ? 'zcs' : 'zone_homogene';
  const fields = config.tableau[zoneKey]?.fields || [];
  const fieldsHtml = fields.map(f => {
    const val = zone.data?.[f.id] ?? '';
    return renderInlineField(f, val, `zone-${zone.id}-`);
  }).join('');

  return `
    <div class="inline-form" data-zone-id="${zone.id}">
      ${fieldsHtml}
      <div class="inline-form-actions">
        <button class="btn btn-sm btn-primary btn-save-zone" data-zone-id="${zone.id}">💾 Sauver</button>
      </div>
    </div>
  `;
}

function renderPointForm(config, point) {
  const terrainFields = config.tableau.point.fields.filter(f => f.phase === 'terrain');
  const fieldsHtml = terrainFields.map(f => {
    const val = point.data?.[f.id] ?? '';
    return renderInlineField(f, val, `point-${point.id}-`);
  }).join('');

  return `
    <div class="inline-form" data-point-id="${point.id}">
      ${fieldsHtml}
      <div class="inline-form-actions">
        <button class="btn btn-sm btn-primary btn-save-point" data-point-id="${point.id}">💾 Sauver</button>
      </div>
    </div>
  `;
}

function renderInlineField(field, value, prefix) {
  const name = prefix + field.id;
  let input = '';

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
    input = `<input type="${field.type || 'text'}" name="${name}" class="form-input form-input-sm" value="${value || ''}">`;
  }

  return `
    <div class="form-group-inline ${field.required ? 'required' : ''}">
      <label class="form-label-inline">${field.label}</label>
      ${input}
    </div>
  `;
}

// ── Events ─────────────────────────────────────────────

function bindTerrainEvents(config) {
  const isCT = config.type === 'CT';
  const missionId = State.get('currentMissionId');

  // Retour
  $('#btn-back-terrain')?.addEventListener('click', () => {
    State.clearMission();
    State.navigate('home');
  });

  // Tabs navigation
  $$('.mission-nav-tab').forEach(tab => {
    tab.addEventListener('click', () => State.navigate(tab.dataset.navView));
  });

  // Toggle sections (bâtiment / zone / point)
  $$('.tree-bat-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-tree')) return;
      const body = header.nextElementSibling;
      body.style.display = body.style.display === 'none' ? '' : 'none';
      const chevron = header.querySelector('.tree-chevron');
      if (chevron) chevron.textContent = body.style.display === 'none' ? '▸' : '▾';
    });
  });

  $$('.tree-zone-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-tree')) return;
      const body = header.nextElementSibling;
      body.style.display = body.style.display === 'none' ? '' : 'none';
      const chevron = header.querySelector('.tree-chevron');
      if (chevron) chevron.textContent = body.style.display === 'none' ? '▸' : '▾';
    });
  });

  $$('.tree-point-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-tree')) return;
      const pointId = header.closest('.tree-point').dataset.pointId;
      const body = $(`#point-body-${pointId}`);
      if (body) body.style.display = body.style.display === 'none' ? '' : 'none';
    });
  });

  // Ajouter bâtiment
  $('#btn-add-batiment')?.addEventListener('click', async () => {
    const bats = await BatimentDB.getByMission(missionId);
    await BatimentDB.create(missionId, {
      data: { nom: `Bâtiment ${bats.length + 1}` },
    });
    State.toast('Bâtiment ajouté', 'success', 1500);
    loadTerrain();
  });

  // Ajouter zone
  $$('.btn-add-zone').forEach(btn => {
    btn.addEventListener('click', async () => {
      const batId = btn.dataset.batId;
      const zones = await ZoneDB.getByBatiment(batId);
      const num = zones.length + 1;
      await ZoneDB.create(batId, missionId, {
        data: isCT ? { nom: String(num) } : { numero: String(num) },
      });
      State.toast(`${isCT ? 'ZCS' : 'ZH'} ${num} ajoutée`, 'success', 1500);
      loadTerrain();
    });
  });

  // Ajouter point
  $$('.btn-add-point').forEach(btn => {
    btn.addEventListener('click', async () => {
      const zoneId = btn.dataset.zoneId;
      const batId = btn.dataset.batId;
      await PointDB.create(zoneId, batId, missionId);
      State.toast('Point ajouté', 'success', 1500);
      loadTerrain();
    });
  });

  // Supprimer bâtiment
  $$('.btn-delete-bat').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const batId = btn.closest('.tree-batiment').dataset.batId;
      if (confirm('Supprimer ce bâtiment et tout son contenu ?')) {
        await BatimentDB.delete(batId);
        State.toast('Bâtiment supprimé', 'info');
        loadTerrain();
      }
    });
  });

  // Supprimer zone
  $$('.btn-delete-zone').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const zoneId = btn.closest('.tree-zone').dataset.zoneId;
      if (confirm('Supprimer cette zone et ses points ?')) {
        await ZoneDB.delete(zoneId);
        State.toast('Zone supprimée', 'info');
        loadTerrain();
      }
    });
  });

  // Supprimer point
  $$('.btn-delete-point').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const pointId = btn.closest('.tree-point').dataset.pointId;
      if (confirm('Supprimer ce point ?')) {
        await PointDB.delete(pointId);
        State.toast('Point supprimé', 'info');
        loadTerrain();
      }
    });
  });

  // Sauvegarder bâtiment
  $$('.btn-save-bat').forEach(btn => {
    btn.addEventListener('click', async () => {
      const batId = btn.dataset.batId;
      const form = btn.closest('.inline-form');
      const data = collectFormData(form, `bat-${batId}-`, config.tableau.batiment.fields);
      await BatimentDB.update(batId, { data });
      State.toast('Bâtiment enregistré', 'success', 1500);
      loadTerrain();
    });
  });

  // Sauvegarder zone
  $$('.btn-save-zone').forEach(btn => {
    btn.addEventListener('click', async () => {
      const zoneId = btn.dataset.zoneId;
      const form = btn.closest('.inline-form');
      const zoneKey = isCT ? 'zcs' : 'zone_homogene';
      const fields = config.tableau[zoneKey]?.fields || [];
      const data = collectFormData(form, `zone-${zoneId}-`, fields);
      await ZoneDB.update(zoneId, { data });
      State.toast('Zone enregistrée', 'success', 1500);
      loadTerrain();
    });
  });

  // Sauvegarder point
  $$('.btn-save-point').forEach(btn => {
    btn.addEventListener('click', async () => {
      const pointId = btn.dataset.pointId;
      const form = btn.closest('.inline-form');
      const terrainFields = config.tableau.point.fields.filter(f => f.phase === 'terrain');
      const data = collectFormData(form, `point-${pointId}-`, terrainFields);
      await PointDB.update(pointId, { data });
      State.toast('Point enregistré', 'success', 1500);
      loadTerrain();
    });
  });
}

function collectFormData(formEl, prefix, fields) {
  const data = {};
  for (const f of fields) {
    const input = formEl.querySelector(`[name="${prefix}${f.id}"]`);
    if (input && input.value !== '') {
      data[f.id] = input.value;
    }
  }
  return data;
}

// ── Nav helper ─────────────────────────────────────────

function renderTerrainNav(activeId) {
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
