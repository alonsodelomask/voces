async () => {
  // Lo oído en la grabación se guarda en el dispositivo, junto a ella: al recargar la app (otro día), «Letra» pone la
  // letra donde se oye sin volver a escuchar, también en una copia hecha con «Duplicar». Se borra con la grabación, deja
  // de valer si la grabación cambia, y lo de canciones que ya no existen se limpia al abrir la app. La prueba va en tres
  // vueltas, recargando la página entre ellas (window.__vuelta). Lo que «oye» Whisper es de mentira
  // (window.__vocesLetraOida): no se descarga el modelo. La letra y la melodía son inventadas.
  const V = window.voces;
  const vuelta = window.__vuelta ?? 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const titulo = 'Letra guardada';
  const HUERFANA = 'cancion-que-ya-no-existe';
  const DATOS = 'prueba-letra-guardada';
  const T = await import('/src/audio/track.ts');
  const { saveSong } = window.voces.storage;
  const t = Array.from({ length: 13 }, (_, i) => 0.5 * i);
  const p = (texto, a, b) => ({ texto, a, b });
  const oido = () => [p('Mi', t[0] + 0.02, t[1] - 0.05), p('gato', t[1] + 0.03, t[2] + 0.15), p('escucha', t[2] + 0.2, t[5] - 0.05),
    p('la', t[5] + 0.02, t[6] - 0.05), p('canción', t[6] + 0.03, t[9] - 0.05), p('del', t[9] + 0.02, t[10] - 0.05), p('mar', t[10] + 0.03, t[12] - 0.1)];
  const letra = (v) => v?.notes.map((n) => (n.lyric ?? '·') + (n.lyricDoubt ? '?' : '')).join(' ');
  const aviso = () => document.querySelector('#toast')?.textContent;
  const espera = async (cond, ms = 3000) => {
    for (let i = 0; i < ms / 50 && !(await cond()); i++) await wait(50);
  };
  const dialogo = async () => {
    document.querySelector('#ed-lyrics').click();
    await espera(() => document.querySelector('dialog[open] [name=texto]'));
    return document.querySelector('dialog[open]');
  };
  const cierra = async (d) => {
    await espera(() => !d.isConnected);
    await wait(50);
  };
  // Lo que se ve en el diálogo de la voz «Alta» al abrirlo, y la letra que queda al pulsar «Poner la letra».
  const ponLetra = async (s, r) => {
    const va = s.voices.find((v) => v.name === 'Alta');
    V.roll.activeVoiceId = va.id;
    const d = await dialogo();
    r.manera = d.querySelector('[name=como]')?.value;
    r.texto = d.querySelector('[name=texto]').value;
    r.estado = d.querySelector('[data-oido]')?.textContent;
    r.vista = d.querySelector('[data-vista]').textContent;
    d.querySelector('button[value=ok]').click();
    await cierra(d);
    r.letra = letra(va);
    r.aviso = aviso();
  };
  // Cuántas veces se vuelve a escuchar: si se escuchara, se «oiría» otra letra.
  let escuchas = 0;
  const cuentaEscuchas = () =>
    Object.defineProperty(window, '__vocesLetraOida', {
      configurable: true,
      get() {
        escuchas++;
        return [p('Otra', 0.1, 0.4), p('letra', 0.6, 0.9)];
      },
    });
  const bienPuesta = (r) =>
    r.manera === 'oido' && r.texto === 'Mi gato escucha la canción del mar' && /^Oídas 7 palabras\.$/.test(r.estado ?? '') &&
    /^10 sílabas en 12 notas/.test(r.vista ?? '') && r.letra === 'Mi ga- to‿es- cu- cha la can- ción? · del mar ·' &&
    /^Letra puesta donde se oye: 10 sílabas en «Alta»/.test(r.aviso ?? '');

  const res = { vuelta };
  try {
    if (vuelta === 0) {
      sessionStorage.removeItem(DATOS);
      const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
      const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
      const parte = (id, notas) => `<part id="${id}">` + [0, 1, 2].map((c) =>
        `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="120"/>' : ''}` : ''}` +
        notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
      const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>${titulo}</work-title></work>
        <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Baja</part-name></score-part></part-list>
        ${parte('P1', [67, 69, 71, 72, 74, 72, 71, 69, 67, 69, 71, 72])}${parte('P2', [60, 62, 64, 65, 67, 65, 64, 62, 60, 62, 64, 65])}</score-partwise>`;
      window.__vocesLetraOida = oido();
      const input = document.querySelector('#file');
      const dt = new DataTransfer();
      dt.items.add(new File([xml], `${titulo}.musicxml`, { type: 'application/xml' }));
      input.files = dt.files;
      input.dispatchEvent(new Event('change'));
      await espera(() => V.song.title === titulo);
      const s = V.song;
      // La grabación (silencio de 8 s, con su 0 en el de la canción), guardada como la deja la mezcla.
      await T.putTrack(s.id, T.encodeWav(new Float32Array(32000 * 8), 32000));
      s.audioTrack = { name: 'Ensayo martes.wav', offset: 0, duration: 8, volume: 0.8, muted: false, solo: false };
      saveSong(s);

      // 1) Se escucha (🎧) y se cierra sin poner nada: lo oído queda guardado en el dispositivo.
      V.roll.activeVoiceId = s.voices[0].id;
      const d = await dialogo();
      d.querySelector('[data-oir]').click();
      await espera(() => /^Oídas/.test(d.querySelector('[data-oido]').textContent));
      res.oido = d.querySelector('[data-oido]').textContent;
      d.querySelector('button[value=cancel]').click();
      await cierra(d);
      let g = null;
      await espera(async () => (g = await T.getHeard(s.id)));
      res.guardado = g && { version: g.version, clave: g.clave === `${s.id}|Ensayo martes.wav|0.000|8.00`, palabras: g.palabras?.map((x) => x.texto).join(' '), tramos: g.tramos?.length };
      // Lo oído en una canción que ya no existe: se tiene que limpiar al abrir la app.
      await T.putHeard(HUERFANA, { version: 1, clave: `${HUERFANA}|x.wav|0.000|1.00`, tramos: [], palabras: [] });
      res.huerfanaAntes = (await T.heardIds()).includes(HUERFANA);
      sessionStorage.setItem(DATOS, JSON.stringify({ original: s.id }));
      res.recargar =
        /^Oídas 7 palabras/.test(res.oido) && res.guardado?.version === 1 && res.guardado.clave &&
        res.guardado.palabras === 'Mi gato escucha la canción del mar' && res.guardado.tramos > 0 && res.huerfanaAntes;
      if (!res.recargar) res.ok = false;
      return res;
    }

    const datos = JSON.parse(sessionStorage.getItem(DATOS) ?? '{}');
    if (vuelta === 1) {
      // 2) Recargada la app, la canción vuelve a estar abierta, con lo oído solo en el dispositivo (no en memoria), y lo
      //    de la canción que ya no existe se ha limpiado.
      await espera(() => V.song.id === datos.original);
      const s = V.song;
      res.abierta = s.id === datos.original && !!s.audioTrack;
      cuentaEscuchas();
      await espera(async () => !(await T.heardIds()).includes(HUERFANA));
      res.huerfanaLimpia = !(await T.heardIds()).includes(HUERFANA);

      // 3) «Duplicar» la canción: la copia se lleva lo oído (lo lee del dispositivo y lo guarda para ella) y se abre.
      document.querySelector('#btn-library').click();
      await espera(() => document.querySelector('#library-list .bib-row.current [data-more]'));
      document.querySelector('#library-list .bib-row.current [data-more]').click();
      document.querySelector('#dlg-library .bib-pop [data-a=copy]').click();
      await espera(() => /^Copia creada/.test(aviso() ?? ''));
      const item = [...document.querySelectorAll('#library-list .bib-row')].find((x) => x.querySelector('b')?.textContent.includes(`${titulo} (copia)`));
      item?.querySelector('.bib-open').click();
      await espera(() => V.song.title === `${titulo} (copia)`);
      const c = V.song;
      let g = null;
      await espera(async () => (g = await T.getHeard(c.id)));
      res.copiaGuardada = c.id !== s.id && g?.palabras?.length === 7;
      res.escuchas = escuchas;
      sessionStorage.setItem(DATOS, JSON.stringify({ ...datos, copia: c.id }));
      res.recargar = res.abierta && res.huerfanaLimpia && res.copiaGuardada && escuchas === 0;
      if (!res.recargar) res.ok = false;
      return res;
    }

    // 4) Recargada otra vez, con la copia abierta: «Letra» tiene ya lo oído (lo lee del dispositivo) y pone la letra donde
    //    se oye sin volver a escuchar.
    await espera(() => V.song.id === datos.copia);
    const c = V.song;
    res.abierta = c.id === datos.copia && !!c.audioTrack;
    cuentaEscuchas();
    res.copia = {};
    await ponLetra(c, res.copia);
    res.escuchas = escuchas;

    // 5) Lo guardado solo vale para esa grabación y esa manera de escuchar, y si está bien. Se mira con el módulo
    //    recién cargado (como al abrir la app), para que no lo tenga ya en memoria.
    // (Un número entero: con un punto, Vite no lo tomaría por TypeScript.)
    let veces = 0;
    const fresco = () => import(`/src/import/transcribe.ts?vez=${Date.now()}${++veces}`);
    const bueno = await T.getHeard(c.id);
    res.frescoLoTrae = (await (await fresco()).recallHeard(c))?.length === 7;
    res.otraGrabacion = await (await fresco()).recallHeard({ ...c, audioTrack: { ...c.audioTrack, name: 'Otra toma.wav' } });
    res.otraSincronia = await (await fresco()).recallHeard({ ...c, audioTrack: { ...c.audioTrack, offset: 0.25 } });
    await T.putHeard(c.id, { ...bueno, version: 0 });
    res.otraVersion = await (await fresco()).recallHeard(c);
    await T.putHeard(c.id, { ...bueno, palabras: [{ texto: 'Mi', a: 'cero', b: 1 }] });
    res.estropeado = await (await fresco()).recallHeard(c);

    // 6) Otra grabación en su sitio, o quitarla: lo oído se borra con ella.
    await T.putHeard(c.id, bueno);
    await T.putTrack(c.id, T.encodeWav(new Float32Array(32000 * 2), 32000));
    res.trasOtraGrabacion = await T.getHeard(c.id);
    await T.putHeard(c.id, bueno);
    await T.delTrack(c.id);
    res.trasQuitarla = await T.getHeard(c.id);
    sessionStorage.removeItem(DATOS);
    res.ok =
      res.abierta && bienPuesta(res.copia) && escuchas === 0 && res.frescoLoTrae &&
      res.otraGrabacion === null && res.otraSincronia === null && res.otraVersion === null && res.estropeado === null &&
      res.trasOtraGrabacion === null && res.trasQuitarla === null;
    return res;
  } finally {
    delete window.__vocesLetraOida;
    document.querySelectorAll('dialog[open]').forEach((x) => x.close());
  }
}
