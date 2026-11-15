// La altura de una sola voz, momento a momento (YIN, de Cheveigné y Kawahara, 2002): cuando en la grabación se oye a
// una persona sola, esto la sigue mucho mejor que Basic Pitch, que busca notas sueltas entre varias voces o
// instrumentos y solo apunta las que ve empezar con claridad (se le escapan las suaves, las ligadas y las que llegan
// con portamento). Con la partitura al lado se corrigen los saltos de octava, que son el fallo típico de YIN.
import type { Note } from '../model';

/** La altura de cada momento: `midi[i]` (con decimales) es la del segundo `t0 + i·hop`; NaN si no se canta. */
export interface PitchTrack {
  t0: number;
  hop: number;
  midi: Float32Array;
}

/** Ajustes (se pueden cambiar en las pruebas). */
export const PITCH = {
  /** Cuánto se busca alrededor de la nota que da la partitura, en semitonos. */
  ventana: 4,
  /** Lo más grave y lo más agudo que se busca, en Hz (de un bajo a una soprano). */
  fmin: 60,
  fmax: 1100,
  /** Un momento es cantado si la diferencia normalizada de YIN baja de esto (0: periódico del todo). */
  umbral: 0.5,
  /** Y si suena a menos de tantos decibelios por debajo de lo fuerte de la toma (respiraciones y ruido, fuera). */
  db: 45,
  /** Hasta dónde se aparta la altura de su nota antes de cambiar de nota, en semitonos (con vibrato no salta). */
  histeresis: 0.9,
  /** Hasta cuánto puede ir alta o baja una nota (en semitonos) y seguir siendo la que da la partitura. */
  tolerancia: 0.7,
  /** Lo más corto que vale como nota (lo demás es el paso de una a otra), y el hueco que se salta dentro de una. */
  minNota: 0.07,
  hueco: 0.12,
};

/**
 * Sigue la altura de `samples` (mono, a `sr` Hz) entre los segundos `desde` y `hasta`, cada 10 ms. Para ir más rápido
 * escucha a menos frecuencia (una voz no pasa de unos 1100 Hz). `esperada`: la nota que da la partitura en cada segundo
 * (con decimales vale igual), o null donde no da ninguna.
 */
