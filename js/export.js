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
  // Charger via CDN
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  XLSX = window.XLSX;
  return XLSX;
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
          🧪 Fiche de prélèvement labo (PearL)
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
    $('#btn-export-json')?.addEventListener('click', () => exportJSON());
    $('#btn-back-export')?.addEventListener('click', () => {
      State.clearMission();
      State.navigate('home');
    });
    $$('.mission-nav-tab').forEach(tab => {
      tab.addEventListener('click', () => State.navigate(tab.dataset.navView));
    });
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

    // ── Onglet Entrée ──
    const entreeData = buildEntreeSheet(config, mission);
    const wsEntree = xlsx.utils.aoa_to_sheet(entreeData);
    xlsx.utils.book_append_sheet(wb, wsEntree, 'Entrée');

    // ── Onglet Tableau ──
    const tableauData = buildTableauSheet(config, batiments, zones, points);
    const wsTableau = xlsx.utils.aoa_to_sheet(tableauData);

    // Appliquer des largeurs de colonnes
    wsTableau['!cols'] = tableauData[0].map(() => ({ wch: 18 }));

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

function buildEntreeSheet(config, mission) {
  const rows = [];
  const entree = mission.entree || {};

  rows.push(['', 'RADON — ' + config.label]);
  rows.push([]);

  for (const section of config.entree.sections) {
    rows.push(['', section.title]);
    for (const field of section.fields) {
      const val = entree[field.id] ?? '';
      rows.push(['', field.label, val]);
    }
    rows.push([]);
  }

  return rows;
}

// ── Construction de l'onglet Tableau ────────────────────────

function buildTableauSheet(config, batiments, zones, points) {
  const isCT = config.type === 'CT';
  const rows = [];

  // ── Ligne d'en-tête ──
  if (isCT) {
    rows.push([
      'N° Ligne',
      'Bâtiment',
      'Zone à caractéristiques similaires (ZCS)',
      'Année de construction',
      'Matériau de construction principal',
      'Niveau de la ZCS',
      'Activité professionnelle',
      'Interface sol/bâtiment',
      'Ventilation',
      'Température',
      'Surface au sol (m²)',
      'Nombre de détecteur',
      'N° Détecteur',
      'Lieu de pose',
      'Type de fenêtres',
      'Surface de la pièce instrumentée (m²)',
      'Date de pose',
      'Date de dépose',
      'Durée totale de pose (jours)',
      '',  // colonne vide (U)
      'Dosimètre perdu ou détérioré',
      'Activité volumique (Bq/m³) (k=2)',
      'Incertitude',
      'Activité volumique moyenne attribuée à la zone (Bq.m-3)',
    ]);
  } else {
    rows.push([
      'N° Ligne',
      'Bâtiments',
      'Nombre de salles',
      'Surface au sol',
      'Période de construction',
      'Nombres de niveaux du bâtiment',
      'Niveau le plus bas occupé',
      'Interface avec le sol',
      'Matériau de construction principal (mur porteurs)',
      'N° Zone Homogène',
      'Superficie',
      'Nombres de pièces dans cette zone',
      'Nombres de pièces occupées',
      'Nombre de dispositifs de mesures',
      'Niveau de la zone homogène (étage)',
      "Entrée et sorties d'air de la zone",
      'Interface de la zone avec le sol',
      'Température Ambiante',
      'Nom de la pièce mesuré (utilisation)',
      'Superficie de la pièce mesuré',
      'utilisation de la pièce',
      'Composition des fenêtres',
      'Niveau de la pièce',
      'Aération par ouverture des fenêtres',
      "Entrées et sorties d'air de la pièce",
      'N° Dosimétrie',
      'Type de dosimètre',
      'Marque',
      'Hauteur de dosimètre par rapport au sol',
      'Distance du dosimètre par rapport au mur le plus proche',
      'Date de début de mesure',
      'Date de fin de mesure',
      'Durée de total de pose (j)',
      "Période d'inoccupation",
      "Taux d'inoccupation",
      'Dosimètre perdu ou détérioré',
      'Concentration mesurée',
      'Incertitude élargie (k=2)',
      'Activité volumique moyenne',
    ]);
  }

  // ── Lignes de données ──
  let lineNum = 1;

  for (const bat of batiments) {
    const batZones = zones.filter(z => z.batimentId === bat.id);

    for (const zone of batZones) {
      const zonePoints = points.filter(p => p.zoneId === zone.id);

      // Calculer la moyenne de la zone
      const valKey = isCT ? 'activite_bqm3' : 'concentration';
      const vals = zonePoints
        .map(p => parseFloat(p.resultats?.[valKey] || ''))
        .filter(v => !isNaN(v));
      const avg = vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : '';

      for (const point of zonePoints) {
        const d = point.data || {};
        const r = point.resultats || {};

        if (isCT) {
          // Durée de pose
          let duree = '';
          if (d.date_pose && d.date_depose) {
            const d1 = new Date(d.date_pose);
            const d2 = new Date(d.date_depose);
            duree = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
          }

          rows.push([
            lineNum++,
            bat.data?.nom || '',
            zone.data?.nom || '',
            bat.data?.annee_construction || '',
            bat.data?.materiau || '',
            zone.data?.niveau || '',
            zone.data?.activite || '',
            zone.data?.interface_sol || '',
            zone.data?.ventilation || '',
            zone.data?.temperature || '',
            zone.data?.surface_sol || '',
            1,                                 // Nombre de détecteur : toujours 1 (1 clic = 1 capteur)
            d.num_detecteur || '',
            d.lieu_pose || '',
            d.type_fenetres || '',
            d.surface_piece || '',
            d.date_pose || '',
            d.date_depose || '',
            duree,
            '',  // colonne vide
            r.dosimetre_perdu || 'NON',
            r.activite_bqm3 || '',
            r.incertitude || '',
            avg,
          ]);
        } else {
          // CSP
          let duree = '';
          if (d.date_debut && d.date_fin) {
            const d1 = new Date(d.date_debut);
            const d2 = new Date(d.date_fin);
            duree = Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
          }
          const tauxInocc = duree && d.periode_inoccupation
            ? (parseFloat(d.periode_inoccupation) / duree).toFixed(2)
            : '';

          rows.push([
            lineNum++,
            bat.data?.nom || '',
            bat.data?.nb_salles || '',
            bat.data?.surface_sol || '',
            bat.data?.periode_construction || '',
            bat.data?.nb_niveaux || '',
            bat.data?.niveau_bas_occupe || '',
            bat.data?.interface_sol || '',
            bat.data?.materiau || '',
            zone.data?.numero || '',
            zone.data?.superficie || '',
            zone.data?.nb_pieces || '',
            zone.data?.nb_pieces_occupees || '',
            zone.data?.nb_dispositifs || '',
            zone.data?.niveau_etage || '',
            zone.data?.entrees_air_zone || '',
            zone.data?.interface_sol_zone || '',
            zone.data?.temperature || '',
            d.nom_piece || '',
            d.superficie_piece || '',
            d.utilisation || '',
            d.type_fenetres || '',
            d.niveau_piece || '',
            d.aeration || '',
            d.entrees_air_piece || '',
            d.num_dosimetrie || '',
            d.type_dosimetre || '',
            d.marque || '',
            d.hauteur_sol || '',
            d.distance_mur || '',
            d.date_debut || '',
            d.date_fin || '',
            duree,
            d.periode_inoccupation || '',
            tauxInocc,
            r.dosimetre_perdu || 'NON',
            r.concentration || '',
            r.incertitude || '',
            avg,
          ]);
        }
      }
    }
  }

  return rows;
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
