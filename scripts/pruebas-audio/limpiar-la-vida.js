async () => {
  // ¿Cuánto se separa la melodía colocada de donde se canta de verdad? Se mide contra los ataques que oye el
  // modelo, con el ajuste por anclas y sin él. `oidas` son las notas cuya altura se distingue en la grabación:
  // en las demás no hay forma de saberlo (en «La vida es una copa de licor» las voces interiores se tapan).
  const A = await import('/src/import/audio.ts');
  const { alignScoreToAudio, ALIGN } = await import('/src/import/align.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const score = parseMusicXML(await (await fetch('/samples/la-vida-sibelius.xml')).text());
  const wav = await (await fetch('/samples/la-vida.wav')).arrayBuffer();
  const VENTANA = 60;
  const { samples } = await A.decodeAudio(wav.slice(0));
  const out = await A.basicPitchOutputs(samples.subarray(0, Math.floor(VENTANA * 22050)));
  const fps = out.frames.length / VENTANA;
  const res = {};
  // Referencia: sin anclas es solo el DTW; con anclas, lo que hace la app.
  const CFGS = window.__cfgs ?? [{ refine: false }, {}];
  for (const cfg of CFGS) {
    Object.assign(ALIGN, { refine: true, onset: 0.12, heard: 0.1, bin: 1, minBin: 3 }, cfg);
    const t0 = performance.now();
    const r = await alignScoreToAudio(score, wav.slice(0), 'x', { start: 0, end: VENTANA, keepKey: false, span: 'match', addSung: true });
    const mel = r.song.voices.find((v) => v.name === 'Unai');
    const off = r.audioOffset;
    const onset = (m, t) => out.onsets[Math.round((t + off) * fps)]?.[m - 21] ?? 0;
    const prob = (m, t) => out.frames[Math.round((t + off) * fps)]?.[m - 21] ?? 0;
    const seOye = (n) => { let s = 0, c = 0; for (let t = n.start + 0.06; t < n.start + n.dur - 0.06; t += 0.04) { c++; s += prob(n.midi, t); } return c ? s / c : 0; };
    const des = [], desOidas = [];
    for (const n of mel.notes) {
      let best = null;
      for (let d = -0.35; d <= 0.35; d += 1 / fps) {
        const x = onset(n.midi, n.start + d) + 0.6 * onset(n.midi + 12, n.start + d) + 0.6 * onset(n.midi - 12, n.start + d);
        if (x > 0.3 && (!best || x > best.x)) best = { x, d };
      }
      if (best) { des.push(Math.abs(best.d)); if (seOye(n) > 0.3) desOidas.push(Math.abs(best.d)); }
    }
    des.sort((a, b) => a - b); desOidas.sort((a, b) => a - b);
    res[JSON.stringify(cfg)] = {
      s: +((performance.now() - t0) / 1000).toFixed(0), anclas: r.anchors, notas: mel.notes.length, medidas: des.length,
      medio: +(des.reduce((s, d) => s + d, 0) / Math.max(1, des.length)).toFixed(3),
      mediana: +(des[Math.floor(des.length / 2)] ?? 0).toFixed(3),
      finos: +(des.filter((d) => d < 0.08).length / Math.max(1, des.length)).toFixed(2),
      oidas: desOidas.length,
      medianaOidas: +(desOidas[Math.floor(desOidas.length / 2)] ?? 0).toFixed(3),
      finosOidas: +(desOidas.filter((d) => d < 0.08).length / Math.max(1, desOidas.length)).toFixed(2),
      cantada: r.sung?.voice.notes.length,
    };
  }
  return res;
}
