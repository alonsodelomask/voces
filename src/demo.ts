import { makeSong, makeVoice, type Note, type Song } from './model';
import { computeChords, nameToMidi } from './music';

/** Canción de ejemplo a 5 voces (de aguda a grave) para ver la app funcionando. */
export function demoSong(): Song {
  // Cada acorde: [Voz 1 … Voz 5] y duración en pulsos. Se permiten varias notas por voz con "|".
  const prog: [string[], number][] = [
    [['D5', 'A4', 'F#4', 'D4', 'D3'], 4],
    [['E5', 'B4', 'G4', 'E4', 'E3'], 4],
    [['D5|F#5', 'B4', 'F#4', 'D4', 'B2'], 4],
    [['D5|B4', 'B4|G4', 'G4', 'D4', 'G2'], 4],
    [['C#5', 'A4', 'E4', 'C#4', 'A2'], 4],
    [['D5', 'A4', 'F#4', 'D4', 'F#2'], 4],
    [['E5|G5', 'B4', 'G4', 'E4', 'E3'], 4],
    [['E5|C#5', 'A4', 'E4', 'C#4', 'A2'], 4],
    [['D5', 'A4', 'F#4', 'D4', 'D3'], 8],
  ];
  const bpm = 84;
  const spb = 60 / bpm;
  const names = ['Soprano', 'Mezzo', 'Contralto', 'Tenor', 'Bajo'];
  const voices = names.map((n, i) => makeVoice(n, i));
  let beat = 0;
  for (const [chord, len] of prog) {
    chord.forEach((spec, vi) => {
      const parts = spec.split('|');
      const each = len / parts.length;
      parts.forEach((p, k) => {
        const n: Note = { midi: nameToMidi(p), start: (beat + k * each) * spb, dur: each * spb, name: p };
        const prev = voices[vi].notes[voices[vi].notes.length - 1];
        // Une notas iguales consecutivas en una sola.
        if (prev && prev.midi === n.midi && Math.abs(prev.start + prev.dur - n.start) < 1e-6) prev.dur += n.dur;
        else voices[vi].notes.push(n);
      });
    });
    beat += len;
  }
  const song = makeSong({ title: 'Ejemplo · 5 voces', bpm, beatsPerBar: 4, keyFifths: 2, voices });
  song.chords = computeChords(song);
  return song;
}
