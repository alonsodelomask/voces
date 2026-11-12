async () => {
  // Convierte la primera toma de la grabación y la compara con la partitura (MusicXML) de la misma canción.
  const { audioToSong } = await import('/src/import/audio.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const gt = parseMusicXML(await (await fetch('/samples/la-vida.musicxml')).text());
  const wav = await (await fetch('/samples/la-vida.wav')).arrayBuffer();
  const opts = window.__opts ?? {};
  const t0 = performance.now();
  const song = await audioToSong(wav, 'prueba', { voices: opts.voices ?? 0, grid: 0, bpm: 0, start: 0, end: 72, sensitivity: opts.sens ?? 0.5 });
  const secs = (performance.now() - t0) / 1000;
  const G = gt.voices.flatMap((v) => v.notes);
  const T = song.voices.flatMap((v) => v.notes);
  const active = (notes, t) => notes.filter((n) => n.start <= t && n.start + n.dur > t).map((n) => n.midi);
  // Búsqueda del desfase de tiempo y de la transposición (octava o tono) que mejor alinean.
  let best = { f: -1 };
  for (const tr of [-24, -12, -7, -5, -2, 0, 2, 5, 7, 12]) {
    for (let off = -4; off <= 4; off += 0.1) {
      let tp = 0, ng = 0, nt = 0;
      for (let t = 0.5; t < 74; t += 0.1) {
        const g = active(G, t);
        const s = active(T, t + off).map((m) => m - tr);
        ng += g.length; nt += s.length;
        const pool = [...s];
        for (const m of g) { const k = pool.indexOf(m); if (k >= 0) { tp++; pool.splice(k, 1); } }
      }
      const p = tp / Math.max(1, nt), r = tp / Math.max(1, ng), f = (2 * p * r) / Math.max(1e-9, p + r);
      if (f > best.f) best = { f, p, r, tr, off: +off.toFixed(1) };
    }
  }
  // Por voz: la línea más aguda (melodía) contra la voz más aguda de la partitura.
  const topG = gt.voices[0].notes, topT = song.voices[0]?.notes ?? [];
  let mtp = 0, mg = 0;
  for (let t = 0.5; t < 74; t += 0.1) { const g = active(topG, t); const s = active(topT, t + best.off).map((m) => m - best.tr); if (g.length) { mg++; if (s.length && s[0] === g[0]) mtp++; } }
  return { segundos: +secs.toFixed(1), tempo: song.bpm, voces: song.voices.length, notas: T.length, notasPartitura: G.length, mejor: { ...best, f: +best.f.toFixed(3), p: +best.p.toFixed(3), r: +best.r.toFixed(3) }, melodiaAcierto: +(mtp / Math.max(1, mg)).toFixed(3), porVoz: song.voices.map((v) => v.notes.length) };
}
