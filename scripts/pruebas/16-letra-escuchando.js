async () => {
  // El diálogo «Letra» mientras escucha la grabación (aquí escuchar «tarda»: se retrasa la decodificación del audio, que
  // es lo primero que hace). No se puede tocar nada salvo «Cancelar»; si algo cambia, no se cierra solo; «Cancelar»
  // deja de escuchar de verdad (no se queda nada oído) y se puede volver a escuchar. Lo que «oye» Whisper es de mentira
  // (window.__vocesLetraOida): no se descarga el modelo. La letra y la melodía son inventadas.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const LENTO = 1200;

  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  const titulo = 'Letra mientras escucha';
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
  const cierra = async (d, ms = 3000) => {
    await espera(() => !d.isConnected, ms);
    await wait(50);
  };
  const elige = (d, nombre, valor) => {
    const el = d.querySelector(`[name=${nombre}]`);
    el.value = valor;
    el.dispatchEvent(new Event('change'));
  };
  // Qué se puede tocar ahora mismo en el diálogo.
  const controles = (d) => {
    const q = (s) => d.querySelector(s);
    return {
      cuadroSoloLectura: q('[name=texto]').readOnly,
      desactivados: ['desde', 'como', 'auto', 'sinalefa', 'otras', 'buenas'].filter((n) => q(`[name=${n}]`)?.disabled).join(','),
      botonesDesactivados: [...d.querySelectorAll('form button')].filter((b) => b.disabled).map((b) => ('oir' in b.dataset ? '🎧' : b.value)).join(','),
    };
  };
  const nada = { cuadroSoloLectura: false, desactivados: '', botonesDesactivados: '' };
  const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const orig = OfflineAudioContext.prototype.decodeAudioData;
  OfflineAudioContext.prototype.decodeAudioData = function (...a) {
    return new Promise((r) => setTimeout(r, LENTO)).then(() => orig.apply(this, a));
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
    const [va, vb] = s.voices;
    V.roll.activeVoiceId = va.id;
    const { putTrack, encodeWav } = await import('/src/audio/track.ts');
    await putTrack(s.id, encodeWav(new Float32Array(32000 * 8), 32000));
    s.audioTrack = { name: 'Ensayo jueves.wav', offset: 0, duration: 8, volume: 0.8, muted: false, solo: false };

    // 1) «Poner la letra» donde se oye, sin haber escuchado: mientras escucha, todo quieto salvo «Cancelar». Si aun así
    //    algo cambia (aquí, la manera), al acabar no se cierra solo: se avisa y se devuelve todo.
    let d = await dialogo();
    res.manera = d.querySelector('[name=como]').value;
    d.querySelector('button[value=ok]').click();
    await wait(250);
    res.mientras = controles(d);
    res.estadoMientras = d.querySelector('[data-oido]').textContent;
    elige(d, 'como', 'orden');
    await wait(LENTO + 600);
    res.sigueAbierto = d.isConnected && d.open;
    res.estadoDespues = d.querySelector('[data-oido]').textContent;
    res.despues = controles(d);
    res.sinPoner = letra(va);
    // Lo oído ya está: de vuelta a «donde se oye», «Poner la letra» la pone sin volver a escuchar.
    elige(d, 'como', 'oido');
    d.querySelector('button[value=ok]').click();
    await cierra(d, 500);
    res.puesta = letra(va);
    res.avisoPuesta = aviso();

    // 2) Otra grabación (sin escuchar) y la voz sin letra: «Poner la letra» y, mientras escucha, «Cancelar». Se deja de
    //    escuchar (aviso), y pasado lo que habría tardado no hay nada oído: hay que volver a escuchar, y se puede.
    d = await dialogo();
    d.querySelector('button[value=quitar]').click();
    await cierra(d);
    s.audioTrack.name = 'Otra toma.wav';
    d = await dialogo();
    d.querySelector('button[value=ok]').click();
    await wait(250);
    res.cancelarActivo = !d.querySelector('button[value=cancel]').disabled;
    d.querySelector('button[value=cancel]').click();
    await cierra(d);
    res.avisoCancelar = aviso();
    await wait(LENTO + 400);
    d = await dialogo();
    res.vistaTrasCancelar = d.querySelector('[data-vista]').textContent;
    d.querySelector('button[value=ok]').click();
    await cierra(d, LENTO + 3000);
    res.trasVolver = letra(va);
    res.avisoVolver = aviso();

    // 3) 🎧 mientras escucha: también quieto; al acabar escribe lo oído y se devuelve todo.
    s.audioTrack.name = 'Tercera toma.wav';
    V.roll.activeVoiceId = vb.id;
    d = await dialogo();
    d.querySelector('[data-oir]').click();
    await wait(250);
    res.oirMientras = controles(d);
    await wait(LENTO + 600);
    res.oirDespues = controles(d);
    res.oirTexto = d.querySelector('[name=texto]').value;
    d.querySelector('button[value=cancel]').click();
    await cierra(d);
  } finally {
    OfflineAudioContext.prototype.decodeAudioData = orig;
    delete window.__vocesLetraOida;
  }

  const oida = 'Mi ga- to‿es- cu- cha la can- ción? · del mar ·';
  const quieto = { cuadroSoloLectura: true, desactivados: 'desde,como,auto,sinalefa,otras,buenas', botonesDesactivados: '🎧,quitar,ok' };
  res.ok =
    res.manera === 'oido' &&
    igual(res.mientras, quieto) && /^Preparando la grabación/.test(res.estadoMientras) &&
    res.sigueAbierto && res.estadoDespues === 'Ya está escuchada: revisa y pulsa «Poner la letra».' && igual(res.despues, nada) &&
    res.sinPoner === '· · · · · · · · · · · ·' &&
    res.puesta === oida && /^Letra puesta donde se oye: 10 sílabas en «Alta»/.test(res.avisoPuesta ?? '') &&
    res.cancelarActivo && res.avisoCancelar === 'Escucha parada.' &&
    /^Al pulsar «Poner la letra», la app escucha la grabación/.test(res.vistaTrasCancelar) &&
    res.trasVolver === oida && /^Letra puesta donde se oye: 10 sílabas en «Alta»/.test(res.avisoVolver ?? '') &&
    igual(res.oirMientras, quieto) && igual(res.oirDespues, nada) && res.oirTexto === 'Mi gato escucha la canción del mar';
  return res;
}
