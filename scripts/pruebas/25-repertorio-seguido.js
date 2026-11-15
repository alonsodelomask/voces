async () => {
  // «Tocar todo seguido» en un repertorio: suena la primera y, al acabar, se abre y suena la siguiente; al final, avisa.
  // Dos canciones cortas inventadas.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const S = V.storage;
  const R = await import('/src/library/repertorios.ts');
  const { makeSong, makeVoice } = await import('/src/model.ts');
  const espera = async (cond, ms = 8000) => {
    for (let i = 0; i < ms / 50 && !cond(); i++) await wait(50);
  };
  const corta = (title, midi) => {
    const v = makeVoice('Soprano', 0);
    v.notes = [{ midi, start: 0, dur: 0.4 }];
    const s = makeSong({ title, bpm: 120, beatsPerBar: 4, voices: [v] });
    S.saveSong(s);
    return s;
  };
  const a = corta('Seguido uno', 67);
  const b = corta('Seguido dos', 69);
  const rep = R.createRepertorio('Ensayo seguido', [a.id, b.id]);
  const res = {};

  document.querySelector('#btn-library').click();
  await wait(150);
  const lib = document.querySelector('#dlg-library');
  lib.querySelector(`[data-sec="rep:${rep.id}"]`).click();
  await wait(100);
  lib.querySelector('[data-act=play-rep]').click();
  await espera(() => V.song.id === a.id && V.engine.playing);
  res.primera = V.song.title;
  res.sonando = V.engine.playing;
  res.bibliotecaCerrada = !lib.open;
  await espera(() => V.song.id === b.id);
  res.segunda = V.song.title;
  await espera(() => /Fin del repertorio/.test(document.querySelector('#toast')?.textContent ?? ''));
  res.aviso = document.querySelector('#toast')?.textContent;
  res.parada = !V.engine.playing;

  R.deleteRepertorio(rep.id);
  res.ok = res.primera === 'Seguido uno' && res.sonando && res.bibliotecaCerrada && res.segunda === 'Seguido dos' && /Fin del repertorio/.test(res.aviso ?? '') && res.parada;
  return res;
}
