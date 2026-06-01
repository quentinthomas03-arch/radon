// ============================================================
// resultats.js — Saisie des résultats labo
// ✨ AVEC IMPORT PDF AUTOMATIQUE
// Tableau récapitulatif + saisie par point + indicateurs couleur
// ============================================================

import * as State from './state.js';
import { BatimentDB, ZoneDB, PointDB, MissionDB } from './database.js';

const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

// ── Rendu principal ─────────────────────────────────────────

export function renderResultats() {
  const config = State.getConfig();
  if (!config) return '<p>Aucune mission chargée</p>';

  return `
    <div class="view-header">
      <button class="btn-back" id="btn-back-res">←</button>
      <h2>${config.label} — Résultats</h2>
    </div>
    ${renderResNav('resultats')}
    <div id="resultats-content" class="resultats-content">
      <div class="terrain-loading">Chargement…</div>
    </div>
  `;
}

// Charger après rendu
State.on('navigate', ({ view }) => {
  if (view === 'resultats') setTimeout(loadResultats, 50);
});
setTimeout(() => {
  if ($('#resultats-content')) loadResultats();
}, 50);

async function loadResultats() {
  const container = $('#resultats-content');
  if (!container) return;

  const missionId = State.get('currentMissionId');
  const config = State.getConfig();
  if (!missionId || !config) return;

  try {
    const batiments = await BatimentDB.getByMission(missionId);
    const zones     = await ZoneDB.getByMission(missionId);
    const points    = await PointDB.getByMission(missionId);

    if (points.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p>Aucun point de mesure défini</p>
          <p class="text-sm">Placez d'abord des capteurs sur le plan ou ajoutez-les dans l'onglet Terrain</p>
        </div>`;
      return;
    }

    container.innerHTML =
      renderImportButton() +
      renderSummary(config, batiments, zones, points) +
      renderResultsTable(config, batiments, zones, points);

    bindResultatsEvents(config, points);
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur : ${err.message}</p></div>`;
  }
}

// ── Bouton import PDF ──────────────────────────────────────

function renderImportButton() {
  return `
    <div style="margin-bottom: 16px;">
      <button class="btn btn-secondary btn-block" id="btn-import-pdf">
        📥 Importer résultats PDF (PearL)
      </button>
      <input type="file" id="pdf-file-input" accept=".pdf" style="display:none;">
    </div>
  `;
}

// ── Résumé en haut ──────────────────────────────────────────

function renderSummary(config, batiments, zones, points) {
  const filled = points.filter(p => {
    const val = p.resultats?.activite_bqm3 || p.resultats?.concentration;
    return val !== undefined && val !== null && val !== '';
  });
  const total = points.length;
  const pct = total > 0 ? Math.round((filled.length / total) * 100) : 0;

  // Compter par seuil
  let vert = 0, orange = 0, rouge = 0;
  for (const p of filled) {
    const val = parseFloat(p.resultats?.activite_bqm3 || p.resultats?.concentration || 0);
    if (val < 300) vert++;
    else if (val < 1000) orange++;
    else rouge++;
  }

  // Max global
  const maxVal = Math.max(0, ...filled.map(p =>
    parseFloat(p.resultats?.activite_bqm3 || p.resultats?.concentration || 0)
  ));

  return `
    <div class="results-summary">
      <div class="summary-progress">
        <div class="summary-progress-bar" style="width:${pct}%"></div>
        <span class="summary-progress-text">${filled.length} / ${total} résultats saisis (${pct}%)</span>
      </div>
      <div class="summary-cards">
        <div class="summary-card card-vert">
          <div class="summary-card-val">${vert}</div>
          <div class="summary-card-label">&lt; 300</div>
        </div>
        <div class="summary-card card-orange">
          <div class="summary-card-val">${orange}</div>
          <div class="summary-card-label">300–1000</div>
        </div>
        <div class="summary-card card-rouge">
          <div class="summary-card-val">${rouge}</div>
          <div class="summary-card-label">≥ 1000</div>
        </div>
        <div class="summary-card card-max">
          <div class="summary-card-val">${maxVal > 0 ? maxVal : '—'}</div>
          <div class="summary-card-label">Max Bq/m³</div>
        </div>
      </div>
    </div>
  `;
}

// ── Tableau de saisie des résultats ─────────────────────────

function renderResultsTable(config, batiments, zones, points) {
  const isCT = config.type === 'CT';
  const resultFields = config.tableau.point.fields.filter(f => f.phase === 'resultats');

  const rows = points.map(point => {
    const zone = zones.find(z => z.id === point.zoneId);
    const bat  = batiments.find(b => b.id === point.batimentId);

    const numDosi = point.data?.num_detecteur || point.data?.num_dosimetrie || '—';
    const lieu = point.data?.lieu_pose || point.data?.nom_piece || '—';
    const batName = bat?.data?.nom || '—';
    const zoneName = zone?.data?.nom || zone?.data?.numero || '—';

    // Valeur actuelle
    const valKey = isCT ? 'activite_bqm3' : 'concentration';
    const val = point.resultats?.[valKey];
    const numVal = parseFloat(val || 0);

    // Couleur
    let colorClass = '';
    if (val !== undefined && val !== null && val !== '') {
      if (numVal < 300) colorClass = 'res-vert';
      else if (numVal < 1000) colorClass = 'res-orange';
      else colorClass = 'res-rouge';
    }

    const fieldsHtml = resultFields.map(f => {
      const fieldVal = point.resultats?.[f.id] ?? '';
      if (f.type === 'select') {
        const opts = (f.options || []).map(o => {
          const sel = String(fieldVal) === String(o) ? 'selected' : '';
          return `<option value="${o}" ${sel}>${o}</option>`;
        }).join('');
        return `
          <td>
            <select name="${f.id}" class="form-input form-input-sm res-input"
              data-point-id="${point.id}">
              <option value="">—</option>
              ${opts}
            </select>
          </td>`;
      }
      return `
        <td>
          <input type="${f.type === 'number' ? 'number' : 'text'}"
            name="${f.id}" class="form-input form-input-sm res-input"
            value="${fieldVal}"
            ${f.type === 'number' ? 'inputmode="numeric" step="any"' : ''}
            data-point-id="${point.id}">
        </td>`;
    }).join('');

    return `
      <tr class="${colorClass}" data-point-id="${point.id}">
        <td class="res-cell-bat">${batName}</td>
        <td class="res-cell-zone">${isCT ? 'ZCS' : 'ZH'} ${zoneName}</td>
        <td class="res-cell-dosi"><strong>${numDosi}</strong></td>
        <td class="res-cell-lieu">${lieu}</td>
        ${fieldsHtml}
      </tr>
    `;
  }).join('');

  const headerCols = resultFields.map(f =>
    `<th>${f.label.replace(/\(.*?\)/g, '').trim()}</th>`
  ).join('');

  return `
    <div class="results-table-wrap">
      <table class="results-table">
        <thead>
          <tr>
            <th>Bâtiment</th>
            <th>${isCT ? 'ZCS' : 'ZH'}</th>
            <th>N° Dosi</th>
            <th>Lieu</th>
            ${headerCols}
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>
    <div class="form-actions" style="margin-top:12px;">
      <button class="btn btn-primary btn-block" id="btn-save-resultats">
        💾 Enregistrer tous les résultats
      </button>
    </div>
  `;
}

// ── Events ──────────────────────────────────────────────────

function bindResultatsEvents(config, points) {
  // ── Import PDF ─────────────────────────────────────────────
  const btnImportPdf = $('#btn-import-pdf');
  const pdfInput = $('#pdf-file-input');

  btnImportPdf?.addEventListener('click', () => pdfInput?.click());

  pdfInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    State.setLoading(true);
    try {
      await handlePDFImport(file, points, config);
    } catch (err) {
      State.toast('❌ Erreur import PDF : ' + err.message, 'error');
      console.error('PDF import error:', err);
    } finally {
      State.setLoading(false);
      pdfInput.value = '';
    }
  });

  // Auto-save on change
  $$('.res-input').forEach(input => {
    input.addEventListener('change', async () => {
      const pointId = input.dataset.pointId;
      const fieldName = input.name;
      const value = input.value;

      try {
        const point = await PointDB.getById(pointId);
        if (!point) return;
        point.resultats = point.resultats || {};
        point.resultats[fieldName] = value;
        await PointDB.update(pointId, { resultats: point.resultats });

        // Mettre à jour la couleur de la ligne
        const row = input.closest('tr');
        if (row) {
          const valKey = config.type === 'CT' ? 'activite_bqm3' : 'concentration';
          const val = parseFloat(point.resultats[valKey] || 0);
          row.classList.remove('res-vert', 'res-orange', 'res-rouge');
          if (point.resultats[valKey]) {
            if (val < 300) row.classList.add('res-vert');
            else if (val < 1000) row.classList.add('res-orange');
            else row.classList.add('res-rouge');
          }
        }
      } catch (err) {
        console.error('Save result error:', err);
      }
    });
  });

  // Bouton sauvegarder tout
  $('#btn-save-resultats')?.addEventListener('click', async () => {
    const inputs = $$('.res-input');
    const updates = {};

    inputs.forEach(input => {
      const pointId = input.dataset.pointId;
      if (!updates[pointId]) updates[pointId] = {};
      if (input.value !== '') {
        updates[pointId][input.name] = input.value;
      }
    });

    try {
      for (const [pointId, resultats] of Object.entries(updates)) {
        await PointDB.update(pointId, { resultats });
      }
      State.toast('Résultats enregistrés', 'success');
      loadResultats(); // Refresh pour les couleurs et le résumé
    } catch (err) {
      State.toast('Erreur : ' + err.message, 'error');
    }
  });

  // Retour
  $('#btn-back-res')?.addEventListener('click', () => {
    State.clearMission();
    State.navigate('home');
  });

  // Nav tabs
  $$('.mission-nav-tab').forEach(tab => {
    tab.addEventListener('click', () => State.navigate(tab.dataset.navView));
  });
}

