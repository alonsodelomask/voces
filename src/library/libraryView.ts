import type { Song } from '../model';
import { isNewerFormat, NEWER_FORMAT_MSG, uid } from '../model';
import { confirmDialog, esc, form } from '../ui/dialog';
import * as cloud from '../cloud/cloud';
import { keepLocalMix } from '../cloud/mix';
import { markChanged } from '../cloud/groupSync';
import { delHeard, delTrack, getTrack, putTrack } from '../audio/track';
import { deleteSong, getSong, peekSongs, peekTrash, restoreSong, saveSong, TRASH_DAYS, trashSong } from '../storage';
import { applyQuery, daysLeft, itemFromSong, miniLines, relativeDate, type LibItem, type Query, type SortKey } from './query';
import {
  addToRepertorio,
  createRepertorio,
  deleteRepertorio,
  forgetSong,
  loadRepertorios,
  mergeShared,
  moveInRepertorio,
  removeFromRepertorio,
  renameRepertorio,
  setRepertorioGroup,
  type Repertorio,
} from './repertorios';

/**
 * La biblioteca: todas las canciones a pantalla completa, con las del grupo en la misma lista, buscador, filtros,
 * orden, selección de varias, repertorios y papelera. Ideas tomadas de la biblioteca de flat.io (docs/AUDITORIA_FLAT.md),
 * con el aspecto de Vocify.
 */
export interface LibraryDeps {
  current: () => Song;
  /** Abre una canción de este dispositivo. */
  open: (s: Song) => void;
  /** Abre una canción del grupo recién descargada (y la guarda en el dispositivo). */
  openDownloaded: (s: Song) => void;
  /** Guarda la canción abierta tal como está ahora. */
  persistCurrent: () => void;
  /** La canción abierta ha cambiado fuera (título, grupo): repintar y volver a vigilar el grupo. */
  refreshCurrent: () => void;
  /** La abierta se ha ido a la papelera: abrir otra. */
  openAnother: () => void;
  /** Compartir la abierta con un grupo (guarda y sincroniza). */
  shareCurrent: (groupId: string) => Promise<void>;
  /** Guarda la versión del grupo que se acaba de traer; si es la abierta, la pone en su lugar (con su grabación). */
  adopt: (s: Song) => void;
  toast: (msg: string, error?: boolean) => void;
  exportMidi: (s: Song) => void;
  exportProject: (s: Song) => void;
  playQueue: (ids: string[]) => void;
  create: { newSong: () => void; importFile: () => void; mix: () => void; hum: () => void };
}

/**
 * La nube que usa la biblioteca. Solo en desarrollo, las pruebas pueden poner una de mentira en memoria
 * (`window.__vocesNube`, ver scripts/pruebas/26-biblioteca-grupo.js) para probar el grupo sin Supabase.
 */
type Nube = typeof cloud;
const nube = (): Nube => (import.meta.env.DEV && (window as unknown as { __vocesNube?: Nube }).__vocesNube) || cloud;

type Section = 'all' | 'trash' | `rep:${string}`;

const VIEW_KEY = 'voces.biblioteca.vista';
interface ViewPrefs {
  sort: SortKey;
  desc: boolean;
}
function loadPrefs(): ViewPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}');
    return { sort: ['updated', 'title', 'created'].includes(p.sort) ? p.sort : 'updated', desc: typeof p.desc === 'boolean' ? p.desc : true };
  } catch {
    return { sort: 'updated', desc: true };
  }
}
function savePrefs(p: ViewPrefs) {
  try {
    localStorage.setItem(VIEW_KEY, JSON.stringify(p));
  } catch {
    /* nada */
  }
}

let deps: LibraryDeps;
let dlg: HTMLDialogElement;
let section: Section = 'all';
const query: Query & ViewPrefs = { q: '', where: '', audio: false, lyrics: false, ...loadPrefs() };
const selected = new Set<string>();
/** Canciones de los grupos (de la última consulta), su papelera y los nombres de los grupos y de sus miembros. */
let remote: LibItem[] = [];
let remoteTrash: LibItem[] = [];
let groupNames = new Map<string, string>();
const memberNames = new Map<string, string>();
let remoteLoading = false;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => dlg.querySelector(sel) as T;

export function openLibrary(d: LibraryDeps) {
  deps = d;
  dlg = document.querySelector<HTMLDialogElement>('#dlg-library')!;
  if (!dlg.dataset.ready) build();
  selected.clear();
  closePop();
  render();
  if (!dlg.open) dlg.showModal();
  void loadRemote();
}

// ---------------- Estructura ----------------

