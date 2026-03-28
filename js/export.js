// ============================================================
// export.js — Génération XLSX structuré (onglets Entrée + Tableau)
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
          📤 Exporter en XLSX
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

// ── Export XLSX ──────────────────────────────────────────────

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
            d.nb_detecteur || 1,
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
