async () => {
  // Graba (sintetiza) dos voces de prueba, las importa como WAV y comprueba que salen sus notas.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const SR = 22050, beat = 0.5; // 120 BPM
  const alta = [72, 74, 76, 77, 79, 77, 76, 74, 72, 72, 76, 79];
  const baja = [60, 60, 55, 55, 57, 57, 53, 53, 55, 55, 48, 48];
  const dur = alta.length * beat + 1;
  const ctx = new OfflineAudioContext(1, Math.ceil(dur * SR), SR);
  const voz = (notas, vol) => notas.forEach((m, i) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((m - 69) / 12);
    const t = 0.5 + i * beat;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setValueAtTime(vol, t + beat - 0.06); g.gain.linearRampToValueAtTime(0, t + beat - 0.02);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + beat);
  });
  voz(alta, 0.3); voz(baja, 0.3);
  const buf = await ctx.startRendering();
  // WAV de 16 bits.
  const pcm = buf.getChannelData(0);
  const wav = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => wav.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); wav.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  wav.setUint32(16, 16, true); wav.setUint16(20, 1, true); wav.setUint16(22, 1, true);
  wav.setUint32(24, SR, true); wav.setUint32(28, SR * 2, true); wav.setUint16(32, 2, true); wav.setUint16(34, 16, true);
  str(36, 'data'); wav.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => wav.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
  const file = new File([wav.buffer], 'Prueba a dos voces.wav', { type: 'audio/wav' });

  const input = document.querySelector('#file');
  // En la app nativa no se filtra por extensión (el iPhone deja en gris lo que no reconoce).
  const nativa = document.documentElement.classList.contains('native');
  const res = { acepta: nativa ? input.accept === '' : input.accept.includes('.mp3') && input.accept.includes('.wav') };
  const dt = new DataTransfer(); dt.items.add(file); input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  await wait(300);
  const d = document.querySelector('dialog[open]');
  res.dialogo = d?.querySelector('h2')?.textContent;
  d.querySelector('[name=voices]').value = '2';
  d.querySelector('button[value=ok]').click();
  for (let i = 0; i < 600 && V.song.title !== 'Prueba a dos voces'; i++) await wait(250);
  const s = V.song;
  res.titulo = s.title;
  res.bpm = s.bpm;
  res.voces = s.voices.map((v) => v.notes.map((n) => n.midi));
  const acierto = (got, want) => { const pool = [...got]; let ok = 0; for (const m of want) { const k = pool.indexOf(m); if (k >= 0) { ok++; pool.splice(k, 1); } } return ok / want.length; };
  res.aciertoAlta = +acierto(res.voces[0] ?? [], alta).toFixed(2);
  res.aciertoBaja = +acierto(res.voces[1] ?? [], baja).toFixed(2);
  res.ok = res.acepta && s.voices.length === 2 && res.aciertoAlta >= 0.8 && res.aciertoBaja >= 0.8 && Math.abs(s.bpm - 120) <= 3;
  return res;
}