/**
 * Traiter l'import PDF et remplir automatiquement les résultats
 */
async function handlePDFImport(file, points, config) {
  // Charger pdfjs dynamiquement
  const pdfjsLib = await loadPDFJS();

  // Lire le fichier
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // Extraire texte de toutes les pages
  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(item => item.str).join(' ');
  }

  // Parser le tableau
  const results = parsePDFTable(fullText);

  if (results.length === 0) {
    State.toast('⚠️ Aucun résultat trouvé dans le PDF', 'warning');
    return;
  }

  // Matcher et remplir
  let matched = 0;
  for (const result of results) {
    const point = points.find(p => {
      const numDosi = String(p.data?.num_detecteur || p.data?.num_dosimetrie || '').trim();
      return numDosi === String(result.numClient).trim();
    });

    if (point) {
      // Remplir les résultats
      const valKey = config.type === 'CT' ? 'activite_bqm3' : 'concentration';
      point.resultats = point.resultats || {};
      point.resultats[valKey] = result.activite.toString();
      point.resultats.incertitude = result.incertitude.toString();

      // Sauvegarder
      await PointDB.update(point.id, { resultats: point.resultats });
      matched++;
    }
  }

  State.toast(`✅ ${matched} résultats importés sur ${results.length}`, 'success');
  loadResultats(); // Recharger le tableau
}

