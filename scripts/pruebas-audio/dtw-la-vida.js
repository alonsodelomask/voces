async () => {
  const A = await import('/src/import/audio.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const gt = parseMusicXML(await (await fetch('/samples/la-vida.musicxml')).text());
  const { samples } = await A.decodeAudio(await (await fetch('/samples/la-vida.wav')).arrayBuffer());
  const out = await A.basicPitchOutputs(samples.subarray(0, 72 * 22050));
  const G = gt.voices.flatMap((v) => v.notes);
  const STEP = 0.1;
  const frames = (notes, dur) => { const f = []; for (let t = 0; t < dur; t += STEP) f.push(notes.filter((n) => n.start <= t && n.start + n.dur > t).map((n) => n.midi)); return f; };
  const chroma = (ps, tr = 0) => { const v = new Float32Array(12); for (const m of ps) v[(((m - tr) % 12) + 12) % 12] += 1; const n = Math.hypot(...v) || 1; return v.map((x) => x / n); };
  const gF = frames(G, 76);
  function evaluate(notes) {
    const tF = frames(notes, 72);
    let bestAll = null;
    for (const tr of [-2, 0, -1, 1, -3, 2]) {
      // DTW entre cromas (transcripción transpuesta a la tonalidad de la partitura).
      const gc = gF.map((p) => chroma(p)), tc = tF.map((p) => chroma(p, tr));
      const n = gc.length, m = tc.length, INF = 1e9;
      const D = new Float32Array((n + 1) * (m + 1)).fill(INF); D[0] = 0;
      const cost = (i, j) => { const a = gc[i], b = tc[j]; let s = 0; for (let k = 0; k < 12; k++) s += a[k] * b[k]; const ea = a.every((x) => x === 0), eb = b.every((x) => x === 0); return ea && eb ? 0 : ea || eb ? 0.6 : 1 - s; };
      for (let i = 1; i <= n; i++) for (let j = 1; j <= m; j++) D[i * (m + 1) + j] = cost(i - 1, j - 1) + Math.min(D[(i - 1) * (m + 1) + j], D[i * (m + 1) + j - 1], D[(i - 1) * (m + 1) + j - 1]);
      // Camino.
      let i = n, j = m; const path = [];
      while (i > 0 && j > 0) { path.push([i - 1, j - 1]); const a = D[(i - 1) * (m + 1) + j - 1], b = D[(i - 1) * (m + 1) + j], c = D[i * (m + 1) + j - 1]; if (a <= b && a <= c) { i--; j--; } else if (b <= c) i--; else j--; }
      path.reverse();
      const map = new Map(); for (const [gi, tj] of path) if (!map.has(gi)) map.set(gi, tj);
      // Métricas sobre el camino: altura exacta (probando octavas) y clase de nota.
      const res = {};
      for (const oct of [0, -12, 12]) {
        let tp = 0, ng = 0, nt = 0, mel = 0, nmel = 0, tpc = 0;
        for (const [gi, tj] of map) {
          const g = gF[gi], s = tF[tj].map((x) => x - tr - oct);
          ng += g.length; nt += s.length;
          const pool = [...s]; for (const x of g) { const k = pool.indexOf(x); if (k >= 0) { tp++; pool.splice(k, 1); } }
          const pcs = new Set(s.map((x) => ((x % 12) + 12) % 12)); for (const x of g) if (pcs.has(((x % 12) + 12) % 12)) tpc++;
          if (g.length) { nmel++; if (s.length && Math.max(...s) === Math.max(...g)) mel++; }
        }
        const P = tp / Math.max(1, nt), R = tp / Math.max(1, ng);
        res[oct] = { F: +((2 * P * R) / Math.max(1e-9, P + R)).toFixed(3), P: +P.toFixed(3), R: +R.toFixed(3), recallClase: +(tpc / Math.max(1, ng)).toFixed(3), melodia: +(mel / Math.max(1, nmel)).toFixed(3) };
      }
      const bestOct = Object.entries(res).sort((a, b) => b[1].F - a[1].F)[0];
      const coste = D[n * (m + 1) + m] / path.length;
      if (!bestAll || coste < bestAll.coste) bestAll = { tr, coste: +coste.toFixed(3), octava: +bestOct[0], ...bestOct[1] };
    }
    return bestAll;
  }
  const res = { notasPartitura: G.length };
  for (const sens of [0.5]) {
    const raw = await A.notesFromOutputs(out, sens, 11);
    for (const hr of [0.6, 0.8, 1.1]) { A.setHarmonicRatio(hr); const c = A.cleanNotes(raw); res[`s${sens}-h${hr}`] = { notas: c.length, ...evaluate(c) }; }
  }
  // Histograma de clases de nota de la transcripción (para ver la tonalidad cantada).
  const raw = await A.notesFromOutputs(out, 0.7, 11);
  const h = new Array(12).fill(0); for (const n of raw) h[n.midi % 12] += n.dur;
  res.clases = h.map((x) => +x.toFixed(1));
  const hg = new Array(12).fill(0); for (const n of G) hg[n.midi % 12] += n.dur;
  res.clasesPartitura = hg.map((x) => +x.toFixed(1));
  res.alturaMediaTranscripcion = +(raw.reduce((s, n) => s + n.midi * n.dur, 0) / raw.reduce((s, n) => s + n.dur, 0)).toFixed(1);
  res.alturaMediaPartitura = +(G.reduce((s, n) => s + n.midi * n.dur, 0) / G.reduce((s, n) => s + n.dur, 0)).toFixed(1);
  return res;
}