function build() {
  dlg.dataset.ready = '1';
  dlg.innerHTML = `
    <div class="bib">
      <aside class="bib-side">
        <div class="bib-brand"><b>Biblioteca</b></div>
        <button class="btn primary bib-create" data-act="create" aria-haspopup="menu">＋ Crear</button>
        <nav class="bib-nav" aria-label="Secciones de la biblioteca">
          <button class="bib-sec" data-sec="all"><span>🎵 Todas las canciones</span><small data-count="all"></small></button>
          <div class="bib-reps-head"><span>Repertorios</span><button class="bib-icon" data-act="new-rep" title="Nuevo repertorio" aria-label="Nuevo repertorio">＋</button></div>
          <div class="bib-reps"></div>
          <button class="bib-sec bib-trash" data-sec="trash"><span>🗑 Papelera</span><small data-count="trash"></small></button>
        </nav>
      </aside>
      <section class="bib-main">
        <header class="bib-head">
          <div class="bib-title"><h2 id="bib-title"></h2><small id="bib-count"></small></div>
          <input id="lib-search" type="search" placeholder="Buscar por título, voz o letra…" aria-label="Buscar canciones" />
          <button class="btn icon bib-close" data-act="close" title="Cerrar" aria-label="Cerrar la biblioteca">✕</button>
        </header>
        <div class="bib-filters" role="group" aria-label="Filtros">
          <label class="chip bib-where">Dónde <select id="bib-where" aria-label="Dónde está la canción"></select></label>
          <button class="chip" data-filter="audio" aria-pressed="false">🎙 Con grabación</button>
          <button class="chip" data-filter="lyrics" aria-pressed="false">📝 Con letra</button>
          <button class="bib-link" data-act="clear" hidden>Limpiar</button>
          <span class="bib-sort">
            <label>Ordenar <select id="bib-sort" aria-label="Ordenar por">
              <option value="updated">Modificada</option><option value="title">Nombre</option><option value="created">Creada</option>
            </select></label>
            <button class="bib-icon" data-act="dir" id="bib-dir"></button>
          </span>
        </div>
        <div class="bib-bar">
          <label class="bib-all"><input type="checkbox" id="bib-all" /> <span id="bib-sel-count">Seleccionar</span></label>
          <div class="bib-bulk" hidden></div>
          <div class="bib-extra"></div>
        </div>
        <div id="library-list" class="bib-list" role="list"></div>
      </section>
    </div>
    <div class="bib-pop" role="menu" hidden></div>`;

  dlg.addEventListener('click', onClick);
  dlg.addEventListener('close', closePop);
  $('#lib-search').addEventListener('input', (e) => {
    query.q = (e.target as HTMLInputElement).value;
    render();
  });
  $('#bib-where').addEventListener('change', (e) => {
    query.where = (e.target as HTMLSelectElement).value;
    render();
  });
  $('#bib-sort').addEventListener('change', (e) => {
    query.sort = (e.target as HTMLSelectElement).value as SortKey;
    // Al cambiar de orden, el sentido natural: por nombre A→Z; por fecha, lo más reciente primero.
    query.desc = query.sort !== 'title';
    savePrefs(query);
    render();
  });
  $('#bib-all').addEventListener('change', (e) => {
    const on = (e.target as HTMLInputElement).checked;
    selected.clear();
    if (on) visible().filter((i) => !i.remote).forEach((i) => selected.add(i.id));
    render();
  });
  dlg.addEventListener('change', (e) => {
    const cb = (e.target as HTMLElement).closest<HTMLInputElement>('input[data-check]');
    if (!cb) return;
    if (cb.checked) selected.add(cb.dataset.check!);
    else selected.delete(cb.dataset.check!);
    render();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('.bib-pop').hidden) {
      e.preventDefault();
      closePop();
    }
  });
}

// ---------------- Datos ----------------

function repOf(sec: Section): Repertorio | undefined {
  return sec.startsWith('rep:') ? loadRepertorios().find((r) => `rep:${r.id}` === sec) : undefined;
}

function baseItems(): LibItem[] {
  if (section === 'trash') {
    const local = peekTrash().map(itemFromSong);
    const have = new Set(local.map((i) => i.id));
    return [...local, ...remoteTrash.filter((r) => !have.has(r.id))];
  }
  const local = peekSongs().map(itemFromSong);
  const rep = repOf(section);
  if (rep) {
    // En un repertorio del grupo puede haber canciones del grupo que aún no están en este dispositivo.
    const byId = new Map([...remote, ...local].map((i) => [i.id, i]));
    return rep.songIds.map((id) => byId.get(id)).filter((i): i is LibItem => !!i);
  }
  const have = new Set(local.map((i) => i.id));
  return [...local, ...remote.filter((r) => !have.has(r.id))];
}

/** Lo que se ve ahora (con búsqueda y filtros; en un repertorio, en su orden). */
function visible(items = baseItems()): LibItem[] {
  if (section.startsWith('rep:')) return applyQuery(items, { ...query, sort: 'updated' }).sort((a, b) => items.indexOf(a) - items.indexOf(b));
  return applyQuery(items, query);
}

async function loadRemote() {
  if (!nube().cloudEnabled || !nube().user() || remoteLoading) return;
  remoteLoading = true;
  try {
    const groups = await nube().myGroups();
    groupNames = new Map(groups.map((g) => [g.id, g.name]));
    const [lists, trashes, setlists, people] = await Promise.all([
      Promise.all(groups.map((g) => nube().groupSongs(g.id).catch(() => []))),
      // La papelera y los repertorios del grupo necesitan la migración 004: sin ella, como antes.
      Promise.all(groups.map((g) => nube().groupTrash(g.id).catch(() => null))),
      Promise.all(groups.map((g) => nube().groupSetlists(g.id).catch(() => null))),
      Promise.all(groups.map((g) => nube().members(g.id).catch(() => []))),
    ]);
    people.flat().forEach((m) => memberNames.set(m.user_id, m.display_name));
    remoteTrash = trashes.flatMap((t) => t ?? []).map((t) => ({
      id: t.id,
      title: t.title,
      voices: [],
      groupId: t.group_id,
      createdAt: Date.parse(t.deleted_at),
      updatedAt: Date.parse(t.deleted_at),
      deletedAt: Date.parse(t.deleted_at),
      by: t.deleted_by ? (memberNames.get(t.deleted_by) ?? 'alguien del grupo') : undefined,
      audio: false,
      lyrics: false,
      lyricText: '',
      remote: true,
    }));
    groups.forEach((g, i) => {
      const list = setlists[i];
      if (list) mergeShared(g.id, list.map((r) => ({ id: r.id, name: r.name, songIds: r.song_ids, updatedAt: Date.parse(r.updated_at) })));
    });
    remote = lists.flat().map((m) => ({
      id: m.id,
      title: m.title,
      voices: [],
      groupId: m.group_id,
      createdAt: Date.parse(m.updated_at),
      updatedAt: Date.parse(m.updated_at),
      audio: false,
      lyrics: false,
      lyricText: '',
      remote: true,
    }));
    if (dlg.open) render();
  } catch {
    /* sin conexión: solo las de este dispositivo */
  } finally {
    remoteLoading = false;
  }
}

