async () => {
  // Sintetiza dos voces, las importa como WAV y comprueba que salen sus notas.
  // Después añade una tercera pista (grabada «por separado») a la misma canción.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const SR = 22050, beat = 0.5; // 120 BPM
  const alta = [72, 74, 76, 77, 79, 77, 76, 74, 72, 72, 76, 79];
  const baja = [60, 60, 55, 55, 57, 57, 53, 53, 55, 55, 48, 48];
  const media = [67, 67, 67, 69, 71, 69, 67, 65, 64, 64, 67, 67];

  // `diapason`: un La de medio segundo antes de empezar (antes del 0 de la canción).
  async function wav(name, voces, diapason = false) {
    const dur = 12 * beat + 1;
    const ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
    if (diapason) {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 440;
      g.gain.setValueAtTime(0, 0.05); g.gain.linearRampToValueAtTime(0.3, 0.08); g.gain.setValueAtTime(0.3, 0.5); g.gain.linearRampToValueAtTime(0, 0.55);
      o.connect(g).connect(ctx.destination); o.start(0.05); o.stop(0.56);
    }
    for (const notas of voces) notas.forEach((m, i) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((m - 69) / 12);
      const t = 0.7 + i * beat; // fuera del pulso: obliga a recortar el principio
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.03);
      g.gain.setValueAtTime(0.3, t + beat - 0.06); g.gain.linearRampToValueAtTime(0, t + beat - 0.02);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + beat);
    });
    const pcm = (await ctx.startRendering()).getChannelData(0);
    const w = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const str = (o, s) => [...s].forEach((c, i) => w.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); w.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
    w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 1, true);
    w.setUint32(24, SR, true); w.setUint32(28, SR * 2, true); w.setUint16(32, 2, true); w.setUint16(34, 16, true);
    str(36, 'data'); w.setUint32(40, pcm.length * 2, true);
    pcm.forEach((x, i) => w.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
    return new File([w.buffer], name, { type: 'audio/wav' });
  }
  const input = document.querySelector('#file');
  const abrir = async (file) => {
    const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await wait(300);
    return document.querySelector('dialog[open]');
  };
  const acierto = (got, want) => { const pool = [...got]; let ok = 0; for (const m of want) { const k = pool.indexOf(m); if (k >= 0) { ok++; pool.splice(k, 1); } } return ok / want.length; };

  // En la app nativa no se filtra por extensión (el iPhone deja en gris lo que no reconoce).
  const nativa = document.documentElement.classList.contains('native');
  const res = { acepta: nativa ? input.accept === '' : input.accept.includes('.mp3') && input.accept.includes('.wav') };
  let d = await abrir(await wav('Prueba a dos voces.wav', [alta, baja]));
  res.dialogo = d?.querySelector('h2')?.textContent;
  if (d.querySelector('[name=target]')) d.querySelector('[name=target]').value = 'new';
  d.querySelector('[name=voices]').value = '2';
  d.querySelector('button[value=ok]').click();
  for (let i = 0; i < 600 && V.song.title !== 'Prueba a dos voces'; i++) await wait(250);
  const s = V.song;
  res.titulo = s.title;
  res.bpm = s.bpm;
  res.voces = s.voices.map((v) => v.notes.map((n) => n.midi));
  res.aciertoAlta = +acierto(res.voces[0] ?? [], alta).toFixed(2);
  res.aciertoBaja = +acierto(res.voces[1] ?? [], baja).toFixed(2);

  // Tercera voz grabada aparte: se añade a la canción abierta, con el mismo tiempo.
  d = await abrir(await wav('Contralto.wav', [media]));
  res.ofreceAnadir = !!d.querySelector('[name=target] option[value=add]');
  d.querySelector('[name=target]').value = 'add';
  d.querySelector('button[value=ok]').click();
  for (let i = 0; i < 600 && V.song.voices.length < 3; i++) await wait(250);
  const nueva = V.song.voices[2];
  res.tercera = nueva && { nombre: nueva.name, notas: nueva.notes.map((n) => n.midi) };
  res.aciertoMedia = nueva ? +acierto(nueva.notes.map((n) => n.midi), media).toFixed(2) : 0;
  // Con la misma rejilla, la nota 5 de la voz media empieza a la vez que la 5 de la baja.
  const t = (v, m) => v.notes.find((n) => n.midi === m)?.start;
  res.alineada = nueva ? Math.abs(t(nueva, 71) - t(V.song.voices[1], 57)) < 0.01 : false;
  res.mismaCancion = V.song.title === 'Prueba a dos voces';

  // La misma pista convertida «Desde el segundo» 1: el archivo es el mismo, así que sus notas caen donde las de antes
  // (antes quedaban un segundo antes: se contaban desde el principio del tramo y no del archivo).
  d = await abrir(await wav('Contralto bis.wav', [media]));
  d.querySelector('[name=target]').value = 'add';
  d.querySelector('[name=start]').value = '1';
  d.querySelector('button[value=ok]').click();
  for (let i = 0; i < 600 && V.song.voices.length < 4; i++) await wait(250);
  const cuarta = V.song.voices[3];
  res.desdeElSegundo = cuarta && nueva ? +(t(cuarta, 71) - t(nueva, 71)).toFixed(3) : null;

  // Y una pista con un diapasón que suena antes del 0 de la canción (aquí, una canción cuyo 0 está en el segundo 1 del
  // archivo): lo de antes del 0 no entra y lo que lo cruza se recorta. Antes se amontonaba todo en el 0 y tapaba la
  // primera nota.
  const { audioToSong } = await import('/src/import/audio.ts');
  const conDiapason = await audioToSong(await (await wav('Contralto con diapasón.wav', [media], true)).arrayBuffer(), 'x', { voices: 1, grid: 0.5, bpm: 120, keepTime: true, phase: 1, start: 0, end: 0, sensitivity: 0.5 });
  const cn = conDiapason.voices[0]?.notes ?? [];
  res.conDiapason = { primera: cn[0] && `${cn[0].midi}@${cn[0].start}`, laAlPrincipio: cn.some((n) => n.midi === 69 && n.start < 0.3) };
  res.ok = res.acepta && s.voices.length >= 2 && res.aciertoAlta >= 0.8 && res.aciertoBaja >= 0.8 && Math.abs(s.bpm - 120) <= 3 &&
    res.ofreceAnadir && res.mismaCancion && V.song.voices.length === 4 && res.aciertoMedia >= 0.8 && res.alineada &&
    res.desdeElSegundo !== null && Math.abs(res.desdeElSegundo) < 0.01 && res.conDiapason.primera === '67@0' && !res.conDiapason.laAlPrincipio;
  return res;
}
