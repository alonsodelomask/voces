async () => {
  // «Asistente → Fusión → 🎧 Volver a sacarla de la grabación»: la voz «🎙» se vuelve a sacar de la grabación guardada
  // siguiendo la altura de quien canta (una persona sola). La grabación es sintética: una voz con armónicos, vibrato y
  // portamento que canta la línea de la partitura (inventada), un poco desafinada en una nota y con otra nota distinta
  // en otra. La «🎙» de partida es pobre, como la que daba el modelo: pocas notas. Se puede deshacer.
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
  const titulo = 'Fusión para rehacer';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part></part-list><part id="P1">` +
    [0, 1, 2].map((c) => `<measure number="${c + 1}">${c === 0 ? '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><sound tempo="120"/>' : ''}` +
      alta.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') +
    '</part></score-partwise>';
  const input = document.querySelector('#file');
  const dt = new DataTransfer();
  dt.items.add(new File([xml], `${titulo}.musicxml`, { type: 'application/xml' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  await espera(() => V.song.title === titulo);
  const s = V.song;
  const va = s.voices[0];

  // Lo que se canta: la línea de la partitura, la nota 4 un poco alta (+0,4) y la 9 tres semitonos más alta (otra nota).
  const cantadas = va.notes.map((n, i) => ({ midi: n.midi + (i === 3 ? 0.4 : i === 8 ? 3 : 0), start: n.start, dur: n.dur }));
  const SR = 32000;
  const fin = Math.max(...cantadas.map((n) => n.start + n.dur)) + 0.5;
  const x = new Float32Array(Math.ceil(fin * SR));
  let fase = 0;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const k = cantadas.findIndex((n) => t >= n.start && t < n.start + n.dur);
    if (k < 0) continue;
    const n = cantadas[k];
    let m = n.midi + 0.25 * Math.sin(2 * Math.PI * 5.5 * t);
    if (k > 0 && t - n.start < 0.06) m = cantadas[k - 1].midi + (m - cantadas[k - 1].midi) * ((t - n.start) / 0.06);
    fase += (2 * Math.PI * 440 * 2 ** ((m - 69) / 12)) / SR;
    x[i] = 0.3 * Math.sin(fase) + 0.25 * Math.sin(2 * fase) + 0.1 * Math.sin(3 * fase);
  }
  const { putTrack, encodeWav } = await import('/src/audio/track.ts');
  await putTrack(s.id, encodeWav(x, SR));
  s.audioTrack = { name: 'Toma sola.wav', offset: 0, duration: x.length / SR, volume: 0.8, muted: false, solo: false };
  // La «🎙» de partida: solo tres notas, como cuando el modelo no apuntaba casi nada.
  const { makeVoice } = await import('/src/model.ts');
  const voz = makeVoice('🎙 Alta', 1, [0, 4, 10].map((i) => ({ midi: va.notes[i].midi, start: va.notes[i].start, dur: va.notes[i].dur })));
  voz.sungOf = va.id;
  s.voices.push(voz);

  const res = {};
  document.querySelector('[data-view=edit]')?.click();
  await wait(100);
  document.querySelector('#ed-assist').click();
  await espera(() => document.querySelector('dialog[open] [data-t=fusion]'));
  const d = document.querySelector('dialog[open]');
  d.querySelector('[data-t=fusion]').click();
  res.boton = !!d.querySelector('#as-fu-redo');
  d.querySelector('#as-fu-redo').click();
  await espera(() => /sacada otra vez|no está guardada|No se ha podido/.test(d.querySelector('#as-fu-out')?.textContent ?? ''));
  res.mensaje = d.querySelector('#as-fu-out')?.textContent;
  const sung = s.voices.find((v) => v.name === '🎙 Alta');
  res.notas = sung.notes.map((n) => n.midi).join(' ');
  res.esperadas = va.notes.map((n, i) => (i === 8 ? n.midi + 3 : n.midi)).join(' ');
  res.desfase = Math.max(...sung.notes.map((n, i) => Math.abs(n.start - (va.notes[i]?.start ?? Infinity))));
  d.querySelector('#as-close').click();
  await wait(100);
  document.querySelector('#ed-undo').click();
  await wait(100);
  res.deshecho = V.song.voices.find((v) => v.name === '🎙 Alta')?.notes.length;

  res.ok = res.boton && /sacada otra vez de la grabación: 12 notas \(antes 3\)/.test(res.mensaje ?? '') && res.notas === res.esperadas && res.desfase < 0.08 && res.deshecho === 3;
  return res;
}