const groupName = (id?: string) => (id ? (groupNames.get(id) ?? 'Grupo') : '');

// ---------------- Pintar ----------------

/** Si la biblioteca está abierta, la vuelve a pintar (han llegado canciones de la cuenta desde otro dispositivo). */
export function refreshLibrary() {
  if (dlg?.open) render();
}

function render() {
  const reps = loadRepertorios();
  if (section.startsWith('rep:') && !repOf(section)) section = 'all';
  const rep = repOf(section);
  const all = baseItems();
  const items = visible(all);
  const liveIds = new Set(peekSongs().map((s) => s.id));
  // La selección solo guarda lo que sigue a la vista.
  for (const id of [...selected]) if (!items.some((i) => i.id === id && !i.remote)) selected.delete(id);

  // Barra lateral.
  dlg.querySelectorAll<HTMLElement>('.bib-sec').forEach((b) => b.classList.toggle('on', b.dataset.sec === section));
  $('[data-count="all"]').textContent = String(liveIds.size);
  const localTrash = new Set(peekTrash().map((s) => s.id));
  $('[data-count="trash"]').textContent = String(localTrash.size + remoteTrash.filter((r) => !localTrash.has(r.id)).length);
  const remoteIds = new Set(remote.map((r) => r.id));
  $('.bib-reps').innerHTML = reps.length
    ? reps
        .map(
          (r) => `<div class="bib-rep${section === `rep:${r.id}` ? ' on' : ''}">
            <button class="bib-sec" data-sec="rep:${esc(r.id)}" ${r.groupId ? `title="Compartido con «${esc(groupName(r.groupId))}»"` : ''}><span>${r.groupId ? '☁' : '🎼'} ${esc(r.name)}</span><small>${r.songIds.filter((id) => liveIds.has(id) || remoteIds.has(id)).length}</small></button>
            <button class="bib-icon" data-rep-more="${esc(r.id)}" aria-label="Más acciones del repertorio «${esc(r.name)}»">⋯</button>
          </div>`,
        )
        .join('')
    : '<p class="bib-hint">Junta canciones para un concierto o un ensayo.</p>';

  // Cabecera.
  const title = section === 'trash' ? 'Papelera' : rep ? `${rep.name}${rep.groupId ? ` · ☁ ${groupName(rep.groupId)}` : ''}` : 'Todas las canciones';
  $('#bib-title').textContent = title;
  const n = all.length;
  $('#bib-count').textContent =
    items.length === n ? `${n} ${n === 1 ? 'canción' : 'canciones'}` : `${items.length} de ${n} ${n === 1 ? 'canción' : 'canciones'}`;
  const search = $<HTMLInputElement>('#lib-search');
  if (search.value !== query.q) search.value = query.q ?? '';

  // Filtros.
  const where = $<HTMLSelectElement>('#bib-where');
  const groupsSeen = new Map(groupNames);
  for (const i of all) if (i.groupId && !groupsSeen.has(i.groupId)) groupsSeen.set(i.groupId, 'Grupo');
  where.innerHTML =
    `<option value="">Todas</option><option value="local">Solo en este dispositivo</option>` +
    [...groupsSeen].map(([id, name]) => `<option value="${esc(id)}">☁ ${esc(name)}</option>`).join('');
  if (query.where && !groupsSeen.has(query.where) && query.where !== 'local') query.where = '';
  where.value = query.where ?? '';
  dlg.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((b) => {
    const on = !!query[b.dataset.filter as 'audio' | 'lyrics'];
    b.classList.toggle('on', on);
    b.setAttribute('aria-pressed', String(on));
  });
  $('[data-act="clear"]').hidden = !(query.q || query.where || query.audio || query.lyrics);
  const sortBox = $('.bib-sort');
  sortBox.hidden = !!rep;
  $<HTMLSelectElement>('#bib-sort').value = query.sort;
  const dir = $('#bib-dir');
  dir.textContent = query.desc ? '↓' : '↑';
  const dirLabel =
    query.sort === 'title' ? (query.desc ? 'De la Z a la A' : 'De la A a la Z') : query.desc ? 'Las más recientes primero' : 'Las más antiguas primero';
  dir.title = dirLabel;
  dir.setAttribute('aria-label', dirLabel);

  // Selección y acciones de varias.
  const selectable = items.filter((i) => !i.remote);
  const allBox = $<HTMLInputElement>('#bib-all');
  allBox.checked = selectable.length > 0 && selected.size === selectable.length;
  allBox.indeterminate = selected.size > 0 && selected.size < selectable.length;
  allBox.disabled = !selectable.length;
  $('#bib-sel-count').textContent = selected.size ? `${selected.size} ${selected.size === 1 ? 'seleccionada' : 'seleccionadas'}` : 'Seleccionar';
  const bulk = $('.bib-bulk');
  bulk.hidden = !selected.size;
  bulk.innerHTML =
    section === 'trash'
      ? `<button class="btn small" data-bulk="restore">↩ Recuperar</button><button class="btn small danger" data-bulk="purge">Borrar para siempre</button>`
      : `<button class="btn small" data-bulk="rep">🎼 Añadir a un repertorio</button>${rep ? '<button class="btn small" data-bulk="unrep">Quitar del repertorio</button>' : ''}<button class="btn small" data-bulk="copy">⧉ Duplicar</button><button class="btn small" data-bulk="trash">🗑 A la papelera</button>`;
  const extra = $('.bib-extra');
  extra.innerHTML =
    section === 'trash' && localTrash.size
      ? `<button class="btn small danger" data-act="empty-trash" title="Solo lo de este dispositivo; lo del grupo se borra solo a los ${TRASH_DAYS} días">Vaciar la papelera</button>`
      : rep && rep.songIds.length
        ? `<button class="btn small primary" data-act="play-rep">▶ Tocar todo seguido</button>`
        : '';
  extra.hidden = !!selected.size;

  // Lista.
  const list = $('#library-list');
  const cur = deps.current();
  if (!items.length) {
    list.innerHTML = `<div class="bib-empty">${emptyText(all.length, rep)}</div>`;
    return;
  }
  list.innerHTML = items.map((it) => row(it, it.id === cur.id)).join('');
}

