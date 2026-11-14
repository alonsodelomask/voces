async () => {
  // El diálogo «Letra» por dentro: Intro es siempre «Poner la letra» (también en el del acorde), singular y plural, el
  // ámbar que se queda al ponerla en orden y la casilla para darlo por bueno, 🎧 no pisa lo escrito, un solo diálogo
  // aunque se toque dos veces, la grabación que no está en este dispositivo y la canción que cambia con el diálogo
  // abierto. Lo que «oye» Whisper es de mentira (window.__vocesLetraOida): no se descarga el modelo. La letra y la
  // melodía son inventadas.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);

  // Partitura: dos voces al mismo ritmo, 12 negras a 120 BPM (medio segundo cada una, desde el segundo 0).
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  const titulo = 'Letra del diálogo';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Baja</part-name></score-part></part-list>
    ${parte('P1', [67, 69, 71, 72, 74, 72, 71, 69, 67, 69, 71, 72])}${parte('P2', [60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65])}</score-partwise>`;
  // Lo que «oye» Whisper, en segundos de la canción: «Mi gato escucha la canción del mar».
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
  const elige = (d, nombre, valor) => {
    const el = d.querySelector(`[name=${nombre}]`);
    el.value = valor;
    el.dispatchEvent(new Event('change'));
  };
  const escribe = (d, texto) => {
    const area = d.querySelector('[name=texto]');
    area.value = texto;
    area.dispatchEvent(new Event('input'));
  };
  const vista = (d) => d.querySelector('[data-vista]').textContent;
  const oculta = (el) => !!el && getComputedStyle(el).display === 'none';
  // El diálogo se quita al cerrarse; lo que se pone va justo después.
  const cierra = async (d) => {
    await espera(() => !d.isConnected);
    await wait(50);
  };
  const cancela = async (d) => {
    d.querySelector('button[value=cancel]').click();
    await cierra(d);
  };
  const acepta = async (d) => {
    d.querySelector('button[value=ok]').click();
    await cierra(d);
  };
  // Lo que hace Intro en un formulario: pulsa su primer botón de envío, el «botón por defecto».
  const porDefecto = (d) => [...d.querySelector('form').elements].find((e) => e.type === 'submit');

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

    // 1) Intro: el único botón de envío es «Poner la letra». Con la casilla de las otras voces enfocada, Intro pone la
    //    letra (antes pulsaba «Quitar la letra»). «Cancelar» cierra sin tocar nada.
    let d = await dialogo();
    res.botonesDeEnvio = [...d.querySelectorAll('form button')].filter((b) => b.type === 'submit').map((b) => b.textContent).join(' | ');
    escribe(d, 'Mi ga-to es-cu-cha la can-ción del mar');
    d.querySelector('[name=otras]').focus();
    porDefecto(d).click();
    await cierra(d);
    res.intro = letra(va);
    res.introBaja = letra(vb);
    res.avisoIntro = aviso();
    d = await dialogo();
    escribe(d, 'Otra cosa');
    await cancela(d);
    res.cancelarNoToca = letra(va) === res.intro;

    // 2) El acorde: Intro en «Cifrado» guarda el nuevo (antes pulsaba «Eliminar»).
    s.chordsAuto = false;
    s.chords = [{ time: 0, name: 'C' }, { time: 2, name: 'G' }];
    V.roll.onChordClick(2, 1);
    await espera(() => document.querySelector('dialog[open] [name=name]'));
    d = document.querySelector('dialog[open]');
    res.acordeDefecto = porDefecto(d)?.textContent;
    d.querySelector('[name=name]').value = 'G7';
    porDefecto(d).click();
    await wait(200);
    res.acordes = V.song.chords.map((c) => c.name).join(' ');

    // 3) Singular y plural en la vista y en el aviso.
    d = await dialogo();
    escribe(d, '');
    escribe(d, 'Mi ga-to es-cu-cha la can-ción del mar con pan sol');
    res.vista13 = vista(d);
    escribe(d, 'Sol');
    res.vista1 = vista(d);
    escribe(d, 'Mi ga-to es-cu-cha la can-ción del mar sol');
    res.vista11 = vista(d);
    await acepta(d);
    res.aviso11 = aviso();
    d = await dialogo();
    escribe(d, '');
    escribe(d, 'Mi ga-to es-cu-cha la can-ción del mar con pan sol');
    await acepta(d);
    res.aviso13 = aviso();

    // 4) El ámbar. Donde se oye, «ción» queda en ámbar en «Alta» y en su copia de «Baja». Al volver a abrir (en orden),
    //    la vista lo dice y lo pinta, y se ve la casilla para darlo por bueno (no desde una nota posterior). Aceptar sin
    //    tocar nada no lo quita; con la casilla, sí (también en la copia).
    const { putTrack, encodeWav } = await import('/src/audio/track.ts');
    await putTrack(s.id, encodeWav(new Float32Array(32000 * 8), 32000));
    s.audioTrack = { name: 'Ensayo jueves.wav', offset: 0, duration: 8, volume: 0.8, muted: false, solo: false };
    d = await dialogo();
    elige(d, 'como', 'oido');
    escribe(d, '');
    await acepta(d);
    res.oida = letra(va);
    res.oidaBaja = letra(vb);
    d = await dialogo();
    res.ambarManera = d.querySelector('[name=como]').value;
    res.ambarVista = vista(d);
    res.ambarPintadas = d.querySelectorAll('[data-vista] .ambar').length;
    res.buenasVisible = !oculta(d.querySelector('[name=buenas]').closest('label'));
    await acepta(d);
    res.sinTocar = letra(va);
    res.sinTocarBaja = letra(vb);
    res.avisoSinTocar = aviso();
    V.engine.seek(va.notes[9].start + 0.1);
    await wait(50);
    d = await dialogo();
    elige(d, 'desde', 'cabezal');
    res.buenasDesdeLa9 = !oculta(d.querySelector('[name=buenas]').closest('label'));
    elige(d, 'desde', 'inicio');
    res.buenasDesdeLa0 = !oculta(d.querySelector('[name=buenas]').closest('label'));
    const buenas = d.querySelector('[name=buenas]');
    buenas.checked = true;
    buenas.dispatchEvent(new Event('change'));
    res.buenasVista = vista(d);
    res.buenasPintadas = d.querySelectorAll('[data-vista] .ambar').length;
    await acepta(d);
    V.engine.seek(0);
    res.buenas = letra(va);
    res.buenasBaja = letra(vb);
    res.avisoBuenas = aviso();

    // 4b) «Baja» canta otra sílaba en una nota: al corregir «Alta» con las otras voces, sus copias cambian y esa no (el
    //     aviso la cuenta).
    vb.notes[4].lyric = 'ah';
    d = await dialogo();
    escribe(d, '');
    escribe(d, 'Mi pe-rro es-cu-cha la can-ción del mar');
    d.querySelector('[name=otras]').checked = true;
    await acepta(d);
    res.distintaAlta = letra(va);
    res.distintaBaja = letra(vb);
    res.avisoDistinta = aviso();

    // 5) 🎧 no pisa lo que ha escrito la persona: avisa, y un segundo toque lo cambia por lo oído.
    d = await dialogo();
    escribe(d, 'Esto lo he escrito yo');
    d.querySelector('[data-oir]').click();
    await wait(200);
    res.oir1 = { texto: d.querySelector('[name=texto]').value, estado: d.querySelector('[data-oido]').textContent };
    d.querySelector('[data-oir]').click();
    await wait(200);
    res.oir2 = { texto: d.querySelector('[name=texto]').value, manera: d.querySelector('[name=como]').value };
    await cancela(d);

    // 6) Dos toques seguidos en «Letra»: un solo diálogo.
    document.querySelector('#ed-lyrics').click();
    document.querySelector('#ed-lyrics').click();
    await espera(() => document.querySelector('dialog[open] [name=texto]'));
    await wait(300);
    res.dialogosAbiertos = document.querySelectorAll('dialog[open]').length;
    const abiertos = [...document.querySelectorAll('dialog[open]')];
    abiertos.forEach((x) => x.querySelector('button[value=cancel]')?.click());
    for (const x of abiertos) await cierra(x);

    // 7) La grabación no está en este dispositivo. Con lo oído en memoria, se puede seguir poniendo donde se oye; con
    //    otra grabación sin escuchar, se abre en orden, sin 🎧, y se dice por qué.
    const { delTrack } = await import('/src/audio/track.ts');
    await delTrack(s.id);
    d = await dialogo();
    res.sinAudioConOido = { auricular: !!d.querySelector('[data-oir]'), maneras: [...(d.querySelector('[name=como]')?.options ?? [])].map((o) => o.value).join(',') };
    await cancela(d);
    s.audioTrack.name = 'Otra toma.wav';
    d = await dialogo();
    res.sinAudio = {
      como: !!d.querySelector('[name=como]'),
      auricular: !!d.querySelector('[data-oir]'),
      porQue: d.querySelector('[data-sin-grabacion]')?.textContent ?? null,
    };
    await cancela(d);

    // 8) La canción cambia con el diálogo abierto (la guarda alguien del grupo): lo escrito no va a ninguna de las dos.
    const antes = letra(va);
    d = await dialogo();
    escribe(d, '');
    escribe(d, 'U-na le-tra nue-va');
    const remota = JSON.parse(JSON.stringify(s));
    remota.voices.forEach((v) => v.notes.forEach((n) => {
      delete n.lyric;
      delete n.lyricDoubt;
    }));
    await V.openFile(new File([JSON.stringify(remota)], `${titulo}.voces.json`, { type: 'application/json' }));
    res.otraCancion = V.song !== s;
    await acepta(d);
    res.avisoCambio = aviso();
    res.viejaIntacta = letra(va) === antes;
    res.nueva = letra(V.song.voices[0]);
  } finally {
    delete window.__vocesLetraOida;
  }

  const puesta = 'Mi ga- to‿es- cu- cha la can- ción del mar · ·';
  const oida = 'Mi ga- to‿es- cu- cha la can- ción? · del mar ·';
  const sinAmbar = 'Mi ga- to‿es- cu- cha la can- ción · del mar ·';
  res.ok =
    res.botonesDeEnvio === 'Poner la letra' &&
    res.intro === puesta && res.introBaja === puesta &&
    /^Letra puesta: 10 sílabas en «Alta» y en 10 notas de las otras voces; 2 notas se quedan sin letra\.$/.test(res.avisoIntro ?? '') &&
    res.cancelarNoToca &&
    res.acordeDefecto === 'Guardar' && res.acordes === 'C G7' &&
    /^13 sílabas para 12 notas: sobra 1\./.test(res.vista13 ?? '') &&
    /^1 sílaba para 12 notas \(las 11 últimas, sin letra\)\./.test(res.vista1 ?? '') &&
    /^11 sílabas para 12 notas \(la última, sin letra\)\./.test(res.vista11 ?? '') &&
    /^Letra puesta: 11 sílabas en «Alta» y en 11 notas de las otras voces; 1 nota se queda sin letra\.$/.test(res.aviso11 ?? '') &&
    /; sobra 1 \(no hay más notas\)\.$/.test(res.aviso13 ?? '') &&
    res.oida === oida && res.oidaBaja === oida &&
    res.ambarManera === 'orden' && /\. 1 sigue en ámbar para revisar\./.test(res.ambarVista ?? '') && res.ambarPintadas === 1 && res.buenasVisible &&
    res.sinTocar === oida && res.sinTocarBaja === oida && /; 1 nota sigue en ámbar para revisar/.test(res.avisoSinTocar ?? '') &&
    !res.buenasDesdeLa9 && res.buenasDesdeLa0 &&
    /\. 1 en ámbar se da por buena\./.test(res.buenasVista ?? '') && res.buenasPintadas === 0 &&
    res.buenas === sinAmbar && res.buenasBaja === sinAmbar && /; 1 nota en ámbar dada por buena/.test(res.avisoBuenas ?? '') &&
    res.distintaAlta === 'Mi pe- rro‿es- cu- cha la can- ción del mar · ·' &&
    res.distintaBaja === 'Mi pe- rro‿es- cu- ah la can- ción del mar · ·' &&
    /^Letra puesta: 10 sílabas en «Alta» y en 9 notas de las otras voces; 1 nota de las otras voces tiene otra sílaba y se queda como estaba; 2 notas se quedan sin letra\.$/.test(res.avisoDistinta ?? '') &&
    res.oir1.texto === 'Esto lo he escrito yo' && /^No se ha cambiado lo que has escrito/.test(res.oir1.estado) &&
    res.oir2.texto === 'Mi gato escucha la canción del mar' && res.oir2.manera === 'oido' &&
    res.dialogosAbiertos === 1 &&
    res.sinAudioConOido.auricular && res.sinAudioConOido.maneras === 'oido,orden' &&
    !res.sinAudio.como && !res.sinAudio.auricular && /no está guardada en este dispositivo/.test(res.sinAudio.porQue ?? '') &&
    res.otraCancion && res.avisoCambio === 'La canción ha cambiado mientras tanto: vuelve a poner la letra.' &&
    res.viejaIntacta && res.nueva === '· · · · · · · · · · · ·';
  return res;
}
