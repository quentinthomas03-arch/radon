// ============================================================
// database.js — IndexedDB : stockage local hors-ligne
// Stores : missions, batiments, zones, points, plans, photos
// ============================================================

const DB_NAME = 'RadonPWA';
const DB_VERSION = 1;

let _db = null;

/**
 * Ouvre (ou crée) la base IndexedDB
 */
export async function openDB() {
  if (_db) return _db;

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      // ── Store : missions ──────────────────────────────────
      // Une mission = un dossier complet (CT ou CSP)
      if (!db.objectStoreNames.contains('missions')) {
        const ms = db.createObjectStore('missions', { keyPath: 'id' });
        ms.createIndex('by_type', 'type');            // 'CT' ou 'CSP'
        ms.createIndex('by_date', 'createdAt');
        ms.createIndex('by_dossier', 'numero_dossier');
      }

      // ── Store : batiments ─────────────────────────────────
      if (!db.objectStoreNames.contains('batiments')) {
        const bs = db.createObjectStore('batiments', { keyPath: 'id' });
        bs.createIndex('by_mission', 'missionId');
        bs.createIndex('by_order', ['missionId', 'order']);
      }

      // ── Store : zones (ZCS pour CT, ZH pour CSP) ──────────
      if (!db.objectStoreNames.contains('zones')) {
        const zs = db.createObjectStore('zones', { keyPath: 'id' });
        zs.createIndex('by_batiment', 'batimentId');
        zs.createIndex('by_mission', 'missionId');
        zs.createIndex('by_order', ['batimentId', 'order']);
      }

      // ── Store : points (1 dosimètre = 1 point) ───────────
      if (!db.objectStoreNames.contains('points')) {
        const ps = db.createObjectStore('points', { keyPath: 'id' });
        ps.createIndex('by_zone', 'zoneId');
        ps.createIndex('by_batiment', 'batimentId');
        ps.createIndex('by_mission', 'missionId');
        ps.createIndex('by_order', ['zoneId', 'order']);
      }

      // ── Store : plans (images de plans avec positions) ────
      if (!db.objectStoreNames.contains('plans')) {
        const pls = db.createObjectStore('plans', { keyPath: 'id' });
        pls.createIndex('by_mission', 'missionId');
      }

      // ── Store : photos (photos terrain) ───────────────────
      if (!db.objectStoreNames.contains('photos')) {
        const phs = db.createObjectStore('photos', { keyPath: 'id' });
        phs.createIndex('by_point', 'pointId');
        phs.createIndex('by_mission', 'missionId');
      }
    };

    req.onsuccess = (e) => {
      _db = e.target.result;
      resolve(_db);
    };

    req.onerror = (e) => {
      reject(new Error('IndexedDB open failed: ' + e.target.error));
    };
  });
}

// ── Helpers génériques ──────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function tx(storeName, mode = 'readonly') {
  return _db.transaction(storeName, mode).objectStore(storeName);
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── CRUD générique ──────────────────────────────────────────

async function put(storeName, record) {
  const db = await openDB();
  return promisify(tx(storeName, 'readwrite').put(record));
}

async function get(storeName, id) {
  const db = await openDB();
  return promisify(tx(storeName, 'readonly').get(id));
}

async function del(storeName, id) {
  const db = await openDB();
  return promisify(tx(storeName, 'readwrite').delete(id));
}

async function getAll(storeName) {
  const db = await openDB();
  return promisify(tx(storeName, 'readonly').getAll());
}

async function getAllByIndex(storeName, indexName, key) {
  const db = await openDB();
  return promisify(tx(storeName, 'readonly').index(indexName).getAll(key));
}

// ── API Missions ────────────────────────────────────────────

