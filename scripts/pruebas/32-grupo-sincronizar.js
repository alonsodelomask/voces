async () => {
  // Sincronización de las canciones del grupo (src/cloud/groupSync.ts) con una nube de mentira en memoria
  // (window.__vocesNube, solo en desarrollo). Comprueba que:
  // a) Solo, Silencio y el volumen son de este dispositivo: no se suben (lo subido va con la mezcla normal, que la
  //    app 1.0 necesita) y no se pierden al traer la versión del grupo; tocarlos no impide traerla.
  // b) Si otra persona cambia la canción mientras la tuya espera para subir (o aún para guardarse), no se pisa nada: se
  //    sube solo sobre la versión que tenías; la tuya queda como «(mis cambios)» y tienes la del grupo.
  // c) Lo que esperaba su guardado (0,8 s) se guarda al abrir la biblioteca, en `pagehide` y al pasar a segundo plano.
  // d) Una subida fallida se queda pendiente (indicador en rojo) y se reintenta al volver la conexión.
  // e) Al abrir una copia vieja de una canción del grupo, se trae la versión nueva.
  // f) Al cambiar de canción sin pasar por la biblioteca («Abrir la mía»), lo que esperaba su guardado se guarda antes.
  // g) Cambiar desde la biblioteca el nombre de una canción del grupo que no está abierta también se sube.
  // h) Lo pendiente de una cuenta no se sube con otra que entre en el mismo dispositivo (ni se desliga del grupo).
  // Grupo, personas y canciones inventados.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const espera = async (cond, ms = 5000) => {
    for (let i = 0; i < ms / 50 && !(await cond()); i++) await wait(50);
    return !!(await cond());
  };
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const S = V.storage;
  const { makeSong, makeVoice } = await import('/src/model.ts');
  const clon = (x) => JSON.parse(JSON.stringify(x));
  const res = {};
  const G = 'grupo-prueba-sync';
  const ANA = 'u-ana';
  const BRUNO = 'u-bruno';
  let reloj = Date.parse('2026-11-21T10:00:00Z');
  const sello = () => new Date((reloj += 1000)).toISOString();

  // Canción con Soprano y Tenor (ids de voz fijos, para encontrarlas).
  const cancion = (id, title) => {
    const s = makeSong({ title, bpm: 90, beatsPerBar: 4, voices: [makeVoice('Soprano', 0), makeVoice('Tenor', 1)] });
    s.id = id;
    s.voices[0].id = `${id}-sop`;
    s.voices[1].id = `${id}-ten`;
    s.voices[0].notes = [{ midi: 64, start: 0, dur: 1 }];
    s.voices[1].notes = [{ midi: 57, start: 0, dur: 1 }];
    return s;
  };

  // El servidor de mentira: guarda la canción y su versión (updated_at), como la tabla `songs`.
  const servidor = {};
  const subidas = [];
  let fallar = 0;
  let aviso = null;
  let quien = ANA;
  const enServidor = (s, por) => (servidor[s.id] = { data: { ...clon(s), groupId: undefined, remoteUpdatedAt: undefined }, updated_at: sello(), updated_by: por });
  const cambiaBruno = (id, fn) => {
    const r = servidor[id];
    const data = clon(r.data);
    fn(data);
    servidor[id] = { data, updated_at: sello(), updated_by: BRUNO };
    aviso?.({ type: 'UPDATE', id, updated_by: BRUNO, updated_at: servidor[id].updated_at, deleted_at: null });
  };
  window.__vocesNube = {
    cloudEnabled: true,
    user: () => ({ id: quien, email: `${quien}@ejemplo.invalid` }),
    myGroups: async () => [{ id: G, name: 'Cuarteto de prueba', invite_code: 'XXXX', max_members: 30, role: 'owner' }],
    groupSongs: async () => [],
    groupTrash: async () => [],
    groupSetlists: async () => [],
    members: async () => [],
    watchGroup: (g, cb) => {
      aviso = cb;
      return () => {};
    },
    songStamp: async (id) => (servidor[id] ? { updated_at: servidor[id].updated_at, deleted_at: null } : null),
    fetchSong: async (id) => ({ ...clon(servidor[id].data), id, groupId: G, remoteUpdatedAt: servidor[id].updated_at }),
    pushSong: async (s) => {
      subidas.push(clon(s));
      if (fallar > 0) {
        fallar--;
        throw new Error('Failed to fetch');
      }
      const r = servidor[s.id];
      // Como la de verdad: solo si sigue siendo la versión que tenía este dispositivo.
      if (r && s.remoteUpdatedAt && r.updated_at !== s.remoteUpdatedAt) throw Object.assign(new Error('Otra versión'), { name: 'GroupConflict' });
      return enServidor(s, ANA).updated_at;
    },
  };

  const guardadaAqui = (s) => S.saveSong({ ...clon(s), groupId: G, remoteUpdatedAt: servidor[s.id].updated_at });
  const lib = document.querySelector('#dlg-library');
  const abrir = async (id) => {
    document.querySelector('#btn-library').click();
    await espera(() => lib.open && lib.querySelector(`.bib-row[data-id="${id}"] .bib-open`));
    lib.querySelector(`.bib-row[data-id="${id}"] .bib-open`).click();
    await espera(() => V.song.id === id);
    await wait(300);
  };
  const fila = (nombre) => [...document.querySelectorAll('#voice-list .voice')].find((r) => r.querySelector('.vname').value === nombre);
  const voz = (s, nombre) => s.voices.find((v) => v.name === nombre);
  const titulo = async (t) => {
    const el = document.querySelector('#song-title');
    el.value = t;
    el.dispatchEvent(new Event('change'));
  };
  const toast = () => document.querySelector('#toast')?.textContent ?? '';
  const badge = () => document.querySelector('#sync').dataset.state;
  const neutra = (v) => v.muted === false && v.solo === false && v.hidden === false && v.volume === 0.8;
  const creadas = ['gs-a', 'gs-b'];

  try {
    // ---- a) La mezcla de ensayo es de este dispositivo ----
    const A = cancion('gs-a', 'Sincro: Canción A');
    enServidor(A, BRUNO);
    guardadaAqui(A);
    await abrir('gs-a');
    fila('Tenor').querySelector('[data-k=s]').click();
    fila('Soprano').querySelector('[data-k=m]').click();
    const vol = fila('Tenor').querySelector('input[type=range]');
    vol.value = '0.35';
    vol.dispatchEvent(new Event('input'));
    await wait(2000);
    res.mezclaNoSube = subidas.length === 0;
    const g = S.getSong('gs-a');
    res.mezclaGuardadaAqui = voz(g, 'Tenor').solo && voz(g, 'Soprano').muted && voz(g, 'Tenor').volume === 0.35;

    // Bruno añade una nota: llega aunque Ana tenga el Solo puesto, y el Solo de Ana sigue.
    cambiaBruno('gs-a', (d) => d.voices[0].notes.push({ midi: 67, start: 1, dur: 1 }));
    await espera(() => voz(V.song, 'Soprano').notes.length === 2);
    res.llegaLoDeBruno = voz(V.song, 'Soprano').notes.length === 2;
    res.mezclaSeQueda = voz(V.song, 'Tenor').solo && voz(V.song, 'Soprano').muted && voz(V.song, 'Tenor').volume === 0.35;

    // Un cambio de verdad (el título) sí se sube, con la mezcla normal.
    await titulo('Sincro: Canción A de Ana');
    await espera(() => subidas.length >= 1);
    const sub = subidas[subidas.length - 1];
    res.subeNeutra = sub?.title === 'Sincro: Canción A de Ana' && sub.voices.every(neutra) && servidor['gs-a'].data.voices.every(neutra);
    res.subeSobreLaDeBruno = voz(servidor['gs-a'].data, 'Soprano').notes.length === 2;
    res.aquiSigueElSolo = voz(V.song, 'Tenor').solo;

    // ---- b) Dos personas a la vez: el aviso de Bruno llega mientras lo de Ana espera para subir ----
    await espera(() => badge() === 'ok');
    const antes = subidas.length;
    await titulo('Sincro: Título de Ana');
    cambiaBruno('gs-a', (d) => {
      d.title = 'Sincro: Título de Bruno';
      d.voices[1].notes[0].midi = 55;
    });
    await espera(() => /mis cambios/.test(toast()));
    await wait(200);
    const copia = S.loadSongs().find((s) => s.title === 'Sincro: Título de Ana (mis cambios)');
    if (copia) creadas.push(copia.id);
    res.noPisaAlGrupo = servidor['gs-a'].data.title === 'Sincro: Título de Bruno' && subidas.length > antes;
    res.tieneLaDeBruno = V.song.title === 'Sincro: Título de Bruno' && voz(V.song, 'Tenor').notes[0].midi === 55;
    res.laSuyaAparte = !!copia && !copia.groupId && voz(copia, 'Tenor').notes[0].midi === 57;
    res.avisoClaro = /a la vez que tú/.test(toast()) && /mis cambios/.test(toast());
    res.mezclaTrasChocar = voz(V.song, 'Tenor').solo;
    res.nadaPendiente = await espera(() => !localStorage.getItem('voces.grupo.pendientes') && badge() === 'ok');

    // b2) Igual, pero el aviso de Bruno llega cuando el cambio de Ana aún esperaba su guardado (0,8 s): no se pierde.
    const tempo = document.querySelector('#ed-bpm');
    tempo.value = '100';
    tempo.dispatchEvent(new Event('change'));
    cambiaBruno('gs-a', (d) => (d.title = 'Sincro: Bruno otra vez'));
    const copia2 = () => S.loadSongs().find((s) => s.title === 'Sincro: Título de Bruno (mis cambios)');
    await espera(() => copia2() && V.song.title === 'Sincro: Bruno otra vez');
    if (copia2()) creadas.push(copia2().id);
    // El botón «Abrir la mía» del aviso (se guarda ya: otro aviso cambiaría el texto).
    const abrirLaMia = [...document.querySelectorAll('#toast .toast-action')].find((b) => b.textContent === 'Abrir la mía');
    res.sinGuardarNoSePierde = copia2()?.bpm === 100 && V.song.bpm === 90 && servidor['gs-a'].data.bpm === 90;
    res.nadaPendiente2 = await espera(() => !localStorage.getItem('voces.grupo.pendientes') && badge() === 'ok');

    // ---- f) Cambio de canción directo (sin la biblioteca) con un cambio que aún esperaba su guardado ----
    tempo.value = '105';
    tempo.dispatchEvent(new Event('change'));
    abrirLaMia?.click();
    res.guardaAlAbrirLaMia = !!abrirLaMia && V.song.id === copia2()?.id && S.getSong('gs-a').bpm === 105;
    res.subeTrasCambiarDirecto = await espera(() => servidor['gs-a'].data.bpm === 105 && !localStorage.getItem('voces.grupo.pendientes'));
    await abrir('gs-a');

    // ---- d) Subida fallida: pendiente y reintento al volver la conexión ----
    fallar = 1;
    await titulo('Sincro: Con reintento');
    await espera(() => badge() === 'error', 4000);
    res.pendienteVisible = badge() === 'error' && servidor['gs-a'].data.title !== 'Sincro: Con reintento' && /intentar/.test(document.querySelector('#sync').title);
    res.pendienteGuardado = (localStorage.getItem('voces.grupo.pendientes') ?? '').includes('gs-a');
    dispatchEvent(new Event('online'));
    await espera(() => servidor['gs-a'].data.title === 'Sincro: Con reintento' && badge() === 'ok');
    res.reintentada = servidor['gs-a'].data.title === 'Sincro: Con reintento' && badge() === 'ok';

    // ---- e) Abrir una copia vieja trae la versión nueva del grupo (con la mezcla de aquí) ----
    const B = cancion('gs-b', 'Sincro: Canción B');
    enServidor(B, BRUNO);
    B.voices[1].solo = true;
    guardadaAqui(B);
    cambiaBruno('gs-b', (d) => (d.voices[0].notes[0].midi = 72)); // Bruno la cambia sin que Ana la tenga abierta
    await abrir('gs-b');
    await espera(() => voz(V.song, 'Soprano').notes[0].midi === 72);
    res.abreLaNueva = voz(V.song, 'Soprano').notes[0].midi === 72 && voz(V.song, 'Tenor').solo;

    // ---- g) Cambiar el nombre desde la biblioteca a una del grupo que no está abierta (gs-a) ----
    document.querySelector('#btn-library').click();
    await espera(() => lib.open && lib.querySelector('.bib-row[data-id="gs-a"] [data-more]'));
    lib.querySelector('.bib-row[data-id="gs-a"] [data-more]').click();
    await wait(50);
    lib.querySelector('.bib-pop [data-a=rename]').click();
    await wait(250);
    const dn = [...document.querySelectorAll('dialog[open]')].pop();
    dn.querySelector('[name=t]').value = 'Sincro: Nombre desde la biblioteca';
    dn.querySelector('button[value=ok]').click();
    await wait(300);
    lib.close();
    res.nombreDesdeBibliotecaSube = await espera(() => servidor['gs-a'].data.title === 'Sincro: Nombre desde la biblioteca' && !localStorage.getItem('voces.grupo.pendientes'));

    // ---- h) Lo pendiente de Ana no se sube si entra otra cuenta (Carla, que no es del grupo) ----
    await titulo('Sincro: Cambio de Ana sin subir');
    await espera(() => (localStorage.getItem('voces.grupo.pendientes') ?? '').includes('gs-b'));
    quien = 'u-carla';
    const antesCarla = subidas.length;
    await wait(2500);
    res.otraCuentaNoSube =
      subidas.length === antesCarla &&
      S.getSong('gs-b').groupId === G &&
      (localStorage.getItem('voces.grupo.pendientes') ?? '').includes(ANA) &&
      badge() === 'error' &&
      /otra cuenta/.test(document.querySelector('#sync').title);
    quien = ANA;
    dispatchEvent(new Event('online'));
    res.vuelveAnaYSube = await espera(() => servidor['gs-b'].data.title === 'Sincro: Cambio de Ana sin subir' && badge() === 'ok');

    // ---- c) Guardar ya lo que esperaba su guardado ----
    const bpm = document.querySelector('#ed-bpm');
    const cambiaBpm = (n) => {
      bpm.value = String(n);
      bpm.dispatchEvent(new Event('change'));
    };
    cambiaBpm(120);
    document.querySelector('#btn-library').click(); // al abrir la biblioteca (desde ahí se cambia de canción)
    res.guardaAlAbrirBiblioteca = S.getSong('gs-b').bpm === 120;
    lib.close();
    cambiaBpm(130);
    dispatchEvent(new Event('pagehide'));
    res.guardaEnPagehide = S.getSong('gs-b').bpm === 130;
    cambiaBpm(140);
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
    res.guardaAlOcultarse = S.getSong('gs-b').bpm === 140;
    delete document.visibilityState;
    // Y al cambiar de canción enseguida.
    cambiaBpm(150);
    await abrir('gs-a');
    res.guardaAlCambiarDeCancion = S.getSong('gs-b').bpm === 150;
    await espera(() => !localStorage.getItem('voces.grupo.pendientes'));
    res.bpmEnElGrupo = servidor['gs-b'].data.bpm === 150;
  } catch (e) {
    res.error = `${e.message} · ${(e.stack ?? '').split(String.fromCharCode(10))[1]?.trim()}`;
  } finally {
    quien = ANA;
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    await wait(200);
    delete window.__vocesNube;
    for (const id of creadas) S.deleteSong(id, { silent: true });
    localStorage.removeItem('voces.grupo.pendientes');
    await S.flushStorage();
  }

  res.ok =
    res.mezclaNoSube &&
    res.mezclaGuardadaAqui &&
    res.llegaLoDeBruno &&
    res.mezclaSeQueda &&
    res.subeNeutra &&
    res.subeSobreLaDeBruno &&
    res.aquiSigueElSolo &&
    res.noPisaAlGrupo &&
    res.tieneLaDeBruno &&
    res.laSuyaAparte &&
    res.avisoClaro &&
    res.mezclaTrasChocar &&
    res.nadaPendiente &&
    res.sinGuardarNoSePierde &&
    res.nadaPendiente2 &&
    res.guardaAlAbrirLaMia &&
    res.subeTrasCambiarDirecto &&
    res.pendienteVisible &&
    res.pendienteGuardado &&
    res.reintentada &&
    res.abreLaNueva &&
    res.nombreDesdeBibliotecaSube &&
    res.otraCuentaNoSube &&
    res.vuelveAnaYSube &&
    res.guardaAlAbrirBiblioteca &&
    res.guardaEnPagehide &&
    res.guardaAlOcultarse &&
    res.guardaAlCambiarDeCancion &&
    res.bpmEnElGrupo;
  return res;
}
