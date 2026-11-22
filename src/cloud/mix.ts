// La mezcla de ensayo (solo, silencio, ocultar y volumen de cada voz) es de cada dispositivo, no de la canción del grupo.
// Cada cantante pone su voz en solo o calla las demás para ensayar: eso no debe cambiar lo que oyen los demás.
//
// Compatibilidad: la app 1.0 espera que cada voz lleve esos campos. Por eso a la canción del grupo se suben siempre, pero
// con su valor normal («sin solo, sin silencio, a la vista, volumen normal»), y la mezcla propia se queda aquí.
// Este archivo no importa nada de la app: así se puede probar con `node --test` (scripts/grupoMezcla.test.mjs).
import type { Song, Voice } from '../model';

/** Cómo va una voz en la canción del grupo: la mezcla normal (el volumen, el de una voz nueva en `makeVoice`). */
export const NEUTRAL_MIX = { muted: false, solo: false, hidden: false, volume: 0.8 } as const;

/** La voz con la mezcla normal (el resto, igual). */
export function neutralVoice(v: Voice): Voice {
  return { ...v, ...NEUTRAL_MIX };
}

/** Copia de la canción para subirla al grupo: las voces con la mezcla normal (no se toca la de aquí). */
export function withNeutralMix(song: Song): Song {
  return { ...song, voices: (song.voices ?? []).map(neutralVoice) };
}

/**
 * Pone en `target` (una versión que llega del grupo) la mezcla de `local` (la de este dispositivo), voz por voz según su
 * id, y la grabación de aquí, que tampoco viaja al grupo. Las voces que aquí no estaban llegan con la mezcla normal:
 * así una canción subida por una app anterior, con el Solo de otra persona puesto, no deja voces calladas.
 * Cambia `target` y lo devuelve.
 */
export function keepLocalMix(target: Song, local?: Song | null): Song {
  const mine = new Map((local?.voices ?? []).map((v) => [v.id, v]));
  target.voices = (target.voices ?? []).map((v) => {
    const m = mine.get(v.id);
    return m ? { ...v, muted: !!m.muted, solo: !!m.solo, hidden: !!m.hidden, volume: m.volume ?? NEUTRAL_MIX.volume } : neutralVoice(v);
  });
  if (local?.audioTrack) target.audioTrack = local.audioTrack;
  return target;
}

/** Texto estable (claves ordenadas): la base de datos guarda el JSON con las claves en otro orden. */
function stable(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(stable).join(',')}]`;
  if (x && typeof x === 'object')
    return `{${Object.keys(x)
      .filter((k) => (x as Record<string, unknown>)[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((x as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  return JSON.stringify(x) ?? 'null';
}

/** Lo que se comparte de una canción (sin la mezcla, la grabación ni las marcas de este dispositivo). */
function shared(s: Song) {
  const { title, bpm, beatsPerBar, keyFifths, chords, chordsAuto, barStarts, audioPhase, audioTranspose } = s;
  return { title, bpm, beatsPerBar, keyFifths, chords, chordsAuto, barStarts, audioPhase, audioTranspose, voices: (s.voices ?? []).map(neutralVoice) };
}

/** ¿Dicen lo mismo las dos versiones (sin contar la mezcla de cada uno)? Entonces no hace falta guardar una copia. */
export function sameContent(a: Song, b: Song): boolean {
  return stable(shared(a)) === stable(shared(b));
}
