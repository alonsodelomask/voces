import { Midi } from '@tonejs/midi';
import { lyricsVoice, type Song } from './model';
import { saveFile } from './native';

function download(blob: Blob, filename: string) {
  saveFile(blob, filename).catch((e) => console.error(e));
}

export function safeName(s: string) {
  return s.replace(/[\/:*?"<>|]+/g, '').trim() || 'cancion';
}

/** El MIDI guarda cada carácter de un texto como un byte: lo que no cabe en Latin-1 («🎙») va en UTF-8 (y así se lee al importar). */
export function midiText(s: string): string {
  if (!/[^\x00-\xff]/.test(s)) return s;
  return Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join('');
}

export function exportMidi(song: Song) {
  download(new Blob([songToMidi(song) as BlobPart], { type: 'audio/midi' }), safeName(song.title) + '.mid');
}

/** La canción como archivo MIDI (con la letra de la voz que la lleva, como los MIDI de karaoke). */
export function songToMidi(song: Song): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(song.bpm);
  midi.header.name = midiText(song.title);
  for (const v of song.voices) {
    const t = midi.addTrack();
    t.name = midiText(v.name);
    for (const n of v.notes) t.addNote({ midi: n.midi, time: n.start, duration: n.dur, velocity: 0.8 });
  }
  // La letra de la voz que la lleva (`lyricsVoice`: la melodía, no una de arriba con trozos copiados de ella o con sus
  // «uh» y «dum»), como en los MIDI de karaoke: una sílaba por evento, y la última de cada palabra con un espacio detrás
  // (así se sabe al volver a abrirlo qué sílabas van juntas).
  const conLetra = lyricsVoice(song);
  for (const n of conLetra?.notes ?? []) {
    if (!n.lyric) continue;
    const s = n.lyric.endsWith('-') ? n.lyric.slice(0, -1) : `${n.lyric} `;
    midi.header.meta.push({ type: 'lyrics', text: midiText(s), ticks: Math.round(midi.header.secondsToTicks(n.start)) });
  }
  return midi.toArray();
}

export function exportProject(song: Song) {
  download(new Blob([JSON.stringify(song)], { type: 'application/json' }), safeName(song.title) + '.voces.json');
}

export { download };
