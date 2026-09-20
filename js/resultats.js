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
      renderEcarts(config, zones, points) +
      renderResultsTable(config, batiments, zones, points);

    bindResultatsEvents(config, points);
    bindEcartsEvents();
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

// ── Écarts aux normes ────────────────────────────────────────
// Détecte automatiquement les cas prévus par les 5 modèles d'écart de la macro
// (onglet "ECARTS AUX NORMES") à partir des données déjà saisies, et pré-remplit
// le texte correspondant. L'utilisateur relit/ajuste avant de le copier dans le
// rapport — l'appli ne décide pas à sa place, elle évite juste la resaisie.

function detectEcarts(config, zones, points) {
  const isCT = config.type === 'CT';
  const valKey = isCT ? 'activite_bqm3' : 'concentration';
  const numKey = isCT ? 'num_detecteur' : 'num_dosimetrie';
  const localKey = isCT ? 'lieu_pose' : 'nom_piece';
  const poseKey = isCT ? 'date_pose' : 'date_debut';
  const zoneLabel = (z) => (isCT ? z.data?.nom : z.data?.numero) || '?';
  const zoneNiveau = (z) => (isCT ? z.data?.niveau : z.data?.niveau_etage) || '(niveau non renseigné)';
  const tpl = (id) => config.ecarts_normes?.find(e => e.id === id)?.template || '';
  const fill = (text, vals) => Object.entries(vals).reduce((t, [k, v]) => t.split('{' + k + '}').join(v ?? '?'), text);

  const out = [];

  // Écarts 1/2 — dosimètre perdu
  for (const p of points) {
    if ((p.resultats?.dosimetre_perdu || '') !== 'OUI') continue;
    const zone = zones.find(z => z.id === p.zoneId);
    if (!zone) continue;
    const num = p.data?.[numKey], local = p.data?.[localKey];

    const voisins = points
      .filter(pp => pp.id !== p.id && pp.zoneId === zone.id)
      .map(pp => ({ pp, val: parseFloat(pp.resultats?.[valKey]) }))
      .filter(x => !isNaN(x.val))
      .sort((a, b) => a.val - b.val)
      .slice(0, 2);

    const base = { num, local, niveau: zoneNiveau(zone), zone: zoneLabel(zone) };
    let text;
    if (voisins.length >= 2) {
      const [v1, v2] = voisins;
      text = fill(tpl('dosimetre_perdu_avec_adjacent'), {
        ...base,
        num2: v1.pp.data?.[numKey], local2: v1.pp.data?.[localKey], zone2: zoneLabel(zone), val2: Math.round(v1.val),
        num3: v2.pp.data?.[numKey], local3: v2.pp.data?.[localKey], zone3: zoneLabel(zone), val3: Math.round(v2.val),
      });
    } else {
      text = fill(tpl('dosimetre_perdu_sans_adjacent'), base);
    }
    out.push({ label: `Dosimètre perdu — ${local || '?'} (n°${num || '?'})`, text });
  }

  // Écart 3 — taux d'inoccupation > 20% (CSP uniquement : seul point.fields y définit periode_inoccupation)
  if (!isCT) {
    for (const p of points) {
      const d = p.data || {};
      if (!d.date_debut || !d.date_fin) continue;
      const duree = Math.round((new Date(d.date_fin) - new Date(d.date_debut)) / 86400000);
      const inocc = parseFloat(d.periode_inoccupation);
      if (duree > 0 && !isNaN(inocc) && inocc / duree > 0.2) {
        out.push({ label: `Taux d'inoccupation > 20% — ${d.nom_piece || '?'}`, text: tpl('duree_inoccupation') });
      }
    }
  }

  // Écart 4 — hors période réglementaire (15 septembre → 30 avril)
  for (const p of points) {
    const datePose = p.data?.[poseKey];
    if (!datePose) continue;
    const dt = new Date(datePose);
    if (isNaN(dt.getTime())) continue;
    const m = dt.getMonth() + 1, day = dt.getDate();
    const dansLaPeriode = m <= 4 || m >= 10 || (m === 9 && day >= 15);
    if (!dansLaPeriode) {
      out.push({ label: `Hors période réglementaire — ${p.data?.[localKey] || '?'} (posé le ${formatDateFr(datePose)})`, text: tpl('periode_mesurage') });
    }
  }

  return out;
}

function renderEcarts(config, zones, points) {
  const ecarts = detectEcarts(config, zones, points);
  if (ecarts.length === 0) return '';
  return `
    <div class="results-summary" style="margin-bottom:12px;">
      <h3 style="margin:0 0 8px;">⚠️ Écarts aux normes détectés (${ecarts.length})</h3>
      ${ecarts.map((e, i) => `
        <div class="form-group" style="margin-bottom:10px;">
          <label class="form-label">${escapeHtmlLocal(e.label)}</label>
          <textarea class="form-input ecart-text" data-ecart-i="${i}" rows="4" style="font-size:.85em;">${escapeHtmlLocal(e.text)}</textarea>
          <button class="btn btn-secondary btn-sm btn-copy-ecart" data-ecart-i="${i}" style="margin-top:4px;">📋 Copier</button>
        </div>
      `).join('')}
      <p class="text-sm" style="opacity:.7;">Texte pré-rempli à partir des 5 modèles de la macro — relire et ajuster avant de reporter dans le rapport.</p>
    </div>
  `;
}

