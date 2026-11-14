async () => {
  // Duplicar (⧉ en «Mis canciones») una canción con grabación: la copia lleva su propia grabación (se oye y se puede
  // escuchar) y lo ya oído en ella, así que «Letra» pone la letra donde se oye sin volver a escuchar. Lo que «oye»
  // Whisper es de mentira (window.__vocesLetraOida): no se descarga el modelo. La letra y la melodía son inventadas.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);

  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  const titulo = 'Para duplicar';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Baja</part-name></score-part></part-list>
    ${parte('P1', [67, 69, 71, 72, 74, 72, 71, 69, 67, 69, 71, 72])}${parte('P2', [60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65])}</score-partwise>`;
  const t = Array.from({ length: 13 }, (_, i) => 0.5 * i);
  const p = (texto, a, b) => ({ texto, a, b });
  const oido = () => [p('Mi', t[0] + 0.02, t[1] - 0.05), p('gato', t[1] + 0.03, t[2] + 0.15), p('escucha', t[2] + 0.2, t[5] - 0.05),
    p('la', t[5] + 0.02, t[6] - 0.05), p('canción', t[6] + 0.03, t[9] - 0.05), p('del', t[9] + 0.02, t[10] - 0.05), p('mar', t[10] + 0.03, t[12] - 0.1)];
  const letra = (v) => v?.notes.map((n) => (n.lyric ?? '·') + (n.lyricDoubt ? '?' : '')).join(' ');
  const aviso = () => document.querySelector('#toast')?.textContent;
  const espera = async (cond, ms = 3000) => {
    for (let i = 0; i < ms / 50 && !cond(); i++) await wait(50);
  };
  const dialogo = async () => {
    document.querySelector('#ed-lyrics').click();
    await espera(() => document.querySelector('dialog[open] [name=texto]'));
    return document.querySelector('dialog[open]');
  };
  const cierra = async (d) => {
    await espera(() => !d.isConnected);
    await wait(50);
  };

  const res = {};
  try {
    window.__vocesLetraOida = oido();
    const input = document.querySelector('#file');
    const dt = new DataTransfer();
    dt.items.add(new File([xml], `${titulo}.musicxml`, { type: 'application/xml' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await espera(() => V.song.title === titulo);
    const s = V.song;
    // La grabación (silencio de 8 s, con su 0 en el de la canción), guardada como la deja la mezcla.
    const { putTrack, encodeWav, trackIds } = await import('/src/audio/track.ts');
    await putTrack(s.id, encodeWav(new Float32Array(32000 * 8), 32000));
    s.audioTrack = { name: 'Ensayo jueves.wav', offset: 0, duration: 8, volume: 0.8, muted: false, solo: false };

    // 1) Se escucha en la original (🎧) y se cierra sin poner nada: lo oído queda en memoria.
    V.roll.activeVoiceId = s.voices[0].id;
    let d = await dialogo();
    d.querySelector('[data-oir]').click();
    await espera(() => /^Oídas/.test(d.querySelector('[data-oido]').textContent));
    res.oidoEnLaOriginal = d.querySelector('[data-oido]').textContent;
    d.querySelector('button[value=cancel]').click();
    await cierra(d);

    // Desde aquí, si algo volviera a escuchar, no oiría nada.
    window.__vocesLetraOida = [];

    // 2) Duplicar desde «Mis canciones» y abrir la copia.
    document.querySelector('#menu [data-act=library]').click();
    await espera(() => document.querySelector('#library-list .lib-item.current [data-a=copy]'));
    document.querySelector('#library-list .lib-item.current [data-a=copy]').click();
    await espera(() => /^Copia creada/.test(aviso() ?? ''));
    res.avisoCopia = aviso();
    const item = [...document.querySelectorAll('#library-list .lib-item')].find((x) => x.querySelector('b')?.textContent.includes(`${titulo} (copia)`));
    item.querySelector('.meta').click();
    await espera(() => V.song.title === `${titulo} (copia)`);
    const c = V.song;
    res.otroId = c.id !== s.id;
    res.grabacionGuardada = (await trackIds()).includes(c.id);
    await espera(() => document.querySelector('.voice.track .n')?.textContent === 'grabación');
    res.filaGrabacion = document.querySelector('.voice.track .n')?.textContent;

    // 3) «Letra» en la copia: donde se oye, con lo oído ya escrito, y se pone sin volver a escuchar.
    const va = c.voices.find((v) => v.name === 'Alta');
    V.roll.activeVoiceId = va.id;
    d = await dialogo();
    res.manera = d.querySelector('[name=como]')?.value;
    res.texto = d.querySelector('[name=texto]').value;
    res.vista = d.querySelector('[data-vista]').textContent;
    d.querySelector('button[value=ok]').click();
    await cierra(d);
    res.letra = letra(va);
    res.aviso = aviso();
  } finally {
    delete window.__vocesLetraOida;
    document.querySelectorAll('dialog[open]').forEach((x) => x.close());
  }

  res.ok =
    /^Oídas 7 palabras/.test(res.oidoEnLaOriginal) &&
    res.avisoCopia === `Copia creada: «${titulo} (copia)».` &&
    res.otroId && res.grabacionGuardada && res.filaGrabacion === 'grabación' &&
    res.manera === 'oido' && res.texto === 'Mi gato escucha la canción del mar' && /^10 sílabas en 12 notas/.test(res.vista) &&
    res.letra === 'Mi ga- to‿es- cu- cha la can- ción? · del mar ·' &&
    /^Letra puesta donde se oye: 10 sílabas en «Alta»/.test(res.aviso ?? '');
  return res;
}
