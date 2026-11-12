async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = {};
  // Primero la pantalla de entrada (con la nube activa): «Continuar sin cuenta».
  res.entrada = document.querySelector('.auth h1')?.textContent;
  document.querySelector('#a-skip')?.click();
  await wait(400);
  const d = document.querySelector('dialog[open]');
  res.bienvenida = d?.querySelector('h2')?.textContent;
  res.pasos = d ? d.querySelectorAll('.welcome-step').length : 0;
  // «Componer tarareando»: canción nueva, editor y panel de tararear.
  d.querySelector('[data-w=hum]').click();
  await wait(1200);
  res.cancion = window.voces.song.title;
  res.editor = document.querySelector('#view-edit').classList.contains('active');
  res.ayudaEditor = !document.querySelector('#roll-empty').hidden;
  res.tararear = document.querySelector('dialog[open] h2')?.textContent;
  res.micro = document.querySelector('#hum-status')?.textContent;
  document.querySelector('#hum-close')?.click();
  await wait(300);
  // Visualizador con la canción vacía: tarjeta con acciones.
  document.querySelector('.tab[data-view=viz]').click();
  await wait(200);
  res.vacio = !document.querySelector('#empty').hidden;
  res.acciones = [...document.querySelectorAll('#empty [data-empty]')].map((b) => b.textContent.trim());
  // No vuelve a salir al recargar.
  res.marcada = localStorage.getItem('voces.bienvenida.v1');
  res.ok = res.entrada === 'Entra en Vocify' && res.pasos === 4 && res.cancion === 'Mi melodía' && res.editor && res.ayudaEditor && /Tararear/.test(res.tararear ?? '') && res.vacio && res.acciones.length === 3 && res.marcada === '1';
  return res;
}