export function trackPitch(
  samples: Float32Array,
  sr: number,
  desde = 0,
  hasta = samples.length / sr,
  esperada?: (t: number) => number | null,
): PitchTrack {
  const d = sr >= 32000 ? 4 : sr >= 16000 ? 2 : 1;
  const s2 = sr / d;
  const a = Math.max(0, Math.floor(desde * sr));
  const b = Math.min(samples.length, Math.ceil(hasta * sr));
  // Media de cada `d` muestras: quita lo agudo que se doblaría al bajar la frecuencia.
  const x = new Float32Array(Math.max(0, Math.floor((b - a) / d)));
  for (let i = 0; i < x.length; i++) {
    let s = 0;
    for (let k = 0; k < d; k++) s += samples[a + i * d + k];
    x[i] = s / d;
  }
  const hop = Math.round(s2 * 0.01);
  const tauMin = Math.max(2, Math.floor(s2 / PITCH.fmax));
  const tauMax = Math.ceil(s2 / PITCH.fmin);
  const W = tauMax + 1; // la ventana cubre al menos un periodo del más grave
  const n = Math.max(0, Math.floor((x.length - W - tauMax) / hop) + 1);
  const midi = new Float32Array(n).fill(NaN);
  const rms = new Float32Array(n);
  const dif = new Float64Array(tauMax + 1);
  const hopS = hop / s2;
  const t0 = a / sr + W / 2 / s2;
  // ¿Son el mismo canto dos periodos (uno múltiplo del otro: octava, octava y quinta, dos octavas)?
  const cerca = (p: number, q: number) => [1, 2, 3, 4].some((k) => Math.abs(p - k * q) <= 1 || Math.abs(q - k * p) <= 1);
  for (let f = 0; f < n; f++) {
    const o = f * hop;
    let e = 0;
    for (let i = 0; i < W; i++) e += x[o + i] * x[o + i];
    rms[f] = Math.sqrt(e / W);
    if (e === 0) continue;
    // Diferencia normalizada (CMNDF): el primer mínimo claro es el periodo.
    let suma = 0;
    for (let t = 1; t <= tauMax; t++) {
      let s = 0;
      for (let i = 0; i < W; i++) {
        const q = x[o + i] - x[o + i + t];
        s += q * q;
      }
      suma += s;
      dif[t] = suma > 0 ? (s * t) / suma : 1;
    }
    // Sin partitura, el primer mínimo claro (YIN). Con ella, el más hondo cerca de la nota que toca: así no se cuela
    // la octava de abajo ni otros submúltiplos. Solo se aparta de esa nota si allí se oye otra cosa con mucha claridad.
    let tau = primerMinimo(dif, tauMin, tauMax);
    const r = esperada?.(t0 + f * hopS);
    if (r != null) {
      const lo = Math.max(tauMin, Math.floor(s2 / (440 * 2 ** ((r + PITCH.ventana - 69) / 12))));
      const hi = Math.min(tauMax, Math.ceil(s2 / (440 * 2 ** ((r - PITCH.ventana - 69) / 12))));
      let tw = lo;
      for (let t = lo; t <= hi; t++) if (dif[t] < dif[tw]) tw = t;
      const claro = dif[tau] < 0.08 && dif[tw] > 2 * dif[tau] + 0.05;
      if (!claro || cerca(tau, tw)) tau = tw;
    }
    if (dif[tau] > PITCH.umbral) continue;
    // Interpolación parabólica: el periodo con decimales.
    let p = tau;
    if (tau > tauMin && tau < tauMax) {
      const y0 = dif[tau - 1];
      const y1 = dif[tau];
      const y2 = dif[tau + 1];
      const den = y0 - 2 * y1 + y2;
      if (den > 0) p = tau + (0.5 * (y0 - y2)) / den;
    }
    midi[f] = 69 + 12 * Math.log2(s2 / p / 440);
  }
  // Lo muy flojo (respiraciones, ruido de la sala) no es canto.
  const fuertes = Array.from(rms).filter((r, i) => r > 0 && !Number.isNaN(midi[i])).sort((p, q) => p - q);
  if (fuertes.length) {
    const ref = fuertes[Math.floor(fuertes.length * 0.95)];
    const suelo = ref * 10 ** (-PITCH.db / 20);
    for (let f = 0; f < n; f++) if (rms[f] < suelo) midi[f] = NaN;
  }
  return { t0, hop: hopS, midi };
}

/** El periodo de YIN: el primer mínimo que baja de 0,15 (o el más hondo, si ninguno baja). */
function primerMinimo(dif: Float64Array, tauMin: number, tauMax: number): number {
  let mejor = tauMin;
  for (let t = tauMin; t <= tauMax; t++) {
    if (dif[t] < 0.15) {
      while (t + 1 <= tauMax && dif[t + 1] < dif[t]) t++;
      return t;
    }
    if (dif[t] < dif[mejor]) mejor = t;
  }
  return mejor;
}

/**
 * Las notas que se cantan en `track`. Con `esperada` (la altura que da la partitura en cada segundo, o null si allí no
 * hay nada), cada momento se pone en la octava más cercana a ella: YIN a veces oye la de arriba o la de abajo.
 */
