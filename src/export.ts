import { Midi } from '@tonejs/midi';
import type { Song } from './model';

function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export function safeName(s: string) {
  return s.replace(/[\/:*?"<>|]+/g, '').trim() || 'cancion';
}

export function exportMidi(song: Song) {
  const midi = new Midi();
  midi.header.setTempo(song.bpm);
  midi.header.name = song.title;
  for (const v of song.voices) {
    const t = midi.addTrack();
    t.name = v.name;
    for (const n of v.notes) t.addNote({ midi: n.midi, time: n.start, duration: n.dur, velocity: 0.8 });
  }
  download(new Blob([midi.toArray() as BlobPart], { type: 'audio/midi' }), safeName(song.title) + '.mid');
}

export function exportProject(song: Song) {
  download(new Blob([JSON.stringify(song)], { type: 'application/json' }), safeName(song.title) + '.voces.json');
}

export { download };
