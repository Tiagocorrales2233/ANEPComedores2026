import { Institution } from './types';

const DB_NAME = 'anep-comedores-browser-store';
const STORE_NAME = 'records';
const RECORD_KEY = 'institutions';

type InstitutionsRecord = {
  key: typeof RECORD_KEY;
  updatedAt: string;
  institutions: Institution[];
};

function canUseIndexedDb() {
  return typeof window !== 'undefined' && 'indexedDB' in window;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!canUseIndexedDb()) {
      reject(new Error('IndexedDB is not available in this browser'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open browser database'));
  });
}

export async function loadBrowserInstitutions() {
  if (!canUseIndexedDb()) {
    return null;
  }

  const db = await openDatabase();

  return new Promise<Institution[] | null>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(RECORD_KEY);

    request.onsuccess = () => {
      const record = request.result as InstitutionsRecord | undefined;
      resolve(record?.institutions ?? null);
    };

    request.onerror = () => reject(request.error ?? new Error('Failed to load institutions from browser storage'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to complete browser read transaction'));
  });
}

export async function saveBrowserInstitutions(institutions: Institution[]) {
  if (!canUseIndexedDb()) {
    throw new Error('IndexedDB is not available in this browser');
  }

  const db = await openDatabase();

  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const record: InstitutionsRecord = {
      key: RECORD_KEY,
      updatedAt: new Date().toISOString(),
      institutions
    };

    const request = store.put(record);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error('Failed to save institutions in browser storage'));
    tx.oncomplete = () => db.close();
    tx.onerror = () => reject(tx.error ?? new Error('Failed to complete browser write transaction'));
  });
}