function emptyText(total: number, rep?: Repertorio): string {
  if (section === 'trash')
    return `<p><b>La papelera está vacía.</b></p><p>Lo que mandes aquí se guarda ${TRASH_DAYS} días, con su grabación, por si quieres recuperarlo. Lo que se quite de un grupo, también: cualquiera del grupo puede recuperarlo.</p>`;
  if (rep && !rep.songIds.length)
    return `<p><b>«${esc(rep.name)}» está vacío.</b></p><p>Añade canciones desde <i>Todas las canciones</i>: ⋯ › <i>Añadir a un repertorio</i>, o selecciona varias.</p>`;
  if (total) return '<p>Ninguna canción coincide con la búsqueda o los filtros.</p><p><button class="bib-link" data-act="clear">Quitar la búsqueda y los filtros</button></p>';
  return '<p><b>Aún no hay canciones.</b></p><p>Pulsa <b>＋ Crear</b> para empezar una, importar una partitura o una grabación, o tararear.</p>';
}

function mini(it: LibItem): string {
  if (!it.song) return '<span class="bib-mini bib-mini-cloud" aria-hidden="true">☁</span>';
  const lines = miniLines(it.song);
  return `<svg class="bib-mini" viewBox="0 0 64 36" aria-hidden="true">${lines.map((l) => `<path d="${l.d}" stroke="${esc(l.color)}"/>`).join('')}</svg>`;
}

function row(it: LibItem, current: boolean): string {
  const t = esc(it.title || 'Sin título');
  const voices = it.voices.length ? esc(it.voices.join(' · ')) : it.remote ? (it.deletedAt ? 'En la papelera del grupo' : 'Del grupo · sin descargar') : 'Sin voces';
  const badges = [it.audio ? '<span class="bib-badge" title="Tiene grabación">🎙</span>' : '', it.lyrics ? '<span class="bib-badge" title="Tiene letra">📝</span>' : ''].join('');
  const when =
    section === 'trash' && it.deletedAt
      ? `${it.remote ? `Quitada del grupo${it.by ? ` por ${it.by}` : ''}` : 'Borrada'} ${relativeDate(it.deletedAt)} · ${daysLeft(it.deletedAt, TRASH_DAYS)} días para recuperarla`
      : relativeDate(it.updatedAt);
  const where = it.groupId ? `☁ ${esc(groupName(it.groupId))}` : 'En este dispositivo';
  const check = it.remote
    ? '<span class="bib-check"></span>'
    : `<label class="bib-check"><input type="checkbox" data-check="${esc(it.id)}" ${selected.has(it.id) ? 'checked' : ''} aria-label="Seleccionar «${t}»" /></label>`;
  return `<div class="bib-row${current ? ' current' : ''}${selected.has(it.id) ? ' sel' : ''}${it.remote ? ' remote' : ''}" role="listitem" data-id="${esc(it.id)}">
    ${check}
    <button class="bib-open" data-open="${esc(it.id)}" title="${section === 'trash' ? 'Opciones' : 'Abrir'} «${t}»">
      ${mini(it)}
      <span class="bib-txt"><b>${t}${current ? ' <span class="bib-now">abierta</span>' : ''}</b><small>${voices} ${badges}</small></span>
    </button>
    <span class="bib-when">${esc(when)}</span>
    <span class="bib-where">${where}</span>
    <button class="bib-more" data-more="${esc(it.id)}" aria-haspopup="menu" aria-label="Más acciones de «${t}»">⋯</button>
  </div>`;
}

// ---------------- Menú emergente ----------------

function openPop(anchor: HTMLElement, html: string) {
  const pop = $('.bib-pop');
  pop.innerHTML = html;
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const d = dlg.getBoundingClientRect();
  const w = pop.offsetWidth;
  const h = pop.offsetHeight;
  let left = Math.min(r.right - d.left - w, d.width - w - 8);
  left = Math.max(8, left);
  let top = r.bottom - d.top + 4;
  if (top + h > d.height - 8) top = Math.max(8, r.top - d.top - h - 4);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.querySelector<HTMLElement>('button')?.focus();
}
function closePop() {
  const pop = dlg?.querySelector<HTMLElement>('.bib-pop');
  if (pop) pop.hidden = true;
}

function songMenu(it: LibItem): string {
  const b = (a: string, label: string, cls = '') => `<button role="menuitem" class="${cls}" data-a="${a}" data-id="${esc(it.id)}">${label}</button>`;
  const rep = repOf(section);
  const inRep = rep ? b('up', '↑ Subir en el repertorio') + b('down', '↓ Bajar en el repertorio') + b('unrep', 'Quitar del repertorio') : '';
  if (it.remote && it.deletedAt) return b('grestore', '↩ Recuperar en el grupo');
  if (it.remote) return b('open', '⇣ Abrir (descargar)') + inRep;
  if (section === 'trash') return b('restore', '↩ Recuperar') + b('purge', 'Borrar para siempre', 'danger');
  const logged = nube().cloudEnabled && !!nube().user();
  return [
    b('open', 'Abrir'),
    b('rename', '✎ Cambiar el nombre'),
    b('copy', '⧉ Duplicar'),
    b('rep', '🎼 Añadir a un repertorio'),
    inRep,
    logged && it.groupId ? b('history', '🕘 Historial de versiones') : '',
    logged ? (it.groupId ? b('unshare', '⊘ Quitar del grupo') : b('share', '☁ Compartir con el grupo')) : '',
    '<hr />',
    b('midi', 'Exportar MIDI'),
    b('project', 'Exportar proyecto (.json)'),
    '<hr />',
    b('trash', '🗑 Mover a la papelera', 'danger'),
  ].join('');
}

