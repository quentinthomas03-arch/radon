// ============================================================
// app.js — Contrôleur principal de l'application
// ============================================================

import { openDB, MissionDB, BatimentDB, ZoneDB, PointDB } from './database.js';
import * as State from './state.js';
import { renderPlan, initPlan }       from './plan.js';
import { renderTerrain }              from './terrain.js';
import { renderResultats }            from './resultats.js';
import { renderExport }               from './export.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

// ── Initialisation ──────────────────────────────────────────

export async function initApp() {
  await openDB();

  // Écouter les changements de vue
  State.on('navigate', ({ view }) => renderView(view));
  State.on('toast:add', renderToasts);
  State.on('toast:remove', renderToasts);
  State.on('state:loading', renderLoading);

  // Rendu initial
  renderView('home');
}

// ── Routeur de vues ─────────────────────────────────────────

async function renderView(view) {
  const app = $('#app-content');
  if (!app) return;

  // Mettre à jour la nav
  $$('.nav-tab').forEach(el => {
    el.classList.toggle('active', el.dataset.view === view);
  });

  switch (view) {
    case 'home':
      app.innerHTML = renderHome();
      bindHomeEvents();
      break;

    case 'mission-list':
      app.innerHTML = await renderMissionList();
      bindMissionListEvents();
      break;

    case 'entree':
      app.innerHTML = renderEntree();
      bindEntreeEvents();
      break;

    case 'plan':
      app.innerHTML = renderPlanView();
      initPlan();
      break;

    case 'terrain':
      app.innerHTML = renderTerrain();
      break;

    case 'resultats':
      app.innerHTML = renderResultats();
      break;

    case 'export':
      app.innerHTML = renderExport();
      break;

    default:
      app.innerHTML = `<div class="empty-state"><p>Vue inconnue : ${view}</p></div>`;
  }
}

// ── Vue : Accueil (choix CT / CSP) ──────────────────────────

function renderHome() {
  return `
    <div class="home-screen">
      <div class="home-header">
        <div class="home-logo">
          <svg viewBox="0 0 48 48" width="64" height="64">
            <circle cx="24" cy="24" r="22" fill="none" stroke="var(--accent)" stroke-width="2.5"/>
            <text x="24" y="30" text-anchor="middle" font-size="18" font-weight="700" fill="var(--accent)">Rn</text>
          </svg>
        </div>
        <h1>Radon — Saisie terrain</h1>
        <p class="home-subtitle">Mesurage de l'activité volumique du radon</p>
      </div>

      <div class="home-actions">
        <h2>Nouvelle mission</h2>
        <div class="type-cards">
          <button class="type-card" data-type="CT">
            <div class="type-card-icon">🏢</div>
            <div class="type-card-label">Code du Travail</div>
            <div class="type-card-desc">Lieux de travail<br>R.4451-10 et suivants</div>
          </button>
          <button class="type-card" data-type="CSP">
            <div class="type-card-icon">🏫</div>
            <div class="type-card-label">Code de la Santé Publique</div>
            <div class="type-card-desc">ERP<br>R.1333-33 et suivants</div>
          </button>
        </div>
      </div>

      <div class="home-actions">
        <button class="btn btn-secondary btn-block" id="btn-list-missions">
          📋 Missions existantes
        </button>
      </div>
    </div>
  `;
}

function bindHomeEvents() {
  // Cartes CT / CSP
  $$('.type-card').forEach(card => {
    card.addEventListener('click', async () => {
      const type = card.dataset.type;
      State.setLoading(true);
      try {
        const mission = await MissionDB.create(type);
        State.setMission(mission.id, type);
        State.navigate('entree');
        State.toast(`Mission ${type} créée`, 'success');
      } catch (err) {
        State.toast('Erreur : ' + err.message, 'error');
      }
      State.setLoading(false);
    });
  });

  // Liste missions
  $('#btn-list-missions')?.addEventListener('click', () => {
    State.navigate('mission-list');
  });
}

// ── Vue : Liste des missions ────────────────────────────────

