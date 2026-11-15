async () => {
  // Las canciones pasan de localStorage (como se guardaban antes) a IndexedDB sin perder ninguna, y la copia de antes
  // queda aparte unos días. Y lo que quedó a medio escribir al cerrar la página (apuntado en localStorage) se recupera
  // al volver a abrir. Títulos inventados.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const vuelta = window.__vuelta ?? 0;
  const S = window.voces.storage;
  const { makeSong, makeVoice } = await import('/src/model.ts');
  const ids = ['traslado-uno', 'traslado-dos'];

  if (vuelta === 0) {
    // Como estaba antes: dos canciones en localStorage y nada en IndexedDB.
    const viejas = ids.map((id, i) => {
      const s = makeSong({ title: `Traslado ${i + 1}`, bpm: 90, beatsPerBar: 4, voices: [makeVoice('Soprano', 0)] });
      s.id = id;
      s.voices[0].notes = [{ midi: 64 + i, start: 0, dur: 1 }];
      return s;
    });
    await new Promise((r) => {
      const q = indexedDB.deleteDatabase('voces.canciones');
      q.onsuccess = q.onerror = q.onblocked = () => r();
    });
    localStorage.setItem('voces.songs.v1', JSON.stringify(viejas));
    localStorage.removeItem('voces.songs.v1.copia');
    return { recargar: true };
  }

  if (vuelta === 1) {
    const res = { vuelta };
    res.trasladadas = ids.filter((id) => S.getSong(id)).length;
    res.viejaQuitada = localStorage.getItem('voces.songs.v1') === null;
    res.copiaGuardada = (JSON.parse(localStorage.getItem('voces.songs.v1.copia') ?? '[]') ?? []).length;
    // En la base nueva de verdad (no solo en memoria):
    res.enIndexedDB = await new Promise((r) => {
      const q = indexedDB.open('voces.canciones');
      q.onsuccess = () => {
        const g = q.result.transaction('canciones').objectStore('canciones').getAllKeys();
        g.onsuccess = () => {
          r(ids.filter((id) => g.result.includes(id)).length);
          q.result.close();
        };
      };
    });
    // Una versión más nueva que se quedó a medio escribir al cerrar.
    const s = S.getSong(ids[0]);
    s.title = 'Traslado 1 (cambiada)';
    s.updatedAt = Date.now() + 1000;
    localStorage.setItem('voces.songs.pendientes', JSON.stringify([s]));
    sessionStorage.setItem('traslado', JSON.stringify(res));
    return { ...res, recargar: true };
  }

  const res = JSON.parse(sessionStorage.getItem('traslado') ?? '{}');
  sessionStorage.removeItem('traslado');
  await wait(100);
  res.recuperada = S.getSong(ids[0])?.title;
  res.pendientesBorradas = localStorage.getItem('voces.songs.pendientes') === null;
  // Limpieza: fuera las canciones de la prueba.
  ids.forEach((id) => S.deleteSong(id));
  await S.flushStorage();
  res.ok =
    res.trasladadas === 2 &&
    res.viejaQuitada &&
    res.copiaGuardada === 2 &&
    res.enIndexedDB === 2 &&
    res.recuperada === 'Traslado 1 (cambiada)' &&
    res.pendientesBorradas;
  return res;
}
