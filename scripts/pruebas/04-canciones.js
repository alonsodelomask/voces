async () => {
  // Biblioteca, lo básico: duplicar, buscar, cambiar el nombre, abrir y mandar a la papelera la abierta (se abre otra).
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const res = {};
  const lib = document.querySelector('#dlg-library');
  const filas = () => [...lib.querySelectorAll('#library-list .bib-row')];
  const menu = async (fila, accion) => {
    fila.querySelector('[data-more]').click();
    await wait(50);
    lib.querySelector(`.bib-pop [data-a=${accion}]`).click();
    await wait(250);
  };
  // Dos canciones guardadas: el ejemplo y una nueva.
  document.querySelector('#menu [data-act=demo]').click();
  await wait(200);
  // El logo y la palabra «Vocify» llevan al inicio (la biblioteca), como el botón de los libros.
  document.querySelector('#btn-home').click();
  await wait(200);
  res.abierta1 = lib.open;
  res.antes = filas().length;
  // Duplicar la abierta.
  await menu(lib.querySelector('.bib-row.current'), 'copy');
  res.trasDuplicar = filas().length;
  res.copia = filas().some((f) => f.querySelector('b').textContent.includes('(copia)'));
  // Buscar.
  const s = document.querySelector('#lib-search');
  s.value = 'copia';
  s.dispatchEvent(new Event('input'));
  await wait(100);
  res.filtradas = filas().length;
  // Cambiar el nombre a la copia.
  await menu(filas()[0], 'rename');
  const d = [...document.querySelectorAll('dialog[open]')].pop();
  d.querySelector('[name=t]').value = 'Ensayo del martes';
  d.querySelector('button[value=ok]').click();
  await wait(300);
  s.value = '';
  s.dispatchEvent(new Event('input'));
  await wait(100);
  res.renombrada = filas().some((f) => f.querySelector('b').textContent.startsWith('Ensayo del martes'));
  // Abrirla y mandar la abierta a la papelera (se abre otra).
  filas()
    .find((f) => f.querySelector('b').textContent.startsWith('Ensayo del martes'))
    .querySelector('.bib-open')
    .click();
  await wait(200);
  res.abierta = V.song.title;
  document.querySelector('#btn-library').click();
  await wait(200);
  await menu(lib.querySelector('.bib-row.current'), 'trash');
  res.trasBorrar = filas().length;
  res.ahoraAbierta = V.song.title;
  res.papelera = lib.querySelector('[data-count=trash]').textContent;
  res.ok =
    res.abierta1 &&
    res.trasDuplicar === res.antes + 1 &&
    res.copia &&
    res.filtradas === 1 &&
    res.renombrada &&
    res.abierta === 'Ensayo del martes' &&
    res.trasBorrar === res.antes &&
    res.ahoraAbierta !== 'Ensayo del martes' &&
    Number(res.papelera) >= 1;
  return res;
}