async function renderMissionList() {
  const missions = await MissionDB.getAll();
  missions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const rows = missions.map(m => {
    const dossier = m.entree?.numero_dossier || '(sans numéro)';
    const etab    = m.entree?.etab_nom || '';
    const date    = new Date(m.createdAt).toLocaleDateString('fr-FR');
    const badge   = m.type === 'CT'
      ? '<span class="badge badge-ct">CT</span>'
      : '<span class="badge badge-csp">CSP</span>';

    return `
      <div class="mission-row" data-id="${m.id}" data-type="${m.type}">
        <div class="mission-row-main">
          ${badge}
          <div class="mission-row-info">
            <div class="mission-row-title">${dossier}</div>
            <div class="mission-row-sub">${etab} — ${date}</div>
          </div>
        </div>
        <div class="mission-row-actions">
          <button class="btn-icon btn-open" title="Ouvrir">▶</button>
          <button class="btn-icon btn-delete" title="Supprimer">🗑</button>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="view-header">
      <button class="btn-back" id="btn-back">←</button>
      <h2>Missions</h2>
    </div>
    <div class="mission-list">
      ${missions.length === 0
        ? '<div class="empty-state"><p>Aucune mission enregistrée</p></div>'
        : rows
      }
    </div>
  `;
}

function bindMissionListEvents() {
  $('#btn-back')?.addEventListener('click', () => State.navigate('home'));

  $$('.mission-row .btn-open').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const row = btn.closest('.mission-row');
      openMission(row.dataset.id, row.dataset.type);
    });
  });

  $$('.mission-row .btn-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const row = btn.closest('.mission-row');
      if (confirm('Supprimer cette mission ?')) {
        await MissionDB.delete(row.dataset.id);
        State.toast('Mission supprimée', 'info');
        renderView('mission-list');
      }
    });
  });

  // Clic sur la ligne entière
  $$('.mission-row').forEach(row => {
    row.addEventListener('click', () => {
      openMission(row.dataset.id, row.dataset.type);
    });
  });
}

async function openMission(id, type) {
  State.setMission(id, type);
  State.navigate('entree');
}

// ── Vue : Onglet Entrée (formulaire) ────────────────────────

function renderEntree() {
  const config = State.getConfig();
  if (!config) return '<p>Aucune mission chargée</p>';

  const sections = config.entree.sections.map(section => {
    const fieldsHtml = section.fields.map(f => renderField(f)).join('');
    const collapsible = section.collapsible
      ? 'data-collapsible="true"'
      : '';

    return `
      <fieldset class="form-section" ${collapsible}>
        <legend class="form-section-title" ${section.collapsible ? 'role="button" tabindex="0"' : ''}>
          ${section.title}
          ${section.collapsible ? '<span class="collapse-icon">▾</span>' : ''}
        </legend>
        <div class="form-section-body">
          ${fieldsHtml}
        </div>
      </fieldset>
    `;
  }).join('');

  return `
    <div class="view-header">
      <button class="btn-back" id="btn-back-entree">←</button>
      <h2>${config.label} — Saisie</h2>
    </div>

    ${renderMissionNav()}

    <form id="form-entree" class="form-entree" novalidate>
      ${sections}
      <div class="form-actions">
        <button type="button" class="btn btn-primary btn-block" id="btn-save-entree">
          💾 Enregistrer
        </button>
      </div>
    </form>
  `;
}

function renderField(field) {
  let input = '';

  switch (field.type) {
    case 'select':
      const opts = (field.options || []).map(o =>
        `<option value="${o}">${o}</option>`
      ).join('');
      input = `
        <select id="field-${field.id}" name="${field.id}" class="form-input"
          ${field.required ? 'required' : ''}>
          <option value="">— Choisir —</option>
          ${opts}
        </select>
      `;
      break;

    case 'date':
      input = `<input type="date" id="field-${field.id}" name="${field.id}"
        class="form-input" ${field.required ? 'required' : ''}>`;
      break;

    case 'number':
      input = `<input type="number" id="field-${field.id}" name="${field.id}"
        class="form-input" inputmode="numeric" step="any"
        ${field.required ? 'required' : ''}
        ${field.default !== undefined ? `value="${field.default}"` : ''}>`;
      break;

    case 'email':
      input = `<input type="email" id="field-${field.id}" name="${field.id}"
        class="form-input" inputmode="email" ${field.required ? 'required' : ''}>`;
      break;

    case 'tel':
      input = `<input type="tel" id="field-${field.id}" name="${field.id}"
        class="form-input" inputmode="tel" ${field.required ? 'required' : ''}>`;
      break;

    default:
      input = `<input type="text" id="field-${field.id}" name="${field.id}"
        class="form-input" ${field.required ? 'required' : ''}
        ${field.default !== undefined ? `value="${field.default}"` : ''}>`;
  }

  return `
    <div class="form-group ${field.required ? 'required' : ''}">
      <label class="form-label" for="field-${field.id}">${field.label}</label>
      ${input}
      ${field.hint ? `<div class="form-hint">${field.hint}</div>` : ''}
    </div>
  `;
}

