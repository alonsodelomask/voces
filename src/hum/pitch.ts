// Detección de tono con el algoritmo YIN (de Cheveigné & Kawahara, 2002).

export interface PitchResult {
  freq: number; // Hz, 0 si no hay tono claro
  clarity: number; // 0..1
  rms: number;
}

export class Yin {
  private diff: Float32Array;
  private cmnd: Float32Array;

  constructor(
    private sampleRate: number,
    private size = 2048,
    private threshold = 0.15,
    private minFreq = 65,
    private maxFreq = 1100,
  ) {
    this.diff = new Float32Array(size / 2);
    this.cmnd = new Float32Array(size / 2);
  }

  detect(buf: Float32Array): PitchResult {
    const n = Math.min(buf.length, this.size);
    let sum = 0;
    for (let i = 0; i < n; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / n);
    if (rms < 0.004) return { freq: 0, clarity: 0, rms };

    const half = n >> 1;
    const tauMin = Math.max(2, Math.floor(this.sampleRate / this.maxFreq));
    const tauMax = Math.min(half - 1, Math.ceil(this.sampleRate / this.minFreq));
    const d = this.diff;
    const c = this.cmnd;
    // 1) Función diferencia.
    for (let tau = 1; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0; i < half; i++) {
        const delta = buf[i] - buf[i + tau];
        s += delta * delta;
      }
      d[tau] = s;
    }
    // 2) Diferencia media normalizada acumulada.
    c[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau++) {
      running += d[tau];
      c[tau] = running ? (d[tau] * tau) / running : 1;
    }
    // 3) Primer mínimo por debajo del umbral.
    let tau = -1;
    for (let t = tauMin; t <= tauMax; t++) {
      if (c[t] < this.threshold) {
        while (t + 1 <= tauMax && c[t + 1] < c[t]) t++;
        tau = t;
        break;
      }
    }
    if (tau < 0) {
      // Sin mínimo claro: el mejor candidato con baja confianza.
      let best = tauMin;
      for (let t = tauMin; t <= tauMax; t++) if (c[t] < c[best]) best = t;
      if (c[best] > 0.35) return { freq: 0, clarity: 1 - c[best], rms };
      tau = best;
    }
    // 4) Interpolación parabólica.
    let betterTau = tau;
    if (tau > 1 && tau < tauMax) {
      const s0 = c[tau - 1];
      const s1 = c[tau];
      const s2 = c[tau + 1];
      const den = 2 * (2 * s1 - s2 - s0);
      if (den) betterTau = tau + (s2 - s0) / den;
    }
    return { freq: this.sampleRate / betterTau, clarity: 1 - c[tau], rms };
  }
}

export function freqToMidi(f: number): number {
  return 69 + 12 * Math.log2(f / 440);
}