function repMenu(r: Repertorio): string {
  const b = (a: string, label: string, cls = '') => `<button role="menuitem" class="${cls}" data-ra="${a}" data-id="${esc(r.id)}">${label}</button>`;
  const logged = nube().cloudEnabled && !!nube().user();
  return (
    b('play', '▶ Tocar todo seguido') +
    b('rename', '✎ Cambiar el nombre') +
    (logged && !r.groupId ? b('share', '☁ Compartir con el grupo') : '') +
    b('delete', r.groupId ? 'Borrar el repertorio (para todo el grupo)' : 'Borrar el repertorio', 'danger')
  );
}

function createMenu(): string {
  const b = (a: string, label: string, small: string) => `<button role="menuitem" data-create="${a}"><b>${label}</b><small>${small}</small></button>`;
  return (
    b('new', '✚ Canción nueva', 'Desde cero, con las voces que quieras') +
    b('import', '📂 Importar partitura o audio', 'MusicXML, MIDI, WAV, MP3…') +
    b('mix', '✨ Mezclar grabación y partitura', 'Lo que mejor sale con una grabación') +
    b('hum', '🎤 Tararear una melodía', 'Canta y se convierte en notas')
  );
}

// ---------------- Acciones ----------------

async function onClick(e: MouseEvent) {
  const el = e.target as HTMLElement;
  const pop = $('.bib-pop');
  if (!pop.hidden && !pop.contains(el) && !el.closest('[data-more],[data-rep-more],[data-act="create"]')) closePop();

  const sec = el.closest<HTMLElement>('[data-sec]')?.dataset.sec;
  if (sec) {
    section = sec as Section;
    selected.clear();
    return render();
  }
  const act = el.closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'close') return dlg.close();
  if (act === 'create') return openPop(el.closest('[data-act]')!, createMenu());
  if (act === 'new-rep') return newRepertorio();
  if (act === 'clear') {
    Object.assign(query, { q: '', where: '', audio: false, lyrics: false });
    return render();
  }
  if (act === 'dir') {
    query.desc = !query.desc;
    savePrefs(query);
    return render();
  }
  if (act === 'empty-trash') return emptyTrash();
  if (act === 'play-rep') {
    const rep = repOf(section);
    if (rep) playRep(rep);
    return;
  }
  const filter = el.closest<HTMLElement>('[data-filter]')?.dataset.filter as 'audio' | 'lyrics' | undefined;
  if (filter) {
    query[filter] = !query[filter];
    return render();
  }
  const create = el.closest<HTMLElement>('[data-create]')?.dataset.create;
  if (create) {
    closePop();
    dlg.close();
    const c = deps.create;
    return void (create === 'new' ? c.newSong() : create === 'import' ? c.importFile() : create === 'mix' ? c.mix() : c.hum());
  }
  const more = el.closest<HTMLElement>('[data-more]');
  if (more) {
    const it = visible().find((i) => i.id === more.dataset.more);
    if (it) openPop(more, songMenu(it));
    return;
  }
  const repMore = el.closest<HTMLElement>('[data-rep-more]');
  if (repMore) {
    const r = loadRepertorios().find((x) => x.id === repMore.dataset.repMore);
    if (r) openPop(repMore, repMenu(r));
    return;
  }
  const open = el.closest<HTMLElement>('[data-open]');
  if (open) {
    const it = visible().find((i) => i.id === open.dataset.open);
    if (!it) return;
    if (section === 'trash') return openPop(open, songMenu(it));
    return openItem(it);
  }
  const a = el.closest<HTMLElement>('[data-a]');
  if (a) {
    closePop();
    return songAction(a.dataset.a!, a.dataset.id!);
  }
  const ra = el.closest<HTMLElement>('[data-ra]');
  if (ra) {
    closePop();
    return repAction(ra.dataset.ra!, ra.dataset.id!);
  }
  const bulkAct = el.closest<HTMLElement>('[data-bulk]')?.dataset.bulk;
  if (bulkAct) return bulk(bulkAct);
}

async function openItem(it: LibItem) {
  if (it.remote) {
    try {
      deps.toast(`Descargando «${it.title}»…`);
      const s = await nube().fetchSong(it.id);
      dlg.close();
      deps.openDownloaded(s);
    } catch (e) {
      deps.toast((e as Error).message || 'No se ha podido descargar la canción.', true);
    }
    return;
  }
  dlg.close();
  const cur = deps.current();
  if (it.id === cur.id) return;
  const s = getSong(it.id);
  if (s) deps.open(s);
}

/** La canción tal como está ahora: si es la abierta, la de la app (con lo último); si no, la guardada. */
function live(id: string): Song | undefined {
  const cur = deps.current();
  return id === cur.id ? cur : getSong(id);
}