function bindEcartsEvents() {
  $$('.btn-copy-ecart').forEach(btn => {
    btn.addEventListener('click', async () => {
      const ta = $(`.ecart-text[data-ecart-i="${btn.dataset.ecartI}"]`);
      if (!ta) return;
      try {
        await navigator.clipboard.writeText(ta.value);
        State.toast('Texte copié ✓', 'success', 1500);
      } catch (err) {
        State.toast('Impossible de copier (sélectionnez et copiez manuellement)', 'warning');
      }
    });
  });
}

function escapeHtmlLocal(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatDateFr(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
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
  // Navigation par onglets : gérée par bindGlobalNav() (app.js, délégation globale) —
  // un second listener local ici déclenchait un double rendu de vue par clic.
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

  // Reconstruire le texte ligne par ligne, PAR POSITION (X/Y) et non par ordre
  // d'apparition dans le flux du PDF. Vérifié sur de vrais rapports PearL : le
  // gabarit (généré depuis Excel) dessine la valeur d'incertitude ("+/- 10") comme un
  // objet texte séparé du reste de la ligne — pdf.js le restitue ailleurs dans
  // `getTextContent().items` bien qu'il soit visuellement sur la même ligne (même Y).
  // Un simple `.join(' ')` dans l'ordre du flux détache donc l'incertitude de son
  // n° client. En reconstruisant par (Y puis X), chaque ligne redevient autonome :
  // "N°Client  Lieu  Date  Début  Fin  Durée  Exposition  Activité +/- Incertitude".
  let allLines = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const items = textContent.items.map(it => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
    }));
    allLines.push(...reconstructPdfLines(items));
  }

  // Parser le tableau
  const results = parsePDFTable(allLines);

  if (results.length === 0) {
    State.toast('⚠️ Aucun résultat trouvé dans le PDF', 'warning');
    return;
  }

  // Matcher et remplir
  let matched = 0, lost = 0;
  for (const result of results) {
    const point = points.find(p => {
      const numDosi = String(p.data?.num_detecteur || p.data?.num_dosimetrie || '').trim();
      return numDosi === String(result.numClient).trim();
    });
    if (!point) continue;

    point.resultats = point.resultats || {};
    if (result.perdu) {
      // Le tableau PearL indique "perdu" au lieu d'une valeur quand le dosimètre
      // n'a pas été retrouvé à la relève — reporté tel quel plutôt que silencieusement ignoré.
      point.resultats.dosimetre_perdu = 'OUI';
      lost++;
    } else {
      const valKey = config.type === 'CT' ? 'activite_bqm3' : 'concentration';
      point.resultats[valKey] = result.activite.toString();
      point.resultats.incertitude = result.incertitude.toString();
    }
    await PointDB.update(point.id, { resultats: point.resultats });
    matched++;
  }

  const suffix = lost > 0 ? ` (dont ${lost} dosimètre(s) perdu(s))` : '';
  State.toast(`✅ ${matched} résultat(s) importé(s) sur ${results.length}${suffix}`, 'success');
  loadResultats(); // Recharger le tableau
}

/**
 * Regroupe les items de texte d'une page pdf.js en lignes visuelles, en les
 * triant par position (Y décroissant = haut vers bas, puis X croissant = gauche
 * vers droite) plutôt que par ordre d'apparition dans le flux du PDF.
 */
function reconstructPdfLines(items, tolerance = 6) {
  const sorted = [...items].sort((a, b) => b.y - a.y);
  const rows = [];
  for (const it of sorted) {
    let row = rows.find(r => Math.abs(r.y - it.y) <= tolerance);
    if (!row) { row = { y: it.y, items: [] }; rows.push(row); }
    row.items.push(it);
  }
  return rows.map(r => r.items.sort((a, b) => a.x - b.x).map(it => it.str).join(' ').trim());
}

/**
 * Parser le tableau du PDF — FORMAT PEARL.
 * Chaque ligne (déjà reconstruite par position) est autonome :
 * "N°Client  Lieu  Date…  Activité +/- Incertitude" ou "N°Client  Lieu  perdu".
 */
function parsePDFTable(lines) {
  const results = [];

  for (const line of lines) {
    const head = /^(\d{5,6})\s+(.+)$/.exec(line.trim());
    if (!head) continue;
    const numClient = head[1];
    const rest = head[2];

    if (/\bperdu\b/i.test(rest)) {
      results.push({ numClient, perdu: true });
      continue;
    }

    const val = /(\d{1,5}(?:[.,]\d+)?)\s*\+\/-\s*(\d{1,4}(?:[.,]\d+)?)/.exec(rest);
    if (!val) continue;
    const activite = parseFloat(val[1].replace(',', '.'));
    const incertitude = parseFloat(val[2].replace(',', '.'));
    if (isNaN(activite) || isNaN(incertitude)) continue;

    results.push({ numClient, activite, incertitude });
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
