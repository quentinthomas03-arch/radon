// ============================================================
// export.js — Génération XLSX structuré (onglets Entrée + Tableau)
// + export Fiche de prélèvement PearL (ENR ESS RnPre Cr39 v07)
// Utilise SheetJS (xlsx) chargé dynamiquement via CDN
// ============================================================

import * as State from './state.js';
import { MissionDB, BatimentDB, ZoneDB, PointDB } from './database.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

let XLSX = null;

async function loadXLSX() {
  if (XLSX) return XLSX;
  if (typeof window.XLSX !== 'undefined') {
    XLSX = window.XLSX;
    return XLSX;
  }
  // Charger via CDN — unpkg en priorité, repli jsdelivr (jamais cdnjs : bloqué par
  // l'anti-tracking sur le terrain, voir loadPDFJS dans resultats.js pour le même motif)
  await loadScript('https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js')
    .catch(() => loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'));
  if (!window.XLSX) throw new Error('Impossible de charger SheetJS (XLSX). Vérifiez la connexion internet.');
  XLSX = window.XLSX;
  return XLSX;
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ── Rendu de l'écran Export ──────────────────────────────────

export function renderExport() {
  const config = State.getConfig();
  if (!config) return '<p>Aucune mission chargée</p>';

  return `
    <div class="view-header">
      <button class="btn-back" id="btn-back-export">←</button>
      <h2>${config.label} — Export</h2>
    </div>
    ${renderExportNav('export')}
    <div id="export-content" class="export-content">
      <div class="export-preview" id="export-preview">
        <div class="terrain-loading">Chargement de l'aperçu…</div>
      </div>
      <div class="export-actions">
        <button class="btn btn-primary btn-block btn-lg" id="btn-export-xlsx">
          📤 Exporter en XLSX (macro ${config.type})
        </button>
        <button class="btn btn-primary btn-block" id="btn-export-fiche">
          🧪 Bordereau labo (PearL)
        </button>
        <button class="btn btn-primary btn-block" id="btn-export-fiche-batiment">
          🏢 Fiche de prélèvement par bâtiment
        </button>
        <button class="btn btn-secondary btn-block" id="btn-export-json">
          💾 Sauvegarder (JSON)
        </button>
      </div>
    </div>
  `;
}

// Charger après rendu
State.on('navigate', ({ view }) => {
  if (view === 'export') setTimeout(loadExportPreview, 50);
});
setTimeout(() => {
  if ($('#export-preview')) loadExportPreview();
}, 50);

async function loadExportPreview() {
  const container = $('#export-preview');
  if (!container) return;

  const missionId = State.get('currentMissionId');
  const config = State.getConfig();
  if (!missionId || !config) return;

  try {
    const mission  = await MissionDB.getById(missionId);
    const batiments = await BatimentDB.getByMission(missionId);
    const zones     = await ZoneDB.getByMission(missionId);
    const points    = await PointDB.getByMission(missionId);

    const dossier = mission.entree?.numero_dossier || '(sans n°)';
    const etab    = mission.entree?.etab_nom || '';

    // Statistiques
    const nbPoints = points.length;
    const nbResultats = points.filter(p => {
      const val = p.resultats?.activite_bqm3 || p.resultats?.concentration;
      return val !== undefined && val !== null && val !== '';
    }).length;

    // Calcul moyennes par zone
    const moyParZone = computeZoneAverages(config, zones, points);

    container.innerHTML = `
      <div class="export-summary-card">
        <h3>📋 Aperçu de l'export</h3>
        <table class="export-info-table">
          <tr><td>Type</td><td><strong>${config.label}</strong></td></tr>
          <tr><td>Dossier</td><td><strong>${dossier}</strong></td></tr>
          <tr><td>Établissement</td><td>${etab}</td></tr>
          <tr><td>Bâtiments</td><td>${batiments.length}</td></tr>
          <tr><td>Zones</td><td>${zones.length}</td></tr>
          <tr><td>Points de mesure</td><td>${nbPoints}</td></tr>
          <tr><td>Résultats saisis</td><td>${nbResultats} / ${nbPoints}</td></tr>
        </table>
      </div>

      <div class="export-summary-card">
        <h3>📊 Moyennes par zone</h3>
        ${moyParZone.length > 0 ? `
          <table class="export-info-table">
            <thead>
              <tr>
                <th>Bâtiment</th>
                <th>${config.type === 'CT' ? 'ZCS' : 'ZH'}</th>
                <th>Moy. Bq/m³</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              ${moyParZone.map(z => {
                let statusClass = '';
                let statusText = '—';
                if (z.avg !== null) {
                  if (z.avg < 300)      { statusClass = 'res-vert';   statusText = '✅ < 300'; }
                  else if (z.avg < 1000) { statusClass = 'res-orange'; statusText = '⚠️ 300–1000'; }
                  else                   { statusClass = 'res-rouge';  statusText = '🔴 ≥ 1000'; }
                }
                return `
                  <tr class="${statusClass}">
                    <td>${z.batName}</td>
                    <td>${z.zoneName}</td>
                    <td><strong>${z.avg !== null ? Math.round(z.avg) : '—'}</strong></td>
                    <td>${statusText}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        ` : '<p class="text-sm">Aucun résultat saisi</p>'}
      </div>

      ${nbResultats < nbPoints ? `
        <div class="export-warning">
          ⚠️ ${nbPoints - nbResultats} résultat(s) manquant(s) — l'export sera partiel
        </div>
      ` : ''}
    `;

    // Bind export buttons
    $('#btn-export-xlsx')?.addEventListener('click', () => exportXLSX());
    $('#btn-export-fiche')?.addEventListener('click', () => exportFichePrelevement());
    $('#btn-export-fiche-batiment')?.addEventListener('click', () => exportFicheBatiment());
    $('#btn-export-json')?.addEventListener('click', () => exportJSON());
    $('#btn-back-export')?.addEventListener('click', () => {
      State.clearMission();
      State.navigate('home');
    });
    // Navigation par onglets : gérée par bindGlobalNav() (app.js, délégation globale) —
    // un second listener local ici déclenchait un double rendu de vue par clic.
  } catch (err) {
    container.innerHTML = `<div class="empty-state"><p>Erreur : ${err.message}</p></div>`;
  }
}

// ── Calcul des moyennes par zone ────────────────────────────

function computeZoneAverages(config, zones, points) {
  const isCT = config.type === 'CT';
  const results = [];

  for (const zone of zones) {
    const zonePoints = points.filter(p => p.zoneId === zone.id);
    const vals = zonePoints
      .map(p => parseFloat(p.resultats?.[isCT ? 'activite_bqm3' : 'concentration'] || ''))
      .filter(v => !isNaN(v) && v > 0);

    results.push({
      zoneId: zone.id,
      zoneName: zone.data?.nom || zone.data?.numero || '?',
      batName: '—', // sera rempli plus bas
      avg: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
      count: vals.length,
      total: zonePoints.length,
    });
  }

  return results;
}

// ── Export XLSX (macro) ──────────────────────────────────────

async function exportXLSX() {
  State.setLoading(true);

  try {
    const xlsx = await loadXLSX();
    const missionId = State.get('currentMissionId');
    const config = State.getConfig();
    const mission  = await MissionDB.getById(missionId);
    const batiments = await BatimentDB.getByMission(missionId);
    const zones     = await ZoneDB.getByMission(missionId);
    const points    = await PointDB.getByMission(missionId);

    const wb = xlsx.utils.book_new();

    // ── Onglet Entrée ── (valeurs posées exactement aux cellules excelCell du config)
    const wsEntree = buildEntreeSheet(xlsx, config, mission);
    xlsx.utils.book_append_sheet(wb, wsEntree, 'Entrée');

    // ── Onglet Tableau ── (valeurs posées exactement aux colonnes excelCol du config)
    const wsTableau = buildTableauSheet(xlsx, config, batiments, zones, points);
    xlsx.utils.book_append_sheet(wb, wsTableau, 'Tableau');

    // Télécharger
    const dossier = mission.entree?.numero_dossier || 'export';
    const date = new Date().toISOString().slice(0, 10);
    const filename = `Radon_${config.type}_${dossier}_${date}.xlsx`;

    xlsx.writeFile(wb, filename);
    State.toast(`Export ${filename} téléchargé`, 'success');
  } catch (err) {
    State.toast('Erreur export : ' + err.message, 'error');
    console.error(err);
  }

  State.setLoading(false);
}

// ── Construction de l'onglet Entrée ─────────────────────────
// Chaque valeur est posée EXACTEMENT à la cellule field.excelCell déclarée dans
// config-ct.js/config-csp.js (et non plus en position séquentielle), pour rester
// calée sur la macro. Le libellé est répété en colonne A de la même ligne pour
// que le fichier reste lisible à l'ouverture.

function buildEntreeSheet(xlsx, config, mission) {
  const ws = {};
  const entree = mission.entree || {};
  let maxRow = 1, maxCol = 1;

  const setCell = (addr, value, type = 's') => {
    if (value === '' || value === undefined || value === null) return;
    ws[addr] = { t: type, v: value };
    const pos = xlsx.utils.decode_cell(addr);
    maxRow = Math.max(maxRow, pos.r + 1);
    maxCol = Math.max(maxCol, pos.c + 1);
  };

  setCell('A1', 'RADON — ' + config.label);

  for (const section of config.entree.sections) {
    for (const field of section.fields) {
      if (!field.excelCell) continue; // champs propres à l'appli, sans cellule macro (ex: nb_plans)
      const val = entree[field.id];
      if (val === undefined || val === null || val === '') continue;
      const { c, r } = xlsx.utils.decode_cell(field.excelCell);
      // Libellé juste à gauche de sa valeur (et non systématiquement en colonne A) :
      // plusieurs champs de sections différentes partagent parfois la même ligne
      // (colonnes C et F par ex.), une colonne A unique en écraserait un sur deux.
      const labelAddr = xlsx.utils.encode_col(Math.max(c - 1, 0)) + (r + 1);
      if (!ws[labelAddr]) setCell(labelAddr, field.label);
      setCell(field.excelCell, val, field.type === 'number' ? 'n' : 's');
    }
  }

  ws['!ref'] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: Math.max(maxCol, 5) } });
  ws['!cols'] = Array.from({ length: Math.max(maxCol, 5) + 1 }, () => ({ wch: 22 }));
  return ws;
}

// ── Construction de l'onglet Tableau ────────────────────────
// Idem : chaque colonne vient de field.excelCol dans le config, plus de mapping
// positionnel en dur. Corrige le décalage de colonnes et le mismatch CT/CSP.

function colLetter(computedArr, id) {
  const f = computedArr.find(c => c.id === id);
  return f ? f.excelCol : null;
}

function buildTableauSheet(xlsx, config, batiments, zones, points) {
  const isCT = config.type === 'CT';
  const zoneKey = isCT ? 'zcs' : 'zone_homogene';
  const t = config.tableau;
  const startRow = config.export.sheets.tableau.startRow || 2; // 1ère ligne de données
  const headerRow = startRow - 1;

  const ws = {};
  let maxCol = 1;
  const setCell = (addr, value, type = 's') => {
    ws[addr] = { t: type, v: value };
    maxCol = Math.max(maxCol, xlsx.utils.decode_col(addr.replace(/\d+$/, '')) + 1);
  };
  const setField = (f, addr, value) => {
    if (value === '' || value === undefined || value === null) return;
    setCell(addr, value, f.type === 'number' ? 'n' : 's');
  };

  // ── En-têtes ──
  // Note : .filter(f => f.excelCol) exclut les champs propres à l'appli qui n'ont
  // pas de colonne dans la macro (ex: futurs champs bâtiment hors grille Tableau).
  setCell('A' + headerRow, 'N° Ligne');
  for (const f of t.batiment.fields.filter(f => f.excelCol))     setCell(f.excelCol + headerRow, f.label);
  for (const f of t[zoneKey].fields.filter(f => f.excelCol))     setCell(f.excelCol + headerRow, f.label);
  for (const f of t.point.fields.filter(f => f.excelCol))        setCell(f.excelCol + headerRow, f.label);
  for (const f of t.computed.filter(f => f.excelCol))            setCell(f.excelCol + headerRow, f.label);

  // ── Données ──
  let lineNum = 1, row = startRow;
  const valKey = isCT ? 'activite_bqm3' : 'concentration';

  for (const bat of batiments) {
    const batZones = zones.filter(z => z.batimentId === bat.id);

    for (const zone of batZones) {
      const zonePoints = points.filter(p => p.zoneId === zone.id).sort((a, b) => a.order - b.order);
      const vals = zonePoints
        .map(p => parseFloat(p.resultats?.[valKey]))
        .filter(v => !isNaN(v));
      const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : '';

      for (const point of zonePoints) {
        const d = point.data || {};
        const r = point.resultats || {};

        setCell('A' + row, lineNum++, 'n');
        for (const f of t.batiment.fields.filter(f => f.excelCol)) setField(f, f.excelCol + row, bat.data?.[f.id]);
        for (const f of t[zoneKey].fields.filter(f => f.excelCol)) setField(f, f.excelCol + row, zone.data?.[f.id]);
        for (const f of t.point.fields) {
          const src = f.phase === 'resultats' ? r : d;
          setField(f, f.excelCol + row, src[f.id]);
        }

        const activiteMoyCol = colLetter(t.computed, 'activite_moy');
        if (activiteMoyCol) setCell(activiteMoyCol + row, avg, 'n');

        if (isCT) {
          const nbDetCol = colLetter(t.computed, 'nb_detecteur');
          if (nbDetCol) setCell(nbDetCol + row, 1, 'n'); // toujours 1 : 1 clic sur le plan = 1 capteur
          const dureeCol = colLetter(t.computed, 'duree_pose');
          if (dureeCol && d.date_pose && d.date_depose) {
            const duree = Math.round((new Date(d.date_depose) - new Date(d.date_pose)) / 86400000);
            setCell(dureeCol + row, duree, 'n');
          }
        } else {
          const dureeCol = colLetter(t.computed, 'duree_pose');
          let duree = '';
          if (dureeCol && d.date_debut && d.date_fin) {
            duree = Math.round((new Date(d.date_fin) - new Date(d.date_debut)) / 86400000);
            setCell(dureeCol + row, duree, 'n');
          }
          const tauxCol = colLetter(t.computed, 'taux_inoccupation');
          if (tauxCol && duree && d.periode_inoccupation) {
            setCell(tauxCol + row, Number((parseFloat(d.periode_inoccupation) / duree).toFixed(2)), 'n');
          }
        }

        row++;
      }
    }
  }

  const lastRow = Math.max(row - 1, headerRow);
  ws['!ref'] = xlsx.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: lastRow, c: Math.max(maxCol - 1, 0) } });
  ws['!cols'] = Array.from({ length: maxCol }, () => ({ wch: 18 }));
  return ws;
}

// ══════════════════════════════════════════════════════════════
// EXPORT FICHE DE PRÉLÈVEMENT PearL (ENR ESS RnPre Cr39 v07)
// Réplique exacte de la structure du template labo.
// Colonnes (ligne 14 = entêtes, 16+ = données) :
//   D = N° Dosimètre           (num_detecteur / num_dosimetrie)
//   E = N° Client              (formule =IF(D="","",D) — rempli auto)
//   F = Début d'exposition     (date_pose)
//   G = Fin d'exposition       (date_depose)
//   H = Lieu de pose           (lieu_pose / nom_piece + bâtiment/zone)
//   I = Observations           (libre)
// ══════════════════════════════════════════════════════════════

async function exportFichePrelevement() {
  State.setLoading(true);

  try {
    const xlsx = await loadXLSX();
    const missionId = State.get('currentMissionId');
    const config = State.getConfig();
    const mission   = await MissionDB.getById(missionId);
    const batiments = await BatimentDB.getByMission(missionId);
    const zones     = await ZoneDB.getByMission(missionId);
    const points    = await PointDB.getByMission(missionId);

    const isCT   = config.type === 'CT';
    const entree = mission.entree || {};
    const typeDepistage = isCT ? 'LTBât' : 'ERP';   // Code attendu par la fiche PearL
    const dossier   = entree.numero_dossier || entree.etab_nom || '';
    const preleveur = entree.intervenant || '';

    // Construit une map batId/zoneId → libellé pour étiqueter chaque ligne
    const batMap  = Object.fromEntries(batiments.map(b => [b.id, b.data?.nom  || 'Bât ' + (b.order + 1)]));
    const zoneMap = Object.fromEntries(zones.map(z => {
      const lbl = isCT ? (z.data?.nom || '') : (z.data?.numero || '');
      return [z.id, (isCT ? 'ZCS ' : 'Zone ') + lbl];
    }));

    // Préparer les données triées (par bâtiment → zone → ordre de création)
    const orderedPoints = [];
    for (const bat of batiments) {
      const batZones = zones.filter(z => z.batimentId === bat.id);
      for (const zone of batZones) {
        const zPts = points.filter(p => p.zoneId === zone.id);
        for (const p of zPts) orderedPoints.push({ p, bat, zone });
      }
    }

    // ── Créer la worksheet cellule par cellule pour conserver positions exactes ──
    const ws = {};
    const setCell = (addr, value, type = 's') => {
      ws[addr] = { t: type, v: value };
      if (type === 'n' && typeof value === 'string') ws[addr].v = Number(value);
    };
    const setFormula = (addr, formula, result = '') => {
      ws[addr] = { t: 's', f: formula, v: result };
    };

    // En-têtes (titres généraux du document)
    setCell('F2', 'Fiche de prélèvement');
    setCell('J2', 'Réf : ENR ESS RnPre Cr39');
    setCell('J3', 'Version : 07');
    setCell('F4', "Mesure intégrée de l'activité volumique en Radon 222");
    setCell('J4', 'Date : 23/06/2021');
    setCell('F6', 'En application de la norme NF ISO 11665-4');
    setCell('J6', 'Page :');
    setCell('K6', 1, 'n');
    setCell('L6', '/');
    setCell('M6', 1, 'n');

    // Bloc contact / organisme
    setCell('C9',  'Contact');
    setCell('F9',  'Code postal du lieu de mesure1 :');
    setCell('I9',  'Organisme de prélèvement2 :');
    setCell('C10', 'Tel : ');
    setCell('F10', 'Commune du lieu de mesure1 :');
    setCell('I10', 'Prénom, Nom du préleveur2 : ' + preleveur);
    setCell('C11', 'Mail :');
    setCell('F11', 'Type de dépistage1 : ' + typeDepistage + '   (Notez: ERP / LTBât / Habitat)');
    setCell('I11', 'Référence dossier2 : ' + dossier);
    setCell('F12', "1: Données anonymes transmises à l'IRSN conformément à l'arrêté du 26 octobre 2020  ERP : Au sens du code de la santé publique - LTBât : Code du travail");
    setCell('I12', "2: Notez les données que vous souhaitez voir apparaitre dans les rapports d'analyses");

    // En-têtes de colonnes du tableau (ligne 14)
    setCell('D14', 'N° Dosimètre');
    setCell('E14', 'N° Client\n(Modifier uniquement si différent du N° de Dosimètre)');
    setCell('F14', "Début d'exposition");
    setCell('G14', "Fin\nd'exposition");
    setCell('H14', 'Lieu de pose');
    setCell('I14', 'Observations');

    // Lignes de données : démarre en ligne 16
    let row = 16;
    for (const { p, bat, zone } of orderedPoints) {
      const d = p.data || {};
      const numDos = d.num_detecteur || d.num_dosimetrie || '';
      const datePose   = formatDateFr(d.date_pose);
      const dateDepose = formatDateFr(d.date_depose);
      const lieuBase = isCT ? (d.lieu_pose || '') : (d.nom_piece || '');
      const lieu = lieuBase
        ? `${lieuBase} (${batMap[bat.id]} / ${zoneMap[zone.id]})`
        : `${batMap[bat.id]} / ${zoneMap[zone.id]}`;
      const observations = '';

      // D = N° Dosimètre (numérique si possible, sinon texte)
      if (numDos && /^\d+$/.test(String(numDos))) {
        setCell('D' + row, numDos, 'n');
      } else {
        setCell('D' + row, String(numDos));
      }
      // E = N° Client (formule conforme au template : =IF(D="","",D))
      setFormula('E' + row, `IF(D${row}="","",D${row})`, numDos || '');
      // F = Début d'exposition
      setCell('F' + row, datePose);
      // G = Fin d'exposition
      setCell('G' + row, dateDepose);
      // H = Lieu de pose
      setCell('H' + row, lieu);
      // I = Observations
      setCell('I' + row, observations);

      row++;
    }

    // Pied de page labo
    const footRow = Math.max(row + 2, 38);
    setCell('B' + footRow,       'PearL');
    setCell('B' + (footRow + 1), 'Pôle d\u2019expertises et d\u2019analyses radioactives Limousin');
    setCell('B' + (footRow + 2), '20, Rue Atlantis - 87068 Limoges Cedex');
    setCell('B' + (footRow + 3), 'Tél : 05-55-43-69-95  - contact@sante-radon.com');
    setCell('B' + (footRow + 4), 'SAS au capital de 605 165 \u20ac - n° siret : 488 577 958 000 25');

    // Définir la plage de la worksheet (!ref)
    ws['!ref'] = `A1:N${footRow + 5}`;

    // Largeurs de colonnes (pour lisibilité)
    ws['!cols'] = [
      { wch: 3 },   // A
      { wch: 5 },   // B
      { wch: 10 },  // C
      { wch: 18 },  // D — N° Dosimètre
      { wch: 18 },  // E — N° Client
      { wch: 14 },  // F — Début
      { wch: 14 },  // G — Fin
      { wch: 30 },  // H — Lieu
      { wch: 30 },  // I — Observations
      { wch: 12 },  // J
      { wch: 5 },   // K
      { wch: 3 },   // L
      { wch: 5 },   // M
      { wch: 5 },   // N
    ];

    // Hauteur des lignes de données (plus grandes pour la saisie)
    ws['!rows'] = [];
    for (let i = 0; i < row - 1; i++) ws['!rows'][i] = { hpt: 16 };
    for (let i = 15; i < row - 1; i++) ws['!rows'][i] = { hpt: 24 };

    // Fusions (approximation du template)
    ws['!merges'] = [
      // En-tête : "Fiche de prélèvement" F2:H2, "Réf..." J2:M2
      { s: { r: 1, c: 5 }, e: { r: 1, c: 7 } },
      { s: { r: 1, c: 9 }, e: { r: 1, c: 12 } },
      // Ligne 4 titre + date
      { s: { r: 3, c: 5 }, e: { r: 3, c: 7 } },
      { s: { r: 3, c: 9 }, e: { r: 3, c: 12 } },
      // Ligne 6 norme
      { s: { r: 5, c: 5 }, e: { r: 5, c: 7 } },
      // Bloc contact (colonnes fusionnées pour aération)
      { s: { r: 8, c: 5 }, e: { r: 8, c: 7 } },
      { s: { r: 9, c: 5 }, e: { r: 9, c: 7 } },
      { s: { r: 10, c: 5 }, e: { r: 10, c: 7 } },
      { s: { r: 8, c: 8 }, e: { r: 8, c: 12 } },
      { s: { r: 9, c: 8 }, e: { r: 9, c: 12 } },
      { s: { r: 10, c: 8 }, e: { r: 10, c: 12 } },
      // Notes bas de bloc contact
      { s: { r: 11, c: 5 }, e: { r: 11, c: 7 } },
      { s: { r: 11, c: 8 }, e: { r: 11, c: 12 } },
    ];

    // Créer le classeur et télécharger
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'FR et RA');

    const date = new Date().toISOString().slice(0, 10);
    const safeDossier = (dossier || 'fiche').replace(/[^a-zA-Z0-9_-]+/g, '_');
    const filename = `FichePrelevement_${safeDossier}_${date}.xlsx`;

    xlsx.writeFile(wb, filename);
    State.toast(`Fiche labo ${filename} téléchargée (${orderedPoints.length} capteur(s))`, 'success');
  } catch (err) {
    State.toast('Erreur fiche labo : ' + err.message, 'error');
    console.error(err);
  }

  State.setLoading(false);
}

// ══════════════════════════════════════════════════════════════
// EXPORT FICHE DE PRÉLÈVEMENT PAR BÂTIMENT (technicien terrain)
// Réplique le fichier réel "HCBD - fiche de prélèvement CSP-CT - V1" :
// document DIFFÉRENT du bordereau labo PearL ci-dessus — celui-ci sert à
// consigner les caractéristiques bâtiment/zone/point sur le terrain (base
// du §6.2 "Caractéristiques des locaux" du rapport final), une feuille par
// bâtiment, avec jusqu'à 10 points de mesure en colonnes D à M.
// NOTE : certains champs du gabarit réel (nombre d'occupants du bâtiment,
// nombre de pièces du bâtiment, dates de pose/dépose et durée d'inoccupation
// AU NIVEAU BÂTIMENT) n'existent pas dans le schéma actuel de l'appli
// (config-ct.js / config-csp.js) — ils sont donc laissés vides ci-dessous.
// ══════════════════════════════════════════════════════════════

async function exportFicheBatiment() {
  State.setLoading(true);

  try {
    const xlsx = await loadXLSX();
    const missionId = State.get('currentMissionId');
    const config = State.getConfig();
    const batiments = await BatimentDB.getByMission(missionId);
    const zones     = await ZoneDB.getByMission(missionId);
    const points    = await PointDB.getByMission(missionId);
    const mission   = await MissionDB.getById(missionId);

    const isCT = config.type === 'CT';
    const zoneKey = isCT ? 'zcs' : 'zone_homogene';
    const MAX_POINTS = 10; // largeur du gabarit réel (colonnes D à M)
    const POINT_COLS = ['D','E','F','G','H','I','J','K','L','M'];

    if (batiments.length === 0) {
      State.toast('Aucun bâtiment à exporter', 'warning');
      State.setLoading(false);
      return;
    }

    const wb = xlsx.utils.book_new();

    for (const bat of batiments) {
      const ws = {};
      const setCell = (addr, value, type = 's') => {
        if (value === '' || value === undefined || value === null) return;
        ws[addr] = { t: type, v: value };
      };

      const titre = isCT
        ? 'Fiche de prélèvement par bâtiment - Code du Travail'
        : 'Fiche de prélèvement par bâtiment - Code de la Santé Publique';
      setCell('C1', titre);
      setCell('C3', "Mesure intégrée de l'activité volumique en Radon 222");
      setCell('C5', 'En application de la norme NF ISO 11665-4');

      // ── Caractéristiques du bâtiment (colonne D, valeur unique) ──
      const bd = bat.data || {};

      // Dates de pose/dépose au niveau bâtiment = min/max des dates de tous ses points
      // (le gabarit veut une seule date de pose/dépose par bâtiment, l'appli les saisit
      // par point ; on les dérive plutôt que de redemander une double saisie).
      const batZonesForDates = zones.filter(z => z.batimentId === bat.id);
      const batPointsForDates = points.filter(p => batZonesForDates.some(z => z.id === p.zoneId));
      const poseDates = batPointsForDates.map(p => (p.data || {})[isCT ? 'date_pose' : 'date_debut']).filter(Boolean).sort();
      const deposeDates = batPointsForDates.map(p => (p.data || {})[isCT ? 'date_depose' : 'date_fin']).filter(Boolean).sort();
      const datePoseBat = poseDates[0];
      const dateDeposeBat = deposeDates[deposeDates.length - 1];
      // Durée d'inoccupation bâtiment (CSP uniquement) = somme des périodes d'inoccupation de ses points
      const dureeInoccBat = isCT ? null : batPointsForDates.reduce((sum, p) => {
        const v = parseFloat((p.data || {}).periode_inoccupation);
        return isNaN(v) ? sum : sum + v;
      }, 0);

      let r = 7;
      setCell('A' + r,   'désignation du bâtiment :');       setCell('D' + r, bd.nom); r++;
      if (!isCT) {
        setCell('A' + r, 'niveau le plus bas occupé (au moins 1h/jour) du bâtiment :');
        setCell('D' + r, bd.niveau_bas_occupe); r++;
      }
      setCell('A' + r,   "nombre d'occupants total du bâtiment :"); setCell('D' + r, bd.nb_occupants, 'n'); r++;
      setCell('A' + r,   'surface au sol :');                  setCell('D' + r, isCT ? bd.surface_sol : bd.surface_sol, 'n'); r++;
      setCell('A' + r,   'nombre de pièces :');                setCell('D' + r, isCT ? bd.nb_pieces : bd.nb_salles, 'n'); r++;
      setCell('A' + r,   'période de construction :');         setCell('D' + r, isCT ? bd.annee_construction : bd.periode_construction); r++;
      setCell('A' + r,   "Type d'interface sol/batiment :");   setCell('D' + r, bd.interface_sol); r++;
      setCell('A' + r,   'Matériau de construction :');        setCell('D' + r, bd.materiau); r++;
      setCell('A' + r,   'date de pose des dosimètres :');     setCell('D' + r, formatDateFr(datePoseBat)); r++;
      setCell('A' + r,   'date de dépose des dosimètres :');   setCell('D' + r, formatDateFr(dateDeposeBat)); r++;
      if (!isCT) {
        setCell('A' + r, "durée d'innocupation (jours) :");
        setCell('D' + r, dureeInoccBat > 0 ? dureeInoccBat : '', 'n');
        r++;
      }

      // ── Grille Zone / Point (colonnes D à M = jusqu'à 10 points) ──
      const titleRow = r + 1;
      setCell('D' + titleRow, 'Caractéristiques du bâtiment');
      const idxRow = titleRow + 1;
      POINT_COLS.forEach((c, i) => setCell(c + idxRow, i + 1, 'n'));

      const zoneRow0 = idxRow + 1;
      const zoneLabels = isCT
        ? ['Désignation Zone à Caractéristiques similaires', 'Niveau de la ZCS', 'Surface au sol  de la ZCS (en m2)', 'type de ventilation', "Entrée d'air en facade?", 'nombre de dosimètres posés']
        : ['Désignation Zone Homogène', 'Niveau de la zone homogène', 'Surface au sol  de la zone homogène (en m2)', 'Type de ventilation', "Entrée d'air en facade?", 'Nombre de dosimètres posés'];
      zoneLabels.forEach((lbl, i) => setCell('A' + (zoneRow0 + i), lbl));

      const pointRow0 = zoneRow0 + zoneLabels.length + 2; // ligne de titre vide entre les deux blocs
      const pointLabels = isCT
        ? ['Numéro PEARL', 'Lieu de Pose', "Nombre d'occupants de la pièce", "Type d'Activité professionnelle (fréquence d'utilisation)", 'Hauteur de pose (en mètre)', 'Distance du mur (en mètre)', 'Surface de la pièce instrumentée (en m2)', "Type d'Ouvrants (Composition des fenêtres)", 'Aération  des ouvrants (Fréquente/Moyenne/Faible)', 'Température (Faible/Moyenne/Forte)']
        : ['Numéro PEARL', 'Lieu de Pose', "Nombre d'occupants de la pièce", 'Type d\'activité dans la pièce', 'Hauteur de pose (en mètre)', 'Distance du mur (en mètre)', 'Surface de la pièce instrumentée (en m2)', "Type d'Ouvrants (Composition des fenêtres)", 'Aération  des ouvrants (Fréquente/Moyenne/Faible)', 'Température (Faible/Moyenne/Forte)'];
      pointLabels.forEach((lbl, i) => setCell('A' + (pointRow0 + i), lbl));

      // Remplir jusqu'à 10 points de ce bâtiment, colonne par colonne
      const batZones = zones.filter(z => z.batimentId === bat.id);
      let col = 0;
      for (const zone of batZones) {
        const zd = zone.data || {};
        const zPts = points.filter(p => p.zoneId === zone.id).sort((a, b) => a.order - b.order);
        for (const p of zPts) {
          if (col >= MAX_POINTS) break;
          const c = POINT_COLS[col];
          // Bloc zone (répété pour chaque point de cette zone)
          setCell(c + zoneRow0,     isCT ? zd.nom : zd.numero);
          setCell(c + (zoneRow0+1), zd.niveau ?? zd.niveau_etage);
          setCell(c + (zoneRow0+2), isCT ? zd.surface_sol : zd.superficie, 'n');
          setCell(c + (zoneRow0+3), zd.ventilation ?? zd.entrees_air_zone);
          // Bloc point
          const pd = p.data || {};
          setCell(c + pointRow0,     pd.num_detecteur ?? pd.num_dosimetrie);
          setCell(c + (pointRow0+1), pd.lieu_pose ?? pd.nom_piece);
          setCell(c + (pointRow0+3), isCT ? zd.activite : pd.utilisation);
          setCell(c + (pointRow0+4), pd.hauteur_sol);
          setCell(c + (pointRow0+5), pd.distance_mur);
          setCell(c + (pointRow0+6), pd.surface_piece ?? pd.superficie_piece, 'n');
          setCell(c + (pointRow0+7), pd.type_fenetres);
          setCell(c + (pointRow0+8), pd.aeration);
          setCell(c + (pointRow0+9), pd.temperature);
          col++;
        }
      }
      if (col > MAX_POINTS) {
        console.warn(`Bâtiment "${bd.nom}" : ${col} points, seuls les ${MAX_POINTS} premiers tiennent sur la fiche (limite du gabarit).`);
      }

      const lastRow = pointRow0 + pointLabels.length;
      ws['!ref'] = `A1:M${lastRow}`;
      ws['!cols'] = [{ wch: 3 }, { wch: 3 }, { wch: 3 }].concat(POINT_COLS.map(() => ({ wch: 16 })));

      const sheetName = (bd.nom || 'Bâtiment ' + (bat.order + 1)).replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Bâtiment';
      xlsx.utils.book_append_sheet(wb, ws, sheetName);
    }

    const dossier = mission.entree?.numero_dossier || 'fiche';
    const date = new Date().toISOString().slice(0, 10);
    const safeDossier = String(dossier).replace(/[^a-zA-Z0-9_-]+/g, '_');
    const filename = `FicheBatiment_${config.type}_${safeDossier}_${date}.xlsx`;
    xlsx.writeFile(wb, filename);
    State.toast(`${filename} téléchargée (${batiments.length} bâtiment(s))`, 'success');
  } catch (err) {
    State.toast('Erreur fiche bâtiment : ' + err.message, 'error');
    console.error(err);
  }

  State.setLoading(false);
}

// Petite aide : formatage date ISO (yyyy-mm-dd) en format français jj/mm/aaaa
function formatDateFr(iso) {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ── Export JSON (sauvegarde complète) ────────────────────────

async function exportJSON() {
  const missionId = State.get('currentMissionId');
  const { exportMissionFull } = await import('./database.js');

  try {
    const dump = await exportMissionFull(missionId);
    const json = JSON.stringify(dump, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const dossier = dump.mission?.entree?.numero_dossier || 'mission';
    link.download = `Radon_${dossier}_backup.json`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    State.toast('Sauvegarde JSON téléchargée', 'success');
  } catch (err) {
    State.toast('Erreur : ' + err.message, 'error');
  }
}

// ── Nav helper ──────────────────────────────────────────────

function renderExportNav(activeId) {
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
