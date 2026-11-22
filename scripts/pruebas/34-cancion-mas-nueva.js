async () => {
  // Una canción guardada por una versión más nueva de Vocify (su número de formato es mayor que el de esta app,
  // SONG_FORMAT en src/model.ts): aquí solo se ve. Comprueba que:
  // a) sale el aviso «Actualiza la app para editarla» y lo que cambia la canción está desactivado (el ensayo, no);
  // b) el editor no cambia notas, «Guardar» no guarda y no se avisa a la sincronización: lo guardado sigue igual,
  //    con lo que esta versión no entiende; el asistente no se abre y «Compartir con el grupo» avisa sin marcarla;
  // c) no se sube a la cuenta (las demás sí) ni al grupo, ni aunque el grupo aún no la tenga;
  // d) al abrir otra canción, todo vuelve a funcionar.
  // Nube de mentira en memoria (window.__vocesNube, solo en desarrollo). Grupo, persona y canciones inventados.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const espera = async (cond, ms = 5000) => {
    for (let i = 0; i < ms / 50 && !cond(); i++) await wait(50);
    return !!cond();
  };
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const S = V.storage;
  const { SONG_FORMAT, NEWER_FORMAT_MSG, makeSong, makeVoice } = await import('/src/model.ts');
  const cloud = await import('/src/cloud/cloud.ts');
  const clon = (x) => JSON.parse(JSON.stringify(x));
  const res = {};
  const NUEVA = 'prueba-nueva-local';
  const DEL_GRUPO = 'prueba-nueva-grupo';
  const NORMAL = 'prueba-nueva-normal';
  const G = 'grupo-prueba-nueva';
  const subidas = [];
  const aLaCuenta = [];
  window.__vocesNube = {
    cloudEnabled: true,
    user: () => ({ id: 'u-prueba-nueva', email: 'nueva@ejemplo.invalid' }),
    myGroups: async () => [{ id: G, name: 'Grupo de prueba', invite_code: 'XXXX', max_members: 30, role: 'owner' }],
    groupSongs: async () => [],
    groupTrash: async () => [],
    groupSetlists: async () => [],
    members: async () => [],
    watchGroup: () => () => {},
    songStamp: async () => null,
    fetchSong: async () => {
      throw new Error('sin red de prueba');
    },
    pushSong: async (s) => {
      subidas.push(s.id);
      return new Date().toISOString();
    },
    personalList: async () => [],
    personalFetch: async () => [],
    // Se apunta lo que se sube y se falla: así ninguna canción de la biblioteca pasa a ser de esta cuenta inventada.
    personalPut: async (owner, rows) => {
      aLaCuenta.push(...rows.map((r) => r.id));
      throw new Error('sin red de prueba');
    },
    personalMoved: async () => {},
    personalPurge: async () => {},
    personalDrop: async () => {},
    watchPersonal: () => () => {},
  };
  let avisosSync = 0;
  S.onSongStored((s) => {
    if (s.id === NUEVA || s.id === DEL_GRUPO) avisosSync++;
  });
  const visible = (sel) => {
    const el = document.querySelector(sel);
    return !!el && !el.hidden && el.offsetParent !== null;
  };
  const soloVer = () => ({
    aviso: visible('#solo-ver') && document.querySelector('#solo-ver').textContent === NEWER_FORMAT_MSG,
    transponer: document.querySelector('#ed-transpose').disabled,
    tararear: document.querySelector('#ed-hum').disabled,
    anadirVoz: document.querySelector('#add-voice').disabled,
    tempo: document.querySelector('#ed-bpm').disabled,
    titulo: document.querySelector('#song-title').readOnly,
    color: document.querySelector('#voice-list input[type=color]')?.disabled,
    quitarVoz: document.querySelector('#voice-list [data-k=x]')?.disabled,
    soloActivo: document.querySelector('#voice-list [data-k=s]')?.disabled === false,
  });
  const todoSoloVer = (x) => Object.values(x).every(Boolean);

  try {
    // a) Se abre un proyecto de una versión más nueva, con un campo que esta versión no conoce.
    const futura = makeSong({ title: 'Canción del futuro', bpm: 90, voices: [makeVoice('Melodía', 0)] });
    futura.id = NUEVA;
    futura.format = SONG_FORMAT + 1;
    futura.secciones = [{ nombre: 'Estribillo', compas: 3 }];
    futura.voices[0].notes = [{ midi: 64, start: 0, dur: 1 }, { midi: 67, start: 1, dur: 1 }];
    await V.openFile(new File([JSON.stringify(futura)], 'Canción del futuro.voces.json', { type: 'application/json' }));
    await wait(300);
    res.abierta = V.song.id === NUEVA;
    res.soloVer = soloVer();
    const guardada = S.getSong(NUEVA);
    res.guardadaTalCual = !!guardada && guardada.format === SONG_FORMAT + 1 && JSON.stringify(guardada.secciones) === JSON.stringify(futura.secciones);
    const sello = guardada?.updatedAt;

    // b) Intentos de cambiarla.
    document.querySelector('.tab[data-view=edit]').click();
    await wait(300);
    const roll = document.querySelector('#roll');
    const r = roll.getBoundingClientRect();
    const fire = (type, x, y) => roll.dispatchEvent(new PointerEvent(type, { pointerId: 9, pointerType: 'mouse', clientX: r.left + x, clientY: r.top + y, bubbles: true, button: 0 }));
    V.roll.tool = 'draw';
    const notas = () => V.song.voices.reduce((a, v) => a + v.notes.length, 0);
    const antes = notas();
    fire('pointerdown', 300, 60);
    for (let i = 1; i <= 5; i++) fire('pointermove', 300 + i * 20, 60);
    fire('pointerup', 400, 60);
    roll.dispatchEvent(new MouseEvent('dblclick', { clientX: r.left + 300, clientY: r.top + 60, bubbles: true }));
    await wait(100);
    res.editorNoCambia = notas() === antes;
    document.querySelector('#menu [data-act=save]').click();
    await wait(100);
    res.guardarAvisa = document.querySelector('#toast').textContent === NEWER_FORMAT_MSG;
    // El ensayo sí: Solo en la voz.
    document.querySelector('#voice-list [data-k=s]').click();
    res.soloFunciona = V.song.voices[0].solo === true;
    // Menú › Asistente e IA no se abre (cambiaría la canción y la pregunta a la IA gasta cupo): avisa.
    document.querySelector('#menu [data-act=assistant]').click();
    await wait(200);
    res.asistenteAvisa = !document.querySelector('.assist-dlg[open]') && document.querySelector('#toast').textContent === NEWER_FORMAT_MSG;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    // Compartirla con el grupo desde la biblioteca: avisa, no dice «compartida», no la marca como del grupo ni sube nada.
    document.querySelector('#btn-library').click();
    const filaNueva = () => document.querySelector(`#dlg-library .bib-row[data-id="${NUEVA}"]`);
    await espera(() => !!filaNueva());
    filaNueva()?.querySelector('[data-more]')?.click();
    await wait(50);
    const compartir = document.querySelector('#dlg-library .bib-pop [data-a=share]');
    compartir?.click();
    await wait(300);
    res.compartirAvisa = !!compartir && document.querySelector('#toast').textContent === NEWER_FORMAT_MSG && !V.song.groupId && !S.getSong(NUEVA)?.groupId && subidas.length === 0;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    await wait(1200);
    const despues = S.getSong(NUEVA);
    res.nadaGuardado = despues.updatedAt === sello && despues.voices[0].notes.length === 2 && despues.title === 'Canción del futuro';
    document.querySelector('.tab[data-view=viz]').click();

    // c) La cuenta: se suben las demás, esta no.
    const normal = makeSong({ title: 'Canción normal de prueba', voices: [makeVoice('Voz', 0)] });
    normal.id = NORMAL;
    S.putSynced(normal);
    await V.personalSync.syncPersonal();
    res.cuentaLasDemas = await espera(() => aLaCuenta.includes(NORMAL));
    res.cuentaEstaNo = !aLaCuenta.includes(NUEVA);

    // c) El grupo: una del grupo que aún no tiene versión allí (la app la subiría al abrirla).
    const delGrupo = clon(futura);
    delGrupo.id = DEL_GRUPO;
    delGrupo.title = 'Del futuro, en el grupo';
    delGrupo.groupId = G;
    S.putSynced(delGrupo);
    document.querySelector('#btn-library').click();
    const fila = () => document.querySelector(`#dlg-library .bib-row[data-id="${DEL_GRUPO}"] .bib-open`);
    await espera(() => !!fila());
    fila()?.click();
    await wait(2500);
    res.grupoAbierta = V.song.id === DEL_GRUPO && soloVer().aviso;
    res.grupoSinSubir = subidas.length === 0;
    res.subirFalla = await cloud.pushSong(S.getSong(DEL_GRUPO)).then(
      () => 'se ha subido',
      (e) => e.message,
    );
    res.sinAvisosALaSincronizacion = avisosSync === 0;
  } finally {
    delete window.__vocesNube;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    // d) Otra canción: todo vuelve a funcionar.
    document.querySelector('#menu [data-act=demo]').click();
    await wait(300);
    res.otraNormal = !visible('#solo-ver') && !document.querySelector('#ed-transpose').disabled && !document.querySelector('#add-voice').disabled && !V.roll.readOnly && !document.querySelector('#song-title').readOnly;
    for (const id of [NUEVA, DEL_GRUPO, NORMAL]) S.deleteSong(id, { silent: true });
  }
  res.ok =
    res.abierta && todoSoloVer(res.soloVer) && res.guardadaTalCual && res.editorNoCambia && res.guardarAvisa && res.soloFunciona &&
    res.asistenteAvisa && res.compartirAvisa &&
    res.nadaGuardado && res.cuentaLasDemas && res.cuentaEstaNo && res.grupoAbierta && res.grupoSinSubir &&
    res.subirFalla === NEWER_FORMAT_MSG && res.sinAvisosALaSincronizacion && res.otraNormal;
  return res;
}
