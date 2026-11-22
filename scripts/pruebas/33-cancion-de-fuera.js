async () => {
  // Canciones que llegan de fuera (un .voces.json por WhatsApp, el grupo, lo guardado en el dispositivo): src/songCheck.ts.
  // a) Un color, un id, un nombre o un título con código no se ejecuta ni entra en la pantalla como HTML (tampoco si
  //    llegara sin revisar a la canción abierta: el panel de voces y el asistente lo escapan).
  // b) Un error al dibujar un fotograma no para el visualizador para siempre.
  // c) Abrir un proyecto con el id de una canción que ya está aquí (y en el grupo) no la sustituye: entra como copia, y
  //    la tuya y la del grupo no cambian. Si el archivo es igual que la tuya, se abre la tuya. Uno que no está aquí se
  //    guarda con la fecha del archivo (no con la de ahora), para que no gane a una versión más nueva de la cuenta.
  // d) (tras recargar) Una canción rota guardada en el dispositivo, que es la última abierta, se arregla al arrancar y
  //    la app arranca y dibuja.
  // Canciones e ids inventados.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const espera = async (cond, ms = 4000) => {
    for (let i = 0; i < ms / 50 && !cond(); i++) await wait(50);
    return !!cond();
  };
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const S = V.storage;
  const clon = (x) => JSON.parse(JSON.stringify(x));
  const ROTA = 'prueba-fuera-rota';
  const GUARDADO = 'prueba.fuera.resultado';
  const abrir = (obj, nombre) => V.openFile(new File([JSON.stringify(obj)], nombre, { type: 'application/json' }));
  const aviso = () => document.querySelector('#toast').textContent;
  /** Cuenta los fotogramas que se dibujan durante `ms`. */
  const fotogramas = async (ms) => {
    const orig = V.viz.render;
    let n = 0;
    V.viz.render = function (...a) {
      n++;
      return orig.apply(this, a);
    };
    await wait(ms);
    V.viz.render = orig;
    return n;
  };

  if (window.__vuelta === 1) {
    // d) La app ha arrancado con la canción rota como última abierta.
    const res = JSON.parse(localStorage.getItem(GUARDADO) ?? '{}');
    localStorage.removeItem(GUARDADO);
    document.querySelectorAll('dialog[open]').forEach((d) => d.close());
    document.querySelector('.tab[data-view=viz]').click();
    const s = V.song;
    const notas = s.voices.flatMap((v) => v.notes);
    res.rotaArreglada = {
      abierta: s.id === ROTA,
      voces: s.voices.length,
      notas: notas.length,
      finitas: notas.every((n) => Number.isFinite(n.start) && Number.isFinite(n.dur) && n.dur > 0 && n.midi >= 0 && n.midi <= 127),
      compas: s.beatsPerBar,
      tempo: s.bpm,
      acordes: Array.isArray(s.chords),
    };
    res.rotaDibuja = (await fotogramas(500)) > 3;
    S.deleteSong(ROTA, { silent: true });
    await S.flushStorage();
    document.querySelector('#menu [data-act=demo]').click();
    await wait(200);
    const r = res.rotaArreglada;
    res.ok =
      res.xssNoSeEjecuta && res.xssColorLimpio && res.xssSinHtml && res.xssEscapado && res.asistenteEscapa &&
      res.fotogramaRoto && res.copia && res.laTuyaIntacta && res.nadaAlGrupo && res.igualAbreLaTuya &&
      res.viejaConSuFecha && res.futuraSinFuturo &&
      r.abierta && r.voces === 1 && r.notas === 1 && r.finitas && r.compas === 4 && r.tempo === 100 && r.acordes && res.rotaDibuja;
    return res;
  }

  const res = {};
  // a) Código en los campos de una canción.
  window.__xss = 0;
  const codigo = 'x" autofocus onfocus="window.__xss=1" data-a="';
  const img = '<img src="x-prueba" onerror="window.__xss=1">';
  const malvada = {
    id: 'prueba-fuera-xss',
    title: `${img}Malvada`,
    bpm: 90,
    beatsPerBar: 4,
    keyFifths: 0,
    voices: [{ id: `${codigo}${img}`, name: img, color: `#fff${codigo}${img}`, notes: [{ midi: 60, start: 0, dur: 1, name: img, lyric: img }], muted: false, solo: false, hidden: false, volume: 0.8 }],
    chords: [],
    chordsAuto: true,
    createdAt: 1,
    updatedAt: 1,
  };
  await abrir(malvada, 'malvada.voces.json');
  await wait(300);
  document.querySelector('.tab[data-view=edit]').click();
  await wait(100);
  document.querySelector('.tab[data-view=viz]').click();
  await wait(100);
  const v0 = V.song.voices[0];
  res.xssColorLimpio = /^#[0-9a-f]{6}$/i.test(v0.color) && /^[A-Za-z0-9_.:-]+$/.test(v0.id) && !('name' in v0.notes[0]);
  // Segunda barrera: aunque el color y el id llegaran sin revisar a la canción abierta, el panel no los mete como HTML.
  v0.color = `#fff${codigo}${img}`;
  v0.id = `${codigo}${img}`;
  document.querySelector('.tab[data-view=edit]').click();
  await wait(100);
  document.querySelector('#ed-assist').click();
  await wait(300);
  const opcion = document.querySelector('#as-ch-mel option');
  res.asistenteEscapa = !!opcion && opcion.value === v0.id;
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.querySelector('.tab[data-view=viz]').click();
  await wait(300);
  res.xssSinHtml = !document.querySelector('img[src="x-prueba"]') && !document.querySelector('[data-a]');
  res.xssEscapado = document.querySelector('#voice-list input[type=color]')?.disabled === false && document.querySelector('#voice-list .vname').value === img;
  res.xssNoSeEjecuta = window.__xss === 0;
  // La de la memoria se deja como estaba (no se guarda) y se quita la guardada.
  V.song.voices[0].id = 'v-limpia';
  S.deleteSong('prueba-fuera-xss', { silent: true });

  // b) Un fotograma que falla no para el dibujo.
  document.querySelector('#menu [data-act=demo]').click();
  await wait(200);
  {
    const orig = V.viz.render;
    let fallos = 0;
    let dibujos = 0;
    V.viz.render = function (...a) {
      if (fallos < 5) {
        fallos++;
        throw new Error('fotograma roto de prueba');
      }
      dibujos++;
      return orig.apply(this, a);
    };
    await wait(600);
    V.viz.render = orig;
    res.fotogramaRoto = fallos === 5 && dibujos > 3;
  }

  // c) Un proyecto con el id de una canción que ya está aquí, y en el grupo.
  const DUP = 'prueba-fuera-dup';
  const original = {
    id: DUP,
    title: 'Dúo de prueba',
    bpm: 90,
    beatsPerBar: 4,
    keyFifths: 0,
    voices: [{ id: 'dup-v1', name: 'Voz 1', color: '#ff2d6f', notes: [{ midi: 64, start: 0, dur: 1 }], muted: false, solo: false, hidden: false, volume: 0.8 }],
    chords: [],
    chordsAuto: true,
    createdAt: 1,
    updatedAt: 1,
    groupId: 'grupo-prueba-fuera',
    remoteUpdatedAt: '2026-11-20T10:00:00.000000+00:00',
  };
  S.putSynced(clon(original));
  const cuantas = S.loadSongs().length;
  const vieja = clon(original);
  vieja.voices[0].notes[0].midi = 55;
  vieja.remoteUpdatedAt = '2026-10-01T10:00:00.000000+00:00';
  await abrir(vieja, 'Dúo de prueba.voces.json');
  await wait(300);
  const copia = V.song;
  res.avisoCopia = aviso();
  res.copia = copia.id !== DUP && copia.title === 'Dúo de prueba (copia)' && !copia.groupId && !copia.remoteUpdatedAt && copia.voices[0].notes[0].midi === 55 && /como copia/.test(res.avisoCopia);
  const aqui = S.getSong(DUP);
  res.laTuyaIntacta = aqui.voices[0].notes[0].midi === 64 && aqui.groupId === 'grupo-prueba-fuera' && aqui.remoteUpdatedAt === original.remoteUpdatedAt && S.loadSongs().length === cuantas + 1;
  res.nadaAlGrupo = !(localStorage.getItem('voces.grupo.pendientes') ?? '').includes(DUP);
  // El mismo archivo que la tuya: se abre la tuya, sin copias.
  await abrir(clon(S.getSong(DUP)), 'Dúo de prueba.voces.json');
  await wait(300);
  res.avisoIgual = aviso();
  res.igualAbreLaTuya = V.song.id === DUP && S.loadSongs().length === cuantas + 1 && /ya estaba en tu biblioteca/.test(res.avisoIgual);
  // Uno que no está aquí se abre con su id y se guarda con la fecha del archivo, no con la de ahora: si la cuenta
  // tiene esa canción más nueva (aún sin bajar aquí), al sincronizar gana la de la cuenta. Una fecha futura no vale.
  const VIEJA = 'prueba-fuera-vieja';
  const FECHA = Date.parse('2026-01-10T10:00:00Z');
  await abrir({ ...clon(original), id: VIEJA, title: 'Vieja de prueba', groupId: undefined, remoteUpdatedAt: undefined, updatedAt: FECHA }, 'Vieja de prueba.voces.json');
  await wait(300);
  res.viejaConSuFecha = V.song.id === VIEJA && S.getSong(VIEJA)?.updatedAt === FECHA;
  const FUTURA = 'prueba-fuera-futura';
  await abrir({ ...clon(original), id: FUTURA, title: 'Futura de prueba', groupId: undefined, remoteUpdatedAt: undefined, updatedAt: Date.now() + 365 * 864e5 }, 'Futura de prueba.voces.json');
  await wait(300);
  res.futuraSinFuturo = V.song.id === FUTURA && S.getSong(FUTURA)?.updatedAt <= Date.now();
  document.querySelector('#menu [data-act=demo]').click();
  await wait(200);
  for (const id of [DUP, copia.id, VIEJA, FUTURA]) S.deleteSong(id, { silent: true });

  // d) Una canción rota guardada en el dispositivo (como la dejaría un fallo), y es la última abierta: tras recargar.
  const rota = {
    id: ROTA,
    title: 'Rota de prueba',
    bpm: -5,
    beatsPerBar: 0,
    keyFifths: 0,
    voices: [
      { id: 'rota-v1', name: 'Rota', color: '#ff0000', notes: [{ midi: 60, start: 0, dur: 1 }, { midi: 62, start: Infinity, dur: 1 }, { midi: 1e9, start: 1, dur: 1 }, { midi: 64, start: 2, dur: NaN }], muted: false, solo: false, hidden: false, volume: 0.8 },
      null,
    ],
    chords: 'nada',
    chordsAuto: true,
    createdAt: 1,
    updatedAt: Date.now() + 60_000,
  };
  await S.flushStorage();
  await new Promise((ok, mal) => {
    const req = indexedDB.open('voces.canciones');
    req.onerror = () => mal(req.error);
    req.onsuccess = () => {
      const t = req.result.transaction('canciones', 'readwrite');
      t.objectStore('canciones').put(rota);
      t.oncomplete = () => {
        req.result.close();
        ok();
      };
      t.onerror = () => mal(t.error);
    };
  });
  localStorage.setItem('voces.last', ROTA);
  localStorage.setItem(GUARDADO, JSON.stringify(res));
  await espera(() => true);
  return { recargar: true, ...res };
}
