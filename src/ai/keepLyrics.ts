// Al aplicar una propuesta de la IA, la voz se reescribe entera con notas nuevas, y la IA no ve ni devuelve la letra.
// Para no perderla, cada sílaba pasa a la nota nueva que empieza en el mismo momento o, si no hay, a la que suena en
// ese momento (si aún no tiene sílaba). Las que no caben se cuentan, para avisar: nunca se pierden sin decirlo.
import type { Note } from '../model';

/**
 * Lleva la letra de `old` a `fresh` (cambia `fresh`). `tolerance`: cuántos segundos pueden separarse dos inicios para
 * contar como el mismo (la IA trabaja en pulsos redondeados). Devuelve cuántas sílabas se han llevado y cuántas no.
 */
export function keepLyrics(old: Note[], fresh: Note[], tolerance: number): { kept: number; lost: number } {
  const conLetra = old.filter((n) => n.lyric).sort((a, b) => a.start - b.start);
  const pendientes: Note[] = [];
  // 1.º Notas que empiezan a la vez: la sílaba sigue en su sitio.
  for (const o of conLetra) {
    const n = fresh.find((x) => !x.lyric && Math.abs(x.start - o.start) <= tolerance);
    if (n) copia(o, n);
    else pendientes.push(o);
  }
  // 2.º La nota nueva que suena cuando empezaba la vieja (una nota alargada que se come a otra, por ejemplo).
  let lost = 0;
  for (const o of pendientes) {
    const n = fresh.find((x) => !x.lyric && x.start <= o.start + tolerance && x.start + x.dur > o.start + tolerance);
    if (n) copia(o, n);
    else lost++;
  }
  return { kept: conLetra.length - lost, lost };
}

function copia(de: Note, a: Note) {
  a.lyric = de.lyric;
  if (de.lyricDoubt) a.lyricDoubt = true;
}
