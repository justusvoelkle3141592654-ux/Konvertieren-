// Speichersystem auf Basis von IndexedDB.
//  - Store "worlds": Metadaten, Spielerdaten, Fortschritt, Vorschaubild je Welt
//  - Store "chunks": nur veränderte Chunks (Blockdaten, Metadaten, Block-Entities)
// Unveränderte Chunks werden beim Laden aus dem Seed neu erzeugt.
import { DB_NAME, DB_VERSION } from '../config.js';

let dbPromise = null;

function openDatabase() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB ist in diesem Browser nicht verfügbar.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('worlds')) {
        db.createObjectStore('worlds', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('chunks')) {
        const chunks = db.createObjectStore('chunks', { keyPath: 'key' });
        chunks.createIndex('worldId', 'worldId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB konnte nicht geöffnet werden.'));
    request.onblocked = () => reject(new Error('Die Datenbank ist durch einen anderen Tab blockiert.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Speichervorgang abgebrochen (Speicherplatz voll?).'));
  });
}

export const saveSystem = {
  /** Alle Welten, zuletzt gespielt zuerst. */
  async listWorlds() {
    const db = await openDatabase();
    const tx = db.transaction('worlds', 'readonly');
    const list = await requestToPromise(tx.objectStore('worlds').getAll());
    return list.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  },

  async getWorld(id) {
    const db = await openDatabase();
    const tx = db.transaction('worlds', 'readonly');
    const value = await requestToPromise(tx.objectStore('worlds').get(id));
    return value ?? null;
  },

  async putWorld(meta) {
    const db = await openDatabase();
    const tx = db.transaction('worlds', 'readwrite');
    tx.objectStore('worlds').put(meta);
    await txDone(tx);
    return meta;
  },

  async deleteWorld(id) {
    const db = await openDatabase();
    const tx = db.transaction(['worlds', 'chunks'], 'readwrite');
    tx.objectStore('worlds').delete(id);
    const cursorReq = tx.objectStore('chunks').index('worldId').openCursor(IDBKeyRange.only(id));
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        cursor.delete();
        cursor.continue();
      }
    };
    await txDone(tx);
  },

  async getChunk(key) {
    const db = await openDatabase();
    const tx = db.transaction('chunks', 'readonly');
    const value = await requestToPromise(tx.objectStore('chunks').get(key));
    return value ?? null;
  },

  /** records: Array von { key, worldId, dim, cx, cz, blocks, meta, blockEntities, ... } */
  async putChunks(records) {
    if (!records.length) return;
    const db = await openDatabase();
    const tx = db.transaction('chunks', 'readwrite');
    const store = tx.objectStore('chunks');
    for (const record of records) store.put(record);
    await txDone(tx);
  },

  async countChunks(worldId) {
    const db = await openDatabase();
    const tx = db.transaction('chunks', 'readonly');
    return requestToPromise(tx.objectStore('chunks').index('worldId').count(IDBKeyRange.only(worldId)));
  },

  async isAvailable() {
    try {
      await openDatabase();
      return true;
    } catch {
      return false;
    }
  },
};