async function songAction(a: string, id: string) {
  const it = baseItems().find((i) => i.id === id);
  if (a === 'open' && it) return openItem(it);
  if (a === 'grestore' && it) {
    await groupRestore(it);
    return render();
  }
  if ((a === 'up' || a === 'down' || a === 'unrep') && it?.remote) {
    const rep = repOf(section);
    if (rep) {
      if (a === 'unrep') removeFromRepertorio(rep.id, [id]);
      else moveInRepertorio(rep.id, id, a === 'up' ? -1 : 1);
      void syncRep(rep.id);
    }
    return render();
  }
  const s = live(id);
  if (!s) return render();
  const isCur = id === deps.current().id;
  switch (a) {
    case 'rename': {
      const r = await form({ title: 'Cambiar el nombre', fields: [{ name: 't', label: 'Título', value: s.title }], okLabel: 'Guardar' });
      const t = r?.values.t.trim();
      if (!t) break;
      s.title = t;
      if (isCur) {
        deps.persistCurrent();
        deps.refreshCurrent();
      } else {
        saveSong(s);
        // Del grupo y sin abrir: el nombre nuevo también se sube (si no, se perdería al traer una versión más nueva).
        if (s.groupId) markChanged(s);
      }
      break;
    }
    case 'copy': {
      const c = await duplicate(s);
      deps.toast(`Copia creada: «${c.title}».`);
      break;
    }
    case 'rep':
      await chooseRepertorio([id]);
      break;
    case 'up':
    case 'down': {
      const rep = repOf(section);
      if (rep) {
        moveInRepertorio(rep.id, id, a === 'up' ? -1 : 1);
        void syncRep(rep.id);
      }
      break;
    }
    case 'unrep': {
      const rep = repOf(section);
      if (rep) {
        removeFromRepertorio(rep.id, [id]);
        void syncRep(rep.id);
      }
      break;
    }
    case 'history':
      await history(s, isCur);
      break;
    case 'share':
      await share(s, isCur);
      break;
    case 'unshare':
      await unshare(s, isCur);
      break;
    case 'midi':
      deps.exportMidi(s);
      break;
    case 'project':
      deps.exportProject(s);
      break;
    case 'trash':
      toTrash([id]);
      deps.toast(`«${s.title}» está en la papelera. Puedes recuperarla durante ${TRASH_DAYS} días.`);
      break;
    case 'restore':
      restoreSong(id);
      deps.toast(`«${s.title}» ha vuelto a la biblioteca.`);
      break;
    case 'purge':
      if (await confirmDialog('Borrar para siempre', `¿Borrar «${s.title}» y su grabación de este dispositivo? No se puede deshacer.`, 'Borrar')) await purge([id]);
      break;
  }
  render();
}

async function bulk(a: string) {
  const ids = [...selected];
  if (!ids.length) return;
  const n = ids.length;
  const canc = `${n} ${n === 1 ? 'canción' : 'canciones'}`;
  switch (a) {
    case 'rep':
      if (!(await chooseRepertorio(ids))) return;
      break;
    case 'unrep': {
      const rep = repOf(section);
      if (rep) {
        removeFromRepertorio(rep.id, ids);
        void syncRep(rep.id);
      }
      break;
    }
    case 'copy':
      for (const id of ids) {
        const s = live(id);
        if (s) await duplicate(s);
      }
      deps.toast(`${n === 1 ? 'Creada 1 copia' : `Creadas ${n} copias`}.`);
      break;
    case 'trash':
      toTrash(ids);
      deps.toast(`${canc} en la papelera. Puedes recuperarlas durante ${TRASH_DAYS} días.`);
      break;
    case 'restore':
      ids.forEach(restoreSong);
      deps.toast(`${canc} ${n === 1 ? 'ha' : 'han'} vuelto a la biblioteca.`);
      break;
    case 'purge':
      if (!(await confirmDialog('Borrar para siempre', `¿Borrar ${canc} y sus grabaciones de este dispositivo? No se puede deshacer.`, 'Borrar'))) return;
      await purge(ids);
      break;
  }
  selected.clear();
  render();
}

function toTrash(ids: string[]) {
  const cur = deps.current();
  if (ids.includes(cur.id)) deps.persistCurrent();
  ids.forEach(trashSong);
  if (ids.includes(cur.id)) deps.openAnother();
}

async function purge(ids: string[]) {
  for (const id of ids) {
    deleteSong(id);
    await delTrack(id);
    await delHeard(id);
  }
  forgetSong(ids);
}

async function emptyTrash() {
  const ids = peekTrash().map((s) => s.id);
  if (!ids.length) return;
  if (!(await confirmDialog('Vaciar la papelera', `¿Borrar para siempre ${ids.length} ${ids.length === 1 ? 'canción' : 'canciones'} y sus grabaciones? No se puede deshacer.`, 'Vaciar')))
    return;
  await purge(ids);
  selected.clear();
  render();
}

/** Copia una canción con su grabación y lo ya oído en ella (para no volver a escucharla al poner la letra). */
async function duplicate(origen: Song): Promise<Song> {
  const c: Song = JSON.parse(JSON.stringify(origen));
  c.id = uid();
  c.title = `${origen.title} (copia)`;
  c.groupId = undefined;
  c.remoteUpdatedAt = undefined;
  delete c.deletedAt;
  c.createdAt = c.updatedAt = Date.now();
  if (c.audioTrack) {
    const wav = await getTrack(origen.id);
    try {
      if (wav) await putTrack(c.id, wav);
      else deps.toast(`«${c.title}» se ha copiado sin la grabación: no está en este dispositivo.`);
    } catch {
      deps.toast(`«${c.title}» se ha copiado sin la grabación: no se ha podido guardar.`, true);
    }
    try {
      const { recallHeard, rememberHeard } = await import('../import/transcribe');
      const oidas = await recallHeard(origen);
      if (oidas) rememberHeard(c, oidas);
    } catch {
      /* sin lo oído: se volverá a escuchar */
    }
  }
  saveSong(c);
  return c;
}

