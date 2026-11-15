async () => {
  // La biblioteca con un grupo, sobre una nube de mentira en memoria (window.__vocesNube, solo en desarrollo):
  // canciones del grupo sin descargar, papelera del grupo (recuperar), historial de versiones (abrir como copia y volver
  // a una), «Quitar del grupo» a su papelera, repertorios compartidos (los del grupo llegan, compartir uno sube, y uno
  // que borra otra persona desaparece). Grupo, personas y canciones inventados.
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const V = window.voces;
  const S = V.storage;
  const R = await import('/src/library/repertorios.ts');
  const { makeSong, makeVoice } = await import('/src/model.ts');
  const espera = async (cond, ms = 4000) => {
    for (let i = 0; i < ms / 50 && !(await cond()); i++) await wait(50);
  };
  const res = {};
  const G = 'grupo-de-prueba';
  const ANA = 'u-ana';
  const BRUNO = 'u-bruno';
  const ahora = Date.now();
  const iso = (t) => new Date(t).toISOString();
  const cancion = (id, title, midi) => {
    const v = makeVoice('Soprano', 0);
    v.notes = [{ midi, start: 0, dur: 1 }];
    const s = makeSong({ title, bpm: 90, beatsPerBar: 4, voices: [v, makeVoice('Bajo', 1)] });
    s.id = id;
    return s;
  };

  // La nube de mentira.
  const llamadas = [];
  const estado = {
    canciones: { 'gs-1': { ...cancion('gs-1', 'Grupo: Canción común', 64), groupId: G }, 'gs-2': { ...cancion('gs-2', 'Grupo: Quitada', 65), groupId: G } },
    papelera: [{ id: 'gs-2', title: 'Grupo: Quitada', deleted_at: iso(ahora - 2 * 86_400_000), deleted_by: BRUNO }],
    repertorios: [{ id: 'rep-grupo', group_id: G, name: 'Concierto del grupo', song_ids: ['gs-1'], updated_at: iso(ahora) }],
    versiones: [
      { id: 7, title: 'Grupo: Canción común', saved_by: BRUNO, saved_at: iso(ahora - 3_600_000), data: cancion('gs-1', 'Grupo: Canción común', 60) },
      { id: 6, title: 'Grupo: Canción común (vieja)', saved_by: ANA, saved_at: iso(ahora - 86_400_000), data: cancion('gs-1', 'Grupo: Canción común (vieja)', 59) },
    ],
  };
  window.__vocesNube = {
    cloudEnabled: true,
    user: () => ({ id: ANA, email: 'ana@ejemplo.invalid' }),
    myGroups: async () => [{ id: G, name: 'Txapela de prueba', invite_code: 'XXXX', max_members: 30, role: 'owner' }],
    groupSongs: async () =>
      Object.values(estado.canciones)
        .filter((s) => !estado.papelera.some((t) => t.id === s.id))
        .map((s) => ({ id: s.id, title: s.title, updated_at: iso(ahora - 60_000), updated_by: BRUNO, group_id: G })),
    groupTrash: async () => estado.papelera.map((t) => ({ ...t, group_id: G })),
    groupSetlists: async () => estado.repertorios.map((r) => ({ ...r })),
    members: async () => [
      { user_id: ANA, role: 'owner', display_name: 'Ana' },
      { user_id: BRUNO, role: 'member', display_name: 'Bruno' },
    ],
    fetchSong: async (id) => {
      llamadas.push(['fetchSong', id]);
      return { ...JSON.parse(JSON.stringify(estado.canciones[id])), groupId: G, remoteUpdatedAt: iso(Date.now()) };
    },
    restoreRemoteSong: async (id) => {
      llamadas.push(['restoreRemoteSong', id]);
      estado.papelera = estado.papelera.filter((t) => t.id !== id);
      return iso(Date.now());
    },
    trashRemoteSong: async (id) => {
      llamadas.push(['trashRemoteSong', id]);
      estado.papelera.push({ id, title: estado.canciones[id].title, deleted_at: iso(Date.now()), deleted_by: ANA });
    },
    songVersions: async (id) => estado.versiones.map(({ data, ...v }) => v),
    fetchVersion: async (id) => {
      const v = estado.versiones.find((x) => x.id === id);
      return { title: v.title, data: JSON.parse(JSON.stringify(v.data)) };
    },
    restoreVersion: async (id) => {
      llamadas.push(['restoreVersion', id]);
      const v = estado.versiones.find((x) => x.id === id);
      estado.canciones['gs-1'] = { ...JSON.parse(JSON.stringify(v.data)), groupId: G };
      return iso(Date.now());
    },
    pushSetlist: async (r) => {
      llamadas.push(['pushSetlist', r.name, r.songIds.join(',')]);
      estado.repertorios = [...estado.repertorios.filter((x) => x.id !== r.id), { id: r.id, group_id: r.groupId, name: r.name, song_ids: r.songIds, updated_at: iso(Date.now()) }];
    },
    deleteSetlist: async (id) => {
      llamadas.push(['deleteSetlist', id]);
      estado.repertorios = estado.repertorios.filter((x) => x.id !== id);
    },
    pushSong: async () => iso(Date.now()),
  };

  const lib = document.querySelector('#dlg-library');
  const filas = () => [...lib.querySelectorAll('#library-list .bib-row')];
  const fila = (t) => filas().find((f) => f.querySelector('b').textContent.includes(t));
  const abrirBiblioteca = async () => {
    document.querySelector('#btn-library').click();
    await espera(() => lib.open && fila('Grupo: Canción común'));
    await wait(100);
  };
  const menu = async (f, accion) => {
    f.querySelector('[data-more]').click();
    await wait(50);
    const b = lib.querySelector(`.bib-pop [data-a=${accion}]`);
    if (!b) return false;
    b.click();
    await wait(250);
    return true;
  };
  const aceptar = async () => {
    await wait(100);
    [...document.querySelectorAll('dialog[open]')].pop().querySelector('button[value=ok]').click();
    await wait(300);
  };
  const buscar = async (q) => {
    const s = lib.querySelector('#lib-search');
    s.value = q;
    s.dispatchEvent(new Event('input'));
    await wait(80);
  };

  try {
    // 1) La del grupo sale sin descargar, con el grupo; el repertorio del grupo, con ☁ y su canción.
    await abrirBiblioteca();
    await buscar('grupo:');
    const remota = fila('Grupo: Canción común');
    res.remota = remota?.classList.contains('remote') && /Txapela de prueba/.test(remota.querySelector('.bib-where').textContent);
    res.repDelGrupo = [...lib.querySelectorAll('.bib-reps .bib-sec')].map((b) => b.textContent.replace(/\s+/g, ' ').trim()).find((t) => t.includes('Concierto del grupo'));

    // 2) Papelera del grupo: quién y cuándo; recuperarla la trae al grupo y al dispositivo.
    lib.querySelector('[data-sec=trash]').click();
    await wait(100);
    const quitada = fila('Grupo: Quitada');
    res.papeleraGrupo = quitada?.querySelector('.bib-when').textContent;
    await menu(quitada, 'grestore');
    await espera(() => S.getSong('gs-2'));
    res.recuperada = llamadas.some((l) => l[0] === 'restoreRemoteSong' && l[1] === 'gs-2') && S.getSong('gs-2')?.groupId === G;

    // 3) Abrir la del grupo la descarga.
    lib.querySelector('[data-sec=all]').click();
    await wait(100);
    await buscar('grupo:');
    fila('Grupo: Canción común').querySelector('.bib-open').click();
    await espera(() => V.song.id === 'gs-1');
    res.descargada = V.song.id === 'gs-1' && !!S.getSong('gs-1');

    // 4) Historial: abrir una versión como copia (no toca la del grupo).
    await abrirBiblioteca();
    await buscar('grupo:');
    await menu(fila('Grupo: Canción común'), 'history');
    await espera(() => document.querySelector('dialog.bib-history[open]'));
    const h = document.querySelector('dialog.bib-history[open]');
    res.versiones = h.querySelectorAll('.bib-version').length;
    res.porQuien = /Bruno/.test(h.querySelector('.bib-version').textContent);
    h.querySelector('[data-v-copy="6"]').click();
    await espera(() => /versión del/.test(V.song.title));
    res.copia = /^Grupo: Canción común \(vieja\) \(versión del/.test(V.song.title) && !V.song.groupId && V.song.voices[0].notes[0].midi === 59;

    // 5) Volver a una versión: para todo el grupo, y la del dispositivo queda como la elegida.
    await abrirBiblioteca();
    await buscar('grupo:');
    await menu(lib.querySelector('.bib-row[data-id="gs-1"]'), 'history');
    await espera(() => document.querySelector('dialog.bib-history[open]'));
    document.querySelector('dialog.bib-history[open] [data-v-restore="7"]').click();
    await aceptar();
    await espera(() => llamadas.some((l) => l[0] === 'restoreVersion'));
    await wait(200);
    res.vuelta = llamadas.some((l) => l[0] === 'restoreVersion' && l[1] === 7) && S.getSong('gs-1')?.voices[0].notes[0].midi === 60;
    document.querySelectorAll('dialog.bib-history[open]').forEach((d) => d.close());

    // 6) «Quitar del grupo» la manda a la papelera del grupo (no la borra).
    await abrirBiblioteca();
    await buscar('grupo:');
    await menu(lib.querySelector('.bib-row[data-id="gs-2"]'), 'unshare');
    await aceptar();
    res.quitada = llamadas.some((l) => l[0] === 'trashRemoteSong' && l[1] === 'gs-2') && !S.getSong('gs-2')?.groupId;

    // 7) Compartir un repertorio de este dispositivo: se sube con sus canciones.
    const local = cancion('local-1', 'Grupo: solo mía', 67);
    S.saveSong(local);
    const rep = R.createRepertorio('Ensayo de Ana', ['gs-1', 'local-1']);
    lib.close();
    await abrirBiblioteca();
    lib.querySelector(`[data-rep-more="${rep.id}"]`).click();
    await wait(50);
    lib.querySelector('.bib-pop [data-ra=share]').click();
    await espera(() => llamadas.some((l) => l[0] === 'pushSetlist'));
    await wait(100);
    res.compartido = llamadas.find((l) => l[0] === 'pushSetlist')?.slice(1).join('|');
    res.marcado = R.loadRepertorios().find((r) => r.id === rep.id)?.groupId === G;
    res.avisoFuera = /no está en el grupo/.test(document.querySelector('#toast')?.textContent ?? '');

    // 8) Un repertorio del grupo que borra otra persona desaparece al volver a abrir.
    estado.repertorios = estado.repertorios.filter((r) => r.id !== 'rep-grupo');
    lib.close();
    await abrirBiblioteca();
    await wait(200);
    res.borradoPorOtro = !R.loadRepertorios().some((r) => r.id === 'rep-grupo');
    res.sigueElMio = R.loadRepertorios().some((r) => r.id === rep.id);
    lib.close();
  } catch (e) {
    res.error = `${e.message} · ${(e.stack ?? '').split(String.fromCharCode(10))[1]?.trim()}`;
  } finally {
    delete window.__vocesNube;
  }

  res.ok =
    res.remota &&
    /☁ Concierto del grupo\s*1$/.test(res.repDelGrupo ?? '') &&
    /Quitada del grupo por Bruno/.test(res.papeleraGrupo ?? '') &&
    res.recuperada &&
    res.descargada &&
    res.versiones === 2 &&
    res.porQuien &&
    res.copia &&
    res.vuelta &&
    res.quitada &&
    res.compartido === 'Ensayo de Ana|gs-1,local-1' &&
    res.marcado &&
    res.avisoFuera &&
    res.borradoPorOtro &&
    res.sigueElMio;
  return res;
}
