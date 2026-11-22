// Cambiar el tempo de una canción sin moverla de la rejilla.
// Todo lo que la canción guarda en segundos (notas, acordes, inicios de compás) se reescala a la vez: si se quedara
// alguno atrás, los compases se numerarían mal (al mezclar con una grabación, por ejemplo).
import type { Song } from './model';

/**
 * Pone la canción a `bpm` pulsos por minuto manteniendo cada nota en su pulso. Devuelve el factor por el que se han
 * multiplicado los segundos (para llevar también lo que no está en la canción: el punto de reproducción, el tramo de
 * ensayo…). La grabación y su desfase (`audioTrack`, `audioPhase`) no se tocan: el audio no cambia de velocidad.
 */
export function changeTempo(song: Song, bpm: number): number {
  const k = song.bpm / bpm;
  for (const v of song.voices)
    for (const n of v.notes) {
      n.start *= k;
      n.dur *= k;
    }
  for (const c of song.chords) c.time *= k;
  if (song.barStarts) song.barStarts = song.barStarts.map((t) => t * k);
  song.bpm = bpm;
  return k;
}
