const DB_NAME = "shift-tracker-cleaning-photos";
const STORE = "photos";
const OPERATIONS = "operations";
import type { CleaningPhotoProof } from './domain.ts';
export type PhotoOperation = { id: string; kind: 'attach' | 'delete'; shiftId: string; taskId: string; proof: CleaningPhotoProof; createdAt: string };
export type PhotoRecord = { id: string; kind: "high" | "compressed"; blob: Blob; createdAt: string; expiresAt: string; width: number; height: number; size: number };

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable")); const request = indexedDB.open(DB_NAME, 2); request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: "id" }); if (!request.result.objectStoreNames.contains(OPERATIONS)) request.result.createObjectStore(OPERATIONS, { keyPath: "id" }); }; request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); }; request.onerror = () => reject(request.error); request.onblocked = () => reject(new Error("Photo storage upgrade is blocked by another open tab. Close that tab and retry.")); });
}

/** Atomic byte/intent transactions; upgrades add one store and retain all photos. */
async function operationTransaction<T>(run: (transaction: IDBTransaction, complete: (value: T) => void) => void): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORE, OPERATIONS], 'readwrite');
    let value: T;
    transaction.oncomplete = () => { database.close(); resolve(value); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Photo operation transaction failed')); };
    try { run(transaction, result => { value = result; }); } catch (error) { transaction.abort(); database.close(); reject(error); }
  });
}
export function stagePhotoOperation(operation: PhotoOperation, records: PhotoRecord[] = []) {
  return operationTransaction<PhotoOperation>((transaction, complete) => {
    const store = transaction.objectStore(OPERATIONS);
    const request = store.get(operation.id);
    request.onsuccess = () => {
      if (request.result) { complete(request.result as PhotoOperation); return; }
      records.forEach(record => transaction.objectStore(STORE).put(record));
      store.put(operation);
      if (operation.kind === 'delete') {
        // A durable delete intent supersedes an unfinished attachment of this proof.
        const pending = store.getAll();
        pending.onsuccess = () => {
          for (const earlier of pending.result as PhotoOperation[]) {
            if (earlier.kind === 'attach' && earlier.shiftId === operation.shiftId && earlier.taskId === operation.taskId && earlier.proof.attachedAt === operation.proof.attachedAt && earlier.proof.highRes?.storageId === operation.proof.highRes?.storageId && earlier.proof.compressed?.storageId === operation.proof.compressed?.storageId) store.delete(earlier.id);
          }
        };
      }
      complete(operation);
    };
  });
}
export async function pendingPhotoOperations(): Promise<PhotoOperation[]> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OPERATIONS, 'readonly');
    const request = transaction.objectStore(OPERATIONS).getAll();
    transaction.oncomplete = () => { database.close(); resolve(request.result as PhotoOperation[]); };
    transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error ?? new Error('Photo recovery log unavailable')); };
  });
}
export function finishPhotoOperation(operation: PhotoOperation, deleteIds: string[] = []) {
  return operationTransaction<void>((transaction, complete) => {
    const store = transaction.objectStore(OPERATIONS); const request = store.get(operation.id);
    request.onsuccess = () => {
      if (request.result) { deleteIds.forEach(id => transaction.objectStore(STORE).delete(id)); store.delete(operation.id); }
      complete(undefined);
    };
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore, done: (value: T) => void, fail: (error: unknown) => void) => void): Promise<T> {
  const database = await db();
  return new Promise((resolve, reject) => {
    let result: T | undefined;
    let resultReady = false;
    let settled = false;
    let transaction: IDBTransaction;
    const rejectOnce = (error: unknown) => {
      if (settled) return;
      settled = true;
      database.close();
      reject(error instanceof Error ? error : new Error("Photo storage transaction failed"));
    };
    try { transaction = database.transaction(STORE, mode); }
    catch (error) { rejectOnce(error); return; }
    transaction.oncomplete = () => {
      if (settled) return;
      settled = true;
      database.close();
      if (resultReady) resolve(result as T);
      else reject(new Error("Photo storage transaction completed without a result"));
    };
    transaction.onerror = () => rejectOnce(transaction.error ?? new Error("Photo storage transaction failed"));
    transaction.onabort = () => rejectOnce(transaction.error ?? new Error("Photo storage transaction was cancelled"));
    run(transaction.objectStore(STORE), (value) => { result = value; resultReady = true; }, (error) => {
      try { transaction.abort(); } catch { /* The request may already have aborted the transaction. */ }
      rejectOnce(error);
    });
  });
}
export async function putPhotos(records: PhotoRecord[]) { return tx<void>("readwrite", (store, done, fail) => { if (!records.length) return done(); let pending = records.length; records.forEach((record) => { const r = store.put(record); r.onsuccess = () => { pending -= 1; if (!pending) done(); }; r.onerror = () => fail(r.error); }); }); }
export async function putPhoto(record: PhotoRecord) { return putPhotos([record]); }
export async function getPhoto(id: string): Promise<PhotoRecord | null> { return tx<PhotoRecord | null>("readonly", (store, done, fail) => { const r = store.get(id); r.onsuccess = () => done((r.result as PhotoRecord) ?? null); r.onerror = () => fail(r.error); }); }
export async function deletePhoto(id: string) { return tx<void>("readwrite", (store, done, fail) => { const r = store.delete(id); r.onsuccess = () => done(); r.onerror = () => fail(r.error); }); }
export async function cleanupExpiredPhotos(now = Date.now()) {
  // Keep staged evidence until its canonical commit/cleanup is resolved.
  return operationTransaction<void>((transaction, complete) => {
    const pending = transaction.objectStore(OPERATIONS).getAll();
    pending.onsuccess = () => {
      const protectedIds = new Set((pending.result as PhotoOperation[]).flatMap(operation => [operation.proof.highRes?.storageId, operation.proof.compressed?.storageId].filter(Boolean)));
      const request = transaction.objectStore(STORE).openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) { complete(undefined); return; }
        const value = cursor.value as PhotoRecord;
        if (!protectedIds.has(value.id) && new Date(value.expiresAt).getTime() <= now) cursor.delete();
        cursor.continue();
      };
    };
  });
}
export async function photoStats() { return tx<{ high: number; compressed: number; bytes: number }>("readonly", (store, done, fail) => { let high = 0, compressed = 0, bytes = 0; const r = store.openCursor(); r.onsuccess = () => { const c = r.result; if (!c) return done({ high, compressed, bytes }); const v = c.value as PhotoRecord; v.kind === "high" ? high++ : compressed++; bytes += v.size || v.blob.size; c.continue(); }; r.onerror = () => fail(r.error); }); }
export async function deleteAllPhotos() { return tx<void>("readwrite", (store, done, fail) => { const r = store.clear(); r.onsuccess = () => done(); r.onerror = () => fail(r.error); }); }