export function notesFromPitch(track: PitchTrack, esperada?: (t: number) => number | null): Note[] {
  const { midi, t0, hop } = track;
  const n = midi.length;
  const m = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = midi[i];
    if (!Number.isNaN(v) && esperada) {
      const r = esperada(t0 + i * hop);
      if (r != null) {
        while (v - r > 6) v -= 12;
        while (r - v > 6) v += 12;
        // Cerca de la nota que toca, es esa (afinación, vibrato): así las notas se separan donde cambia la partitura
        // aunque se cante un poco alto o bajo.
        if (Math.abs(v - r) <= PITCH.tolerancia) v = r;
      }
    }
    m[i] = v;
  }
  // Mediana de 5: quita los saltos sueltos (una consonante, un armónico).
  const lisa = new Float32Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (Number.isNaN(m[i])) continue;
    const w: number[] = [];
    for (let k = Math.max(0, i - 2); k <= Math.min(n - 1, i + 2); k++) if (!Number.isNaN(m[k])) w.push(m[k]);
    w.sort((p, q) => p - q);
    lisa[i] = w[w.length >> 1];
  }
  // Una nota sigue mientras la altura no se aparte de ella más que la histéresis; los huecos cortos no la cortan.
  // La nota es la mediana de lo cantado en ella: la entrada (desde abajo, con portamento) no cuenta más que el resto.
  const notas: Note[] = [];
  let cur: { midi: number; a: number; b: number; vals: number[]; suma: number } | null = null;
  const cierra = () => {
    if (cur && cur.b - cur.a >= PITCH.minNota) {
      const v = [...cur.vals].sort((p, q) => p - q);
      const med = v[v.length >> 1];
      // Un poco alta o baja (hasta `tolerancia`) sigue siendo la nota que toca: es afinación, no otra nota.
      const r = esperada?.((cur.a + cur.b) / 2);
      notas.push({ midi: r != null && Math.abs(med - r) <= PITCH.tolerancia ? r : Math.round(med), start: cur.a, dur: cur.b - cur.a });
    }
    cur = null;
  };
  for (let i = 0; i < n; i++) {
    const t = t0 + i * hop;
    const v = lisa[i];
    if (Number.isNaN(v)) {
      if (cur && t - cur.b > PITCH.hueco) cierra();
      continue;
    }
    if (cur && Math.abs(v - cur.midi) <= PITCH.histeresis && t - cur.b <= PITCH.hueco) {
      cur.b = t + hop;
      cur.vals.push(v);
      // La nota es la media de lo cantado hasta ahora: si empezó en el portamento desde la anterior, se va a su sitio.
      cur.suma += v;
      cur.midi = Math.round(cur.suma / cur.vals.length);
      continue;
    }
    cierra();
    cur = { midi: Math.round(v), a: t, b: t + hop, vals: [v], suma: v };
  }
  cierra();
  // Juntas: la misma nota partida por un hueco corto, y lo cantado de seguido, sin hueco entre una nota y la siguiente.
  const out: Note[] = [];
  for (const x of notas) {
    const prev = out[out.length - 1];
    const gap = prev ? x.start - (prev.start + prev.dur) : Infinity;
    if (prev && prev.midi === x.midi && gap <= PITCH.hueco) {
      prev.dur = x.start + x.dur - prev.start;
      continue;
    }
    if (prev && gap <= PITCH.hueco) prev.dur = x.start - prev.start;
    out.push({ ...x });
  }
  return out.filter((x) => x.dur >= 0.08);
}

/**
 * La nota que da `ref` en cada segundo: la que suena entonces o, si calla, la más cercana (hasta medio segundo antes o
 * después); null si no hay ninguna tan cerca.
 */
export function expectedPitch(ref: Note[]): (t: number) => number | null {
  const notas = [...ref].sort((a, b) => a.start - b.start);
  const fin = notas.map((n) => n.start + n.dur);
  return (t) => {
    // La última que empieza antes de t, y sus vecinas.
    let lo = 0;
    let hi = notas.length - 1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (notas[m].start <= t) lo = m;
      else hi = m - 1;
    }
    let best: number | null = null;
    let bestD = 0.5;
    for (let k = Math.max(0, lo - 8); k <= Math.min(notas.length - 1, lo + 1); k++) {
      const d = notas[k].start <= t && fin[k] > t ? 0 : Math.min(Math.abs(notas[k].start - t), Math.abs(fin[k] - t));
      if (d < bestD || (d === 0 && bestD !== 0)) {
        bestD = d;
        best = notas[k].midi;
      }
    }
    return best;
  };
}

