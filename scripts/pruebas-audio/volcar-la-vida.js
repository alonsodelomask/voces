async () => {
  // Vuelca los datos de «La vida es una copa de licor» para analizarlos fuera del navegador: la partitura leída y lo
  // que oye el modelo en toda la grabación (fotogramas y ataques: 88 notas por fotograma, de 0 a 65535, en base64).
  // Como listas anidadas serían decenas de MB (el fondo del modelo ronda 0,1 en todas las notas) y Chrome tarda
  // minutos en devolverlas.
  const A = await import('/src/import/audio.ts');
  const { parseMusicXML } = await import('/src/import/musicxml.ts');
  const score = parseMusicXML(await (await fetch('/samples/la-vida-sibelius.xml')).text());
  const wav = await (await fetch('/samples/la-vida.wav')).arrayBuffer();
  const { samples, duration } = await A.decodeAudio(wav.slice(0));
  const tm = performance.now();
  const out = await A.basicPitchOutputs(samples);
  const segundosModelo = (performance.now() - tm) / 1000;
  const fps = out.frames.length / (samples.length / 22050);
  const b64 = (m) => {
    const u = new Uint16Array(m.length * 88);
    m.forEach((row, f) => row.forEach((v, i) => (u[f * 88 + i] = Math.round(Math.min(1, Math.max(0, v)) * 65535))));
    const bytes = new Uint8Array(u.buffer);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const voces = (s) => s.voices.map((v) => ({ name: v.name, notes: v.notes.map((n) => [n.midi, +n.start.toFixed(3), +n.dur.toFixed(3)]) }));
  return {
    info: { duracion: duration, fps, frames: out.frames.length, segundosModelo, nota: 'frames/onsets: Uint16 little-endian en base64, 88 por fotograma (MIDI 21-108), valor/65535; fotograma f = segundo f/fps del archivo' },
    score: { bpm: score.bpm, beatsPerBar: score.beatsPerBar, keyFifths: score.keyFifths, voices: voces(score) },
    frames: b64(out.frames),
    onsets: b64(out.onsets),
  };
}
