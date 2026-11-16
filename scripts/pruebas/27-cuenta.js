async () => {
  // Menú de la cuenta (círculo con iniciales) y Ajustes de cuenta, con una nube de mentira (window.__vocesNube, solo en
  // desarrollo): nombre y correo, contraseña (no deja guardar una corta o distinta), avisos de este dispositivo,
  // eliminar la cuenta y cerrar sesión. Sin sesión, el menú ofrece entrar. Persona y correo inventados.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.querySelector('.auth')?.remove();
  const res = {};
  const llamadas = [];
  let nombre = 'Ana Pérez';
  window.__vocesNube = {
    cloudEnabled: true,
    user: () => ({ id: 'u-ana', email: 'ana@ejemplo.invalid', created_at: '2026-11-01T10:00:00Z' }),
    onAuth: () => () => {},
    getProfileName: async () => nombre,
    setProfileName: async (n) => {
      llamadas.push(['setProfileName', n]);
      nombre = n;
    },
    changeEmail: async (e) => llamadas.push(['changeEmail', e]),
    signInMethods: () => ['email'],
    updatePassword: async (p) => llamadas.push(['updatePassword', p.length]),
    exportMyData: async () => new Blob(['{}'], { type: 'application/json' }),
    deleteAccount: async () => llamadas.push(['deleteAccount']),
    signOut: async () => llamadas.push(['signOut']),
  };
  const boton = document.querySelector('#btn-account');
  const menu = document.querySelector('#account-menu');
  const ajustes = document.querySelector('#dlg-settings');
  const escribe = (el, v) => {
    el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  try {
    // El menú: iniciales, nombre, correo y sus opciones.
    boton.click();
    await wait(150);
    res.iniciales = boton.textContent;
    res.cabecera = menu.querySelector('.acc-who')?.textContent.replace(/\s+/g, ' ').trim();
    res.opciones = [...menu.querySelectorAll('[data-acc]')].map((b) => b.dataset.acc).join(',');
    menu.querySelector('[data-acc=settings]').click();
    await wait(300);
    res.ajustesAbiertos = ajustes.open && ajustes.querySelector('#aj-title').textContent;
    res.secciones = [...ajustes.querySelectorAll('[data-aj-sec]')].map((b) => b.dataset.ajSec).join(',');

    // Perfil: cambiar el nombre y el correo.
    const nombreInput = ajustes.querySelector('#aj-name');
    res.nombreLeido = nombreInput.value;
    escribe(nombreInput, 'Ana Prueba');
    escribe(ajustes.querySelector('#aj-email'), 'ana.nueva@ejemplo.invalid');
    ajustes.querySelector('[data-aj=save-profile]').click();
    await wait(300);
    res.guardado = llamadas.filter((l) => l[0] !== 'updatePassword').map((l) => l.join(':')).join('|');
    res.inicialesNuevas = boton.textContent;

    // Contraseña: corta o distinta, no; bien, sí.
    ajustes.querySelector('[data-aj-sec=contrasena]').click();
    await wait(100);
    const p1 = ajustes.querySelector('#aj-pass1');
    const p2 = ajustes.querySelector('#aj-pass2');
    const go = ajustes.querySelector('[data-aj=save-pass]');
    escribe(p1, 'corta');
    res.cortaBloqueada = go.disabled && /mínimo 8/.test(ajustes.querySelector('#aj-pass-hint').textContent);
    escribe(p1, 'unaclavelarga1');
    escribe(p2, 'otraclavedistinta');
    res.distintaBloqueada = go.disabled && /no coinciden/.test(ajustes.querySelector('#aj-pass-hint').textContent);
    escribe(p2, 'unaclavelarga1');
    res.buenaPermitida = !go.disabled;
    go.click();
    await wait(200);
    res.contrasena = llamadas.some((l) => l[0] === 'updatePassword' && l[1] === 14);

    // Avisos: se guardan en este dispositivo.
    ajustes.querySelector('[data-aj-sec=avisos]').click();
    await wait(100);
    const auto = ajustes.querySelector('[data-pref=autoUpdate]');
    auto.click();
    res.avisoGuardado = JSON.parse(localStorage.getItem('voces.ajustes.v1') ?? '{}').autoUpdate === false;
    auto.click();

    // Tus datos: eliminar la cuenta (con confirmación).
    ajustes.querySelector('[data-aj-sec=datos]').click();
    await wait(100);
    ajustes.querySelector('[data-aj=delete]').click();
    await wait(200);
    [...document.querySelectorAll('dialog[open]')].pop().querySelector('button[value=ok]').click();
    await wait(300);
    res.borrada = llamadas.some((l) => l[0] === 'deleteAccount') && !ajustes.open;

    // Cerrar sesión desde el menú.
    boton.click();
    await wait(100);
    menu.querySelector('[data-acc=out]').click();
    await wait(200);
    res.sesionCerrada = llamadas.some((l) => l[0] === 'signOut');

    // Sin sesión: el menú ofrece entrar.
    window.__vocesNube = { ...window.__vocesNube, user: () => null };
    boton.click();
    await wait(100);
    res.sinSesion = [...menu.querySelectorAll('[data-acc]')].map((b) => b.dataset.acc).join(',');
    document.body.click();
  } catch (e) {
    res.error = `${e.message} · ${(e.stack ?? '').split(String.fromCharCode(10))[1]?.trim()}`;
  } finally {
    delete window.__vocesNube;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  }
  res.ok =
    res.iniciales === 'AP' &&
    /Ana Pérez/.test(res.cabecera ?? '') &&
    /ana@ejemplo\.invalid/.test(res.cabecera ?? '') &&
    res.opciones === 'profile,settings,group,contact,help,out' &&
    res.ajustesAbiertos === 'Perfil' &&
    res.secciones === 'perfil,contrasena,avisos,ia,datos' &&
    res.nombreLeido === 'Ana Pérez' &&
    res.guardado === 'setProfileName:Ana Prueba|changeEmail:ana.nueva@ejemplo.invalid' &&
    res.inicialesNuevas === 'AP' &&
    res.cortaBloqueada &&
    res.distintaBloqueada &&
    res.buenaPermitida &&
    res.contrasena &&
    res.avisoGuardado &&
    res.borrada &&
    res.sesionCerrada &&
    res.sinSesion === 'auth,contact,help';
  return res;
}