/** Pregunta a qué repertorio (o crea uno) y añade las canciones. */
async function chooseRepertorio(ids: string[]): Promise<boolean> {
  const reps = loadRepertorios();
  const n = ids.length;
  const r = await form({
    title: 'Añadir a un repertorio',
    intro: n === 1 ? undefined : `${n} canciones.`,
    fields: [
      ...(reps.length
        ? [{ name: 'rep', label: 'Repertorio', type: 'select' as const, value: reps[reps.length - 1].id, options: [...reps.map((x) => ({ value: x.id, label: x.name })), { value: '__new', label: '＋ Uno nuevo…' }] }]
        : []),
      { name: 'name', label: reps.length ? 'Nombre (si es nuevo)' : 'Nombre del repertorio', placeholder: 'Concierto de Navidad' },
    ],
    okLabel: 'Añadir',
  });
  if (!r) return false;
  let target = reps.find((x) => x.id === r.values.rep);
  if (!target) {
    const name = r.values.name?.trim();
    if (!name) {
      deps.toast('Escribe el nombre del repertorio nuevo.', true);
      return false;
    }
    target = createRepertorio(name);
  }
  const added = addToRepertorio(target.id, ids);
  let note = '';
  if (target.groupId) {
    void syncRep(target.id);
    // Las que no están en ese grupo, los demás no las tienen: se avisa.
    const outside = ids.filter((id) => getSong(id)?.groupId !== target!.groupId).length;
    if (outside) note = ` ${outside === 1 ? 'Una no está' : `${outside} no están`} en el grupo: los demás no ${outside === 1 ? 'la verán' : 'las verán'} hasta que ${outside === 1 ? 'la compartas' : 'las compartas'}.`;
  }
  deps.toast((added ? `Añadida${added === 1 ? '' : 's'} ${added} a «${target.name}».` : `Ya estaba${n === 1 ? '' : 'n'} en «${target.name}».`) + note);
  return true;
}

async function newRepertorio() {
  const r = await form({ title: 'Repertorio nuevo', intro: 'Una lista de canciones en orden, para un concierto o un ensayo.', fields: [{ name: 'name', label: 'Nombre', placeholder: 'Concierto de Navidad' }], okLabel: 'Crear' });
  const name = r?.values.name?.trim();
  if (!name) return;
  const rep = createRepertorio(name);
  section = `rep:${rep.id}`;
  selected.clear();
  render();
}

async function repAction(a: string, id: string) {
  const r = loadRepertorios().find((x) => x.id === id);
  if (!r) return render();
  if (a === 'play') return playRep(r);
  if (a === 'rename') {
    const f = await form({ title: 'Cambiar el nombre', fields: [{ name: 'name', label: 'Nombre', value: r.name }], okLabel: 'Guardar' });
    const name = f?.values.name?.trim();
    if (name) {
      renameRepertorio(id, name);
      void syncRep(id);
    }
  }
  if (a === 'share') {
    const g = await pickGroup();
    if (g) {
      setRepertorioGroup(id, g.id);
      groupNames.set(g.id, g.name);
      if (await syncRep(id)) {
        const outside = r.songIds.filter((sid) => getSong(sid)?.groupId !== g.id).length;
        deps.toast(
          `«${r.name}» compartido con «${g.name}».` +
            (outside ? ` ${outside === 1 ? 'Una canción no está' : `${outside} canciones no están`} en el grupo: compártelas para que los demás las vean.` : ''),
        );
      } else setRepertorioGroup(id, undefined);
    }
  }
  if (a === 'delete') {
    const text = r.groupId
      ? `¿Borrar «${r.name}»? Está compartido: desaparece para todo el grupo. Las canciones no se borran.`
      : `¿Borrar «${r.name}»? Las canciones no se borran: siguen en la biblioteca.`;
    if (await confirmDialog('Borrar el repertorio', text, 'Borrar')) {
      try {
        if (r.groupId) await nube().deleteSetlist(id);
        deleteRepertorio(id);
        if (section === `rep:${id}`) section = 'all';
      } catch (e) {
        deps.toast((e as Error).message || 'No se ha podido borrar el repertorio del grupo.', true);
      }
    }
  }
  render();
}

/** Sube un repertorio compartido tal como está ahora. Devuelve si ha ido bien (o si no hacía falta). */
async function syncRep(id: string): Promise<boolean> {
  const r = loadRepertorios().find((x) => x.id === id);
  if (!r?.groupId) return true;
  try {
    await nube().pushSetlist({ id: r.id, groupId: r.groupId, name: r.name, songIds: r.songIds });
    return true;
  } catch (e) {
    deps.toast(`No se ha podido guardar «${r.name}» en el grupo: ${(e as Error).message}`, true);
    return false;
  }
}

async function playRep(r: Repertorio) {
  const live = new Set(peekSongs().map((s) => s.id));
  const fromGroup = new Set(remote.map((x) => x.id));
  // Las del grupo que aún no están en este dispositivo se descargan antes.
  const missing = r.songIds.filter((id) => !live.has(id) && fromGroup.has(id));
  if (missing.length) {
    deps.toast(`Descargando ${missing.length} ${missing.length === 1 ? 'canción' : 'canciones'} del grupo…`);
    for (const id of missing) {
      try {
        // Sin copia aquí: la mezcla normal (no la de quien la subió con una app anterior).
        saveSong(keepLocalMix(await nube().fetchSong(id)));
        live.add(id);
      } catch {
        /* sin conexión: se salta */
      }
    }
  }
  const ids = r.songIds.filter((id) => live.has(id));
  if (!ids.length) return deps.toast(`«${r.name}» no tiene canciones.`, true);
  dlg.close();
  deps.playQueue(ids);
}

async function pickGroup(): Promise<cloud.Group | null> {
  const groups = await nube().myGroups();
  if (!groups.length) {
    deps.toast('Aún no estás en ningún grupo: créalo o únete en Menú › Tu grupo.', true);
    return null;
  }
  if (groups.length === 1) return groups[0];
  const r = await form({
    title: 'Compartir con el grupo',
    fields: [{ name: 'g', label: 'Grupo', type: 'select', value: groups[0].id, options: groups.map((g) => ({ value: g.id, label: g.name })) }],
    okLabel: 'Compartir',
  });
  return groups.find((g) => g.id === r?.values.g) ?? null;
}

