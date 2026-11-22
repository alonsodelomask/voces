import { apiEnabled, askAI, user, type AiAnswer } from '../cloud/cloud';
import { makeVoice, VOICE_COLORS, sortNotes, type ChordMark, type Note, type Song } from '../model';
import { insertMonophonic, isValidChord, nameToMidi, prettyAccidentals } from '../music';
import { esc } from '../ui/dialog';
import { analyzeSong, harmonize, songToPrompt, suggestChords } from './harmony';
import { keepLyrics } from './keepLyrics';
import { cleanSung, diffSungVsScore, entriesFromTrack, findFusion, fusionDiffs, fusionPrompt, retimeSong, summarize, sungFromTrack } from './fusion';

export interface AssistDeps {
  song: () => Song;
  activeVoiceId: () => string | null;
  /** Devuelve false si no se ha hecho el cambio (canción de solo ver): entonces no se dice «hecho». */
  edit: (fn: () => void, recomputeChords?: boolean) => boolean;
  toast: (msg: string, error?: boolean) => void;
  goTo: (t: number) => void;
  openAccount: () => void;
}

/** Mientras el servidor dormido arranca (hasta un minuto): que se vea que se está esperando y por qué. */
const WAKING = 'Despertando el servidor (tras un rato sin uso tarda hasta un minuto) y después, a pensar la respuesta…';

const IDEAS = [
  'Crea una segunda voz por terceras por debajo de la melodía',
  'Escribe una línea de bajo con más movimiento',
  'Rearmoniza con acordes más ricos (séptimas, suspendidos)',
  'Revisa las voces y corrige lo que suene mal',
  'Añade una voz aguda tipo "uuh" que sostenga los acordes',
];

