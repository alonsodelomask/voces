async () => {
  // «Toda la grabación» con «La vida es una copa de licor»: la partitura (24 compases escritos, 76 s con sus
  // repeticiones) se canta dos veces en los 175 s de la grabación (de 1,8 a 72,5 s y de 103,7 a 174,6 s; en medio,
  // silencio). Tiene que encontrar las dos tomas enteras, sin trocitos sueltos: en una grabación de verdad un compás se
  // parece a otros muchos, y con un salto barato el camino iba saltando de uno a otro.
  // Usa lo que oye el modelo ya calculado (samples/la-vida-bp.json, de volcar-la-vida.js) para no esperar al modelo.
  const { alignScoreToAudio } = await import('/src/import/align.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const score = parseMusicXML(await (await fetch('/samples/la-vida-sibelius.xml')).text());
  const bp = await (await fetch('/samples/la-vida-bp.json')).json();
  // Cada matriz viene como Uint16 en base64 (88 notas por fotograma, valor/65535).
  const dense = (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const u = new Uint16Array(bytes.buffer);
    const rows = [];
    for (let f = 0; f < u.length / 88; f++) rows.push(Array.from(u.subarray(f * 88, f * 88 + 88), (v) => v / 65535));
    return rows;
  };
  const out = { frames: dense(bp.frames), onsets: dense(bp.onsets), contours: [] };
  const fps = out.frames.length / bp.seconds;
  const t0 = performance.now();
  const r = await alignScoreToAudio(score, new ArrayBuffer(0), 'x', { start: 0, end: 0, keepKey: false, span: 'audio', addSung: true, outputs: { out, seconds: bp.seconds } });
  // Cuánto se oye lo que se ha colocado: media de la «probabilidad de nota» del modelo durante cada nota (su octava o
  // una más arriba o más abajo, que cuenta menos). Los tiempos de la canción van desplazados `audioOffset` del archivo.
  const oye = (notes) => {
    let s = 0, c = 0;
    for (const n of notes) for (let t = n.start + 0.05; t < n.start + n.dur - 0.05; t += 0.05) {
      const f = Math.round((t + r.audioOffset) * fps); if (f < 0 || f >= out.frames.length) continue;
      c++; s += Math.max(out.frames[f][n.midi - 21] ?? 0, 0.7 * (out.frames[f][n.midi - 9] ?? 0), 0.7 * (out.frames[f][n.midi - 33] ?? 0));
    }
    return c ? +(s / c).toFixed(3) : 0;
  };
  const notas = r.song.voices.flatMap((v) => v.notes);
  const esperadas = [[1.8, 72.5], [103.7, 174.6]];
  const tomas = r.passes.length === 2 && r.passes.every((p, k) => Math.abs(p.audioFrom - esperadas[k][0]) < 1.5 && Math.abs(p.audioTo - esperadas[k][1]) < 1.5);
  // La primera voz lleva la melodía, escrita en clave de sol y cantada una octava más baja: es la única que el modelo
  // oye bien (las otras quedan debajo, en el mismo orden).
  const melodia = r.octaves.find((o) => o.index === 0)?.semis;
  return {
    ok: tomas && r.laps === 2 && melodia === -12,
    s: +((performance.now() - t0) / 1000).toFixed(1),
    pasadas: r.passes.map((p) => `partitura ${p.from.toFixed(1)}–${p.to.toFixed(1)} → grabación ${p.audioFrom.toFixed(1)}–${p.audioTo.toFixed(1)}`),
    vueltas: r.laps,
    voces: r.song.voices.map((v) => `${v.name}: ${v.notes.length} notas, se oye ${oye(v.notes)}`),
    octavas: r.octaves.map((o) => `${o.name} ${o.semis}`).join(', '),
    primera: +(Math.min(...notas.map((n) => n.start)) + r.audioOffset).toFixed(1),
    ultima: +(Math.max(...notas.map((n) => n.start + n.dur)) + r.audioOffset).toFixed(1),
    anclas: r.anchors,
  };
}
