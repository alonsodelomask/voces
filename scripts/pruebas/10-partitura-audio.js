async () => {
  // Mezclar grabación y partitura: las notas salen de la partitura y el ritmo, de la grabación.
  // La «grabación» (sintetizada) va más rápida que la partitura y con el tempo cambiando, un tono más baja,
  // la voz grave una octava por debajo de lo escrito y una nota de la aguda cantada tarde.
  const V = window.voces;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  await wait(100);
  const alta = [72, 74, 76, 77, 79, 77, 76, 74, 72, 72, 76, 79];
  const baja = [60, 60, 55, 55, 57, 57, 53, 53, 55, 55, 60, 60];

  // Partitura: dos partes de negras a 100 BPM (la segunda parte escrita para trompeta en Si♭: suena un tono más baja).
  const STEPS = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
  const pitch = (m) => `<pitch><step>${STEPS[m % 12]}</step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<alter>1</alter>' : ''}<octave>${Math.floor(m / 12) - 1}</octave></pitch>`;
  const parte = (id, notas, trompeta) => `<part id="${id}">` + [0, 1, 2].map((c) =>
    `<measure number="${c + 1}">${c === 0 ? `<attributes><divisions>1</divisions><key><fifths>${trompeta ? 2 : 0}</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time>${trompeta ? '<transpose><diatonic>1</diatonic><chromatic>2</chromatic></transpose>' : ''}<clef><sign>G</sign><line>2</line></clef></attributes>${id === 'P1' ? '<sound tempo="100"/>' : ''}` : ''}` +
    notas.slice(c * 4, c * 4 + 4).map((m) => `<note>${pitch(trompeta ? m - 2 : m)}<duration>1</duration><voice>1</voice><type>quarter</type></note>`).join('') + '</measure>').join('') + '</part>';
  // La parte de trompeta se escribe 2 semitonos por debajo para que, con <transpose> +2, suene a la altura de `alta`.
  const xml = `<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><work><work-title>Canon de prueba</work-title></work>
    <part-list><score-part id="P1"><part-name>Alta</part-name></score-part><score-part id="P2"><part-name>Baja</part-name></score-part></part-list>
    ${parte('P1', alta, true)}${parte('P2', baja, false)}</score-partwise>`;

  // Grabación: tiempos reales de cada pulso (acelera y luego frena), un tono más baja y la grave una octava abajo.
  const beatDur = [0.5, 0.48, 0.46, 0.44, 0.42, 0.4, 0.4, 0.42, 0.46, 0.5, 0.55, 0.6];
  const t = [0.8];
  for (const d of beatDur) t.push(t[t.length - 1] + d);
  const tarde = 4; // la 5.ª nota de la aguda entra 0,15 s tarde
  const SR = 22050;
  // `hasta`: cuántas notas se cantan (para probar una grabación que se corta a la mitad).
  // `tomas`/`pausa`: la canción entera varias veces, con un silencio entre toma y toma.
  async function wav(nombre, hasta, tomas = 1, pausa = 0) {
    const vuelta = t[hasta] - t[0] + pausa;
    const fin = t[hasta] + 1 + (tomas - 1) * vuelta;
    const ctx = new OfflineAudioContext(1, Math.ceil(fin * SR), SR);
    const toca = (m, a, b, vol) => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.type = 'triangle'; o.frequency.value = 440 * 2 ** ((m - 69) / 12);
      g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(vol, a + 0.03);
      g.gain.setValueAtTime(vol, b - 0.06); g.gain.linearRampToValueAtTime(0, b - 0.02);
      o.connect(g).connect(ctx.destination); o.start(a); o.stop(b);
    };
    // La aguda suena más fuerte: es la que se oye y la que debe salir en «🎙 Alta».
    for (let k = 0; k < tomas; k++) {
      const d = k * vuelta;
      alta.slice(0, hasta).forEach((m, i) => toca(m - 2, d + t[i] + (i === tarde ? 0.15 : 0), d + t[i + 1], 0.34));
      baja.slice(0, hasta).forEach((m, i) => toca(m - 2 - 12, d + t[i], d + t[i + 1], 0.2));
    }
    const pcm = (await ctx.startRendering()).getChannelData(0);
    const w = new DataView(new ArrayBuffer(44 + pcm.length * 2));
    const str = (o, s) => [...s].forEach((c, i) => w.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); w.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVEfmt ');
    w.setUint32(16, 16, true); w.setUint16(20, 1, true); w.setUint16(22, 1, true);
    w.setUint32(24, SR, true); w.setUint32(28, SR * 2, true); w.setUint16(32, 2, true); w.setUint16(34, 16, true);
    str(36, 'data'); w.setUint32(40, pcm.length * 2, true);
    pcm.forEach((x, i) => w.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 32767, true));
    return new File([w.buffer], nombre, { type: 'audio/wav' });
  }

  // Los dos archivos a la vez, como al elegirlos juntos: abre la partitura y pasa directo a la mezcla.
  const input = document.querySelector('#file');
  const dt = new DataTransfer();
  dt.items.add(await wav('Ensayo martes.wav', 12));
  dt.items.add(new File([xml], 'Canon de prueba.musicxml', { type: 'application/xml' }));
  input.files = dt.files;
  input.dispatchEvent(new Event('change'));
  let d = null;
  for (let i = 0; i < 60 && !d?.querySelector('[name=span]'); i++) { await wait(100); d = document.querySelector('dialog[open]'); }
  const res = {
    multiple: input.multiple,
    partitura: V.song.title,
    // La trompeta en Si♭ se lee a la altura real.
    trompeta: V.song.voices.find((v) => v.name === 'Alta')?.notes.map((n) => n.midi).join(',') === alta.join(','),
    dialogo: d?.querySelector('h2')?.textContent,
    // Usa la partitura abierta, así que no pide el archivo de la partitura.
    usaLaAbierta: d?.querySelector('[name=useOpen]')?.checked === true && d.querySelector('[data-pick=score]')?.hidden === true,
    grabacionElegida: d?.querySelector('[data-pick=audio] [data-name]')?.textContent,
    opciones: [...d.querySelectorAll('[name=span] option')].map((o) => o.value).join(','),
  };
  const partitura = V.song; // la canción abierta es la partitura: hace falta para la última comprobación
  d.querySelector('[data-ok]').click();
  await wait(300);
  res.fusion = !!document.querySelector('.fu-stage');
  for (let i = 0; i < 600 && V.song.title !== 'Canon de prueba (grabación)'; i++) await wait(250);
  const s = V.song;
  res.titulo = s.title;
  res.fusionCerrada = !document.querySelector('.fu-stage');
  const va = s.voices.find((v) => v.name === 'Alta'), vb = s.voices.find((v) => v.name === 'Baja');
  res.notasAlta = va?.notes.map((n) => n.midi).join(',') === alta.map((m) => m - 2).join(',');
  res.notasBaja = vb?.notes.map((n) => n.midi).join(',') === baja.map((m) => m - 14).join(',');
  // Ritmo de cada voz: cuánto se aparta cada ataque, quitado el desplazamiento común (la canción empieza en 0).
  const real = alta.map((_, i) => t[i] + (i === tarde ? 0.15 : 0));
  const ritmo = (v, reales) => {
    if (!v) return { max: 9, off: 0 };
    const d = v.notes.map((n, i) => n.start - reales[i]);
    const med = [...d].sort((a, b) => a - b)[Math.floor(d.length / 2)];
    return { max: +Math.max(...d.map((x) => Math.abs(x - med))).toFixed(3), off: med };
  };
  const rA = ritmo(va, real), rB = ritmo(vb, t);
  res.errorMaxAlta = rA.max;
  res.errorMaxBaja = rB.max;
  // Y las dos voces tienen que seguir cuadrando entre sí.
  res.desfaseEntreVoces = +Math.abs(rA.off - rB.off).toFixed(3);
  res.tarde = va ? +(va.notes[tarde].start - vb.notes[tarde].start).toFixed(3) : null;

  // «🎙 Alta»: la voz sacada del audio, pegada a la línea de la partitura que le corresponde (y enlazada a ella).
  const cantada = s.voices.find((v) => v.sungOf);
  res.enlazada = cantada?.sungOf === va?.id;
  res.cantada = cantada?.name;
  res.cantadaJuntoAAlta = cantada ? s.voices.indexOf(cantada) === s.voices.indexOf(va) + 1 : false;
  res.cantadaNotas = cantada?.notes.length ?? 0;
  const parecido = cantada ? cantada.notes.filter((n) => alta.some((m, i) => m - 2 === n.midi && Math.abs(n.start - va.notes[i].start) < 0.2)).length / cantada.notes.length : 0;
  res.cantadaParecido = +parecido.toFixed(2);

  // La grabación, guardada en el dispositivo y sonando con las voces (se lee y se decodifica aparte).
  for (let i = 0; i < 100 && !V.engine.audioBuffer; i++) await wait(100);
  res.pista = s.audioTrack && { nombre: s.audioTrack.name, offset: +s.audioTrack.offset.toFixed(2), dur: +s.audioTrack.duration.toFixed(1) };
  res.pistaCargada = !!V.engine.audioBuffer;
  const fila = [...document.querySelectorAll('#voice-list .voice.track')];
  res.filaPista = fila.length === 1 && fila[0].querySelector('.n')?.textContent;

  // La cuerda sale de la tesitura, aunque la voz se llame de otra manera.
  const filaDe = (n) => [...document.querySelectorAll('#voice-list .voice')].find((r) => r.querySelector('.vname')?.value === n);
  res.cuerdaAlta = filaDe('Alta')?.querySelector('.n')?.textContent;
  res.cuerdaBaja = filaDe('Baja')?.querySelector('.n')?.textContent;
  res.rangoBaja = filaDe('Baja')?.querySelector('.n')?.title;
  res.enEditor = [...document.querySelectorAll('#ed-voice option')].map((o) => o.textContent).join(' / ');
  // Si el nombre ya dice la cuerda, no se repite.
  const campo = filaDe('Alta').querySelector('.vname');
  campo.value = 'Tenor 2';
  campo.dispatchEvent(new Event('change'));
  res.noRepite = filaDe('Tenor 2')?.querySelector('.n')?.textContent;
  // La voz de la grabación se explica sola en el panel.
  res.filaCantada = filaDe('🎙 Tenor 2')?.querySelector('.n')?.textContent;
  // Renombrar una voz renombra su «🎙» (en su sitio, sin rehacer el panel).
  res.renombrada = s.voices.find((v) => v.sungOf === va.id)?.name === '🎙 Tenor 2' && !filaDe('🎙 Alta');
  // Las canciones mezcladas antes («Como se canta (X)») se ponen al día al abrirlas.
  const { migrateSungVoices } = await import('/src/ai/fusion.ts');
  const vieja = { voices: [{ id: 'a', name: 'Alta', notes: [] }, { id: 'b', name: 'Como se canta (Alta)', notes: [] }] };
  res.migrada = migrateSungVoices(vieja) && vieja.voices[1].name === '🎙 Alta' && vieja.voices[1].sungOf === 'a';
  // «Como se canta» a secas no se parecía a ninguna voz: no se engancha a la de delante.
  const sinPareja = { voices: [{ id: 's', name: 'Soprano', notes: [] }, { id: 'b', name: 'Bajo', notes: [] }, { id: 'x', name: 'Como se canta', notes: [] }] };
  migrateSungVoices(sinPareja);
  res.migradaSinPareja = sinPareja.voices[2].name === '🎙 Grabación' && sinPareja.voices[2].sungOf === '';
  // La voz se renombró después: se reconoce la de delante si canta en la misma zona.
  const nota = (midi) => ({ midi, start: 0, dur: 1 });
  const renombrada = { voices: [{ id: 'a', name: 'Tenor 2', notes: [nota(60), nota(62)] }, { id: 'b', name: 'Como se canta (Alta)', notes: [nota(61), nota(62)] }] };
  migrateSungVoices(renombrada);
  res.migradaRenombrada = renombrada.voices[1].name === '🎙 Tenor 2' && renombrada.voices[1].sungOf === 'a';
  // Y si la voz se borró, la de delante es otra: no se engancha.
  const borrada = { voices: [{ id: 's', name: 'Soprano', notes: [nota(76)] }, { id: 'b', name: 'Como se canta (Alta)', notes: [nota(60)] }] };
  migrateSungVoices(borrada);
  res.migradaBorrada = borrada.voices[1].name === '🎙 Alta' && borrada.voices[1].sungOf === '';
  // Silenciar y volver: el motor obedece.
  fila[0].querySelector('[data-k=m]').click();
  res.silenciada = s.audioTrack.muted;
  fila[0].querySelector('[data-k=m]').click();
  res.sonando = !s.audioTrack.muted;
  res.toast = document.querySelector('.toast')?.textContent;

  // Duración «Toda la partitura»: con una grabación que se corta a la mitad, lo que no se canta se estira igual.
  const { mix } = await import('/src/import/mixDialog.ts');
  const media = await mix(partitura, await wav('Media.wav', 6), { keepKey: false, span: 'score', sung: false, track: false });
  const mv = media?.song.voices.find((v) => v.name === 'Alta');
  res.todaLaPartitura = mv?.notes.length ?? 0;
  res.ordenadas = !!mv && mv.notes.every((n, i) => i === 0 || n.start > mv.notes[i - 1].start);
  res.mitadCantada = mv ? ritmo({ notes: mv.notes.slice(0, 6) }, real).max : 9;
  // Y «solo lo que se canta» con la misma grabación corta se queda en las 6 primeras.
  const corta = await mix(partitura, await wav('Media.wav', 6), { keepKey: false, span: 'match', sung: false, track: false });
  res.soloLoCantado = corta?.song.voices.find((v) => v.name === 'Alta')?.notes.length ?? 0;

  // «Toda la grabación» con la canción cantada dos veces y 1,5 s de silencio entre las dos tomas: dos vueltas,
  // cada nota dos veces y ninguna en el silencio.
  const dos = await mix(partitura, await wav('Dos tomas.wav', 12, 2, 1.5), { keepKey: false, span: 'audio', sung: false, track: false });
  const dv = dos?.song.voices.find((v) => v.name === 'Alta');
  res.dosTomas = { notas: dv?.notes.length, avisos: dos?.notes.join('; ') };
  res.dosVueltas = !!dos?.notes.some((x) => x.includes('se canta 2 veces'));
  res.huecoEntreTomas = dv && dv.notes.length === 24 ? +(dv.notes[12].start - (dv.notes[11].start + dv.notes[11].dur)).toFixed(2) : null;
  res.segundaToma = dv && dv.notes.length === 24 ? dv.notes.slice(12).map((n) => n.midi).join(',') === alta.map((m) => m - 2).join(',') : false;

  // Volver a mezclar usando como partitura una mezcla: su «🎙» no entra como voz escrita y no quedan enlaces rotos.
  const otra = await mix(s, await wav('Ensayo martes.wav', 12), { keepKey: false, span: 'match', sung: true, track: false });
  const conEnlace = otra?.song.voices.filter((v) => v.sungOf !== undefined) ?? [];
  res.remezcla = { voces: otra?.song.voices.map((v) => v.name).join(' / '), grabacion: conEnlace.length };
  res.remezclaBien = conEnlace.length === 1 && (conEnlace[0].sungOf === '' || otra.song.voices.some((v) => v.id === conEnlace[0].sungOf && v.sungOf === undefined));

  res.ok = res.multiple && res.trompeta && res.usaLaAbierta && res.opciones === 'audio,match,score' && res.fusion && res.fusionCerrada &&
    res.notasAlta && res.notasBaja && res.errorMaxAlta < 0.08 && res.errorMaxBaja < 0.08 && res.desfaseEntreVoces < 0.05 && res.tarde > 0.08 &&
    res.cantada === '🎙 Alta' && res.enlazada && res.cantadaJuntoAAlta && res.cantadaNotas >= 8 && res.cantadaParecido >= 0.6 &&
    !!res.pista && res.pistaCargada && res.filaPista === 'grabación' && res.silenciada && res.sonando &&
    res.todaLaPartitura === 12 && res.ordenadas && res.mitadCantada < 0.08 && res.soloLoCantado <= 8 &&
    /^en la grabación · \d+ notas$/.test(res.filaCantada ?? '') && res.renombrada && res.migrada && res.migradaSinPareja && res.migradaRenombrada && res.migradaBorrada &&
    res.dosTomas.notas === 24 && res.dosVueltas && res.huecoEntreTomas >= 1.2 && res.segundaToma && res.remezclaBien &&
    res.cuerdaAlta === 'Soprano · 12 notas' && res.cuerdaBaja === 'Bajo · 12 notas' && res.noRepite === '12 notas' &&
    /Alta · Soprano/.test(res.enEditor) && /Baja · Bajo/.test(res.enEditor);
  return res;
}
