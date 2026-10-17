/* On-device storage (IndexedDB: it can hold photos, unlike localStorage).
   "sightings": your photo sightings.  "posts": community posts you made (and ones waiting to upload). */

const DB_NAME = 'nature-radar';
const DB_VERSION = 2;
let dbPromise = null;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) return reject(new Error('IndexedDB is not available'));
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('sightings')) db.createObjectStore('sightings', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('posts')) db.createObjectStore('posts', { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => db.close(); // let a newer tab upgrade
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Nature Radar is open in another tab. Close it and reload.'));
    });
    dbPromise.catch(() => { dbPromise = null; }); // allow a later retry
  }
  return dbPromise;
}

// Runs one request in a transaction and resolves with its result once the transaction commits.
async function run(storeName, mode, makeRequest) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const req = makeRequest(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Save was cancelled'));
  });
}

const storeApi = name => ({
  getAll: () => run(name, 'readonly', s => s.getAll()),
  put: value => run(name, 'readwrite', s => s.put(value)),
  remove: id => run(name, 'readwrite', s => s.delete(id)),
  clear: () => run(name, 'readwrite', s => s.clear()),
});

export const sightingsDB = storeApi('sightings');
export const postsDB = storeApi('posts');

// Ask the browser not to evict our data when space runs low (best effort).
export async function requestPersistence() {
  try { await navigator.storage?.persist?.(); } catch { /* not supported */ }
}