/**
 * Parser le tableau du PDF - FORMAT PEARL
 * Cherche CHAQUE LIGNE : NUM_CLIENT ... ACTIVITE +/- INCERTITUDE
 */
function parsePDFTable(text) {
  const results = [];

  // Remplacer les multiples espaces par un seul
  const cleanText = text.replace(/\s+/g, ' ');
  
  // Regex : cherche 6 chiffres, puis du texte/nombres, puis 2 chiffres +/- 2 chiffres
  // IMPORTANT : [^\d]* ou [^0-9]* pour arrêter avant les prochains chiffres
  const pattern = /(\d{6})\s+([^0-9]+?)(\d{2})\s+\+\/\-\s+(\d{2})(?=\s+\d{6}|$)/g;

  let match;
  while ((match = pattern.exec(cleanText)) !== null) {
    const numClient = match[1];
    const activite = parseFloat(match[3]);
    const incertitude = parseFloat(match[4]);

    results.push({ numClient, activite, incertitude, lieu: '—' });
  }

  console.log('PDF parsing - résultats trouvés:', results.length, results);
  return results;
}

/**
 * Charger pdf.js depuis CDN (unpkg)
 */
async function loadPDFJS() {
  if (typeof window.pdfjsLib !== 'undefined') {
    return window.pdfjsLib;
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.min.js';

    script.onload = () => {
      if (window.pdfjsLib) {
        try {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        } catch (err) {
          console.warn('Worker config warning (non-bloquant):', err);
        }
        resolve(window.pdfjsLib);
      } else {
        reject(new Error('PDF.js not loaded'));
      }
    };

    script.onerror = () => {
      // Fallback : essayer jsdelivr
      const scriptFallback = document.createElement('script');
      scriptFallback.src = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
      
      scriptFallback.onload = () => {
        if (window.pdfjsLib) {
          window.pdfjsLib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
          resolve(window.pdfjsLib);
        } else {
          reject(new Error('PDF.js library failed to load'));
        }
      };

      scriptFallback.onerror = () => {
        reject(new Error('⚠️ Impossible de charger PDF.js. Vérifiez votre connexion internet.'));
      };

      document.head.appendChild(scriptFallback);
    };

    document.head.appendChild(script);
  });
}

// ── Nav helper ──────────────────────────────────────────────

function renderResNav(activeId) {
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