export async function preparePhoto(file: File, mode: "automatic" | "original" = "automatic") {
  // Android document providers sometimes return selected photos with no MIME
  // type (or the generic octet-stream type), especially after multi-select.
  // The file input is image-only, so let the decoder verify those handles.
  const declaredType = file.type.trim().toLowerCase();
  if (declaredType && declaredType !== "application/octet-stream" && !declaredType.startsWith("image/")) throw new Error("Choose an image file");
  let source: CanvasImageSource;
  let sourceWidth: number;
  let sourceHeight: number;
  let release: () => void = () => undefined;
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    source = bitmap; sourceWidth = bitmap.width; sourceHeight = bitmap.height; release = () => bitmap.close();
  } else {
    const objectUrl = URL.createObjectURL(file);
    try {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => { const candidate = new Image(); candidate.onload = () => resolve(candidate); candidate.onerror = () => reject(new Error("Could not read photo")); candidate.src = objectUrl; });
      source = image; sourceWidth = image.naturalWidth; sourceHeight = image.naturalHeight; release = () => URL.revokeObjectURL(objectUrl);
    } catch (error) { URL.revokeObjectURL(objectUrl); throw error; }
  }
  if (!sourceWidth || !sourceHeight) { release(); throw new Error("Photo dimensions were unavailable"); }
  const render = async (max: number, quality: number) => { const scale = Math.min(1, max / Math.max(sourceWidth, sourceHeight)); const width = Math.max(1, Math.round(sourceWidth * scale)); const height = Math.max(1, Math.round(sourceHeight * scale)); const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const context = canvas.getContext("2d"); if (!context) throw new Error("Photo processing is unavailable"); context.drawImage(source, 0, 0, width, height); const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Could not encode photo")), "image/jpeg", quality)); return { blob, width, height, size: blob.size }; };
  try {
    const highRes = mode === "original" ? await render(Math.max(sourceWidth, sourceHeight), 0.94) : await render(1800, 0.84);
    const compressed = await render(1000, 0.64);
    return { highRes, compressed };
  }
  finally { release(); }
}
