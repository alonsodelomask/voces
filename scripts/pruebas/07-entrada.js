async () => {
  // La pantalla de entrada: modos, validaciones y un intento con datos incorrectos contra Supabase.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  localStorage.removeItem('voces.sinCuenta');
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  // Ábrela desde «Grupo y cuenta» (sin sesión).
  document.querySelector('#menu [data-act=group]').click();
  await wait(500);
  const q = (s) => document.querySelector(s);
  const res = { titulo: q('.auth h1')?.textContent, cerrar: !!q('#a-close') };
  const visible = (sel) => !q(sel).closest('[hidden]') && !q(sel).hidden;
  res.loginCampos = { nombre: visible('#a-name'), clave2: visible('#a-password2'), olvidada: visible('#a-forgot') };
  // Registro: aparecen nombre y repetir contraseña; valida longitud y coincidencia.
  q('[data-m=signup]').click();
  await wait(100);
  res.registro = { titulo: q('.auth h1').textContent, nombre: visible('#a-name'), clave2: visible('#a-password2') };
  q('#a-email').value = 'prueba@ejemplo.test';
  q('#a-password').value = 'corta';
  q('#a-password2').value = 'corta';
  q('#a-submit').click();
  await wait(100);
  res.cortaMsg = q('#a-msg').textContent;
  q('#a-password').value = 'unaclave-larga';
  q('#a-password2').value = 'otraclave-larga';
  q('#a-submit').click();
  await wait(100);
  res.distintasMsg = q('#a-msg').textContent;
  // Olvidada: solo correo.
  q('[data-m=login]').click();
  q('#a-forgot').click();
  await wait(100);
  res.olvidada = { titulo: q('.auth h1').textContent, clave: visible('#a-password') };
  q('#a-back').click();
  await wait(100);
  // Entrar con datos que no existen: mensaje en español de Supabase.
  q('#a-email').value = 'nadie-voces-prueba@ejemplo.test';
  q('#a-password').value = 'contraseña-incorrecta';
  q('#a-submit').click();
  for (let i = 0; i < 40 && /Un momento/.test(q('#a-msg').textContent); i++) await wait(250);
  res.malasMsg = q('#a-msg').textContent;
  // Cerrar con la ✕.
  q('#a-close').click();
  await wait(200);
  res.cerrada = !q('.auth');
  res.ok =
    res.titulo === 'Entra en Vocify' && res.cerrar && !res.loginCampos.nombre && res.loginCampos.olvidada &&
    res.registro.nombre && res.registro.clave2 && /8 caracteres/.test(res.cortaMsg) && /no coinciden/.test(res.distintasMsg) &&
    res.olvidada.titulo === 'Recupera tu contraseña' && !res.olvidada.clave && /no son correctos/.test(res.malasMsg) && res.cerrada;
  return res;
}
