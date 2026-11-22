import { strFromU8, unzipSync } from 'fflate';
import type { Song } from '../model';
import { checkSong, checkSongOrFail } from '../songCheck';
import { parseMidi } from './midi';
import { parseMusicXML } from './musicxml';

export const AUDIO_EXT = ['wav', 'mp3', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac', 'webm', 'aiff', 'aif', 'caf'];
export const isAudioFile = (name: string) => AUDIO_EXT.includes((name.split('.').pop() ?? '').toLowerCase());
export const ACCEPTED = '.musicxml,.xml,.mxl,.mid,.midi,.json,.voces,' + AUDIO_EXT.map((e) => '.' + e).join(',') + ',audio/*';

/** Lee una partitura o un proyecto. Lo que sale se revisa siempre (`songCheck.ts`): el archivo puede venir de cualquiera. */
export async function importFile(file: File): Promise<Song> {
  const s = await readFile(file);
  return checkSong(s) ?? s;
}

async function readFile(file: File): Promise<Song> {
  const name = file.name;
  const base = name.replace(/\.[^.]+$/, '');
  const ext = (name.split('.').pop() ?? '').toLowerCase();

  if (ext === 'mid' || ext === 'midi') return parseMidi(await file.arrayBuffer(), base);
  if (ext === 'musicxml' || ext === 'xml') return parseMusicXML(await file.text(), base);
  if (ext === 'mxl') return parseMusicXML(readMxl(new Uint8Array(await file.arrayBuffer())), base);
  if (ext === 'json' || ext === 'voces') {
    let data: unknown;
    try {
      data = JSON.parse(await file.text());
    } catch {
      throw new Error('El archivo no es un proyecto de Vocify.');
    }
    return checkSongOrFail(data);
  }
  if (ext === 'mscz' || ext === 'mscx') {
    throw new Error('Los archivos de MuseScore no se leen directamente. En MuseScore: Archivo → Exportar → MusicXML, y sube ese archivo.');
  }
  if (/^gp\d?$|^gpx$/.test(ext)) {
    throw new Error('Guitar Pro aún no está soportado. Exporta la partitura como MusicXML o MIDI.');
  }
  throw new Error(`Formato .${ext} no soportado. Usa MusicXML (.musicxml, .xml, .mxl), MIDI (.mid) o audio (WAV, MP3, M4A, OGG, FLAC…).`);
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