function renderMissionNav() {
  const config = State.getConfig();
  const views = [
    { id: 'entree',    label: '📝 Entrée',    icon: '📝' },
    { id: 'plan',      label: '🗺 Plan',       icon: '🗺' },
    { id: 'terrain',   label: '📍 Terrain',    icon: '📍' },
    { id: 'resultats', label: '📊 Résultats',  icon: '📊' },
    { id: 'export',    label: '📤 Export',      icon: '📤' },
  ];

  const current = State.get('currentView');
  return `
    <nav class="mission-nav">
      ${views.map(v => `
        <button class="mission-nav-tab ${current === v.id ? 'active' : ''}"
          data-nav-view="${v.id}">
          <span class="nav-icon">${v.icon}</span>
          <span class="nav-label">${v.label.split(' ').slice(1).join(' ')}</span>
        </button>
      `).join('')}
    </nav>
  `;
}

function bindEntreeEvents() {
  // Retour
  $('#btn-back-entree')?.addEventListener('click', () => {
    State.clearMission();
    State.navigate('home');
  });

  // Tabs navigation
  $$('.mission-nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      saveEntreeForm();  // sauvegarde auto avant navigation
      State.navigate(tab.dataset.navView);
    });
  });

  // Sections collapsibles
  $$('[data-collapsible] legend').forEach(legend => {
    legend.addEventListener('click', () => {
      const fieldset = legend.parentElement;
      fieldset.classList.toggle('collapsed');
    });
  });

  // Sauvegarde
  $('#btn-save-entree')?.addEventListener('click', saveEntreeForm);

  // Charger les valeurs existantes
  loadEntreeForm();
}

async function loadEntreeForm() {
  const missionId = State.get('currentMissionId');
  if (!missionId) return;

  const mission = await MissionDB.getById(missionId);
  if (!mission || !mission.entree) return;

  const form = $('#form-entree');
  if (!form) return;

  for (const [key, value] of Object.entries(mission.entree)) {
    const input = form.querySelector(`[name="${key}"]`);
    if (input && value !== undefined && value !== null) {
      input.value = value;
    }
  }
}

async function saveEntreeForm() {
  const missionId = State.get('currentMissionId');
  if (!missionId) return;

  const form = $('#form-entree');
  if (!form) return;

  const formData = new FormData(form);
  const data = {};
  for (const [key, value] of formData.entries()) {
    if (value !== '') data[key] = value;
  }

  try {
    await MissionDB.updateEntree(missionId, data);
    State.toast('Données enregistrées', 'success', 1500);
  } catch (err) {
    State.toast('Erreur de sauvegarde : ' + err.message, 'error');
  }
}

// ── Vue : Plan (wrapper) ────────────────────────────────────

function renderPlanView() {
  const config = State.getConfig();
  return `
    <div class="view-header">
      <button class="btn-back" id="btn-back-plan">←</button>
      <h2>${config?.label || ''} — Plan</h2>
    </div>
    ${renderMissionNav()}
    <div id="plan-container"></div>
  `;
}

// ── Toasts ──────────────────────────────────────────────────

function renderToasts() {
  let container = $('#toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toasts = State.get('toasts') || [];
  container.innerHTML = toasts.map(t => `
    <div class="toast toast-${t.type}" data-toast-id="${t.id}">
      ${t.message}
    </div>
  `).join('');
}

// ── Loading overlay ─────────────────────────────────────────

function renderLoading(isLoading) {
  let overlay = $('#loading-overlay');
  if (isLoading) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loading-overlay';
      overlay.innerHTML = '<div class="spinner"></div>';
      document.body.appendChild(overlay);
    }
    overlay.classList.add('visible');
  } else if (overlay) {
    overlay.classList.remove('visible');
  }
}

// ── Bind global nav events (pour le header, appelé une fois) ──

export function bindGlobalNav() {
  // Retour plan -> terrain -> etc via les onglets de mission
  document.addEventListener('click', (e) => {
    const navTab = e.target.closest('.mission-nav-tab');
    if (navTab) {
      // Sauvegarde automatique du formulaire courant si besoin
      const currentForm = $('form');
      if (currentForm) {
        // Trigger sauvegarde auto
        const saveBtn = currentForm.querySelector('[id^="btn-save"]');
        if (saveBtn) saveBtn.click();
      }
      State.navigate(navTab.dataset.navView);
    }
  });
}
