async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const res = {};
  // Dos canciones guardadas: el ejemplo y una nueva.
  document.querySelector('#menu [data-act=demo]').click();
  await wait(200);
  document.querySelector('#menu [data-act=library]').click();
  await wait(200);
  const lib = document.querySelector('#dlg-library');
  res.antes = lib.querySelectorAll('.lib-item').length;
  // Duplicar la abierta.
  lib.querySelector('.lib-item.current [data-a=copy]').click();
  await wait(300);
  res.trasDuplicar = lib.querySelectorAll('.lib-item').length;
  res.copia = [...lib.querySelectorAll('.lib-item b')].some((b) => b.textContent.includes('(copia)'));
  // Buscar.
  const s = document.querySelector('#lib-search');
  s.value = 'copia';
  s.dispatchEvent(new Event('input'));
  await wait(100);
  res.filtradas = lib.querySelectorAll('.lib-item').length;
  // Renombrar la copia.
  lib.querySelector('.lib-item [data-a=rename]').click();
  await wait(200);
  const d = [...document.querySelectorAll('dialog[open]')].pop();
  d.querySelector('[name=t]').value = 'Ensayo del martes';
  d.querySelector('button[value=ok]').click();
  await wait(300);
  s.value = '';
  s.dispatchEvent(new Event('input'));
  await wait(100);
  res.renombrada = [...lib.querySelectorAll('.lib-item b')].some((b) => b.textContent.startsWith('Ensayo del martes'));
  // Abrirla y borrar la abierta (vuelve a otra).
  [...lib.querySelectorAll('.lib-item')].find((i) => i.querySelector('b').textContent.startsWith('Ensayo del martes')).querySelector('.meta').click();
  await wait(200);
  res.abierta = V.song.title;
  document.querySelector('#menu [data-act=library]').click();
  await wait(200);
  lib.querySelector('.lib-item.current [data-a=delete]').click();
  await wait(200);
  [...document.querySelectorAll('dialog[open]')].pop().querySelector('button[value=ok]').click();
  await wait(300);
  res.trasBorrar = lib.querySelectorAll('.lib-item').length;
  res.ahoraAbierta = V.song.title;
  res.ok = res.trasDuplicar === res.antes + 1 && res.copia && res.filtradas === 1 && res.renombrada && res.abierta === 'Ensayo del martes' && res.trasBorrar === res.antes && res.ahoraAbierta !== 'Ensayo del martes';
  return res;
}
