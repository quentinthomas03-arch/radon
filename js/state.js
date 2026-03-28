// ============================================================
// state.js — État applicatif réactif + bus d'événements
// ============================================================

import { CONFIG_CT }  from './config-ct.js';
import { CONFIG_CSP } from './config-csp.js';

const _listeners = new Map();

// ── État global ─────────────────────────────────────────────

const state = {
  // Navigation
  currentView: 'home',       // home | mission-list | entree | plan | terrain | resultats | export
  previousView: null,

  // Mission courante
  currentMissionId: null,
  currentMissionType: null,   // 'CT' ou 'CSP'
  currentConfig: null,        // CONFIG_CT ou CONFIG_CSP

  // Sélection courante dans l'arborescence
  currentBatimentId: null,
  currentZoneId: null,
  currentPointId: null,

  // Plan interactif
  currentPlanId: null,
  planMode: 'view',           // view | place | edit

  // UI
  sidebarOpen: false,
  modalOpen: null,            // null ou { type, data }
  toasts: [],
  loading: false,
};

// ── Getters ─────────────────────────────────────────────────

export function getState() {
  return { ...state };
}

export function get(key) {
  return state[key];
}

export function getConfig() {
  return state.currentConfig;
}

export function getMissionType() {
  return state.currentMissionType;
}

// ── Setters avec notification ───────────────────────────────

export function set(key, value) {
  const oldValue = state[key];
  state[key] = value;
  if (oldValue !== value) {
    emit('state:change', { key, value, oldValue });
    emit(`state:${key}`, value);
  }
}

export function setMultiple(patch) {
  const changes = [];
  for (const [key, value] of Object.entries(patch)) {
    const oldValue = state[key];
    state[key] = value;
    if (oldValue !== value) {
      changes.push({ key, value, oldValue });
    }
  }
  if (changes.length) {
    for (const c of changes) {
      emit(`state:${c.key}`, c.value);
    }
    emit('state:change', changes);
  }
}

// ── Navigation ──────────────────────────────────────────────

export function navigate(view, params = {}) {
  const prev = state.currentView;
  setMultiple({
    previousView: prev,
    currentView: view,
    ...params,
  });
  emit('navigate', { view, params, from: prev });

  // Scroll top
  window.scrollTo(0, 0);
}

export function goBack() {
  if (state.previousView) {
    navigate(state.previousView);
  } else {
    navigate('home');
  }
}

// ── Mission ─────────────────────────────────────────────────

export function setMission(missionId, type) {
  const config = type === 'CT' ? CONFIG_CT : CONFIG_CSP;
  setMultiple({
    currentMissionId: missionId,
    currentMissionType: type,
    currentConfig: config,
    currentBatimentId: null,
    currentZoneId: null,
    currentPointId: null,
    currentPlanId: null,
  });
  emit('mission:loaded', { missionId, type });
}

export function clearMission() {
  setMultiple({
    currentMissionId: null,
    currentMissionType: null,
    currentConfig: null,
    currentBatimentId: null,
    currentZoneId: null,
    currentPointId: null,
    currentPlanId: null,
  });
}

// ── Sélection arborescence ──────────────────────────────────

export function selectBatiment(id) {
  setMultiple({
    currentBatimentId: id,
    currentZoneId: null,
    currentPointId: null,
  });
  emit('selection:batiment', id);
}

export function selectZone(id) {
  set('currentZoneId', id);
  set('currentPointId', null);
  emit('selection:zone', id);
}

export function selectPoint(id) {
  set('currentPointId', id);
  emit('selection:point', id);
}

// ── Modal ───────────────────────────────────────────────────

export function openModal(type, data = {}) {
  set('modalOpen', { type, data });
  emit('modal:open', { type, data });
}

export function closeModal() {
  set('modalOpen', null);
  emit('modal:close');
}

// ── Toast notifications ─────────────────────────────────────

let _toastId = 0;

export function toast(message, type = 'info', duration = 3000) {
  const id = ++_toastId;
  const t = { id, message, type, duration };
  state.toasts = [...state.toasts, t];
  emit('toast:add', t);

  if (duration > 0) {
    setTimeout(() => dismissToast(id), duration);
  }
  return id;
}

export function dismissToast(id) {
  state.toasts = state.toasts.filter(t => t.id !== id);
  emit('toast:remove', id);
}

// ── Loading ─────────────────────────────────────────────────

export function setLoading(val) {
  set('loading', !!val);
}

// ── Bus d'événements ────────────────────────────────────────

export function on(event, callback) {
  if (!_listeners.has(event)) _listeners.set(event, new Set());
  _listeners.get(event).add(callback);
  return () => off(event, callback);
}

export function off(event, callback) {
  const set = _listeners.get(event);
  if (set) set.delete(callback);
}

export function emit(event, data) {
  const set = _listeners.get(event);
  if (set) {
    for (const cb of set) {
      try { cb(data); } catch (err) { console.error(`Event ${event} handler error:`, err); }
    }
  }
}

// ── Raccourcis config ───────────────────────────────────────

export function getConfigForType(type) {
  return type === 'CT' ? CONFIG_CT : CONFIG_CSP;
}
