async () => {
  // «Quitar la letra» y las otras voces, y la casilla «Letra» del panel de voces. Con la casilla «La misma sílaba en las
  // voces que van al mismo ritmo», quitar la letra de la melodía quita también las copias de las voces que van a su
  // ritmo (la letra propia de una voz, no): ni el karaoke ni el MIDI siguen con la letra quitada, y la que se pone
  // después se vuelve a copiar. Sin la casilla, solo se quita la de esa voz. La casilla «Letra» del panel la muestra o
  // la oculta sin borrarla, y la ayuda dice dónde está. La letra y la melodía son inventadas.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);

  // Partitura: tres voces al mismo ritmo, 12 negras a 120 BPM (medio segundo cada una, desde el segundo 0).
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  const titulo = 'Quitar la letra';
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Media</part-name></score-part><score-part id="P3"><part-name>Baja</part-name></score-part></part-list>
    ${parte('P1', [67, 69, 71, 72, 74, 72, 71, 69, 67, 69, 71, 72])}${parte('P2', [64, 65, 67, 69, 71, 69, 67, 65, 64, 65, 67, 69])}${parte('P3', [60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65])}</score-partwise>`;

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
  const escribe = (d, texto) => {
    const area = d.querySelector('[name=texto]');
    area.value = texto;
    area.dispatchEvent(new Event('input'));
  };
  // El diálogo se quita al cerrarse; lo que se pone (o se quita) va justo después.
  const pulsa = async (d, valor) => {
    d.querySelector(`button[value=${valor}]`).click();
    await espera(() => !d.isConnected);
    await wait(50);
  };
  const otras = (d) => d.querySelector('[name=otras]');
  // Deshacer cambia los objetos de las voces: se buscan cada vez.
  const voz = (nombre) => V.song.voices.find((v) => v.name === nombre);
  const voces = () => ['Alta', 'Media', 'Baja'].map((n) => letra(voz(n)));
  const { lyricsVoice } = await import('/src/model.ts');
  const { songToMidi } = await import('/src/export.ts');
  const { parseMidi } = await import('/src/import/midi.ts');
  /** La voz del karaoke, y la letra que guarda el MIDI (null si no hay). */
  const karaoke = () => lyricsVoice(V.song)?.name ?? null;
  const midi = () => letra(parseMidi(songToMidi(V.song).slice().buffer, 'x').voices.find((v) => v.notes.some((n) => n.lyric))) ?? null;

  const res = {};
  const input = document.querySelector('#file');
  const dt = new DataTransfer();
  dt.items.add(new File([xml], `${titulo}.musicxml`, { type: 'application/xml' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  await espera(() => V.song.title === titulo);
  V.roll.activeVoiceId = voz('Alta').id;

  // 1) La letra en «Alta». Las otras no tienen: la casilla viene marcada y las dos llevan la copia.
  let d = await dialogo();
  res.otras1 = otras(d).checked;
  escribe(d, 'Mi gato escucha la canción del mar');
  await pulsa(d, 'ok');
  res.voces1 = voces();

  // 2) «Quitar la letra»: la casilla viene marcada (lo que tienen las otras es copia) y dice que vale también al quitar,
  //    así que se van también las copias, y el aviso lo dice. Ni el karaoke ni el MIDI se quedan con la letra quitada.
  d = await dialogo();
  res.otras2 = otras(d).checked;
  res.etiqueta = otras(d).closest('label')?.textContent.trim();
  await pulsa(d, 'quitar');
  res.aviso2 = aviso();
  res.voces2 = voces();
  res.karaoke2 = karaoke();
  res.midi2 = midi();

  // 3) Otra letra: la casilla vuelve a venir marcada y la nueva llega a las otras voces (no se toma por suya).
  d = await dialogo();
  res.otras3 = otras(d).checked;
  escribe(d, 'Tu perro duerme junto al fuego hoy');
  await pulsa(d, 'ok');
  res.aviso3 = aviso();
  res.voces3 = voces();
  res.karaoke3 = karaoke();
  res.midi3 = midi();

  // 4) Sin la casilla, solo se quita la de «Alta»: las otras se quedan con su copia. Y se deshace.
  d = await dialogo();
  otras(d).checked = false;
  await pulsa(d, 'quitar');
  res.aviso4 = aviso();
  res.voces4 = voces();
  document.querySelector('#ed-undo').click();
  await wait(200);
  res.deshecho4 = voces();

  // 5) «Media» canta su propia letra. Desde la nota del cabezal (la 7.ª, segundo 3.0) y con la casilla (viene sin
  //    marcar, porque «Media» canta otra cosa): «Alta» y la copia de «Baja» pierden la letra desde ahí; lo de antes y la
  //    letra de «Media», no.
  const propia = ['Uh', 'uh', 'uh', 'uh', 'Ah', 'ah', 'ah', 'ah', 'Oh', 'oh', 'oh', 'oh'];
  voz('Media').notes.forEach((n, i) => (n.lyric = propia[i]));
  V.engine.seek(voz('Alta').notes[6].start + 0.1);
  await wait(100);
  d = await dialogo();
  res.otras5 = otras(d).checked;
  const desde = d.querySelector('[name=desde]');
  desde.value = 'cabezal';
  desde.dispatchEvent(new Event('change'));
  otras(d).checked = true;
  await pulsa(d, 'quitar');
  V.engine.seek(0);
  res.aviso5 = aviso();
  res.voces5 = voces();

  // 6) La casilla «Letra» está en el panel de voces (el botón «Panel de voces»): la muestra o la oculta, sin borrarla,
  //    y se recuerda en el dispositivo. La ayuda la sitúa ahí (no en unos «ajustes» que no hay) y cuenta lo de quitar.
  const casilla = document.querySelector('#opt-lyrics');
  res.enElPanel = casilla.closest('aside')?.id === 'panel' && document.querySelector('#btn-voices')?.getAttribute('aria-label') === 'Panel de voces';
  casilla.checked = false;
  casilla.dispatchEvent(new Event('change'));
  res.oculta = { viz: V.viz.opts.showLyrics, editor: V.roll.showLyrics, recordada: localStorage.getItem('voces.letra'), sigue: voces().join(' | ') === res.voces5.join(' | ') };
  casilla.checked = true;
  casilla.dispatchEvent(new Event('change'));
  res.muestra = { viz: V.viz.opts.showLyrics, editor: V.roll.showLyrics, recordada: localStorage.getItem('voces.letra') };
  const ayuda = document.querySelector('#dlg-help .help').textContent.replace(/\s+/g, ' ');
  res.ayudaCasilla = /casilla Letra del panel de voces la muestra o la oculta \(no la borra\)/i.test(ayuda);
  res.ayudaSinAjustes = !/ajustes/i.test(ayuda);
  res.ayudaQuitar = /Quitar la letra la quita también de ellas/.test(ayuda);

  const nada = '· · · · · · · · · · · ·';
  const mi = 'Mi ga- to‿es- cu- cha la can- ción del mar · ·';
  const tu = 'Tu pe- rro duer- me jun- to‿al fue- go‿hoy · · ·';
  const hastaEl3 = 'Tu pe- rro duer- me jun- · · · · · ·';
  const igual = (xs, ys) => xs.join(' | ') === ys.join(' | ');
  res.ok =
    res.otras1 && igual(res.voces1, [mi, mi, mi]) &&
    res.otras2 && /, también al quitarla \(/.test(res.etiqueta ?? '') && res.aviso2 === 'Letra quitada de «Alta» y de 20 notas de las otras voces.' &&
    igual(res.voces2, [nada, nada, nada]) && res.karaoke2 === null && res.midi2 === null &&
    res.otras3 && res.aviso3 === 'Letra puesta: 9 sílabas en «Alta» y en 18 notas de las otras voces; 3 notas se quedan sin letra.' &&
    igual(res.voces3, [tu, tu, tu]) && res.karaoke3 === 'Alta' && res.midi3 === tu &&
    res.aviso4 === 'Letra quitada de «Alta».' && igual(res.voces4, [nada, tu, tu]) && igual(res.deshecho4, [tu, tu, tu]) &&
    !res.otras5 && res.aviso5 === 'Letra quitada de «Alta» y de 3 notas de las otras voces desde el segundo 3.0.' &&
    igual(res.voces5, [hastaEl3, propia.join(' '), hastaEl3]) &&
    res.enElPanel &&
    !res.oculta.viz && !res.oculta.editor && res.oculta.recordada === 'no' && res.oculta.sigue &&
    res.muestra.viz && res.muestra.editor && res.muestra.recordada === 'si' &&
    res.ayudaCasilla && res.ayudaSinAjustes && res.ayudaQuitar;
  return res;
}
