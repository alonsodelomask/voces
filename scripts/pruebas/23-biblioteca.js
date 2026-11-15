async () => {
  // Biblioteca completa: ordenar, buscar por voz y por letra, filtrar, seleccionar varias, repertorios (añadir, orden,
  // «Tocar todo seguido») y papelera (la grabación se queda hasta borrar para siempre; a los 30 días se borra sola).
  // Canciones, voces y letra inventadas.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const S = V.storage;
  const T = await import('/src/audio/track.ts');
  const R = await import('/src/library/repertorios.ts');
  const { makeSong, makeVoice } = await import('/src/model.ts');
  const espera = async (cond, ms = 3000) => {
    for (let i = 0; i < ms / 50 && !(await cond()); i++) await wait(50);
  };
  const res = {};

  const voz = (nombre, i, letra = []) => {
    const v = makeVoice(nombre, i);
    v.notes = [60, 62, 64, 65].map((midi, k) => ({ midi: midi - i * 5, start: k * 0.5, dur: 0.5, lyric: letra[k] }));
    return v;
  };
  const nueva = (title, voces) => {
    const s = makeSong({ title, bpm: 100, beatsPerBar: 4, voices: voces });
    S.saveSong(s);
    return s;
  };
  const aurora = nueva('Prueba bib Aurora', [voz('Soprano', 0), voz('Contratenor', 1)]);
  const barca = nueva('Prueba bib Barcarola', [voz('Tenor', 0), voz('Bajo', 1)]);
  const cuna = nueva('Prueba bib Canción de cuna', [voz('Alto', 0, ['Lu-', 'ciér-', 'na-', 'ga']), voz('Bajo', 1)]);
  await T.putTrack(barca.id, T.encodeWav(new Float32Array(32000), 32000));
  barca.audioTrack = { name: 'toma.wav', offset: 0, duration: 1, volume: 0.8, muted: false, solo: false };
  S.saveSong(barca);
  await S.flushStorage();

  const lib = document.querySelector('#dlg-library');
  const filas = () => [...lib.querySelectorAll('#library-list .bib-row')];
  const titulos = () => filas().map((f) => f.querySelector('b').firstChild.textContent.trim());
  const buscar = async (q) => {
    const s = lib.querySelector('#lib-search');
    s.value = q;
    s.dispatchEvent(new Event('input'));
    await wait(80);
  };
  const menu = async (fila, accion) => {
    fila.querySelector('[data-more]').click();
    await wait(50);
    lib.querySelector(`.bib-pop [data-a=${accion}]`).click();
    await wait(250);
  };
  const fila = (t) => filas().find((f) => f.querySelector('b').textContent.includes(t));
  const ok = async () => {
    await wait(100);
    [...document.querySelectorAll('dialog[open]')].pop().querySelector('button[value=ok]').click();
    await wait(250);
  };

  document.querySelector('#btn-library').click();
  await espera(() => lib.open);

  // Ordenar por nombre (y al revés) entre las de la prueba.
  await buscar('prueba bib');
  const orden = lib.querySelector('#bib-sort');
  orden.value = 'title';
  orden.dispatchEvent(new Event('change'));
  await wait(80);
  res.porNombre = titulos();
  lib.querySelector('#bib-dir').click();
  await wait(80);
  res.alReves = titulos();
  lib.querySelector('#bib-dir').click();
  await wait(80);

  // Buscar por una voz y por la letra (sin tildes).
  await buscar('contratenor');
  res.porVoz = titulos();
  await buscar('luciernaga');
  res.porLetra = titulos();

  // Filtro «Con grabación».
  await buscar('prueba bib');
  lib.querySelector('[data-filter=audio]').click();
  await wait(80);
  res.conGrabacion = titulos();
  res.limpiarVisible = !lib.querySelector('[data-act=clear]').hidden;
  lib.querySelector('[data-filter=audio]').click();
  await wait(80);

  // Seleccionar las tres y añadirlas a un repertorio nuevo.
  lib.querySelector('#bib-all').click();
  await wait(80);
  res.seleccion = lib.querySelector('#bib-sel-count').textContent;
  lib.querySelector('[data-bulk=rep]').click();
  await wait(150);
  const d = [...document.querySelectorAll('dialog[open]')].pop();
  const sel = d.querySelector('[name=rep]');
  if (sel) sel.value = '__new';
  d.querySelector('[name=name]').value = 'Concierto de prueba';
  d.querySelector('button[value=ok]').click();
  await wait(300);
  const rep = R.loadRepertorios().find((r) => r.name === 'Concierto de prueba');
  res.repertorio = rep?.songIds.length;

  // El repertorio: en su orden; subir la segunda; «Tocar todo seguido» está.
  lib.querySelector(`[data-sec="rep:${rep.id}"]`).click();
  await wait(100);
  await buscar('');
  res.enElRepertorio = titulos();
  await menu(filas()[1], 'up');
  res.trasSubir = titulos();
  res.tocarSeguido = !!lib.querySelector('[data-act=play-rep]');

  // A la papelera la que tiene grabación: sale de la lista y del repertorio, pero la grabación sigue.
  lib.querySelector('[data-sec=all]').click();
  await wait(100);
  await buscar('prueba bib');
  const papeleraAntes = Number(lib.querySelector('[data-count=trash]').textContent);
  await menu(fila('Barcarola'), 'trash');
  res.fueraDeLaLista = !fila('Barcarola');
  res.papelera = Number(lib.querySelector('[data-count=trash]').textContent) - papeleraAntes;
  res.grabacionSigue = (await T.trackIds()).includes(barca.id);
  lib.querySelector(`[data-sec="rep:${rep.id}"]`).click();
  await wait(100);
  res.repertorioSinElla = filas().length;

  // Recuperarla desde la papelera.
  lib.querySelector('[data-sec=trash]').click();
  await wait(100);
  res.enLaPapelera = titulos().includes('Prueba bib Barcarola');
  res.diasQuedan = /30 días/.test(fila('Barcarola')?.querySelector('.bib-when')?.textContent ?? '');
  await menu(fila('Barcarola'), 'restore');
  lib.querySelector('[data-sec=all]').click();
  await wait(100);
  await buscar('prueba bib');
  res.recuperada = !!fila('Barcarola');

  // Otra vez a la papelera y borrar para siempre: se va la grabación y sale del repertorio.
  await menu(fila('Barcarola'), 'trash');
  lib.querySelector('[data-sec=trash]').click();
  await wait(100);
  await menu(fila('Barcarola'), 'purge');
  await ok();
  await S.flushStorage();
  res.borradaDelTodo = !S.getSong(barca.id);
  res.grabacionBorrada = !(await T.trackIds()).includes(barca.id);
  res.fueraDelRepertorio = !R.loadRepertorios().find((r) => r.id === rep.id).songIds.includes(barca.id);

  // A los 30 días en la papelera se borra sola.
  S.trashSong(aurora.id);
  res.purgaAntes = S.purgeOldTrash().length === 0;
  res.purgaDespues = S.purgeOldTrash(Date.now() + 31 * 86_400_000).includes(aurora.id);

  // Borrar el repertorio no borra canciones.
  lib.querySelector(`[data-rep-more="${rep.id}"]`).click();
  await wait(50);
  lib.querySelector('.bib-pop [data-ra=delete]').click();
  await ok();
  res.repertorioBorrado = !R.loadRepertorios().some((r) => r.id === rep.id);
  res.cancionSigue = !!S.getSong(cuna.id);
  lib.close();

  res.ok =
    res.porNombre.join('|') === 'Prueba bib Aurora|Prueba bib Barcarola|Prueba bib Canción de cuna' &&
    res.alReves[0] === 'Prueba bib Canción de cuna' &&
    res.porVoz.join() === 'Prueba bib Aurora' &&
    res.porLetra.join() === 'Prueba bib Canción de cuna' &&
    res.conGrabacion.join() === 'Prueba bib Barcarola' &&
    res.limpiarVisible &&
    res.seleccion === '3 seleccionadas' &&
    res.repertorio === 3 &&
    res.enElRepertorio.join('|') === 'Prueba bib Aurora|Prueba bib Barcarola|Prueba bib Canción de cuna' &&
    res.trasSubir.join('|') === 'Prueba bib Barcarola|Prueba bib Aurora|Prueba bib Canción de cuna' &&
    res.tocarSeguido &&
    res.fueraDeLaLista &&
    res.papelera === 1 &&
    res.grabacionSigue &&
    res.repertorioSinElla === 2 &&
    res.enLaPapelera &&
    res.diasQuedan &&
    res.recuperada &&
    res.borradaDelTodo &&
    res.grabacionBorrada &&
    res.fueraDelRepertorio &&
    res.purgaAntes &&
    res.purgaDespues &&
    res.repertorioBorrado &&
    res.cancionSigue &&
    !!V.song;
  return res;
}
