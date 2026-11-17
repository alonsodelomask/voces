async () => {
  // Canciones de la cuenta en todos los dispositivos, con una nube de mentira en memoria (window.__vocesNube, solo en
  // desarrollo) que hace de «la cuenta» y de «el otro dispositivo»: sube lo de aquí (sin la grabación), trae lo de la
  // cuenta, gana lo más reciente aunque el otro reloj vaya adelantado, la papelera y el borrado viajan (con lápida), lo
  // pasado a un grupo en otro dispositivo se quita de aquí (o va a una copia si aquí se cambió después, y conserva la
  // grabación) y lo de otra cuenta no se sube. Canciones y cuentas inventadas.
  const V = window.voces;
  const S = V.storage;
  const P = V.personalSync;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const res = {};
  const YO = 'u-cuenta-prueba';
  const filas = new Map();
  const base = JSON.parse(JSON.stringify(V.song));
  for (const k of ['groupId', 'remoteUpdatedAt', 'audioTrack', 'deletedAt', 'ownerId']) delete base[k];
  const cancion = (id, title, extra = {}) => ({ ...JSON.parse(JSON.stringify(base)), id, title, ...extra });
  const ids = ['cc-aqui', 'cc-cuenta', 'cc-otra', 'cc-audio', 'cc-reloj', 'cc-copia', 'cc-lapida', 'cc-grab', 'cc-lapida-grab'];
  const yo = (o) => {
    if (o !== YO) throw new Error('cuenta equivocada');
  };
  window.__vocesNube = {
    cloudEnabled: true,
    user: () => ({ id: YO, email: 'prueba@ejemplo.invalid' }),
    personalList: async (o) => (yo(o), [...filas.values()].map(({ data, ...r }) => ({ ...r }))),
    personalFetch: async (o, want) => (yo(o), [...filas.values()].filter((r) => want.includes(r.id) && r.data).map((r) => ({ id: r.id, data: JSON.parse(JSON.stringify(r.data)) }))),
    personalPut: async (o, rows) => (yo(o), rows.forEach((r) => filas.set(r.id, { ...JSON.parse(JSON.stringify(r)), moved_to_group: null, purged: false }))),
    personalMoved: async (o, ms) => (yo(o), ms.forEach((m) => filas.set(m.id, { ...filas.get(m.id), data: null, moved_to_group: m.group, purged: false, song_updated_ms: m.stamp, song_deleted_ms: null }))),
    personalPurge: async (o, del, stamp) => (yo(o), del.forEach((id) => filas.set(id, { ...filas.get(id), data: null, purged: true, moved_to_group: null, song_updated_ms: stamp, song_deleted_ms: null }))),
    personalDrop: async (o, del) => (yo(o), del.forEach((id) => filas.delete(id))),
    watchPersonal: () => () => {},
    fetchSong: async (id) => cancion(id, 'Versión del grupo', { groupId: 'g-prueba', remoteUpdatedAt: '2026-11-17T10:00:00Z' }),
  };
  const fila = (id, title, stamp, extra = {}) => filas.set(id, { id, title, data: cancion(id, title), song_updated_ms: stamp, song_deleted_ms: null, moved_to_group: null, purged: false, ...extra });
  // Lo que haya programado al guardar puede estar en marcha: se sincroniza unas vueltas seguidas.
  const sincroniza = async () => {
    for (let i = 0; i < 4; i++) {
      await wait(350);
      await P.syncPersonal();
    }
  };
  const errores = [];
  const anota = () => P.lastSync?.errors?.length && errores.push(...P.lastSync.errors);
  const copias = () => S.peekSongs().filter((s) => / \(copia\)$/.test(s.title) && ids.some((i) => s.title.startsWith(i)));
  try {
    // Aquí: una canción hecha sin cuenta, otra de otra cuenta y otra con grabación. En la cuenta: una de otro dispositivo.
    S.saveSong(cancion('cc-aqui', 'cc-aqui'));
    S.saveSong(cancion('cc-otra', 'cc-otra', { ownerId: 'u-otra-persona' }));
    S.saveSong(cancion('cc-audio', 'cc-audio', { audioTrack: { name: 'ensayo.wav', offset: 0 } }));
    fila('cc-cuenta', 'Hecha en el otro ordenador', Date.now() - 60_000);

    // 1) Primera vez: se sube lo de aquí (menos lo de otra cuenta y sin la grabación) y se trae lo de la cuenta.
    await sincroniza();
    anota();
    res.subidas = [...filas.keys()].filter((id) => ids.includes(id)).sort().join(',');
    res.sinGrabacion = !!filas.get('cc-audio') && !('audioTrack' in filas.get('cc-audio').data);
    res.grabacionSeQueda = !!S.getSong('cc-audio')?.audioTrack;
    res.traida = S.getSong('cc-cuenta')?.title;
    res.conDueña = S.getSong('cc-cuenta')?.ownerId === YO && S.getSong('cc-aqui')?.ownerId === YO;
    res.otraSinTocar = S.getSong('cc-otra')?.ownerId === 'u-otra-persona' && !filas.has('cc-otra');

    // 2) Otro ordenador con el reloj 10 minutos adelantado la cambia: aquí se trae. Y si aquí se cambia justo después,
    //    gana lo de aquí (no vuelve la versión «del futuro»).
    fila('cc-reloj', 'Del reloj adelantado', Date.now() + 600_000);
    await sincroniza();
    res.reloj1 = S.getSong('cc-reloj')?.title;
    const r = S.getSong('cc-reloj');
    r.title = 'Cambiada aquí después';
    S.saveSong(r);
    await sincroniza();
    anota();
    res.reloj2 = S.getSong('cc-reloj')?.title + ' / ' + filas.get('cc-reloj')?.data?.title;

    // 3) A la papelera aquí: en la cuenta también. Borrada del todo: en la cuenta queda una lápida sin datos.
    S.trashSong('cc-aqui');
    await sincroniza();
    res.papelera = !!filas.get('cc-aqui')?.song_deleted_ms;
    S.deleteSong('cc-aqui');
    await sincroniza();
    res.lapida = filas.get('cc-aqui')?.purged === true && filas.get('cc-aqui')?.data === null && !localStorage.getItem('voces.cuenta.borradas');

    // 4) Borrada del todo en otro ordenador: la copia de aquí (en la papelera) se borra y no se vuelve a subir.
    S.saveSong(cancion('cc-lapida', 'cc-lapida'));
    await sincroniza();
    S.trashSong('cc-lapida');
    await sincroniza();
    filas.set('cc-lapida', { ...filas.get('cc-lapida'), data: null, purged: true, song_updated_ms: Date.now() + 1000, song_deleted_ms: null });
    await sincroniza();
    res.borradaFuera = !S.getSong('cc-lapida') && filas.get('cc-lapida')?.purged === true;
    //    Con grabación (que solo está aquí) no se borra: va a la papelera de este dispositivo y no vuelve a la cuenta.
    S.saveSong(cancion('cc-lapida-grab', 'cc-lapida-grab', { audioTrack: { name: 'solo-aqui.wav', offset: 0 } }));
    await sincroniza();
    filas.set('cc-lapida-grab', { ...filas.get('cc-lapida-grab'), data: null, purged: true, song_updated_ms: Date.now() + 1000, song_deleted_ms: null });
    await sincroniza();
    const lg = S.getSong('cc-lapida-grab');
    res.grabacionEnPapelera = !!lg?.deletedAt && lg?.audioTrack?.name === 'solo-aqui.wav' && filas.get('cc-lapida-grab')?.purged === true;

    // 5) Pasada a un grupo en otro ordenador, sin cambios aquí: se quita la copia de aquí (está en el grupo).
    const g = filas.get('cc-cuenta');
    filas.set('cc-cuenta', { ...g, data: null, moved_to_group: 'g-prueba', song_updated_ms: Date.now() + 5000 });
    await sincroniza();
    res.pasadaAGrupo = !S.getSong('cc-cuenta');

    // 6) Pasada a un grupo fuera, pero aquí se cambió después: los cambios van a una copia nueva (no se pierden) y la
    //    fila de la cuenta sigue marcada como del grupo.
    S.saveSong(cancion('cc-copia', 'cc-copia'));
    await sincroniza();
    filas.set('cc-copia', { ...filas.get('cc-copia'), data: null, moved_to_group: 'g-prueba', song_updated_ms: Date.now() - 1000 });
    const cc = S.getSong('cc-copia');
    cc.title = 'cc-copia';
    S.saveSong(cc); // cambio aquí, posterior a la marca de «pasada al grupo»
    await sincroniza();
    anota();
    res.copia = !S.getSong('cc-copia') && copias().length === 1 && filas.get('cc-copia')?.moved_to_group === 'g-prueba' && filas.has(copias()[0]?.id);

    // 7) Pasada a un grupo fuera y aquí con grabación: no se borra; se cambia por la del grupo conservando la grabación.
    S.saveSong(cancion('cc-grab', 'cc-grab', { audioTrack: { name: 'toma.wav', offset: 0 } }));
    await sincroniza();
    filas.set('cc-grab', { ...filas.get('cc-grab'), data: null, moved_to_group: 'g-prueba', song_updated_ms: Date.now() + 5000 });
    await sincroniza();
    const gr = S.getSong('cc-grab');
    res.grabacionConservada = gr?.groupId === 'g-prueba' && gr?.audioTrack?.name === 'toma.wav' && !gr?.ownerId;

    // 8) Aquí se comparte una con un grupo: en la cuenta queda marcada como pasada al grupo.
    const a = S.getSong('cc-audio');
    a.groupId = 'g-prueba';
    S.saveSong(a);
    await sincroniza();
    anota();
    res.marcada = filas.get('cc-audio')?.moved_to_group === 'g-prueba' && filas.get('cc-audio')?.data === null;
  } catch (e) {
    res.excepcion = `${e.message} · ${(e.stack ?? '').split(String.fromCharCode(10))[1]?.trim()}`;
  } finally {
    delete window.__vocesNube;
    for (const s of copias()) S.deleteSong(s.id, { silent: true });
    for (const id of ids) S.deleteSong(id, { silent: true });
    localStorage.removeItem('voces.cuenta.borradas');
  }
  res.errores = errores.join(' | ');
  res.ok =
    !res.errores && !res.excepcion &&
    res.subidas === 'cc-aqui,cc-audio,cc-cuenta' &&
    res.sinGrabacion && res.grabacionSeQueda &&
    res.traida === 'Hecha en el otro ordenador' && res.conDueña && res.otraSinTocar &&
    res.reloj1 === 'Del reloj adelantado' && res.reloj2 === 'Cambiada aquí después / Cambiada aquí después' &&
    res.papelera && res.lapida && res.borradaFuera && res.grabacionEnPapelera &&
    res.pasadaAGrupo && res.copia && res.grabacionConservada &&
    res.marcada;
  return res;
}
