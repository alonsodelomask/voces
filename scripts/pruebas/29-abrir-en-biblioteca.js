async () => {
  // Al abrir Vocify (sin la primera bienvenida pendiente) se empieza en la biblioteca, para elegir canción, y no dentro
  // de la última canción. Se carga la app en un marco aparte, con «Continuar sin cuenta» ya elegido.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = {};
  const antes = { sinCuenta: localStorage.getItem('voces.sinCuenta'), bienvenida: localStorage.getItem('voces.bienvenida.v1') };
  localStorage.setItem('voces.sinCuenta', '1');
  localStorage.setItem('voces.bienvenida.v1', '1');
  const marco = document.createElement('iframe');
  marco.style.cssText = 'position:fixed;left:0;top:0;width:1000px;height:700px;opacity:0;pointer-events:none';
  marco.src = '/';
  document.body.appendChild(marco);
  try {
    let bib = null;
    for (let i = 0; i < 100; i++) {
      await wait(100);
      bib = marco.contentDocument?.querySelector('#dlg-library');
      if (bib?.open) break;
    }
    res.biblioteca = !!bib?.open;
    res.sinBienvenida = ![...(marco.contentDocument?.querySelectorAll('dialog[open]') ?? [])].some((d) => /bienvenida a Vocify/.test(d.textContent));
    res.sinEntrada = !marco.contentDocument?.querySelector('.auth');
  } catch (e) {
    res.error = e.message;
  } finally {
    marco.remove();
    for (const [k, clave] of [['sinCuenta', 'voces.sinCuenta'], ['bienvenida', 'voces.bienvenida.v1']])
      antes[k] === null ? localStorage.removeItem(clave) : localStorage.setItem(clave, antes[k]);
  }
  res.ok = res.biblioteca && res.sinBienvenida && res.sinEntrada;
  return res;
}
