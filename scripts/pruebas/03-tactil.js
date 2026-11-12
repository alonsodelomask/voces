async () => {
  // Simula dedos (pointerType 'touch') sobre el editor y el visualizador.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const V = window.voces;
  const res = {};
  document.querySelector('.tab[data-view=edit]').click();
  await wait(300);
  const roll = document.querySelector('#roll');
  const r = roll.getBoundingClientRect();
  const fire = (type, id, x, y) =>
    roll.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: r.left + x, clientY: r.top + y, bubbles: true, isPrimary: id === 1, button: 0 }));
  const voice = V.roll.activeVoice;
  const before = voice.notes.length;
  // 1) Toque en un hueco (arriba del todo, donde no hay notas) → una nota.
  fire('pointerdown', 1, 300, 60);
  await wait(60);
  fire('pointerup', 1, 300, 60);
  await wait(100);
  res.toque = V.roll.activeVoice.notes.length - before;
  // 2) Arrastrar en un hueco → desplaza, no pone notas.
  const n1 = V.roll.activeVoice.notes.length;
  const sx = V.roll.scrollX;
  fire('pointerdown', 1, 500, 70);
  for (let i = 1; i <= 8; i++) {
    fire('pointermove', 1, 500 - i * 20, 70);
    await wait(10);
  }
  fire('pointerup', 1, 340, 70);
  await wait(100);
  res.arrastreDesplaza = V.roll.scrollX - sx;
  res.arrastreSinNotas = V.roll.activeVoice.notes.length === n1;
  // 3) Pellizco → zoom.
  const z0 = V.roll.pxPerBeat;
  fire('pointerdown', 1, 300, 300);
  fire('pointerdown', 2, 400, 300);
  for (let i = 1; i <= 6; i++) {
    fire('pointermove', 1, 300 - i * 10, 300);
    fire('pointermove', 2, 400 + i * 10, 300);
    await wait(10);
  }
  fire('pointerup', 1, 240, 300);
  fire('pointerup', 2, 460, 300);
  await wait(100);
  res.zoom = +(V.roll.pxPerBeat / z0).toFixed(2);
  res.pellizcoSinNotas = V.roll.activeVoice.notes.length === n1;
  // 4) Mantener pulsada la nota recién puesta → se borra (y se puede deshacer).
  V.roll.scrollX = 0;
  V.roll.pxPerBeat = 48;
  V.roll.centerOnNotes();
  await wait(50);
  const nota = V.roll.activeVoice.notes[0];
  const x = 46 + (nota.start / V.roll.spb) * V.roll.pxPerBeat - V.roll.scrollX + 6;
  const y = 42 + (127 - nota.midi) * V.roll.rowH - V.roll.scrollY + V.roll.rowH / 2;
  const n2 = V.roll.activeVoice.notes.length;
  fire('pointerdown', 1, x, y);
  await wait(700);
  fire('pointerup', 1, x, y);
  await wait(100);
  res.mantenerBorra = n2 - V.roll.activeVoice.notes.length;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }));
  await wait(100);
  res.deshacer = V.roll.activeVoice.notes.length === n2;
  res.ok = res.toque === 1 && res.arrastreDesplaza > 50 && res.arrastreSinNotas && res.zoom > 1.5 && res.pellizcoSinNotas && res.mantenerBorra === 1 && res.deshacer;
  return res;
}
