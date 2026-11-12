async () => {
  const A = await import('/src/import/audio.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const gt = parseMusicXML(await (await fetch('/samples/la-vida.musicxml')).text());
  const { samples } = await A.decodeAudio(await (await fetch('/samples/la-vida.wav')).arrayBuffer());
  const SR = 22050;
  const out = await A.basicPitchOutputs(samples.subarray(0, 72 * SR));
  const G = gt.voices.flatMap((v) => v.notes);
  const STEP = 0.1, gFrames = [];
  for (let t = 0.5; t < 75; t += STEP) gFrames.push({ t, p: G.filter((n) => n.start <= t && n.start + n.dur > t).map((n) => n.midi) });
  const topFrames = gFrames.map((f) => ({ t: f.t, p: f.p.length ? Math.max(...f.p) : null }));
  function roll(notes) { const R = 0.02, arr = new Array(Math.ceil(80 / R)).fill(null).map(() => []); for (const n of notes) for (let i = Math.floor(n.start / R); i < Math.min(arr.length, Math.ceil((n.start + n.dur) / R)); i++) arr[i].push(n.midi); return (t) => (t < 0 ? [] : arr[Math.floor(t / 0.02)] ?? []); }
  function score(notes) {
    const at = roll(notes);
    let best = { f: -1 };
    for (const tr of [-24, -12, -7, -5, -2, -1, 0, 1, 2, 5, 7, 12]) for (let k = 0.88; k <= 1.12; k += 0.01) for (let a = -4; a <= 4; a += 0.2) {
      let tp = 0, ng = 0, nt = 0;
      for (const f of gFrames) { const s = at(a + k * f.t); ng += f.p.length; nt += s.length; const pool = s.map((m) => m - tr); for (const m of f.p) { const i = pool.indexOf(m); if (i >= 0) { tp++; pool.splice(i, 1); } } }
      const p = tp / Math.max(1, nt), r = tp / Math.max(1, ng), F = (2 * p * r) / Math.max(1e-9, p + r);
      if (F > best.f) best = { f: F, p, r, tr, k: +k.toFixed(2), a: +a.toFixed(1) };
    }
    // Melodía: la nota más aguda de la transcripción frente a la más aguda de la partitura.
    let ok = 0, n = 0; for (const f of topFrames) { if (f.p === null) continue; n++; const s = at(best.a + best.k * f.t); if (s.length && Math.max(...s) - best.tr === f.p) ok++; }
    return { F: +best.f.toFixed(3), P: +best.p.toFixed(3), R: +best.r.toFixed(3), tr: best.tr, k: best.k, a: best.a, melodia: +(ok / n).toFixed(3), notas: notes.length };
  }
  const res = { notasPartitura: G.length };
  for (const sens of [0.3, 0.5, 0.7, 0.9]) {
    for (const minF of [6, 11]) {
      const raw = await A.notesFromOutputs(out, sens, minF);
      res[`s${sens}-m${minF}-crudo`] = score(raw);
      res[`s${sens}-m${minF}-limpio`] = score(A.cleanNotes(raw));
    }
  }
  return res;
}
