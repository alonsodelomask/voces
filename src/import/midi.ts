import { Midi } from '@tonejs/midi';
import { Key } from 'tonal';
import { makeSong, makeVoice, orderVoicesByPitch, sortNotes, type Note, type Song, type Voice } from '../model';
import { computeChords, splitIntoLanes } from '../music';

export function parseMidi(buf: ArrayBuffer, fallbackTitle = 'MIDI'): Song {
  const midi = new Midi(buf);
  const bpm = midi.header.tempos[0]?.bpm ?? 120;
  const ts = midi.header.timeSignatures[0]?.timeSignature;
  const beatsPerBar = ts ? Math.round((ts[0] * 4) / ts[1]) || 4 : 4;
  const ks = midi.header.keySignatures[0];
  let keyFifths = 0;
  if (ks) {
    keyFifths = ks.scale === 'minor' ? Key.minorKey(ks.key).alteration : Key.majorKey(ks.key).alteration;
  }

  const voices: Voice[] = [];
  let idx = 0;
  for (const track of midi.tracks) {
    if (!track.notes.length || track.channel === 9) continue; // canal 10 = percusión
    const notes: Note[] = track.notes.map((n) => ({ midi: n.midi, start: n.time, dur: Math.max(0.02, n.duration) }));
    const lanes = splitIntoLanes(notes).filter((l) => l.length > 0);
    const base = track.name?.trim() || track.instrument?.name || `Pista ${idx + 1}`;
    lanes
      .sort((a, b) => avg(b) - avg(a))
      .forEach((lane, k) => {
        sortNotes(lane);
        voices.push(makeVoice(lanes.length > 1 ? `${base} ${k + 1}` : base, idx++, lane));
      });
  }
  if (!voices.length) throw new Error('El MIDI no contiene notas.');

  const song = makeSong({
    title: midi.header.name?.trim() || fallbackTitle,
    bpm: Math.round(bpm),
    beatsPerBar,
    keyFifths,
    voices: orderVoicesByPitch(voices),
  });
  song.chords = computeChords(song);
  return song;
}

function avg(l: Note[]) {
  return l.reduce((s, n) => s + n.midi, 0) / l.length;
}
