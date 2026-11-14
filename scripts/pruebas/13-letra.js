async () => {
  // La letra: partituras que la traen (estrofa de cada vuelta, sílabas unidas, melismas, acordes en una voz), el
  // diálogo «Letra» del editor (letra nueva, corregir sin que se mueva nada, desde el cabezal, otras voces, quitar,
  // deshacer) y el MIDI (se guarda y se vuelve a leer).
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const ly = (n, txt, syl) => `<lyric number="${n}"><syllabic>${syl}</syllabic><text>${txt}</text></lyric>`;
  const extend = (n) => `<lyric number="${n}"><extend/></lyric>`;
  const nota = (m, letras = '', acorde = false) => `<note>${acorde ? '<chord/>' : ''}${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type>${letras}</note>`;
  const attrs = '<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>';
  const rep = (cuerpo) => `<barline location="left"><repeat direction="forward"/></barline>${cuerpo}<barline location="right"><repeat direction="backward" times="2"/></barline>`;
  const partitura = (titulo, partes) => `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
    <part-list>${partes.map((p, i) => `<score-part id="P${i + 1}"><part-name>${p.nombre}</part-name></score-part>`).join('')}</part-list>
    ${partes.map((p, i) => `<part id="P${i + 1}">${p.compases.map((c, k) => `<measure number="${k + 1}">${k === 0 ? attrs + (i === 0 ? '<sound tempo="100"/>' : '') : ''}${c}</measure>`).join('')}</part>`).join('')}</score-partwise>`;
  const abrir = async (xml, titulo) => {
    const input = document.querySelector('#file');
    const dt = new DataTransfer();
    dt.items.add(new File([xml], `${titulo}.musicxml`, { type: 'application/xml' }));
    input.files = dt.files;
    input.dispatchEvent(new Event('change'));
    for (let i = 0; i < 60 && V.song.title !== titulo; i++) await wait(100);
    return V.song;
  };
  const letra = (v) => v?.notes.map((n) => n.lyric ?? '·').join(' ');
  const res = {};

  // 1) Partitura con letra: compás 1 con repetición (estrofa 1 «La no-che es», estrofa 2 «Tu vo-z es»); compás 2 con
  //    «se‿a» (elisión), una nota que alarga la sílaba y «bar-ca»; compás 3, dos notas sin letra. La contralto, al
  //    mismo ritmo y sin letra.
  const c1 = (con) => nota(72, con ? ly(1, 'La', 'single') + ly(2, 'Tu', 'single') : '') + nota(74, con ? ly(1, 'no', 'begin') + ly(2, 'vo', 'begin') : '') +
    nota(76, con ? ly(1, 'che', 'end') + ly(2, 'z', 'end') : '') + nota(77, con ? ly(1, 'es', 'single') + ly(2, 'es', 'single') : '');
  const c2 = (con) => nota(79, con ? '<lyric number="1"><syllabic>single</syllabic><text>se</text><elision>‿</elision><syllabic>single</syllabic><text>a</text></lyric>' : '') +
    nota(77, con ? extend(1) : '') + nota(76, con ? ly(1, 'bar', 'begin') : '') + nota(74, con ? ly(1, 'ca', 'end') : '');
  const c3 = () => nota(72) + nota(72) + '<note><rest/><duration>2</duration><voice>1</voice></note>';
  const baja = (s) => s.replace(/<octave>5<\/octave>/g, '<octave>4</octave>');
  const s = await abrir(partitura('Letra de prueba', [
    { nombre: 'Soprano', compases: [rep(c1(true)), c2(true), c3()] },
    { nombre: 'Contralto', compases: [rep(baja(c1(false))), baja(c2(false)), baja(c3())] },
  ]), 'Letra de prueba');
  const sop = s.voices.find((v) => v.name === 'Soprano');
  const alto = s.voices.find((v) => v.name === 'Contralto');
  res.letraPartitura = letra(sop);
  const esperada = 'La no- che es Tu vo- z es se‿a · bar- ca · ·';

  // 2) Letra nueva con el diálogo: se borra la que había (vuelve a separar sola) y se escribe otra.
  const dialogo = async () => {
    document.querySelector('#ed-lyrics').click();
    for (let i = 0; i < 40 && !document.querySelector('dialog[open] [name=texto]'); i++) await wait(50);
    return document.querySelector('dialog[open]');
  };
  const escribe = (d, texto) => {
    const area = d.querySelector('[name=texto]');
    area.value = texto;
    area.dispatchEvent(new Event('input'));
  };
  V.roll.activeVoiceId = sop.id;
  let d = await dialogo();
  res.dialogo = d?.querySelector('h2')?.textContent;
  res.prerrelleno = d.querySelector('[name=texto]').value;
  res.corrigeSinPartir = !d.querySelector('[name=auto]').checked && !d.querySelector('[name=sinalefa]').checked;
  escribe(d, '');
  escribe(d, 'Asómate a la calle, por favor');
  res.vista = d.querySelector('[data-vista]')?.textContent;
  d.querySelector('button[value=ok]').click();
  await wait(300);
  res.soprano = letra(sop);
  res.contralto = letra(alto);
  res.toast = document.querySelector('.toast')?.textContent;
  const puesta = 'A- só- ma- te‿a la ca- lle, por fa- vor · · · ·';

  // 3) Abrir y aceptar sin tocar nada no mueve ninguna sílaba.
  d = await dialogo();
  d.querySelector('button[value=ok]').click();
  await wait(300);
  res.idaYVuelta = letra(sop) === puesta;

  // 4) MIDI: la letra se guarda y, al volver a abrirlo, cae en las mismas notas.
  const { songToMidi } = await import('/src/export.ts');
  const { parseMidi } = await import('/src/import/midi.ts');
  const deVuelta = parseMidi(songToMidi(V.song).slice().buffer, 'x');
  res.midi = letra(deVuelta.voices.find((v) => v.notes.some((n) => n.lyric)));

  // 5) Desde el cabezal, parado a mitad de la 6.ª nota: empieza en esa nota, no en la siguiente. La contralto lleva
  //    la copia de la soprano, así que la casilla de las otras voces viene marcada y se corrige con ella.
  V.engine.seek(sop.notes[5].start + 0.1);
  await wait(100);
  d = await dialogo();
  const desde = d.querySelector('[name=desde]');
  desde.value = 'cabezal';
  desde.dispatchEvent(new Event('change'));
  res.rellenoCabezal = d.querySelector('[name=texto]').value;
  res.otrasMarcada = d.querySelector('[name=otras]').checked;
  escribe(d, 'Uno dos');
  d.querySelector('button[value=ok]').click();
  await wait(300);
  res.cabezal = letra(sop);
  res.contraltoCorregida = letra(alto) === res.cabezal;

  // 6) «Quitar la letra»: la casilla de las otras voces viene marcada (la contralto lleva la copia), así que se va
  //    también la copia, y el aviso lo dice. Se puede deshacer (vuelven las dos). Sin la casilla, solo se quita la de
  //    esta voz: la contralto se queda con su copia.
  const voz = (nombre) => V.song.voices.find((v) => v.name === nombre);
  d = await dialogo();
  res.otrasAlQuitar = d.querySelector('[name=otras]').checked;
  d.querySelector('button[value=quitar]').click();
  await wait(300);
  res.quitada = letra(sop);
  res.contraltoQuitada = letra(alto);
  res.toastQuitar = document.querySelector('.toast')?.textContent;
  document.querySelector('#ed-undo').click();
  await wait(200);
  res.deshecho = letra(voz('Soprano'));
  res.contraltoDeshecha = letra(voz('Contralto')) === res.cabezal;
  d = await dialogo();
  d.querySelector('[name=otras]').checked = false;
  d.querySelector('button[value=quitar]').click();
  await wait(300);
  res.quitadaSola = letra(voz('Soprano'));
  res.contraltoSigue = letra(voz('Contralto')) === res.cabezal;
  res.toastQuitarSola = document.querySelector('.toast')?.textContent;

  // 7) Acordes en una sola voz (la sílaba en la nota de abajo, como exporta MuseScore) y dos estrofas con un melisma
  //    en la 1.ª («a-mor» alarga «mor»; la 2.ª canta «ré» en esa nota).
  const acorde = (a, b, letras) => nota(a, letras) + nota(b, '', true);
  const s2 = await abrir(partitura('Acordes de prueba', [
    { nombre: 'Coro', compases: [rep(acorde(60, 64, ly(1, 'a', 'begin') + ly(2, 'can', 'begin')) + acorde(62, 65, ly(1, 'mor', 'end') + ly(2, 'ta', 'middle')) +
      acorde(64, 67, extend(1) + ly(2, 'ré', 'end')) + acorde(65, 69, ly(1, 'es', 'single') + ly(2, 'hoy', 'single')))] },
  ]), 'Acordes de prueba');
  res.acordes = s2.voices.map(letra);

  const vista = 'A- (C5) · só- (D5)';
  const sinLetra = '· · · · · · · · · · · · · ·';
  res.ok =
    res.letraPartitura === esperada &&
    res.dialogo === 'Letra de «Soprano»' &&
    res.prerrelleno === 'La no-che es Tu vo-z es se‿a _ bar-ca' &&
    res.corrigeSinPartir &&
    /^10 sílabas para 14 notas/.test(res.vista ?? '') && (res.vista ?? '').includes(vista) &&
    res.soprano === puesta && res.contralto === puesta &&
    /Letra puesta: 10 sílabas en «Soprano» y en 10 notas de las otras voces/.test(res.toast ?? '') &&
    res.idaYVuelta &&
    res.midi === puesta &&
    res.rellenoCabezal === 'ca-lle, por fa-vor' && res.otrasMarcada &&
    res.cabezal === 'A- só- ma- te‿a la Uno dos · · · · · · ·' && res.contraltoCorregida &&
    res.otrasAlQuitar && res.quitada === sinLetra && res.contraltoQuitada === sinLetra &&
    res.toastQuitar === 'Letra quitada de «Soprano» y de 7 notas de las otras voces.' &&
    res.deshecho === res.cabezal && res.contraltoDeshecha &&
    res.quitadaSola === sinLetra && res.contraltoSigue && res.toastQuitarSola === 'Letra quitada de «Soprano».' &&
    res.acordes.length === 2 && res.acordes.every((l) => l === 'a- mor · es can- ta- ré hoy');
  return res;
}
