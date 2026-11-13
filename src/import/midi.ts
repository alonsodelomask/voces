import { Midi } from '@tonejs/midi';
import { Key } from 'tonal';
import { makeSong, makeVoice, orderVoicesByPitch, sortNotes, type Note, type Song, type Voice } from '../model';
import { computeChords, splitIntoLanes } from '../music';

/** Si los bytes de un texto son UTF-8 válido se leen así («🎙»); si no, se quedan como estaban (acentos de MIDI antiguos). */
function midiString(s: string): string {
  if (!/[-ÿ]/.test(s)) return s;
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0)));
  } catch {
    return s;
  }
}

/** Segundo en que empieza cada compás, siguiendo los cambios de compás del MIDI. */
function barStartsOf(midi: Midi): number[] {
  const sigs = [...midi.header.timeSignatures].sort((a, b) => a.ticks - b.ticks);
  if (!sigs.length || sigs[0].ticks > 0) sigs.unshift({ ticks: 0, timeSignature: [4, 4] } as (typeof midi.header.timeSignatures)[number]);
  const out: number[] = [];
  for (let k = 0; k < sigs.length; k++) {
    const [num, den] = sigs[k].timeSignature;
    const porCompas = (midi.header.ppq * 4 * num) / (den || 4);
    if (!(porCompas > 0)) continue;
    const hasta = k + 1 < sigs.length ? sigs[k + 1].ticks : midi.durationTicks + 1;
    for (let tick = sigs[k].ticks; tick < hasta && out.length < 20000; tick += porCompas) out.push(midi.header.ticksToSeconds(tick));
  }
  return out;
}

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
    const base = midiString(track.name ?? '').trim() || track.instrument?.name || `Pista ${idx + 1}`;
    lanes
      .sort((a, b) => avg(b) - avg(a))
      .forEach((lane, k) => {
        sortNotes(lane);
        voices.push(makeVoice(lanes.length > 1 ? `${base} ${k + 1}` : base, idx++, lane));
      });
  }
  if (!voices.length) throw new Error('El MIDI no contiene notas.');

  const song = makeSong({
    title: midiString(midi.header.name ?? '').trim() || fallbackTitle,
    bpm: Math.round(bpm),
    beatsPerBar,
    keyFifths,
    voices: orderVoicesByPitch(voices),
    barStarts: barStartsOf(midi),
  });
  song.chords = computeChords(song);
  return song;
}

function avg(l: Note[]) {
  return l.reduce((s, n) => s + n.midi, 0) / l.length;
}
