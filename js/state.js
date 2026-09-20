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

  // Mission courante
  currentMissionId: null,
  currentConfig: null,        // CONFIG_CT ou CONFIG_CSP

  // UI
  toasts: [],
  loading: false,
};

// ── Getters ─────────────────────────────────────────────────

export function get(key) {
  return state[key];
}

export function getConfig() {
  return state.currentConfig;
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
    currentView: view,
    ...params,
  });
  emit('navigate', { view, params, from: prev });

  // Scroll top
  window.scrollTo(0, 0);
}

// ── Mission ─────────────────────────────────────────────────

export function setMission(missionId, type) {
  const config = type === 'CT' ? CONFIG_CT : CONFIG_CSP;
  setMultiple({
    currentMissionId: missionId,
    currentConfig: config,
  });
}

export function clearMission() {
  setMultiple({
    currentMissionId: null,
    currentConfig: null,
  });
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

function off(event, callback) {
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
