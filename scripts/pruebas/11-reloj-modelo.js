async () => {
  // El reloj del modelo: tonos de La4 en segundos conocidos a lo largo de un minuto. Cada uno tiene que salir en su
  // segundo, tanto en los fotogramas (lo que usa la mezcla) como en las notas (lo que usa «Convertir audio»), y el
  // error no puede crecer con el tiempo. Con el troceado de la librería, el reloj adelantaba un 0,5 %: al minuto, las
  // notas ya caían 0,35 s tarde, y a los tres minutos, más de un segundo.
  const A = await import('/src/import/audio.ts');
  const SR = 22050, total = 60;
  const s = new Float32Array(SR * total);
  const reales = [];
  for (let t = 3; t < total - 1; t += 10) {
    reales.push(t);
    const a = Math.round(t * SR);
    for (let k = 0; k < SR * 0.4; k++) {
      const env = Math.min(1, k / (SR * 0.005), (SR * 0.4 - k) / (SR * 0.02));
      s[a + k] = 0.5 * env * Math.sin((2 * Math.PI * 440 * k) / SR);
    }
  }
  const out = await A.basicPitchOutputs(s);
  // Fotogramas: el primero en que el La4 pasa de 0,5 cerca de donde debe estar.
  const enFotogramas = reales.map((t) => {
    const desde = Math.round((t - 2) * A.FRAME_RATE), hasta = Math.min(out.frames.length, Math.round((t + 3) * A.FRAME_RATE));
    for (let f = desde; f < hasta; f++) if (out.frames[f][69 - 21] > 0.5) return +(f / A.FRAME_RATE - t).toFixed(3);
    return null;
  });
  // Notas: la que el modelo saca para cada tono.
  const notas = await A.notesFromOutputs(out, 0.5);
  const enNotas = reales.map((t) => {
    const n = notas.filter((x) => x.midi === 69).sort((a, b) => Math.abs(a.start - t) - Math.abs(b.start - t))[0];
    return n ? +(n.start - t).toFixed(3) : null;
  });
  const bien = (xs) => xs.every((x) => x !== null && Math.abs(x) < 0.03) && Math.max(...xs) - Math.min(...xs) < 0.025;
  return {
    fotogramas: out.frames.length,
    esperados: Math.ceil(s.length / 256),
    enFotogramas,
    enNotas,
    ok: out.frames.length === Math.ceil(s.length / 256) && bien(enFotogramas) && bien(enNotas),
  };
}