/** Ajustes de las entradas (se pueden cambiar en las pruebas). */
export const ENTRADAS = {
  /** Cuánto se busca la entrada antes y después de donde la pone la partitura, en segundos. */
  busca: 0.2,
  /** Lo que tiene que durar lo cantado al llegar a la nota para fiarse, en segundos. */
  firme: 0.06,
  /** Lo menos que se mueve una entrada: menos es ruido, o el portamento (la voz llega a la nota un poco después de
   * empezar a subir o bajar hacia ella). */
  minimo: 0.05,
  /** Cuánto se puede mover una nota, en segundos, y el silencio que separa frases. */
  mueve: 0.5,
  respiro: 0.25,
  /** Lo que cuesta mover una nota y cambiarle la duración, por cada 10 ms (un momento cantado en su nota vale 1). */
  desplaza: 0.12,
  estira: 0.06,
  /** Hasta dónde (en semitonos) cuenta algo lo que se acerca a la nota sin ser ella. */
  cerca: 0.75,
  /** A partir de cuánto (en segundos) un movimiento tiene que oírse mejor que donde estaba. */
  revisa: 0.1,
  /** Momentos (de 10 ms) de la mediana con que se alisa la altura. */
  lisa: 15,
};

/**
 * Dónde empieza de verdad cada nota de `notas` (la línea que se oye, ordenada, en el reloj y el tono de `track`): si
 * viene ligada de otra altura, donde la voz cruza la mitad del camino entre las dos (el portamento); si viene después
 * de un silencio, donde empieza a sonar cerca de esa altura. null si no se sabe: la misma altura que la anterior sin
 * respirar (no cambia nada que se pueda oír), o no se oye con claridad.
 */
export function sungOnsets(track: PitchTrack, notas: Note[]): (number | null)[] {
  const { midi, t0, hop } = track;
  const at = (t: number) => {
    const i = Math.round((t - t0) / hop);
    return i >= 0 && i < midi.length ? midi[i] : NaN;
  };
  const firme = Math.max(2, Math.round(ENTRADAS.firme / hop));
  return notas.map((n, k) => {
    const prev = notas[k - 1];
    const next = notas[k + 1];
    const ligada = !!prev && n.start - (prev.start + prev.dur) < 0.1;
    if (ligada && prev.midi === n.midi) return null;
    const lo = Math.max(n.start - ENTRADAS.busca, prev ? prev.start + Math.min(0.1, prev.dur / 2) : -Infinity);
    const hi = Math.min(n.start + ENTRADAS.busca, n.start + n.dur * 0.7, next ? next.start - 0.03 : Infinity);
    // La altura en la octava de la nota (YIN a veces oye otra).
    const v = (t: number) => {
      let x = at(t);
      if (Number.isNaN(x)) return x;
      while (x - n.midi > 6) x -= 12;
      while (n.midi - x > 6) x += 12;
      return x;
    };
    const mitad = ligada ? (prev.midi + n.midi) / 2 : NaN;
    const sube = ligada && n.midi > prev.midi;
    // ¿Está ya en el lado de la nota nueva (o, tras un silencio, cerca de ella)?
    const llego = (x: number) => !Number.isNaN(x) && (ligada ? (sube ? x > mitad : x < mitad) && Math.abs(x - n.midi) < 1.5 : Math.abs(x - n.midi) < 1);
    let mejor: number | null = null;
    for (let t = lo; t <= hi; t += hop) {
      if (!llego(v(t))) continue;
      // Que lo de justo antes no estuviera ya allí (es un cambio de verdad) y que siga allí un rato.
      const antes = v(t - hop);
      if (llego(antes)) continue;
      let ok = true;
      for (let j = 1; j <= firme && ok; j++) ok = llego(v(t + j * hop));
      if (!ok) continue;
      if (mejor == null || Math.abs(t - n.start) < Math.abs(mejor - n.start)) mejor = t;
    }
    return mejor;
  });
}

/**
 * Cuánto hay que mover el tiempo de la partitura para que su melodía (`melodia`, en el reloj y el tono de `track`)
 * entre donde se canta: una función que lleva cada segundo de la partitura a su segundo nuevo.
 *
 * Frase a frase (notas entre dos silencios), se prueban todas las maneras de colocar sus notas hasta medio segundo
 * antes o después (programación dinámica, de 10 en 10 ms, sin que se crucen) y se queda la que más rato coincide la
 * altura que se oye con la de cada nota, menos lo que cuesta moverlas y cambiarles la duración: así una nota solo se
 * mueve si se oye con claridad dónde entra, tanto si iba tarde como pronto, y las que repiten altura (donde no se oye
 * el cambio) se reparten como en la partitura. Entre esas anclas el tiempo se estira en línea recta: todas las voces
 * se mueven juntas (las notas que atacan a la vez siguen a la vez) y nada se cruza. `track`, mejor sin la partitura al
 * lado: con ella, la altura se iría a donde ya estaba.
 */
