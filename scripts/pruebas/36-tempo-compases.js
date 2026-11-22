async () => {
  // Cambiar el tempo en el editor reescala a la vez las notas, los acordes, los inicios de compás de la partitura y el
  // tramo de ensayo. Medido en la auditoría: de 60 a 120, una nota pasaba de 4 s a 2 s y los compases seguían en 0, 4 y
  // 8 s (y al mezclar con una grabación se numeraban mal). Canción inventada; al final se vuelve al ejemplo.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const S = V.storage;
  const { makeSong, makeVoice } = await import('/src/model.ts');
  const ID = 'prueba-tempo-compases';
  const res = {};
  try {
    const s = makeSong({ title: 'Tempo de prueba', bpm: 60, voices: [makeVoice('Melodía', 0)] });
    s.id = ID;
    s.beatsPerBar = 4;
    s.voices[0].notes = [{ midi: 64, start: 4, dur: 1, lyric: 'sol' }];
    s.chords = [{ time: 8, name: 'G' }];
    s.chordsAuto = false;
    s.barStarts = [0, 4, 8];
    await V.openFile(new File([JSON.stringify(s)], 'Tempo de prueba.voces.json', { type: 'application/json' }));
    await wait(300);
    res.abierta = V.song.id === ID && V.song.bpm === 60;
    V.engine.range = { start: 4, end: 8 }; // tramo de ensayo: compás 2
    const bpm = document.querySelector('#ed-bpm');
    bpm.value = '120';
    bpm.dispatchEvent(new Event('change'));
    await wait(100);
    const n = V.song.voices[0].notes[0];
    res.nota = [n.start, n.dur, n.lyric];
    res.compases = V.song.barStarts;
    res.acorde = V.song.chords[0]?.time;
    res.tramo = V.engine.range && [V.engine.range.start, V.engine.range.end];
    res.okNota = V.song.bpm === 120 && n.start === 2 && n.dur === 0.5 && n.lyric === 'sol';
    res.okCompases = JSON.stringify(res.compases) === JSON.stringify([0, 2, 4]);
    res.okAcorde = res.acorde === 4;
    res.okTramo = JSON.stringify(res.tramo) === JSON.stringify([2, 4]);
  } finally {
    V.engine.range = null;
    document.querySelector('#menu [data-act=demo]').click();
    await wait(300);
    S.deleteSong(ID, { silent: true });
  }
  res.ok = res.abierta && res.okNota && res.okCompases && res.okAcorde && res.okTramo;
  return res;
}
