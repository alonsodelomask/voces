async () => {
  // La letra sacada de la grabación: al mezclar (casilla «Poner la letra») y en el diálogo «Letra» (🎧, corregir una
  // palabra, y escuchar al pulsar «Poner la letra»). Lo que «oye» Whisper es de mentira (window.__vocesLetraOida): así
  // no se descarga el modelo. La letra y la melodía son inventadas.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const alta = [67, 69, 71, 72, 74, 72, 71, 69, 67, 69, 71, 72];
  const baja = [60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65];

  // Partitura sin letra: dos voces al mismo ritmo, negras a 120 BPM (medio segundo cada una).
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>Letra oída</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Baja</part-name></score-part></part-list>
    ${parte('P1', alta)}${parte('P2', baja)}</score-partwise>`;

  // Grabación: las dos voces a la vez, cada nota medio segundo desde el segundo 0,8 (la aguda, más fuerte).
  const t = Array.from({ length: 13 }, (_, i) => 0.8 + 0.5 * i);
  const SR = 22050;
  const ctx = new OfflineAudioContext(1, Math.ceil((t[12] + 1) * SR), SR);
  const toca = (m, a, b, vol) => {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((m - 69) / 12);
    g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(vol, a + 0.03);
    g.gain.setValueAtTime(vol, b - 0.06); g.gain.linearRampToValueAtTime(0, b - 0.02);
    o.connect(g).connect(ctx.destination); o.start(a); o.stop(b);
  };
  alta.forEach((m, i) => toca(m, t[i], t[i + 1], 0.34));
  baja.forEach((m, i) => toca(m, t[i], t[i + 1], 0.2));
  const pcm = (await ctx.startRendering()).getChannelData(0);
  const w = new DataView(new ArrayBuffer(44 + pcm.length * 2));
  const str = (o, s) => [...s].forEach((c, i) => w.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF'); w.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
  w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 1, true);
  w.setUint32(24, SR, true); w.setUint32(28, SR * 2, true); w.setUint16(32, 2, true); w.setUint16(34, 16, true);
  str(36, 'data'); w.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => w.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
  const wav = new File([w.buffer], 'Ensayo jueves.wav', { type: 'audio/wav' });

  // Lo que «oye» Whisper, en segundos del archivo: «Mi gato escucha la canción del mar». «to‿es» va en una nota
  // (sinalefa), «ción» y «mar» se alargan una nota más (melisma).
  const p = (texto, a, b) => ({ texto, a, b });
  window.__vocesLetraOida = [p('Mi', t[0] + 0.02, t[1] - 0.05), p('gato', t[1] + 0.03, t[2] + 0.15), p('escucha', t[2] + 0.2, t[5] - 0.05),
    p('la', t[5] + 0.02, t[6] - 0.05), p('canción', t[6] + 0.03, t[9] - 0.05), p('del', t[9] + 0.02, t[10] - 0.05), p('mar', t[10] + 0.03, t[12] - 0.1)];
  const esperada = 'Mi ga- to‿es- cu- cha la can- ción · del mar ·';
  const letra = (v) => v?.notes.map((n) => n.lyric ?? '·').join(' ');
  // Las notas en ámbar (para revisar), por su número.
  const ambar = (v) => v?.notes.flatMap((n, i) => (n.lyricDoubt ? [i] : [])).join(',');
  // Oculta de verdad (no solo con la propiedad `hidden`: una regla de estilos puede volver a enseñarla).
  const oculta = (el) => !!el && getComputedStyle(el).display === 'none';
  const res = {};
  try {
    // 1) Mezclar con «Poner la letra» (sin marcar al principio; se recuerda).
    const input = document.querySelector('#file');
    const dt = new DataTransfer();
    dt.items.add(wav);
    dt.items.add(new File([xml], 'Letra oída.musicxml', { type: 'application/xml' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    let d = null;
    for (let i = 0; i < 60 && !d?.querySelector('[name=span]'); i++) { await wait(100); d = document.querySelector('dialog[open]'); }
    const casilla = d?.querySelector('[name=lyrics]');
    res.casillaSinMarcar = !!casilla && !casilla.checked;
    casilla.checked = true;
    d.querySelector('[data-ok]').click();
    for (let i = 0; i < 600 && V.song.title !== 'Letra oída (grabación)'; i++) await wait(250);
    const s = V.song;
    const va = s.voices.find((v) => v.name === 'Alta');
    const vb = s.voices.find((v) => v.name === 'Baja');
    res.mezclaAlta = letra(va);
    res.mezclaBaja = letra(vb);
    res.toastMezcla = document.querySelector('.toast')?.textContent;
    res.recordada = localStorage.getItem('voces.mezcla.letra') === 'si';
    res.pista = !!s.audioTrack;

    res.ambarMezcla = ambar(va);
    res.ambarMezclaBaja = ambar(vb);

    // 2) El diálogo, con letra ya puesta: se abre para corregirla en orden, con la nota en ámbar de la mezcla a la vista
    //    (en orden se queda si no cambia su sílaba) y la casilla para darla por buena. «Baja» lleva la copia de «Alta»:
    //    la casilla de las otras voces viene marcada. «Donde se oye» la escribe sin marcas.
    const dialogo = async () => {
      document.querySelector('#ed-lyrics').click();
      for (let i = 0; i < 40 && !document.querySelector('dialog[open] [name=texto]'); i++) await wait(50);
      return document.querySelector('dialog[open]');
    };
    const elige = (d, nombre, valor) => {
      const el = d.querySelector(`[name=${nombre}]`);
      el.value = valor;
      el.dispatchEvent(new Event('change'));
    };
    V.roll.activeVoiceId = va.id;
    d = await dialogo();
    res.manera = d.querySelector('[name=como]')?.value;
    res.otrasMarcada = d.querySelector('[name=otras]').checked;
    res.vistaOrden = d.querySelector('[data-vista]')?.textContent;
    res.ambarPintadas = d.querySelectorAll('[data-vista] .ambar').length;
    res.buenasVisible = !oculta(d.querySelector('[name=buenas]').closest('label'));
    res.buenasSinMarcar = !d.querySelector('[name=buenas]').checked;
    elige(d, 'como', 'oido');
    res.sinMarcas = d.querySelector('[name=texto]').value;
    res.separarOculto = oculta(d.querySelector('[name=auto]').closest('label')) && oculta(d.querySelector('[name=sinalefa]').closest('label'));
    await wait(50);
    res.vistaOida = d.querySelector('[data-vista]')?.textContent;

    // 3) 🎧 escribe lo oído (ya escuchado al mezclar: no vuelve a escuchar); se corrige una palabra y se pone. La copia
    //    de «Baja» se corrige con ella.
    d.querySelector('[data-oir]').click();
    await wait(100);
    const area = d.querySelector('[name=texto]');
    res.oido = area.value;
    area.value = area.value.replace('gato', 'perro');
    area.dispatchEvent(new Event('input'));
    d.querySelector('button[value=ok]').click();
    await wait(300);
    res.corregida = letra(va);
    res.bajaCorregida = letra(vb);
    res.toastCorregida = document.querySelector('.toast')?.textContent;

    // 4) Sin lo oído en memoria (otra grabación): al pulsar «Poner la letra» se escucha antes de cerrar.
    s.audioTrack.name = 'Otra toma.wav';
    d = await dialogo();
    d.querySelector('button[value=quitar]').click();
    await wait(300);
    d = await dialogo();
    res.manera2 = d.querySelector('[name=como]')?.value;
    res.vacio = d.querySelector('[name=texto]').value;
    res.aviso = d.querySelector('[data-vista]')?.textContent;
    d.querySelector('button[value=ok]').click();
    for (let i = 0; i < 40 && document.querySelector('dialog[open] [name=texto]'); i++) await wait(50);
    await wait(200);
    res.escuchada = letra(va);
    res.toastEscuchada = document.querySelector('.toast')?.textContent;
  } finally {
    delete window.__vocesLetraOida;
  }

  res.ok =
    res.casillaSinMarcar &&
    res.mezclaAlta === esperada && res.mezclaBaja === esperada &&
    /letra puesta en «Alta» \(10 sílabas\) y en las voces que van a su ritmo/.test(res.toastMezcla ?? '') &&
    res.recordada && res.pista &&
    res.ambarMezcla === '7' && res.ambarMezclaBaja === '7' &&
    res.manera === 'orden' && res.otrasMarcada &&
    /^10 sílabas para 12 notas \(la última, sin letra\)\. 1 sigue en ámbar para revisar\./.test(res.vistaOrden ?? '') &&
    res.ambarPintadas === 1 && res.buenasVisible && res.buenasSinMarcar &&
    res.sinMarcas === 'Mi ga-to es-cu-cha la can-ción del mar' && res.separarOculto &&
    /^10 sílabas en 12 notas/.test(res.vistaOida ?? '') &&
    res.oido === 'Mi gato escucha la canción del mar' &&
    res.corregida === 'Mi pe- rro‿es- cu- cha la can- ción · del mar ·' && res.bajaCorregida === res.corregida &&
    /^Letra puesta donde se oye: 10 sílabas en «Alta» y en 10 notas de las otras voces/.test(res.toastCorregida ?? '') &&
    res.manera2 === 'oido' && res.vacio === '' && /escucha la grabación/.test(res.aviso ?? '') &&
    res.escuchada === esperada &&
    /^Letra puesta donde se oye: 10 sílabas en «Alta»/.test(res.toastEscuchada ?? '');
  return res;
}
