// Pruebas de cómo se sigue la altura de una voz sola (src/import/pitch.ts) con voces sintéticas: notas con vibrato,
// portamento entre ellas, un armónico más fuerte que la fundamental (donde YIN suele oír otra octava), silencios y
// notas cantadas un poco altas o bajas.
// Se ejecutan con: node --test scripts/pitch.test.mjs
import { describe, test } from "node:test";
import assert from "node:assert/strict";

const { trackPitch, notesFromPitch, expectedPitch, entryMap } = await import("../src/import/pitch.ts");

const SR = 22050;
const hz = (m) => 440 * 2 ** ((m - 69) / 12);

/**
 * Una «voz»: cada nota es [midi, inicio, duración, desvío en semitonos]. Con armónicos (el segundo, el más fuerte si
 * `armonico`), vibrato de 5,5 Hz y ±0,25 semitonos, y portamento de 60 ms desde la nota anterior si van seguidas.
 */
function voz(notas, { armonico = false, total } = {}) {
  const fin = total ?? Math.max(...notas.map(([, a, d]) => a + d)) + 0.5;
  const x = new Float32Array(Math.ceil(fin * SR));
  let fase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const k = notas.findIndex(([, a, d]) => t >= a && t < a + d);
    if (k < 0) continue;
    const [m, a, d, desvio = 0] = notas[k];
    let altura = m + desvio + 0.25 * Math.sin(2 * Math.PI * 5.5 * t);
    const prev = notas[k - 1];
    if (prev && Math.abs(prev[1] + prev[2] - a) < 0.01 && t - a < 0.06) altura = prev[0] + (altura - prev[0]) * ((t - a) / 0.06);
    fase += (2 * Math.PI * hz(altura)) / SR;
    const env = Math.min(1, (t - a) / 0.02, (a + d - t) / 0.02);
    x[i] = env * (armonico ? 0.25 * Math.sin(fase) + 0.5 * Math.sin(2 * fase) + 0.15 * Math.sin(3 * fase) : 0.5 * Math.sin(fase) + 0.25 * Math.sin(2 * fase) + 0.1 * Math.sin(3 * fase));
  }
  return x;
}
const ref = (notas) => notas.map(([midi, start, dur]) => ({ midi, start, dur }));
const midis = (ns) => ns.map((n) => n.midi);

