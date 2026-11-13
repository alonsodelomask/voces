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
    partitura: { voces: sib.voices.map((v) => `${v.name} ${v.notes.length}`).join(' / '), bpm: sib.bpm, clave: sib.keyFifths, igualQueLaOtra: notas(sib) === notas(otra) },
  };
  for (const [nombre, url, span] of [
    ['mp3', '/samples/la-vida-partitura.mp3', 'match'],
    ['acapella', '/samples/la-vida.wav', 'match'],
    ['acapella-partitura', '/samples/la-vida.wav', 'score'],
    ['acapella-grabacion', '/samples/la-vida.wav', 'audio'],
  ]) {
    const t0 = performance.now();
    const r = await alignScoreToAudio(sib, await get(url), 'x', { start: 0, end: 0, keepKey: false, span, addSung: true });
    const dur = Math.max(...r.song.voices.flatMap((v) => v.notes.map((n) => n.start + n.dur)));
    const ini = Math.min(...r.song.voices.flatMap((v) => v.notes.map((n) => n.start)));
    res[nombre] = {
      segundos: +((performance.now() - t0) / 1000).toFixed(1),
      transpone: r.transpose,
      parecido: +r.match.toFixed(2),
      partitura: [+r.from.toFixed(1), +r.to.toFixed(1)],
      grabacion: [+r.audioFrom.toFixed(1), +r.audioTo.toFixed(1)],
      cancion: [+ini.toFixed(1), +dur.toFixed(1)],
      offsetAudio: +r.audioOffset.toFixed(2),
      bpm: r.song.bpm,
      notas: r.song.voices.reduce((a, v) => a + v.notes.length, 0),
      octavas: r.octaves.map((o) => `${o.name} ${o.semis}`).join(' / '),
      cantada: r.sung && { nombre: r.sung.voice.name, notas: r.sung.voice.notes.length, coincide: +r.sung.agreement.toFixed(2) },
      // Con el MP3 de la propia partitura el mapa debería ser casi una recta (mismo tempo).
      desfase: [2, 20, 40, 60, 75].map((t) => +(r.toAudio(t) - t).toFixed(1)).join(' '),
    };
  }
  return res;
}
