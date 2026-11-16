async () => {
  // Al iniciar sesión (desde el menú de la cuenta) se abre la biblioteca para elegir canción, y la bienvenida ya no
  // sale. Si se cierra sin entrar, no. Nube de mentira (window.__vocesNube) y entrada simulada (window.__vocesEntrar),
  // las dos solo en desarrollo. Persona inventada.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  // La pantalla de entrada se cierra con su botón (quitarla a mano la deja «abierta» por dentro), y después los diálogos.
  { const a = document.querySelector('.auth'); (a?.querySelector('#a-close') ?? a?.querySelector('#a-skip'))?.click(); }
  await wait(100);
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const res = {};
  const biblioteca = document.querySelector('#dlg-library');
  const boton = document.querySelector('#btn-account');
  window.__vocesNube = {
    cloudEnabled: true,
    user: () => null,
    onAuth: () => () => {},
    getProfileName: async () => null,
    signInMethods: () => [],
  };
  const abreEntrar = async () => {
    boton.click();
    await wait(100);
    document.querySelector('#account-menu [data-acc=auth]').click();
    await wait(200);
    return !!document.querySelector('.auth');
  };
  try {
    localStorage.removeItem('voces.bienvenida.v1');

    // Se cierra sin entrar: ni biblioteca ni nada.
    res.pantalla1 = await abreEntrar();
    document.querySelector('.auth #a-close').click();
    await wait(200);
    res.sinEntrar = !biblioteca.open && !document.querySelector('.auth');

    // Se entra: se cierra la pantalla y se abre la biblioteca; la bienvenida queda vista.
    res.pantalla2 = await abreEntrar();
    window.__vocesEntrar();
    await wait(400);
    res.biblioteca = biblioteca.open && !document.querySelector('.auth');
    res.bienvenidaVista = localStorage.getItem('voces.bienvenida.v1') === '1';
    res.sinBienvenida = ![...document.querySelectorAll('dialog[open]')].some((d) => /bienvenida a Vocify/.test(d.textContent));
  } catch (e) {
    res.error = `${e.message} · ${(e.stack ?? '').split(String.fromCharCode(10))[1]?.trim()}`;
  } finally {
    delete window.__vocesNube;
    delete window.__vocesEntrar;
    { const a = document.querySelector('.auth'); (a?.querySelector('#a-close') ?? a?.querySelector('#a-skip'))?.click(); }
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  }
  res.ok = res.pantalla1 && res.sinEntrar && res.pantalla2 && res.biblioteca && res.bienvenidaVista && res.sinBienvenida;
  return res;
}
