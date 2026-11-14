async () => {
  // Sacar la letra de «La vida es una copa de licor» con Whisper (en el navegador): se mezcla la partitura con la
  // grabación (lo que oye Basic Pitch ya calculado, samples/la-vida-bp.json), se escucha la letra donde cantan las voces
  // (en trozos cortados en sus silencios) y se pone en la melodía (Unai), cada sílaba en la nota en que se oye, y en las
  // voces que van a su ritmo. Devuelve lo que entiende, con los tiempos de cada palabra, y cómo queda la letra.
  const { alignScoreToAudio } = await import('/src/import/align.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const { decodeMono } = await import('/src/audio/track.ts');
  const T = await import('/src/import/transcribe.ts');
  const { placeHeard } = await import('/src/editor/lyricsPlace.ts');
  const score = parseMusicXML(await (await fetch('/samples/la-vida.musicxml')).text());
  const bp = await (await fetch('/samples/la-vida-bp.json')).json();
  const dense = (b64) => { const bin = atob(b64); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); const u = new Uint16Array(bytes.buffer); const rows = []; for (let f = 0; f < u.length / 88; f++) rows.push(Array.from(u.subarray(f * 88, f * 88 + 88), (v) => v / 65535)); return rows; };
  const out = { frames: dense(bp.frames), onsets: dense(bp.onsets), contours: [] };
  const r = await alignScoreToAudio(score, new ArrayBuffer(0), 'x', { start: 0, end: 0, keepKey: false, span: 'audio', addSung: false, outputs: { out } });
  const unai = r.song.voices[0];
  const audio = await decodeMono(await (await fetch('/samples/la-vida.wav')).arrayBuffer(), 16000);
  // Los mismos tramos que escucha hearSong: donde cantan las voces, cortados por los respiros de la melodía.
  const tramos = T.sungStretches(T.scoreNotes(r.song), r.audioOffset, audio.length / 16000, unai.notes);
  const fases = [];
  const t0 = performance.now();
  const palabras = await T.hearSong(r.song, audio, r.audioOffset, (fase, f) => { if (!fases.length || fases[fases.length - 1].fase.slice(0, 12) !== fase.slice(0, 12)) fases.push({ fase, f: +f.toFixed(2), s: Math.round((performance.now() - t0) / 1000) }); });
  const segundos = Math.round((performance.now() - t0) / 1000);
  const c0 = performance.now();
  const puesta = placeHeard(r.song, unai, palabras, null, 0, true);
  const msColocar = Math.round(performance.now() - c0);
  return {
    segundos,
    msColocar,
    puesta: { puestas: puesta.puestas, dudosas: puesta.dudosas, descartadas: puesta.descartadas, otras: puesta.otras, otroRitmo: puesta.otroRitmo },
    porVoz: r.song.voices.map((v) => ({ voz: v.name, notas: v.notes.length, conLetra: v.notes.filter((n) => n.lyric).length })),
    principio: r.song.voices.map((v) => v.notes.slice(0, 12).map((n) => n.lyric ?? '·').join(' ')),
    tramos: tramos.map((t) => `${t.a.toFixed(1)}–${t.b.toFixed(1)}`),
    fases,
    palabras: palabras.length,
    texto: T.lyricsFromWords(palabras),
    tiempos: palabras.map((p) => `${p.texto}@${p.a.toFixed(2)}`).join(' '),
    oidas: palabras.map((p) => [p.texto, +(p.a + r.audioOffset).toFixed(3), +(p.b + r.audioOffset).toFixed(3)]),
    audioOffset: r.audioOffset,
    notasMelodia: unai.notes.map((n) => [n.midi, +(n.start + r.audioOffset).toFixed(3), +n.dur.toFixed(3)]),
  };
}