describe("trackPitch y notesFromPitch", () => {
  test("una melodía legato con vibrato: cada nota una vez, en su sitio", () => {
    const notas = [[59, 0.3, 0.4], [61, 0.7, 0.3], [62, 1.0, 0.5], [61, 1.5, 0.3], [59, 1.8, 0.3], [57, 2.1, 0.6]];
    const n = notesFromPitch(trackPitch(voz(notas), SR));
    assert.deepEqual(midis(n), [59, 61, 62, 61, 59, 57]);
    n.forEach((x, i) => assert.ok(Math.abs(x.start - notas[i][1]) < 0.08, `la nota ${i} empieza en ${x.start.toFixed(3)}, no en ${notas[i][1]}`));
  });

  test("dos notas iguales seguidas con silencio: dos notas; un hueco corto dentro de una: una", () => {
    const n = notesFromPitch(trackPitch(voz([[64, 0.2, 0.5], [64, 1.0, 0.5], [67, 1.6, 0.3], [67, 1.95, 0.4]]), SR));
    assert.deepEqual(midis(n), [64, 64, 67]);
  });

  test("silencio: nada", () => {
    assert.deepEqual(notesFromPitch(trackPitch(new Float32Array(SR * 2), SR)), []);
  });

  test("con el armónico más fuerte, la partitura al lado evita la octava de arriba", () => {
    const notas = [[52, 0.2, 0.5], [55, 0.7, 0.5], [57, 1.2, 0.6], [55, 1.8, 0.5]];
    const esperada = expectedPitch(ref(notas));
    const n = notesFromPitch(trackPitch(voz(notas, { armonico: true }), SR, 0, 2.8, esperada), esperada);
    assert.deepEqual(midis(n), [52, 55, 57, 55]);
  });

  test("un poco alta o baja sigue siendo la nota de la partitura; mucho más, otra", () => {
    const notas = [[60, 0.2, 0.5, 0.45], [62, 0.7, 0.5, -0.5], [64, 1.2, 0.5, 2]];
    const partitura = ref(notas.map(([m, a, d]) => [m, a, d]));
    const esperada = expectedPitch(partitura);
    const n = notesFromPitch(trackPitch(voz(notas), SR, 0, 2.2, esperada), esperada);
    assert.deepEqual(midis(n), [60, 62, 66]);
  });

  test("expectedPitch: la que suena, o la más cercana hasta medio segundo", () => {
    const e = expectedPitch([{ midi: 60, start: 1, dur: 1 }, { midi: 64, start: 2.2, dur: 0.5 }, ]);
    assert.equal(e(1.5), 60);
    assert.equal(e(2.15), 64);
    assert.equal(e(2.05), 60);
    assert.equal(e(3.1), 64);
    assert.equal(e(3.3), null);
    assert.equal(e(0.4), null);
  });

  test("tres minutos se escuchan deprisa", () => {
    const x = voz([[57, 0, 180]]);
    const t = performance.now();
    trackPitch(x, SR);
    assert.ok(performance.now() - t < 5000, `tarda ${(performance.now() - t).toFixed(0)} ms`);
  });

  describe("entryMap: cada entrada de la partitura donde se canta", () => {
    // La partitura, y lo que se canta: la 2.ª nota 0,25 s antes (entra pronto) y la 4.ª 0,2 s después (entra tarde).
    const partitura = [[60, 0.3, 0.4], [62, 0.7, 0.4], [64, 1.1, 0.4], [62, 1.5, 0.4], [60, 1.9, 0.6]];
    const cantado = [[60, 0.3, 0.15], [62, 0.45, 0.65], [64, 1.1, 0.6], [62, 1.7, 0.2], [60, 1.9, 0.6]];
    const { map, movidas } = entryMap(trackPitch(voz(cantado), SR), ref(partitura));

    test("la que entra pronto y la que entra tarde van a donde se cantan; las demás se quedan", () => {
      assert.ok(Math.abs(map(0.7) - 0.45) < 0.05, `la 2.ª, en ${map(0.7).toFixed(3)}`);
      assert.ok(Math.abs(map(1.5) - 1.7) < 0.05, `la 4.ª, en ${map(1.5).toFixed(3)}`);
      for (const t of [0.3, 1.1, 1.9]) assert.ok(Math.abs(map(t) - t) < 0.03, `la de ${t}, en ${map(t).toFixed(3)}`);
      assert.equal(movidas, 2);
    });

    test("entre anclas el tiempo se estira en línea recta y nada se cruza", () => {
      let antes = -Infinity;
      for (let t = 0; t <= 3; t += 0.01) {
        const x = map(t);
        assert.ok(x > antes, `en ${t.toFixed(2)}`);
        antes = x;
      }
      assert.ok(Math.abs(map(0.9) - (map(0.7) + ((0.9 - 0.7) / (1.1 - 0.7)) * (map(1.1) - map(0.7)))) < 1e-9);
    });

    test("una nota que no se canta donde iría no se mueve por arrastre", () => {
      // La 3.ª no se canta (se queda la 2.ª): no hay de dónde sacar su entrada.
      const cantado2 = [[60, 0.3, 0.4], [62, 0.7, 0.8], [62, 1.5, 0.4], [60, 1.9, 0.6]];
      const { map: m2 } = entryMap(trackPitch(voz(cantado2), SR), ref(partitura));
      for (const t of [0.3, 0.7, 1.9]) assert.ok(Math.abs(m2(t) - t) < 0.05, `la de ${t}, en ${m2(t).toFixed(3)}`);
      assert.ok(m2(1.1) > m2(0.7) && m2(1.1) < m2(1.5));
    });

    test("cantado igual que la partitura: no se mueve nada", () => {
      const { map: m3, movidas: n3 } = entryMap(trackPitch(voz(partitura), SR), ref(partitura));
      assert.equal(n3, 0);
      for (const t of [0.3, 0.7, 1.1, 1.5, 1.9, 2.5]) assert.ok(Math.abs(m3(t) - t) < 1e-9);
    });
  });
});
