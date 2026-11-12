async () => {
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  localStorage.removeItem('voces.ensayo');
  document.querySelector('#menu [data-act=demo]').click();
  await wait(300);
  document.querySelector('#btn-practice').click();
  await wait(300);
  const d = document.querySelector('dialog[open]');
  d.querySelector('[name=tramo]').value = 'bars';
  d.querySelector('[name=desde]').value = '2';
  d.querySelector('[name=hasta]').value = '2';
  d.querySelector('[name=metronome]').checked = true;
  d.querySelector('[name=countIn]').checked = true;
  d.querySelector('button[value=ok]').click();
  await wait(400);
  const bar = (60 / V.song.bpm) * V.song.beatsPerBar;
  const r = V.engine.range;
  const res = {
    rango: r && [+(r.start / bar).toFixed(2), +(r.end / bar).toFixed(2)],
    boton: document.querySelector('#btn-practice').classList.contains('on'),
    metronomo: V.engine.metronome,
    cuenta: V.engine.countIn,
    guardado: localStorage.getItem('voces.ensayo'),
  };
  // Reproduce y comprueba que vuelve al principio del tramo (con cuenta atrás de un compás).
  await V.engine.play(undefined, undefined, true);
  const t = [];
  for (let i = 0; i < 34; i++) {
    await wait(250);
    t.push(+V.engine.time.toFixed(2));
  }
  V.engine.pause();
  const dentro = t.filter((x) => x > 0).every((x) => x >= r.start - bar - 0.05 && x <= r.end + 0.15);
  const vuelve = t.some((x, i) => i > 0 && x < t[i - 1] - 0.5);
  res.tiempos = t.join(' ');
  res.ok = !!r && res.rango[0] === 1 && res.rango[1] === 2 && res.metronomo && res.cuenta && dentro && vuelve;
  return res;
}
