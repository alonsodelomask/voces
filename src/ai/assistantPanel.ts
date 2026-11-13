import { apiEnabled, askAI, user, type AiAnswer } from '../cloud/cloud';
import { makeVoice, VOICE_COLORS, sortNotes, type ChordMark, type Note, type Song } from '../model';
import { insertMonophonic, isValidChord, nameToMidi, prettyAccidentals } from '../music';
import { esc } from '../ui/dialog';
import { analyzeSong, harmonize, songToPrompt, suggestChords } from './harmony';
import { cleanSung, diffSungVsScore, findFusion, fusionPrompt, summarize } from './fusion';

export interface AssistDeps {
  song: () => Song;
  activeVoiceId: () => string | null;
  edit: (fn: () => void, recomputeChords?: boolean) => void;
  toast: (msg: string, error?: boolean) => void;
  goTo: (t: number) => void;
  openAccount: () => void;
}

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
  const voiceOpts = song.voices.map((v) => `<option value="${v.id}" ${v.id === melodyDefault ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
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
      <div class="row end"><button class="btn" id="as-fu-clean">Limpiar lo evidente</button><button class="btn primary" id="as-fu-ai">Afinar con IA</button></div>
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
      deps.edit(() => {
        song.chords = proposed;
        song.chordsAuto = false;
      }, false);
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
    deps.edit(() => {
      if (generated) {
        song.chords = chords;
        song.chordsAuto = false;
      }
      const idx = song.voices.findIndex((v) => v.id === mel);
      song.voices.splice(idx + 1, 0, ...created);
    }, !generated);
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
    q<HTMLButtonElement>('#as-fu-clean').onclick = () => {
      const r = cleanSung(song, fusion);
      deps.edit(() => {}, false);
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
      try {
        const ans = await askAI(fusionPrompt(song, fusion), songToPrompt(song));
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
    box.innerHTML = `<p class="intro">La IA (Claude) funciona a través del servidor de Vocify, que todavía no está configurado en esta instalación. Mientras tanto, las pestañas Revisar, Acordes y Crear voces funcionan sin conexión.</p>`;
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
      const ans = await askAI(prompt, songToPrompt(song));
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
      return { ...v, parsed: notes, target: song.voices.find((x) => x.id === v.targetId) };
    })
    .filter((v) => v.parsed.length);
  const changes: string[] = [];
  if (chords.length) changes.push(`Acordes nuevos: ${chords.map((c) => esc(prettyAccidentals(c.name))).join(' · ')}`);
  for (const v of voices) changes.push(v.target ? `Reescribe «${esc(v.target.name)}» (${v.parsed.length} notas)` : `Crea la voz «${esc(v.name)}» (${v.parsed.length} notas)`);
  out.innerHTML = `<div class="ai-reply"></div>${changes.length ? `<ul class="ai-changes">${changes.map((c) => `<li>${c}</li>`).join('')}</ul><div class="row end"><button class="btn primary" id="as-ai-apply">Aplicar cambios</button></div>` : ''}`;
  out.querySelector('.ai-reply')!.textContent = ans.reply;
  const apply = out.querySelector<HTMLButtonElement>('#as-ai-apply');
  if (!apply) return;
  apply.onclick = () => {
    deps.edit(() => {
      if (chords.length) {
        song.chords = chords.map((c) => ({ time: c.beat * spb, name: prettyAccidentals(c.name) })).sort((a, b) => a.time - b.time);
        song.chordsAuto = false;
      }
      const used = new Set(song.voices.map((v) => v.color));
      for (const v of voices) {
        sortNotes(v.parsed);
        let mono: Note[] = [];
        for (const n of v.parsed) mono = insertMonophonic(mono, n);
        if (v.target) v.target.notes = mono;
        else {
          const nv = makeVoice(v.name || 'Voz IA', song.voices.length, mono);
          nv.color = VOICE_COLORS.find((c) => !used.has(c)) ?? nv.color;
          used.add(nv.color);
          song.voices.push(nv);
        }
      }
    }, !chords.length);
    deps.toast('Cambios de la IA aplicados (puedes deshacerlos con ↶).');
    dlg.close();
  };
}