export function entryMap(track: PitchTrack, melodia: Note[]): { map: (t: number) => number; movidas: number } {
  const { t0, hop } = track;
  // Mediana de `ENTRADAS.lisa` momentos (un ciclo de vibrato): el vibrato ancho y los golpes de consonante no cuentan como
  // otra nota.
  const midi = new Float32Array(track.midi.length).fill(NaN);
  for (let i = 0; i < midi.length; i++) {
    const w: number[] = [];
    const r = ENTRADAS.lisa >> 1;
    for (let k = Math.max(0, i - r); k <= Math.min(midi.length - 1, i + r); k++) if (!Number.isNaN(track.midi[k])) w.push(track.midi[k]);
    if (!Number.isNaN(track.midi[i]) && w.length > r) midi[i] = w.sort((p, q) => p - q)[w.length >> 1];
  }
  const paso = 0.01;
  const R = Math.round(ENTRADAS.mueve / paso); // posiciones a cada lado
  const S = 2 * R + 1;
  const notas = [...melodia].sort((a, b) => a.start - b.start);
  // Lo que suma cada momento a una nota: +1 si se canta su altura (medio semitono arriba o abajo), algo si se acerca, y
  // −0,5 si se canta otra.
  const vale = (t: number, m: number) => {
    const i = Math.round((t - t0) / hop);
    let x = i >= 0 && i < midi.length ? midi[i] : NaN;
    if (Number.isNaN(x)) return 0;
    while (x - m > 6) x -= 12;
    while (m - x > 6) x += 12;
    const d = Math.abs(x - m);
    return d <= 0.5 ? 1 : d <= ENTRADAS.cerca ? 0.3 : -0.5;
  };
  const frases: Note[][] = [];
  for (const n of notas) {
    const f = frases[frases.length - 1];
    const ult = f?.[f.length - 1];
    if (ult && n.start - (ult.start + ult.dur) < ENTRADAS.respiro) f.push(n);
    else frases.push([n]);
  }
  const anclas: [number, number][] = [];
  let movidas = 0;
  for (const f of frases) {
    const K = f.length;
    // Rejilla común de la frase: de su primera entrada menos el margen al final de la última más el margen.
    const ini = f[0].start - ENTRADAS.mueve;
    const fin = f[K - 1].start + f[K - 1].dur + ENTRADAS.mueve;
    const G = Math.ceil((fin - ini) / paso) + 1;
    // Sumas acumuladas de lo que vale cada momento para cada nota.
    const acum = f.map((n) => {
      const c = new Float64Array(G + 1);
      for (let g = 0; g < G; g++) c[g + 1] = c[g] + vale(ini + g * paso, n.midi);
      return c;
    });
    // Y solo los momentos en que se canta justo su altura.
    const justo = f.map((n) => {
      const c = new Float64Array(G + 1);
      for (let g = 0; g < G; g++) c[g + 1] = c[g] + (vale(ini + g * paso, n.midi) === 1 ? 1 : 0);
      return c;
    });
    const pos = (k: number, j: number) => Math.round((f[k].start - ini) / paso) + (j - R); // índice en la rejilla
    const suma = (k: number, a: number, b: number) => acum[k][Math.max(0, Math.min(G, b))] - acum[k][Math.max(0, Math.min(G, a))];
    const dur0 = (k: number) => Math.round(((k + 1 < K ? f[k + 1].start : f[k].start + f[k].dur) - f[k].start) / paso);
    const minimo = Math.round(0.05 / paso);
    // best[k][j]: lo mejor colocando las notas 0..k con la k en la posición j; de dónde viene.
    let best = new Float64Array(S).fill(-Infinity);
    const de: Int16Array[] = [];
    for (let j = 0; j < S; j++) best[j] = -ENTRADAS.desplaza * Math.abs(j - R);
    for (let k = 1; k < K; k++) {
      const nuevo = new Float64Array(S).fill(-Infinity);
      const desde = new Int16Array(S).fill(-1);
      for (let j = 0; j < S; j++) {
        const p = pos(k, j);
        for (let i = 0; i < S; i++) {
          if (best[i] === -Infinity) continue;
          const q = pos(k - 1, i);
          if (p - q < minimo) continue;
          // Una nota no se queda en menos de la mitad de lo que dura en la partitura si en ese rato no se oye su altura:
          // sería quitarla para dar sitio a otra.
          const tramo = suma(k - 1, q, p);
          if (p - q < dur0(k - 1) / 2 && justo[k - 1][Math.max(0, Math.min(G, p))] - justo[k - 1][Math.max(0, Math.min(G, q))] < 2) continue;
          const v = best[i] + tramo - ENTRADAS.estira * Math.abs(p - q - dur0(k - 1));
          if (v > nuevo[j]) {
            nuevo[j] = v;
            desde[j] = i;
          }
        }
        nuevo[j] -= ENTRADAS.desplaza * Math.abs(j - R);
      }
      de.push(desde);
      best = nuevo;
    }
    // La última nota: lo que dura en la partitura.
    let jFin = R;
    let vFin = -Infinity;
    for (let j = 0; j < S; j++) {
      if (best[j] === -Infinity) continue;
      const p = pos(K - 1, j);
      const v = best[j] + suma(K - 1, p, p + dur0(K - 1));
      if (v > vFin) {
        vFin = v;
        jFin = j;
      }
    }
    const js = new Array<number>(K);
    js[K - 1] = jFin;
    for (let k = K - 1; k > 0; k--) js[k - 1] = de[k - 1][js[k]];
    // Una nota que se mueve mucho tiene que oírse donde se mueve: si entra antes, en lo que gana ya se canta su altura;
    // si entra después, en lo que pierde todavía no. Si no, es el arreglo de la frase el que la arrastra: no se ancla
    // y su sitio sale de las de alrededor.
    const cuenta = (k: number, a: number, b: number) =>
      justo[k][Math.max(0, Math.min(G, Math.round((b - ini) / paso)))] - justo[k][Math.max(0, Math.min(G, Math.round((a - ini) / paso)))];
    const seOye = (k: number, d: number) => {
      if (Math.abs(d) < ENTRADAS.revisa) return true;
      const a = f[k].start;
      const n = Math.abs(d) / paso;
      return d < 0 ? cuenta(k, a + d, a) >= n * 0.5 : cuenta(k, a, a + d) <= n * 0.3 && cuenta(k, a + d, a + d + 0.1) >= 3;
    };
    let dUlt = 0;
    f.forEach((n, k) => {
      const d = (js[k] - R) * paso;
      if (!seOye(k, d)) {
        dUlt = 0;
        return;
      }
      if (Math.abs(d) >= ENTRADAS.minimo) movidas++;
      dUlt = Math.abs(d) >= ENTRADAS.minimo ? d : 0;
      anclas.push([n.start, n.start + dUlt]);
    });
    const u = f[K - 1];
    anclas.push([u.start + u.dur, u.start + u.dur + dUlt]);
  }
  anclas.sort((a, b) => a[0] - b[0]);
  // Que no se crucen: cada ancla, después de la anterior (si no, se queda la anterior y esta se quita).
  const buenas: [number, number][] = [];
  for (const x of anclas) {
    const p = buenas[buenas.length - 1];
    if (p && (x[0] - p[0] < 1e-6 || x[1] - p[1] < Math.min(0.04, (x[0] - p[0]) * 0.5))) continue;
    buenas.push(x);
  }
  const map = (t: number) => {
    if (!buenas.length) return t;
    if (t <= buenas[0][0]) return t + (buenas[0][1] - buenas[0][0]);
    const u = buenas[buenas.length - 1];
    if (t >= u[0]) return t + (u[1] - u[0]);
    let lo = 0;
    let hi = buenas.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (buenas[m][0] <= t) lo = m;
      else hi = m;
    }
    const [a0, b0] = buenas[lo];
    const [a1, b1] = buenas[hi];
    return b0 + ((t - a0) / (a1 - a0)) * (b1 - b0);
  };
  return { map, movidas };
}