export function openAssistant(deps: AssistDeps, tab: 'review' | 'chords' | 'voices' | 'ai' | 'fusion' = 'review') {
  const song = deps.song();
  const fusion = findFusion(song);
  const melodyDefault = deps.activeVoiceId() ?? song.voices[0]?.id ?? '';
  const voiceOpts = song.voices.map((v) => `<option value="${esc(v.id)}" ${v.id === melodyDefault ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg assist-dlg';
  dlg.innerHTML = `
    <h2>✨ Asistente</h2>
    <div class="tabs assist-tabs">
      <button class="tab" data-t="review">Revisar</button>
      <button class="tab" data-t="chords">Acordes</button>
      <button class="tab" data-t="voices">Crear voces</button>
      <button class="tab" data-t="fusion" ${fusion ? '' : 'hidden'}>Fusión</button>
      <button class="tab" data-t="ai">IA</button>
    </div>
    <section data-p="review">
      <p class="intro">Busco cosas que suelen dar problemas al cantar: registros extremos, saltos difíciles, quintas/octavas paralelas, cruces y choques.</p>
      <div class="issue-list" id="as-issues"></div>
    </section>
    <section data-p="chords">
      <p class="intro">Propongo acordes que encajen con una melodía (útil después de tararear).</p>
      <div class="row">
        <label class="field col">Melodía<select id="as-ch-mel">${voiceOpts}</select></label>
        <label class="field col">Acordes<select id="as-ch-per"><option value="1">Uno por compás</option><option value="2">Dos por compás</option></select></label>
      </div>
      <div class="row end"><button class="btn" id="as-ch-go">Proponer</button></div>
      <div id="as-ch-out" class="as-out"></div>
    </section>
    <section data-p="voices">
      <p class="intro">Creo voces nuevas por debajo de la melodía siguiendo los acordes de la canción (si no hay, los propongo antes).</p>
      <div class="row">
        <label class="field col">Melodía<select id="as-h-mel">${voiceOpts}</select></label>
        <label class="field col">Voces nuevas<select id="as-h-n"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></label>
        <label class="field col">Estilo<select id="as-h-style">
          <option value="bloque">En bloque (siguen el ritmo)</option>
          <option value="pad">Notas largas (colchón)</option>
        </select></label>
      </div>
      <div class="row end"><button class="btn primary" id="as-h-go">Crear voces</button></div>
    </section>
    <section data-p="fusion">
      <p class="intro">Esta canción ha salido de mezclar una partitura con una grabación. Comparo lo que se oye con lo que pone la partitura: lo que es del detector se quita, y lo dudoso se lo pregunto a la IA, que para eso hace falta oído musical.</p>
      <div id="as-fu-sum"></div>
      <div class="row end"><button class="btn" id="as-fu-entradas" title="Cada nota de la partitura (y las de las otras voces que atacan con ella) entra donde se canta en la grabación, ni antes ni después. Para una grabación en la que se oye a una persona sola">⏱ Ajustar las entradas a la grabación</button><button class="btn" id="as-fu-redo" title="Sigue la altura de quien canta, momento a momento, con la partitura al lado. Para una grabación en la que se oye a una persona sola">🎧 Volver a sacarla de la grabación</button><button class="btn" id="as-fu-clean">Limpiar lo evidente</button><button class="btn primary" id="as-fu-ai">Afinar con IA</button></div>
      <div id="as-fu-out" class="as-out"></div>
    </section>
    <section data-p="ai">
      <div id="as-ai"></div>
    </section>
    <div class="row end"><button class="btn" id="as-close">Cerrar</button></div>`;
  document.body.appendChild(dlg);
  dlg.showModal();
  const q = <T extends HTMLElement>(sel: string) => dlg.querySelector(sel) as T;

  const show = (t: string) => {
    dlg.querySelectorAll<HTMLElement>('.assist-tabs .tab').forEach((b) => b.classList.toggle('active', b.dataset.t === t));
    dlg.querySelectorAll<HTMLElement>('section[data-p]').forEach((s) => (s.hidden = s.dataset.p !== t));
  };
  dlg.querySelector('.assist-tabs')!.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('.tab')?.dataset.t;
    if (t) show(t);
  });
  show(tab);
  q<HTMLButtonElement>('#as-close').onclick = () => dlg.close();
  dlg.addEventListener('close', () => dlg.remove());

  // ---- Revisar ----
  const issues = analyzeSong(song);
  const list = q<HTMLElement>('#as-issues');
  if (!issues.length) list.innerHTML = '<p class="ok">✓ No veo nada raro. ¡Buen trabajo!</p>';
  for (const it of issues) {
    const b = document.createElement('button');
    b.className = 'issue ' + it.level;
    b.innerHTML = `<span>${it.level === 'aviso' ? '⚠️' : '💡'}</span><span></span>`;
    b.lastElementChild!.textContent = it.text;
    b.onclick = () => {
      dlg.close();
      deps.goTo(it.time);
    };
    list.appendChild(b);
  }

  // ---- Acordes ----
  let proposed: ChordMark[] = [];
  q<HTMLButtonElement>('#as-ch-go').onclick = () => {
    const mel = q<HTMLSelectElement>('#as-ch-mel').value;
    proposed = suggestChords(song, mel, parseInt(q<HTMLSelectElement>('#as-ch-per').value) as 1 | 2);
    const out = q<HTMLElement>('#as-ch-out');
    if (!proposed.length) {
      out.innerHTML = '<p>Esa voz no tiene notas.</p>';
      return;
    }
    const spb = 60 / song.bpm;
    out.innerHTML = `<div class="chips">${proposed
      .map((c) => `<span class="chip"><small>c.${Math.floor(c.time / spb / song.beatsPerBar) + 1}</small> ${esc(c.name)}</span>`)
      .join('')}</div><div class="row end"><button class="btn primary" id="as-ch-apply">Usar estos acordes</button></div>`;
    q<HTMLButtonElement>('#as-ch-apply').onclick = () => {
      if (
        !deps.edit(() => {
          song.chords = proposed;
          song.chordsAuto = false;
        }, false)
      )
        return;
      deps.toast(`${proposed.length} acordes aplicados. Puedes retocarlos en la fila «Acorde» del editor.`);
      dlg.close();
    };
  };

  // ---- Crear voces ----
  q<HTMLButtonElement>('#as-h-go').onclick = () => {
    const mel = q<HTMLSelectElement>('#as-h-mel').value;
    const n = parseInt(q<HTMLSelectElement>('#as-h-n').value);
    const style = q<HTMLSelectElement>('#as-h-style').value as 'bloque' | 'pad';
    let chords = song.chords;
    let generated = false;
    if (!chords.length) {
      chords = suggestChords(song, mel, 1);
      generated = true;
    }
    const tmp: Song = { ...song, chords };
    const created = harmonize(tmp, { melodyId: mel, voices: n, style });
    if (!created.length) return deps.toast('No he podido crear voces (¿la melodía tiene notas y hay acordes?).', true);
    const hecho = deps.edit(() => {
      if (generated) {
        song.chords = chords;
        song.chordsAuto = false;
      }
      const idx = song.voices.findIndex((v) => v.id === mel);
      song.voices.splice(idx + 1, 0, ...created);
    }, !generated);
    if (!hecho) return;
    deps.toast(`${created.length} voces nuevas${generated ? ' y acordes propuestos' : ''}. Escúchalas y retócalas a tu gusto.`);
    dlg.close();
  };

  // ---- Fusión ----
  if (fusion) {
    const sum = q<HTMLElement>('#as-fu-sum');
    const out = q<HTMLElement>('#as-fu-out');
    const pinta = () => {
      const s = summarize(diffSungVsScore(song, fusion));
      const sis = s.sistematicas.length
        ? `<p class="hint-s">Donde más se repite la misma diferencia: ${s.sistematicas.map((x) => `c.${x.bar} (${x.semis > 0 ? '+' : ''}${x.semis}, ×${x.veces})`).join(' · ')}. Ahí es probable que cantéis de verdad algo distinto.</p>`
        : '';
      sum.innerHTML = `<ul class="ai-changes">
        <li><b>${s.iguales}</b> de ${s.total} notas oídas coinciden con «${esc(fusion.score.name)}».</li>
        <li><b>${s.distintas}</b> suenan distintas${s.octavas ? ` (${s.octavas} a la octava)` : ''} y <b>${s.cortas}</b> duran menos de un suspiro.</li>
        ${s.sinPartitura ? `<li><b>${s.sinPartitura}</b> caen donde la partitura calla.</li>` : ''}
      </ul>${sis}`;
    };
    pinta();
    const entradas = q<HTMLButtonElement>('#as-fu-entradas');
    entradas.onclick = async () => {
      entradas.disabled = true;
      out.innerHTML = '<p class="thinking">Escuchando la grabación…</p>';
      try {
        const r = await entriesFromTrack(song, fusion);
        if (!r) {
          out.innerHTML = '<p class="intro">La grabación de esta canción no está guardada en este dispositivo.</p>';
          return;
        }
        if (!r.movidas) {
          out.innerHTML = '<p class="ok">Las entradas ya caen donde se canta: no hay nada que mover.</p>';
          return;
        }
        if (!deps.edit(() => retimeSong(song, r.map))) {
          out.innerHTML = '';
          return;
        }
        pinta();
        out.innerHTML = `<p class="ok">Ajustadas ${r.movidas} entradas de «${esc(fusion.score.name)}» a donde se cantan, con las de las otras voces que atacan a la vez.</p>`;
        deps.toast('Entradas ajustadas a la grabación (puedes deshacerlo con ↶).');
      } catch (err) {
        out.innerHTML = `<p class="err">No se ha podido escuchar la grabación: ${esc((err as Error).message)}</p>`;
      } finally {
        entradas.disabled = false;
      }
    };
    const redo = q<HTMLButtonElement>('#as-fu-redo');
    redo.onclick = async () => {
      redo.disabled = true;
      out.innerHTML = '<p class="thinking">Escuchando la grabación…</p>';
      try {
        const notas = await sungFromTrack(song, fusion);
        if (!notas) {
          out.innerHTML = '<p class="intro">La grabación de esta canción no está guardada en este dispositivo, o no se oye a nadie cantar.</p>';
          return;
        }
        const antes = fusion.sung.notes.length;
        const hecho = deps.edit(() => {
          fusion.sung.notes = notas;
        }, false);
        if (!hecho) {
          out.innerHTML = '';
          return;
        }
        pinta();
        out.innerHTML = `<p class="ok">«${esc(fusion.sung.name)}» sacada otra vez de la grabación: ${notas.length} notas (antes ${antes}).</p>`;
        deps.toast('Voz de la grabación rehecha (puedes deshacerlo con ↶).');
      } catch (err) {
        out.innerHTML = `<p class="err">No se ha podido escuchar la grabación: ${esc((err as Error).message)}</p>`;
      } finally {
        redo.disabled = false;
      }
    };
    q<HTMLButtonElement>('#as-fu-clean').onclick = () => {
      // Dentro de la edición: así ↶ vuelve a lo de antes de limpiar.
      let r = { quitadas: 0, unidas: 0, octavas: 0 };
      if (
        !deps.edit(() => {
          r = cleanSung(song, fusion);
        }, false)
      )
        return;
      pinta();
      out.innerHTML = `<p class="ok">Quitadas ${r.quitadas} notas sueltas, unidas ${r.unidas} y devueltas a su octava ${r.octavas}.</p>`;
      deps.toast('Fusión limpiada (puedes deshacerlo con ↶).');
    };
    const goAI = q<HTMLButtonElement>('#as-fu-ai');
    goAI.onclick = async () => {
      if (!apiEnabled || !user()) {
        out.innerHTML = '<p class="intro">Para esto hace falta la IA: inicia sesión en la pestaña IA.</p>';
        return;
      }
      goAI.disabled = true;
      out.innerHTML = '<p class="thinking">Comparando con la partitura… (puede tardar un poco)</p>';
      const wakeMsg = () => (out.innerHTML = `<p class="thinking">${WAKING}</p>`);
      try {
        const ans = await askAI(fusionPrompt(fusion), `${songToPrompt(song)}\n\n${fusionDiffs(song, fusion)}`, wakeMsg);
        showAnswer(out, ans, deps, dlg);
      } catch (err) {
        out.innerHTML = `<p class="err">${esc((err as Error).message)}</p>`;
      } finally {
        goAI.disabled = false;
      }
    };
  }

  // ---- IA ----
  renderAI(q<HTMLElement>('#as-ai'), deps, dlg);
}

function renderAI(box: HTMLElement, deps: AssistDeps, dlg: HTMLDialogElement) {
  if (!apiEnabled) {
    box.innerHTML = `<p class="intro">La IA funciona a través del servidor de Vocify, que todavía no está configurado en esta instalación. Mientras tanto, las pestañas Revisar, Acordes y Crear voces funcionan sin conexión.</p>`;
    return;
  }
  if (!user()) {
    box.innerHTML = `<p class="intro">Para usar la IA, inicia sesión (es gratis y solo necesitas tu email).</p><div class="row end"><button class="btn primary" id="as-login">Iniciar sesión</button></div>`;
    box.querySelector<HTMLButtonElement>('#as-login')!.onclick = () => {
      dlg.close();
      deps.openAccount();
    };
    return;
  }
  box.innerHTML = `
    <p class="intro">Pídele a la IA lo que quieras sobre esta canción. Verás su propuesta antes de aplicarla, y siempre puedes deshacer.</p>
    <div class="chips">${IDEAS.map((i) => `<button class="chip as-idea">${esc(i)}</button>`).join('')}</div>
    <textarea id="as-ai-q" rows="3" placeholder="Ej.: haz que la voz del tenor sea más sencilla en el estribillo"></textarea>
    <div class="row end"><button class="btn primary" id="as-ai-go">Preguntar</button></div>
    <div id="as-ai-out" class="as-out"></div>`;
  const ta = box.querySelector<HTMLTextAreaElement>('#as-ai-q')!;
  box.querySelectorAll<HTMLButtonElement>('.as-idea').forEach((b) => (b.onclick = () => (ta.value = b.textContent ?? '')));
  const go = box.querySelector<HTMLButtonElement>('#as-ai-go')!;
  const out = box.querySelector<HTMLElement>('#as-ai-out')!;
  go.onclick = async () => {
    const prompt = ta.value.trim();
    if (!prompt) return;
    go.disabled = true;
    out.innerHTML = '<p class="thinking">Pensando el arreglo… (puede tardar un poco)</p>';
    try {
      const song = deps.song();
      const ans = await askAI(prompt, songToPrompt(song), () => (out.innerHTML = `<p class="thinking">${WAKING}</p>`));
      showAnswer(out, ans, deps, dlg);
    } catch (err) {
      out.innerHTML = `<p class="err">${esc((err as Error).message)}</p>`;
    } finally {
      go.disabled = false;
    }
  };
}

function showAnswer(out: HTMLElement, ans: AiAnswer, deps: AssistDeps, dlg: HTMLDialogElement) {
  const song = deps.song();
  const spb = 60 / song.bpm;
  const chords = (ans.chords ?? []).filter((c) => isValidChord(c.name) && c.beat >= 0);
  const voices = (ans.voices ?? [])
    .map((v) => {
      const notes: Note[] = [];
      for (const n of v.notes ?? []) {
        try {
          if (n.dur > 0 && n.beat >= 0) notes.push({ midi: nameToMidi(n.note), start: n.beat * spb, dur: n.dur * spb, name: n.note });
        } catch {
          /* nota no válida: se ignora */
        }
      }
      // Una voz monofónica: se ordena y cada nota recorta a la que pisa.
      sortNotes(notes);
      let mono: Note[] = [];
      for (const n of notes) mono = insertMonophonic(mono, n);
      return { ...v, parsed: notes, mono, target: song.voices.find((x) => x.id === v.targetId) };
    })
    .filter((v) => v.parsed.length);
  // La IA no ve la letra: se lleva a las notas nuevas, y lo que no quepa se avisa antes de aplicar (y al aplicar).
  const tol = spb / 8;
  const perdidas = (v: (typeof voices)[number]) => (v.target ? keepLyrics(v.target.notes, v.mono.map((n) => ({ ...n })), tol).lost : 0);
  const changes: string[] = [];
  if (chords.length) changes.push(`Acordes nuevos: ${chords.map((c) => esc(prettyAccidentals(c.name))).join(' · ')}`);
  for (const v of voices) {
    const sinSitio = perdidas(v);
    const aviso = sinSitio ? `; ${sinSitio === 1 ? 'una sílaba' : `${sinSitio} sílabas`} de la letra se quedan sin nota` : '';
    changes.push(v.target ? `Reescribe «${esc(v.target.name)}» (${v.parsed.length} notas${aviso})` : `Crea la voz «${esc(v.name)}» (${v.parsed.length} notas)`);
  }
  out.innerHTML = `<div class="ai-reply"></div>${changes.length ? `<ul class="ai-changes">${changes.map((c) => `<li>${c}</li>`).join('')}</ul><div class="row end"><button class="btn primary" id="as-ai-apply">Aplicar cambios</button></div>` : ''}`;
  out.querySelector('.ai-reply')!.textContent = ans.reply;
  const apply = out.querySelector<HTMLButtonElement>('#as-ai-apply');
  if (!apply) return;
  apply.onclick = () => {
    let sinNota = 0;
    const hecho = deps.edit(() => {
      if (chords.length) {
        song.chords = chords.map((c) => ({ time: c.beat * spb, name: prettyAccidentals(c.name) })).sort((a, b) => a.time - b.time);
        song.chordsAuto = false;
      }
      const used = new Set(song.voices.map((v) => v.color));
      for (const v of voices) {
        const mono = v.mono.map((n) => ({ ...n }));
        if (v.target) {
          sinNota += keepLyrics(v.target.notes, mono, tol).lost;
          v.target.notes = mono;
        } else {
          const nv = makeVoice(v.name || 'Voz IA', song.voices.length, mono);
          nv.color = VOICE_COLORS.find((c) => !used.has(c)) ?? nv.color;
          used.add(nv.color);
          song.voices.push(nv);
        }
      }
    }, !chords.length);
    if (!hecho) return;
    deps.toast(
      sinNota
        ? `Cambios de la IA aplicados. ${sinNota === 1 ? 'Una sílaba' : `${sinNota} sílabas`} de la letra no tenían nota donde ir: revisa la letra o deshaz con ↶.`
        : 'Cambios de la IA aplicados (puedes deshacerlos con ↶).',
    );
    dlg.close();
  };
}
