async () => {
  // Partitura + grabación a la vez: las notas salen de la partitura y el ritmo, de la grabación.
  // La «grabación» (sintetizada) va más rápida que la partitura y con el tempo cambiando, un tono más baja,
  // la voz grave una octava por debajo de lo escrito y una nota de la aguda cantada tarde.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const alta = [72, 74, 76, 77, 79, 77, 76, 74, 72, 72, 76, 79];
  const baja = [60, 60, 55, 55, 57, 57, 53, 53, 55, 55, 60, 60];

  // Partitura: dos partes de negras a 100 BPM (la segunda parte escrita para trompeta en Si♭: suena un tono más baja).
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas, trompeta) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>${trompeta ? 2 : 0}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${trompeta ? '<transpose><diatonic>1</diatonic><chromatic>2</chromatic></transpose>' : ''}<clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="100"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(trompeta ? m - 2 : m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  // La parte de trompeta se escribe 2 semitonos por debajo para que, con <transpose> +2, suene a la altura de `alta`.
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>Canon de prueba</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Baja</part-name></score-part></part-list>
    ${parte('P1', alta, true)}${parte('P2', baja, false)}</score-partwise>`;

  // Grabación: tiempos reales de cada pulso (acelera y luego frena), un tono más baja y la grave una octava abajo.
  const beatDur = [0.5, 0.48, 0.46, 0.44, 0.42, 0.4, 0.4, 0.42, 0.46, 0.5, 0.55, 0.6];
  const t = [0.8];
  for (const d of beatDur) t.push(t[t.length - 1] + d);
  const tarde = 4; // la 5.ª nota de la aguda entra 0,15 s tarde
  const SR = 22050;
  const ctx = new OfflineAudioContext(1, Math.ceil((t[12] + 1) * SR), SR);
  const toca = (m, a, b, vol) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((m - 69) / 12);
    g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(vol, a + 0.03);
    g.gain.setValueAtTime(vol, b - 0.06); g.gain.linearRampToValueAtTime(0, b - 0.02);
    o.connect(g).connect(ctx.destination); o.start(a); o.stop(b);
  };
  alta.forEach((m, i) => toca(m - 2, t[i] + (i === tarde ? 0.15 : 0), t[i + 1], 0.3));
  baja.forEach((m, i) => toca(m - 2 - 12, t[i], t[i + 1], 0.3));
  const pcm = (await ctx.startRendering()).getChannelData(0);
  const w = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => w.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); w.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 1, true);
  w.setUint32(24, SR, true); w.setUint32(28, SR * 2, true); w.setUint16(32, 2, true); w.setUint16(34, 16, true);
  str(36, 'data'); w.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => w.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));

  // Las dos a la vez, como al elegir dos archivos.
  const input = document.querySelector('#file');
  const dt = new DataTransfer();
  dt.items.add(new File([w.buffer], 'Ensayo martes.wav', { type: 'audio/wav' }));
  dt.items.add(new File([xml], 'Canon de prueba.musicxml', { type: 'application/xml' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  let d = null;
  for (let i = 0; i < 40 && !d?.querySelector('[name=target]'); i++) { await wait(100); d = document.querySelector('dialog[open]'); }
  const res = {
    multiple: input.multiple,
    partitura: V.song.title,
    // La trompeta en Si♭ se lee a la altura real.
    trompeta: V.song.voices.find((v) => v.name === 'Alta')?.notes.map((n) => n.midi).join(',') === alta.join(','),
    eligeAlinear: d?.querySelector('[name=target]')?.value,
    ocultaVoces: d?.querySelector('[name=voices]')?.closest('label')?.hidden,
  };
  d.querySelector('button[value=ok]').click();
  for (let i = 0; i < 600 && !V.song.title.includes('Ensayo martes'); i++) await wait(250);
  const s = V.song;
  res.titulo = s.title;
  const va = s.voices.find((v) => v.name === 'Alta'), vb = s.voices.find((v) => v.name === 'Baja');
  res.alta = va?.notes.map((n) => n.midi).join(',');
  res.baja = vb?.notes.map((n) => n.midi).join(',');
  res.notasAlta = res.alta === alta.map((m) => m - 2).join(',');
  res.notasBaja = res.baja === baja.map((m) => m - 14).join(',');
  // Ritmo: los ataques relativos a la primera nota, contra los reales.
  const real = alta.map((_, i) => t[i] + (i === tarde ? 0.15 : 0) - t[0]);
  const errA = va ? va.notes.map((n, i) => Math.abs(n.start - va.notes[0].start - real[i])) : [9];
  const errB = vb ? vb.notes.map((n, i) => Math.abs(n.start - va.notes[0].start - (t[i] - t[0]))) : [9];
  res.errA = errA.map((x) => x.toFixed(2)).join(" "); res.errB = errB.map((x) => x.toFixed(2)).join(" ");
  res.errorMaxAlta = +Math.max(...errA).toFixed(3);
  res.errorMaxBaja = +Math.max(...errB).toFixed(3);
  res.tarde = va ? +(va.notes[tarde].start - vb.notes[tarde].start).toFixed(3) : null;
  res.bpm = s.bpm;
  res.toast = document.querySelector('.toast')?.textContent;
  res.ok = res.multiple && res.trompeta && res.eligeAlinear === 'align' && res.ocultaVoces === true && res.notasAlta && res.notasBaja &&
    res.errorMaxAlta < 0.08 && res.errorMaxBaja < 0.08 && res.tarde > 0.08;
  return res;
}
