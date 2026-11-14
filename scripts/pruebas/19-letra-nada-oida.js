async () => {
  // «Donde se oye» cuando la app no oye letra en la grabación (un tarareo, o Whisper no entiende nada): si hay letra
  // escrita, se pone lo que enseña la vista (sin tiempos, en ámbar) en vez de cerrar y perder lo escrito. Sin letra
  // escrita, avisa como siempre. Lo «oído» es de mentira (window.__vocesLetraOida vacío): no se descarga el modelo. La
  // letra y la melodía son inventadas.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const dlgMod = await import('/src/editor/lyricsDialog.ts');
  let ultimo = '';
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  const titulo = 'Nada oído';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part></part-list>
    ${parte('P1', [67, 69, 71, 72, 74, 72, 71, 69, 67, 69, 71, 72])}</score-partwise>`;
  const letra = (v) => v?.notes.map((n) => (n.lyric ?? '·') + (n.lyricDoubt ? '?' : '')).join(' ');
  const espera = async (cond, ms = 3000) => {
    for (let i = 0; i < ms / 50 && !cond(); i++) await wait(50);
  };
  const res = {};
  try {
    window.__vocesLetraOida = [];
    const input = document.querySelector('#file');
    const dt = new DataTransfer();
    dt.items.add(new File([xml], `${titulo}.musicxml`, { type: 'application/xml' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    await espera(() => V.song.title === titulo);
    const s = V.song;
    const [va] = s.voices;
    V.roll.activeVoiceId = va.id;
    // La grabación (silencio) guardada en el dispositivo: así el diálogo ofrece «donde se oye».
    const { putTrack, encodeWav } = await import('/src/audio/track.ts');
    await putTrack(s.id, encodeWav(new Float32Array(32000 * 8), 32000));
    s.audioTrack = { name: 'Tarareo.wav', offset: 0, duration: 8, volume: 0.8, muted: false, solo: false };

    // 1) Con letra escrita: el primer «Poner la letra» escucha (no oye nada) y deja el diálogo abierto con la vista; el
    //    segundo pone la letra escrita.
    const p = dlgMod.openLyrics({ song: () => V.song, voice: () => V.roll.activeVoice, time: () => 0, edit: (fn) => fn(), toast: (x) => (ultimo = x) });
    await espera(() => document.querySelector('dialog[open] [name=texto]'));
    const d = document.querySelector('dialog[open]');
    res.manera = d.querySelector('[name=como]')?.value;
    const area = d.querySelector('[name=texto]');
    area.value = 'Mi gato escucha la canción del mar';
    area.dispatchEvent(new Event('input'));
    d.querySelector('button[value=ok]').click();
    await espera(() => /sílabas en 12 notas/.test(d.querySelector('[data-vista]')?.textContent ?? ''));
    res.vista = d.querySelector('[data-vista]')?.textContent;
    d.querySelector('button[value=ok]').click();
    await p;
    res.aviso = ultimo;
    res.letra = letra(va);

    // 2) Sin letra escrita y sin nada oído: el aviso de siempre, y no se pone nada.
    va.notes.forEach((n) => {
      delete n.lyric;
      delete n.lyricDoubt;
    });
    const p2 = dlgMod.openLyrics({ song: () => V.song, voice: () => V.roll.activeVoice, time: () => 0, edit: (fn) => fn(), toast: (x) => (ultimo = x) });
    await espera(() => document.querySelector('dialog[open] [name=texto]'));
    document.querySelector('dialog[open] button[value=ok]').click();
    await p2;
    res.avisoVacio = ultimo;
    res.letraVacia = letra(va);
  } finally {
    delete window.__vocesLetraOida;
  }
  const puestas = (res.letra ?? '').split(' ').filter((x) => x !== '·').length;
  res.ok =
    res.manera === 'oido' &&
    /^11 sílabas en 12 notas/.test(res.vista ?? '') &&
    /^Letra puesta donde se oye: 11 sílabas/.test(res.aviso ?? '') &&
    puestas === 11 &&
    /No se ha oído letra/.test(res.avisoVacio ?? '') &&
    res.letraVacia === '· · · · · · · · · · · ·';
  return res;
}
