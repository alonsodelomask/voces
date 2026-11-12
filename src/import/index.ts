import { strFromU8, unzipSync } from 'fflate';
import type { Song } from '../model';
import { parseMidi } from './midi';
import { parseMusicXML } from './musicxml';

export const ACCEPTED = '.musicxml,.xml,.mxl,.mid,.midi,.json,.voces';

export async function importFile(file: File): Promise<Song> {
  const name = file.name;
  const base = name.replace(/\.[^.]+$/, '');
  const ext = (name.split('.').pop() ?? '').toLowerCase();

  if (ext === 'mid' || ext === 'midi') return parseMidi(await file.arrayBuffer(), base);
  if (ext === 'musicxml' || ext === 'xml') return parseMusicXML(await file.text(), base);
  if (ext === 'mxl') return parseMusicXML(readMxl(new Uint8Array(await file.arrayBuffer())), base);
  if (ext === 'json' || ext === 'voces') {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.voices)) throw new Error('El archivo no es un proyecto de Voces.');
    return data as Song;
  }
  if (ext === 'mscz' || ext === 'mscx') {
    throw new Error('Los archivos de MuseScore no se leen directamente. En MuseScore: Archivo → Exportar → MusicXML, y sube ese archivo.');
  }
  if (/^gp\d?$|^gpx$/.test(ext)) {
    throw new Error('Guitar Pro aún no está soportado. Exporta la partitura como MusicXML o MIDI.');
  }
  throw new Error(`Formato .${ext} no soportado. Usa MusicXML (.musicxml, .xml, .mxl) o MIDI (.mid).`);
}

function readMxl(bytes: Uint8Array): string {
  const files = unzipSync(bytes);
  const container = files['META-INF/container.xml'];
  if (container) {
    const doc = new DOMParser().parseFromString(strFromU8(container), 'application/xml');
    const path = doc.getElementsByTagName('rootfile')[0]?.getAttribute('full-path');
    if (path && files[path]) return strFromU8(files[path]);
  }
  const key = Object.keys(files).find((k) => !k.startsWith('META-INF') && /\.(musicxml|xml)$/i.test(k));
  if (!key) throw new Error('El archivo .mxl no contiene una partitura MusicXML.');
  return strFromU8(files[key]);
}
