async () => {
  // Partitura + grabación: coloca las notas de la partitura donde se cantan y mide cuánto coinciden con lo que se oye.
  const A = await import('/src/import/audio.ts');
  const { alignScoreToAudio, ALIGN } = await import('/src/import/align.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const score = parseMusicXML(await (await fetch('/samples/la-vida.musicxml')).text());
  const wav = await (await fetch('/samples/la-vida.wav')).arrayBuffer();
  const END = 175;
  // Lo que se oye: la «probabilidad de nota» de Basic Pitch por fila y fotograma.
  const { samples } = await A.decodeAudio(wav.slice(0));
  const out = await A.basicPitchOutputs(samples.subarray(0, END * 22050));
  const fps = A.FRAME_RATE; // el fotograma f es el segundo f / FRAME_RATE
  // Con el desplazamiento que mejor encaja (la canción empieza en la primera nota, la grabación no).
  const oye = (notes, off) => {
    let on = 0, tot = 0;
    for (const n of notes) for (let t = n.start + 0.05; t < n.start + n.dur - 0.05; t += 0.05) {
      const f = Math.round((t + off) * fps); if (f < 0 || f >= out.frames.length) continue;
      const row = out.frames[f]; tot++;
      if ([n.midi, n.midi - 12, n.midi + 12].some((m) => (row[m - 21] ?? 0) > 0.3)) on++;
    }
    return on / Math.max(1, tot);
  };
  let centro = 0;
  const mejor = (notes) => { let b = { f: 0, off: 0 }; for (let off = centro - 4; off <= centro + 4; off += 0.05) { const f = oye(notes, off); if (f > b.f) b = { f, off }; } return { suena: +b.f.toFixed(3), off: +b.off.toFixed(2) }; };
  const res = { partes: score.voices.map((v) => [v.name, v.notes.length, Math.min(...v.notes.map((n) => n.midi)), Math.max(...v.notes.map((n) => n.midi)), +v.notes[0].start.toFixed(1)].join(' ')), clave: score.keyFifths };
  for (const cfg of window.__cfgs ?? [{}]) {
    Object.assign(ALIGN, { stall: 0.08, harm: 0.2, refine: true, smooth: 3 }, cfg);
    const t0 = performance.now();
    const r = await alignScoreToAudio(score, wav.slice(0), 'alineada', { start: 0, end: END, keepKey: false });
    const secs = (performance.now() - t0) / 1000;
    centro = r.audioFrom;
  const alineada = r.song.voices.flatMap((v) => v.notes);
  // Comparación: la partitura tal cual (transpuesta y estirada de forma uniforme al mismo tramo).
  const k = (r.to - r.from) / (Math.max(...alineada.map((n) => n.start + n.dur)) - Math.min(...alineada.map((n) => n.start)));
  const tal = score.voices.flatMap((v) => v.notes).filter((n) => n.start >= r.from && n.start < r.to).map((n) => ({ midi: n.midi + r.transpose, start: (n.start - r.from) / k, dur: n.dur / k }));
    res[JSON.stringify(cfg)] = {
    segundos: +secs.toFixed(1), transpone: r.transpose, parecido: +r.match.toFixed(2), partitura: [+r.from.toFixed(1), +r.to.toFixed(1)], grabacion: [+r.audioFrom.toFixed(1), +r.audioTo.toFixed(1)], bpm: r.song.bpm, bpmPartitura: score.bpm,
    notas: alineada.length, voces: r.song.voices.map((v) => v.notes.length),
    alineada: mejor(alineada),
    octavas: r.song.voices.map((v) => [-12, 0, 12].map((o) => { const off = mejor(alineada).off; let on = 0, tot = 0; for (const n of v.notes) for (let t = n.start + 0.05; t < n.start + n.dur - 0.05; t += 0.05) { const f = Math.round((t + off) * fps); if (f < 0 || f >= out.frames.length) continue; tot++; on += out.frames[f][n.midi + o - 21] ?? 0; } return (on / Math.max(1, tot)).toFixed(3); }).join('/')),
    porVoz: r.song.voices.map((v) => oye(v.notes, mejor(alineada).off).toFixed(2)).join(' '), partituraEstirada: mejor(tal),
    };
  }
  return res;
}
