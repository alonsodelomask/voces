async () => {
  // «Asistente → Fusión → ⏱ Ajustar las entradas a la grabación»: cada nota de la partitura entra donde se canta en la
  // grabación guardada (ni antes ni después), con las de la otra voz que atacan a la vez. La grabación es sintética: una
  // voz sola que canta la melodía (inventada) con la 3.ª nota 0,25 s antes de lo escrito y la 7.ª 0,2 s después. Se
  // puede deshacer.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const espera = async (cond, ms = 5000) => {
    for (let i = 0; i < ms / 50 && !cond(); i++) await wait(50);
  };
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const alta = [55, 57, 59, 60, 62, 60, 59, 57, 55, 57, 59, 60];
  const baja = [48, 50, 52, 53, 55, 53, 52, 50, 48, 50, 52, 53];
  const titulo = 'Entradas a destiempo';
  const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) => `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Baja</part-name></score-part></part-list>
    ${parte('P1', alta)}${parte('P2', baja)}</score-partwise>`;
  const input = document.querySelector('#file');
  const dt = new DataTransfer();
  dt.items.add(new File([xml], `${titulo}.musicxml`, { type: 'application/xml' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  await espera(() => V.song.title === titulo);
  const s = V.song;
  const [va, vb] = s.voices;
  const antes = va.notes.map((n) => n.start);

  // Lo que se canta: la 3.ª entra 0,25 s antes y la 7.ª 0,2 s después (las de al lado se acortan o se alargan).
  const entra = va.notes.map((n, i) => n.start + (i === 2 ? -0.25 : i === 6 ? 0.2 : 0));
  const cantadas = va.notes.map((n, i) => ({ midi: n.midi, start: entra[i], dur: (entra[i + 1] ?? n.start + n.dur) - entra[i] }));
  const SR = 32000;
  const x = new Float32Array(Math.ceil((cantadas.at(-1).start + cantadas.at(-1).dur + 0.5) * SR));
  let fase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const k = cantadas.findIndex((n) => t >= n.start && t < n.start + n.dur);
    if (k < 0) continue;
    const n = cantadas[k];
    let m = n.midi + 0.2 * Math.sin(2 * Math.PI * 5.5 * t);
    if (k > 0 && t - n.start < 0.05) m = cantadas[k - 1].midi + (m - cantadas[k - 1].midi) * ((t - n.start) / 0.05);
    fase += (2 * Math.PI * 440 * 2 ** ((m - 69) / 12)) / SR;
    x[i] = 0.3 * Math.sin(fase) + 0.25 * Math.sin(2 * fase) + 0.1 * Math.sin(3 * fase);
  }
  const { putTrack, encodeWav } = await import('/src/audio/track.ts');
  await putTrack(s.id, encodeWav(x, SR));
  s.audioTrack = { name: 'Toma sola.wav', offset: 0, duration: x.length / SR, volume: 0.8, muted: false, solo: false };
  const { makeVoice } = await import('/src/model.ts');
  const voz = makeVoice('🎙 Alta', 2, cantadas.map((n) => ({ ...n })));
  voz.sungOf = va.id;
  s.voices.push(voz);

  const res = {};
  document.querySelector('[data-view=edit]')?.click();
  await wait(100);
  document.querySelector('#ed-assist').click();
  await espera(() => document.querySelector('dialog[open] [data-t=fusion]'));
  const d = document.querySelector('dialog[open]');
  d.querySelector('[data-t=fusion]').click();
  d.querySelector('#as-fu-entradas').click();
  await espera(() => /Ajustadas|nada que mover|no está guardada|No se ha podido/.test(d.querySelector('#as-fu-out')?.textContent ?? ''));
  res.mensaje = d.querySelector('#as-fu-out')?.textContent;
  const desfase = va.notes.map((n, i) => +(n.start - entra[i]).toFixed(3));
  res.desfaseMax = Math.max(...desfase.map(Math.abs));
  res.juntas = va.notes.every((n, i) => Math.abs(n.start - vb.notes[i].start) < 1e-6);
  res.enOrden = va.notes.every((n, i) => i === 0 || n.start > va.notes[i - 1].start + 0.05);
  res.sinTocarLaGrabada = s.voices.find((v) => v.name === '🎙 Alta').notes.every((n, i) => Math.abs(n.start - cantadas[i].start) < 1e-9);
  d.querySelector('#as-close').click();
  await wait(100);
  document.querySelector('#ed-undo').click();
  await wait(100);
  res.deshecho = V.song.voices[0].notes.every((n, i) => Math.abs(n.start - antes[i]) < 1e-9);

  res.ok = /^Ajustadas 2 entradas de «Alta»/.test(res.mensaje ?? '') && res.desfaseMax < 0.06 && res.juntas && res.enOrden && res.sinTocarLaGrabada && res.deshecho;
  return res;
}
