// La grabación que suena junto a las voces, guardada en este dispositivo.
// No va en el almacén de canciones (localStorage son unos pocos MB y un WAV son decenas), ni se sube al grupo:
// IndexedDB aguanta archivos grandes y cada canción guarda el suyo con su id.
// Se guarda en mono y a 32 kHz, que para voces basta y ocupa una décima parte del original.

const DB_NAME = 'voces.audio';
const STORE = 'pistas';
export const TRACK_SR = 32000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('No se ha podido abrir el almacén de grabaciones.'));
  });
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('Error al acceder a la grabación.'));
        tx.oncomplete = () => db.close();
      }),
  );
}

/** Guarda (o reemplaza) la grabación de una canción. */
export async function putTrack(songId: string, wav: ArrayBuffer): Promise<void> {
  await run('readwrite', (s) => s.put(wav, songId));
}

export async function getTrack(songId: string): Promise<ArrayBuffer | null> {
  try {
    return (await run<ArrayBuffer | undefined>('readonly', (s) => s.get(songId))) ?? null;
  } catch {
    return null;
  }
}

export async function delTrack(songId: string): Promise<void> {
  try {
    await run('readwrite', (s) => s.delete(songId));
  } catch {
    /* nada */
  }
}

/** Ids de las canciones que tienen grabación guardada (para limpiar las que ya no existen). */
export async function trackIds(): Promise<string[]> {
  try {
    return (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())).map(String);
  } catch {
    return [];
  }
}

/** Decodifica cualquier formato que entienda el navegador y lo deja en mono a `sr` Hz. */
export async function decodeMono(data: ArrayBuffer, sr = TRACK_SR): Promise<Float32Array> {
  const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
  const ctx = new Ctx(1, sr, sr); // decodeAudioData remuestrea a la frecuencia del contexto
  const buf = await ctx.decodeAudioData(data);
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < ch.length; i++) out[i] += ch[i] / buf.numberOfChannels;
  }
  return out;
}

/** WAV mono de 16 bits (lo que se guarda). */
export function encodeWav(samples: Float32Array, sampleRate = TRACK_SR): ArrayBuffer {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const w = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) w.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, 'RIFF');
  w.setUint32(4, 36 + samples.length * 2, true);
  str(8, 'WAVEfmt ');
  w.setUint32(16, 16, true);
  w.setUint16(20, 1, true);
  w.setUint16(22, 1, true);
  w.setUint32(24, sampleRate, true);
  w.setUint32(28, sampleRate * 2, true);
  w.setUint16(32, 2, true);
  w.setUint16(34, 16, true);
  str(36, 'data');
  w.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) w.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
  return buf;
}
