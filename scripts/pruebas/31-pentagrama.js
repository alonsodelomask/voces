async () => {
  // Líneas de pentagrama en el visualizador: salen por defecto, la casilla «Pentagrama» del panel de voces las quita y
  // las vuelve a poner, se recuerda en el dispositivo y la ayuda lo cuenta. Se mira además que se dibujan: una columna
  // de píxeles del lienzo es más clara con pentagrama que sin él.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const res = {};
  const casilla = document.querySelector('#opt-staff');
  const antes = localStorage.getItem('voces.pentagrama');
  res.enElPanel = casilla?.closest('aside')?.id === 'panel' && /Pentagrama/.test(casilla.closest('label').textContent);
  res.porDefecto = V.viz.opts.showStaff === true && casilla.checked;
  // Brillo de la última columna de píxeles del lienzo, de arriba abajo: las voces son las mismas con y sin pentagrama.
  const lienzo = document.querySelector('canvas#viz');
  const brillo = () => {
    const c = lienzo.getContext('2d');
    const x = lienzo.width - 4;
    const d = c.getImageData(x, 0, 1, lienzo.height).data;
    let suma = 0;
    for (let i = 0; i < d.length; i += 4) suma += d[i] + d[i + 1] + d[i + 2];
    return suma;
  };
  V.engine.pause?.();
  await wait(300);
  const con = brillo();
  casilla.checked = false;
  casilla.dispatchEvent(new Event('change'));
  await wait(300);
  const sin = brillo();
  res.quitado = V.viz.opts.showStaff === false && localStorage.getItem('voces.pentagrama') === 'no';
  res.seDibuja = con > sin;
  casilla.checked = true;
  casilla.dispatchEvent(new Event('change'));
  await wait(100);
  res.puesto = V.viz.opts.showStaff === true && localStorage.getItem('voces.pentagrama') === 'si';
  res.ayuda = /casilla Pentagrama del panel de voces/.test(document.querySelector('#dlg-help .help').textContent.replace(/\s+/g, ' '));
  if (antes === null) localStorage.removeItem('voces.pentagrama');
  else localStorage.setItem('voces.pentagrama', antes);
  res.ok = res.enElPanel && res.porDefecto && res.quitado && res.seDibuja && res.puesto && res.ayuda;
  return res;
}
