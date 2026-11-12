async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  document.querySelector('#menu [data-act=demo]').click();
  await wait(200);
  document.querySelector('.tab[data-view=edit]').click();
  await wait(300);
  const roll = document.querySelector('#roll');
  const r = roll.getBoundingClientRect();
  const fire = (type, x, y, extra = {}) => roll.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'mouse', clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0, ...extra }));
  const v = V.roll.activeVoice;
  const n0 = v.notes.length;
  // Clic y arrastre a la derecha: nota nueva que se alarga.
  fire('pointerdown', 300, 60);
  for (let i = 1; i <= 5; i++) fire('pointermove', 300 + i * 20, 60);
  fire('pointerup', 400, 60);
  await wait(100);
  const nueva = V.roll.activeVoice.notes.find((n) => !n.name);
  const res = { notas: V.roll.activeVoice.notes.length - n0, pulsos: nueva ? +(nueva.dur / V.roll.spb).toFixed(2) : null };
  // Botones de deshacer: activo tras editar, y en gris tras deshacerlo todo.
  res.undoActivo = !document.querySelector('#ed-undo').disabled;
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ', ctrlKey: true }));
  await wait(100);
  res.undoGris = document.querySelector('#ed-undo').disabled;
  res.redoActivo = !document.querySelector('#ed-redo').disabled;
  res.ok = res.notas === 1 && res.pulsos > 1 && res.undoActivo && res.undoGris && res.redoActivo;
  return res;
}