export const MissionDB = {
  async create(type, data = {}) {
    const mission = {
      id: generateId(),
      type,  // 'CT' ou 'CSP'
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'draft',   // draft | terrain | resultats | export
      entree: {},         // données de l'onglet Entrée
      ...data,
    };
    await put('missions', mission);
    return mission;
  },

  async getById(id) {
    return get('missions', id);
  },

  async getAll() {
    return getAll('missions');
  },

  async getAllByType(type) {
    return getAllByIndex('missions', 'by_type', type);
  },

  async update(id, patch) {
    const mission = await get('missions', id);
    if (!mission) throw new Error('Mission not found: ' + id);
    Object.assign(mission, patch, { updatedAt: new Date().toISOString() });
    await put('missions', mission);
    return mission;
  },

  async updateEntree(id, entreeData) {
    const mission = await get('missions', id);
    if (!mission) throw new Error('Mission not found: ' + id);
    mission.entree = { ...mission.entree, ...entreeData };
    mission.updatedAt = new Date().toISOString();
    await put('missions', mission);
    return mission;
  },

  async delete(id) {
    // Supprimer en cascade : photos, points, zones, batiments, plans
    const photos = await getAllByIndex('photos', 'by_mission', id);
    const points = await getAllByIndex('points', 'by_mission', id);
    const zones  = await getAllByIndex('zones',  'by_mission', id);
    const bats   = await getAllByIndex('batiments', 'by_mission', id);
    const plans  = await getAllByIndex('plans', 'by_mission', id);

    for (const p of photos) await del('photos', p.id);
    for (const p of points) await del('points', p.id);
    for (const z of zones)  await del('zones',  z.id);
    for (const b of bats)   await del('batiments', b.id);
    for (const p of plans)  await del('plans', p.id);
    await del('missions', id);
  },
};

// ── API Bâtiments ───────────────────────────────────────────

export const BatimentDB = {
  async create(missionId, data = {}) {
    const siblings = await getAllByIndex('batiments', 'by_mission', missionId);
    const bat = {
      id: generateId(),
      missionId,
      order: siblings.length,
      data: {},
      ...data,
    };
    await put('batiments', bat);
    return bat;
  },

  async getByMission(missionId) {
    const bats = await getAllByIndex('batiments', 'by_mission', missionId);
    return bats.sort((a, b) => a.order - b.order);
  },

  async getById(id) {
    return get('batiments', id);
  },

  async update(id, patch) {
    const bat = await get('batiments', id);
    if (!bat) throw new Error('Batiment not found: ' + id);
    if (patch.data) bat.data = { ...bat.data, ...patch.data };
    if (patch.order !== undefined) bat.order = patch.order;
    await put('batiments', bat);
    return bat;
  },

  async delete(id) {
    // Supprimer zones et points enfants
    const zones = await getAllByIndex('zones', 'by_batiment', id);
    for (const z of zones) await ZoneDB.delete(z.id);
    await del('batiments', id);
  },
};

// ── API Zones ───────────────────────────────────────────────

export const ZoneDB = {
  async create(batimentId, missionId, data = {}) {
    const siblings = await getAllByIndex('zones', 'by_batiment', batimentId);
    const zone = {
      id: generateId(),
      batimentId,
      missionId,
      order: siblings.length,
      data: {},
      ...data,
    };
    await put('zones', zone);
    return zone;
  },

  async getByBatiment(batimentId) {
    const zones = await getAllByIndex('zones', 'by_batiment', batimentId);
    return zones.sort((a, b) => a.order - b.order);
  },

  async getByMission(missionId) {
    const zones = await getAllByIndex('zones', 'by_mission', missionId);
    return zones.sort((a, b) => a.order - b.order);
  },

  async getById(id) {
    return get('zones', id);
  },

  async update(id, patch) {
    const zone = await get('zones', id);
    if (!zone) throw new Error('Zone not found: ' + id);
    if (patch.data) zone.data = { ...zone.data, ...patch.data };
    if (patch.order !== undefined) zone.order = patch.order;
    await put('zones', zone);
    return zone;
  },

  async delete(id) {
    // Supprimer points enfants
    const points = await getAllByIndex('points', 'by_zone', id);
    for (const p of points) await PointDB.delete(p.id);
    await del('zones', id);
  },
};

// ── API Points de mesure ────────────────────────────────────

