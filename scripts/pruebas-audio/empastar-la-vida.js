async () => {
  // Los tres archivos de «La vida es una copa de licor»: la partitura (Sibelius), su audio (MP3 de la partitura)
  // y la grabación a cappella. La partitura tiene que encajar con los dos audios.
  const { alignScoreToAudio } = await import('/src/import/align.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const get = async (u) => (await fetch(u)).arrayBuffer();
  const sib = parseMusicXML(await (await fetch('/samples/la-vida-sibelius.xml')).text());
  const otra = parseMusicXML(await (await fetch('/samples/la-vida.musicxml')).text());
  const notas = (s) => s.voices.map((v) => v.notes.map((n) => n.midi + '@' + n.start.toFixed(2)).join(',')).join('|');
  const res = {
    partitura: { voces: sib.voices.map((v) => `${v.name} ${v.notes.length} ${Math.min(...v.notes.map((n) => n.midi))}-${Math.max(...v.notes.map((n) => n.midi))}`), bpm: sib.bpm, clave: sib.keyFifths, igualQueLaOtra: notas(sib) === notas(otra) },
  };
  for (const [nombre, url] of [['mp3', '/samples/la-vida-partitura.mp3'], ['acapella', '/samples/la-vida.wav']]) {
    const t0 = performance.now();
    const r = await alignScoreToAudio(sib, await get(url), 'x', { start: 0, end: 0, keepKey: false });
    // Con el MP3 de la propia partitura, el mapa debería ser casi una recta (mismo tempo).
    const mapa = [2, 10, 20, 30, 40, 50, 60, 70, 75].map((t) => +(r.toAudio(t) - t).toFixed(2));
    res[nombre] = { segundos: +((performance.now() - t0) / 1000).toFixed(1), transpone: r.transpose, parecido: +r.match.toFixed(2), grabacion: [+r.audioFrom.toFixed(1), +r.audioTo.toFixed(1)], bpm: r.song.bpm, octavas: r.octaves, desfaseSegunTiempo: mapa.join(' ') };
  }
  return res;
}