async function share(s: Song, isCur: boolean) {
  // Una canción de una versión más nueva no se sube (cloud.pushSong la rechaza): se avisa sin marcarla como del grupo.
  if (isNewerFormat(s)) return deps.toast(NEWER_FORMAT_MSG, true);
  try {
    const g = await pickGroup();
    if (!g) return;
    if (isCur) await deps.shareCurrent(g.id);
    else {
      s.groupId = g.id;
      s.remoteUpdatedAt = await nube().pushSong(s);
      saveSong(s);
    }
    groupNames.set(g.id, g.name);
    deps.toast(`«${s.title}» compartida con «${g.name}». Los cambios se sincronizan solos.`);
  } catch (e) {
    deps.toast((e as Error).message || 'No se ha podido compartir.', true);
  }
}

async function unshare(s: Song, isCur: boolean) {
  if (
    !(await confirmDialog(
      'Quitar del grupo',
      `¿Quitar «${s.title}» del grupo? Desaparecerá para todos los miembros, pero cualquiera del grupo podrá recuperarla durante ${TRASH_DAYS} días desde la Papelera. En este dispositivo se queda como canción tuya.`,
      'Quitar',
    ))
  )
    return;
  try {
    await nube().trashRemoteSong(s.id);
    s.groupId = undefined;
    s.remoteUpdatedAt = undefined;
    if (isCur) {
      deps.persistCurrent();
      deps.refreshCurrent();
    } else saveSong(s);
    remote = remote.filter((r) => r.id !== s.id);
    deps.toast(`«${s.title}» ya no está en el grupo.`);
  } catch (e) {
    deps.toast((e as Error).message || 'No se ha podido quitar del grupo.', true);
  }
}

// ---------------- Papelera del grupo ----------------

/** Recupera en el grupo una canción de su papelera, y la de este dispositivo vuelve a ser la del grupo. */
async function groupRestore(it: LibItem) {
  try {
    await nube().restoreRemoteSong(it.id);
    const s = await nube().fetchSong(it.id);
    deps.adopt(s);
    remoteTrash = remoteTrash.filter((r) => r.id !== it.id);
    deps.toast(`«${it.title}» ha vuelto al grupo «${groupName(it.groupId)}».`);
    void loadRemote();
  } catch (e) {
    deps.toast((e as Error).message || 'No se ha podido recuperar.', true);
  }
}

// ---------------- Historial de versiones ----------------

const fmtDate = (t: number) =>
  new Date(t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Las versiones anteriores de una canción del grupo: abrir una como copia o volver a ella. */
async function history(s: Song, isCur: boolean) {
  let list: cloud.SongVersion[];
  try {
    list = await nube().songVersions(s.id);
  } catch (e) {
    return deps.toast((e as Error).message || 'No se ha podido leer el historial.', true);
  }
  const d = document.createElement('dialog');
  d.className = 'dlg bib-history';
  const who = (id: string | null) => (id ? (memberNames.get(id) ?? 'alguien del grupo') : 'alguien del grupo');
  d.innerHTML = `<h2>Historial de «${esc(s.title)}»</h2>
    <p class="intro">Cada vez que alguien del grupo la cambia se guarda cómo estaba: una versión por sesión de trabajo, las 50 últimas.</p>
    ${
      list.length
        ? `<div class="bib-versions">${list
            .map(
              (v) => `<div class="bib-version">
                <span><b>${esc(fmtDate(Date.parse(v.saved_at)))}</b><small>${esc(relativeDate(Date.parse(v.saved_at)))} · ${esc(who(v.saved_by))}${v.title !== s.title ? ` · «${esc(v.title)}»` : ''}</small></span>
                <span class="bib-version-acts"><button class="btn small" data-v-copy="${v.id}">Abrir como copia</button><button class="btn small" data-v-restore="${v.id}">Volver a esta</button></span>
              </div>`,
            )
            .join('')}</div>`
        : '<p class="bib-hint">Todavía no hay versiones anteriores: se guardan a partir de ahora, cuando alguien la cambie.</p>'
    }
    <form method="dialog" class="row"><button class="btn" value="cancel">Cerrar</button></form>`;
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  d.addEventListener('click', async (e) => {
    const el = e.target as HTMLElement;
    const copyId = el.closest<HTMLElement>('[data-v-copy]')?.dataset.vCopy;
    const restoreId = el.closest<HTMLElement>('[data-v-restore]')?.dataset.vRestore;
    try {
      if (copyId) {
        const v = await nube().fetchVersion(Number(copyId));
        const when = list.find((x) => String(x.id) === copyId)!.saved_at;
        const c: Song = { ...JSON.parse(JSON.stringify(v.data)), id: uid(), title: `${v.title} (versión del ${fmtDate(Date.parse(when))})`, groupId: undefined, remoteUpdatedAt: undefined, audioTrack: undefined };
        c.createdAt = c.updatedAt = Date.now();
        saveSong(c);
        d.close();
        dlg.close();
        deps.open(c);
        deps.toast(`Abierta como copia: «${c.title}». La del grupo no cambia.`);
      }
      if (restoreId) {
        const ok = await confirmDialog(
          'Volver a esta versión',
          `«${s.title}» volverá a como estaba el ${fmtDate(Date.parse(list.find((x) => String(x.id) === restoreId)!.saved_at))}, para todo el grupo. La de ahora se guarda en el historial, así que se puede deshacer.`,
          'Volver a esta',
        );
        if (!ok) return;
        // Lo que no haya llegado al grupo no se pierde: al ponerla (`adopt`) se guarda como «(mis cambios)».
        await nube().restoreVersion(Number(restoreId));
        deps.adopt(await nube().fetchSong(s.id));
        d.close();
        render();
        deps.toast(`«${s.title}» ha vuelto a la versión elegida, para todo el grupo.`);
      }
    } catch (err) {
      deps.toast((err as Error).message || 'No se ha podido.', true);
    }
  });
  d.showModal();
}