export const PointDB = {
  async create(zoneId, batimentId, missionId, data = {}) {
    const siblings = await getAllByIndex('points', 'by_zone', zoneId);
    const point = {
      id: generateId(),
      zoneId,
      batimentId,
      missionId,
      order: siblings.length,
      data: {},        // champs terrain
      resultats: {},   // champs résultats labo
      planPosition: null, // { planId, x, y } position sur le plan
      ...data,
    };
    await put('points', point);
    return point;
  },

  async getByZone(zoneId) {
    const points = await getAllByIndex('points', 'by_zone', zoneId);
    return points.sort((a, b) => a.order - b.order);
  },

  async getByBatiment(batimentId) {
    const points = await getAllByIndex('points', 'by_batiment', batimentId);
    return points.sort((a, b) => a.order - b.order);
  },

  async getByMission(missionId) {
    const points = await getAllByIndex('points', 'by_mission', missionId);
    return points.sort((a, b) => a.order - b.order);
  },

  async getById(id) {
    return get('points', id);
  },

  async update(id, patch) {
    const point = await get('points', id);
    if (!point) throw new Error('Point not found: ' + id);
    if (patch.data) point.data = { ...point.data, ...patch.data };
    if (patch.resultats) point.resultats = { ...point.resultats, ...patch.resultats };
    if (patch.planPosition !== undefined) point.planPosition = patch.planPosition;
    if (patch.order !== undefined) point.order = patch.order;
    await put('points', point);
    return point;
  },

  async delete(id) {
    const photos = await getAllByIndex('photos', 'by_point', id);
    for (const ph of photos) await del('photos', ph.id);
    await del('points', id);
  },
};

// ── API Plans ───────────────────────────────────────────────

export const PlanDB = {
  async create(missionId, data = {}) {
    const plan = {
      id: generateId(),
      missionId,
      name: data.name || 'Plan',
      imageData: data.imageData || null,  // base64 ou blob
      mimeType: data.mimeType || 'image/png',
      width: data.width || 0,
      height: data.height || 0,
      createdAt: new Date().toISOString(),
    };
    await put('plans', plan);
    return plan;
  },

  async getByMission(missionId) {
    return getAllByIndex('plans', 'by_mission', missionId);
  },

  async getById(id) {
    return get('plans', id);
  },

  async update(id, patch) {
    const plan = await get('plans', id);
    if (!plan) throw new Error('Plan not found: ' + id);
    Object.assign(plan, patch);
    await put('plans', plan);
    return plan;
  },

  async delete(id) {
    await del('plans', id);
  },
};

// ── API Photos ──────────────────────────────────────────────

export const PhotoDB = {
  async create(pointId, missionId, data = {}) {
    const photo = {
      id: generateId(),
      pointId,
      missionId,
      imageData: data.imageData,  // base64
      caption: data.caption || '',
      createdAt: new Date().toISOString(),
    };
    await put('photos', photo);
    return photo;
  },

  async getByPoint(pointId) {
    return getAllByIndex('photos', 'by_point', pointId);
  },

  async getByMission(missionId) {
    return getAllByIndex('photos', 'by_mission', missionId);
  },

  async delete(id) {
    await del('photos', id);
  },
};

// ── Export complet d'une mission (pour debug / sauvegarde) ──

export async function exportMissionFull(missionId) {
  const mission = await MissionDB.getById(missionId);
  if (!mission) throw new Error('Mission not found');

  const batiments = await BatimentDB.getByMission(missionId);
  const zones     = await ZoneDB.getByMission(missionId);
  const points    = await PointDB.getByMission(missionId);
  const plans     = await PlanDB.getByMission(missionId);
  const photos    = await PhotoDB.getByMission(missionId);

  return { mission, batiments, zones, points, plans, photos };
}

// ── Import complet d'une mission ────────────────────────────

export async function importMissionFull(dump) {
  await put('missions', dump.mission);
  for (const b of dump.batiments) await put('batiments', b);
  for (const z of dump.zones)     await put('zones', z);
  for (const p of dump.points)    await put('points', p);
  for (const p of dump.plans)     await put('plans', p);
  for (const p of dump.photos)    await put('photos', p);
  return dump.mission;
}
