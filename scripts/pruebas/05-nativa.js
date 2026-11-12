async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const res = {};
  res.clase = document.documentElement.className;
  res.ready = window.__msgs.some((m) => m.type === 'ready');
  res.acceptVacio = document.querySelector('#file').accept === '';
  // La app entrega una partitura abierta desde otra app.
  const buf = new Uint8Array(await (await fetch('/samples/la-vida.musicxml')).arrayBuffer());
  let bin = '';
  for (const b of buf) bin += String.fromCharCode(b);
  window.__vocesOpenFile({ name: 'La vida.musicxml', base64: btoa(bin) });
  await wait(1500);
  res.titulo = window.voces.song.title;
  res.voces = window.voces.song.voices.length;
  // Exportar MIDI pasa por el menú de compartir del teléfono.
  document.querySelector('#menu [data-act=export-midi]').click();
  await wait(500);
  const save = window.__msgs.find((m) => m.type === 'save');
  res.compartir = save && { name: save.name, mime: save.mime, midi: atob(save.base64).slice(0, 4) };
  res.ok = res.clase.includes('native-ios') && res.ready && res.acceptVacio && res.titulo === 'La vida es una copa de licor' && res.voces === 4 && res.compartir?.midi === 'MThd';
  return res;
}
