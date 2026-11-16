import * as cloud from '../cloud/cloud';

/** En desarrollo, las pruebas pueden poner una nube de mentira (`window.__vocesNube`, como en la biblioteca). */
const nube = (): typeof cloud => (import.meta.env.DEV && (window as unknown as { __vocesNube?: typeof cloud }).__vocesNube) || cloud;
import { esc } from '../ui/dialog';
import { siteUrl } from '../site';
import { openExternal } from '../native';

/**
 * El menú de la cuenta, arriba a la derecha: un círculo con las iniciales y, al pulsarlo, el nombre y el correo,
 * Ajustes de cuenta, Tu grupo, Contáctanos, Ayuda y Cerrar sesión (o «Entrar o crear cuenta» sin sesión).
 * Idea tomada del menú de flat.io (docs/AUDITORIA_FLAT.md), con el aspecto de Vocify.
 */
export interface AccountMenuDeps {
  openSettings: (section?: string) => void;
  openGroup: () => void;
  openHelp: () => void;
  openAuth: () => void;
  toast: (msg: string, error?: boolean) => void;
}

let deps: AccountMenuDeps;
let btn: HTMLButtonElement;
let pop: HTMLElement;
/** Nombre del perfil (se lee una vez por sesión y al cambiarlo). */
let profileName = '';

/** Iniciales para el círculo: de las dos primeras palabras del nombre o, si no hay, del correo. */
export function initials(name: string, email = ''): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  const local = email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '');
  return local.slice(0, 2).toUpperCase() || '?';
}

export function setProfileNameShown(name: string) {
  profileName = name;
  paint();
}

export function initAccountMenu(d: AccountMenuDeps) {
  deps = d;
  btn = document.querySelector<HTMLButtonElement>('#btn-account')!;
  pop = document.querySelector<HTMLElement>('#account-menu')!;
  btn.onclick = (e) => {
    e.stopPropagation();
    if (pop.hidden) open();
    else close();
  };
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !pop.contains(e.target as Node)) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !pop.hidden) {
      close();
      btn.focus();
    }
  });
  pop.addEventListener('click', (e) => {
    const a = (e.target as HTMLElement).closest<HTMLElement>('[data-acc]')?.dataset.acc;
    if (!a) return;
    close();
    if (a === 'profile') deps.openSettings('perfil');
    if (a === 'settings') deps.openSettings();
    if (a === 'group') deps.openGroup();
    if (a === 'help') deps.openHelp();
    if (a === 'auth') deps.openAuth();
    if (a === 'contact') openExternal(siteUrl('soporte/'));
    if (a === 'out')
      void nube().signOut().then(
        () => deps.toast('Sesión cerrada. Tus canciones siguen en este dispositivo.'),
        (err) => deps.toast((err as Error).message, true),
      );
  });
  nube().onAuth(() => {
    profileName = '';
    void refreshName();
  });
  void refreshName();
}

async function refreshName() {
  paint();
  if (!nube().user()) return;
  try {
    profileName = await nube().getProfileName();
  } catch {
    /* sin conexión: las iniciales del correo */
  }
  paint();
}

function paint() {
  const u = nube().user();
  const email = u?.email ?? '';
  btn.textContent = u ? initials(profileName, email) : '';
  btn.classList.toggle('signed', !!u);
  btn.title = u ? `Tu cuenta: ${profileName || email}` : 'Entrar o crear cuenta';
  btn.setAttribute('aria-label', u ? `Tu cuenta (${profileName || email})` : 'Entrar o crear cuenta');
}

function open() {
  fill();
  pop.hidden = false;
  btn.setAttribute('aria-expanded', 'true');
  pop.querySelector<HTMLElement>('button')?.focus();
  // Si el nombre aún no ha llegado (sin conexión al arrancar, o recién entrada), se pide y se repinta.
  if (nube().user() && !profileName)
    void refreshName().then(() => {
      if (!pop.hidden) fill();
    });
}

/** Pinta el círculo y el contenido del menú con lo que se sabe ahora. */
function fill() {
  paint();
  const u = nube().user();
  const email = u?.email ?? '';
  const b = (a: string, label: string, cls = '') => `<button role="menuitem" class="${cls}" data-acc="${a}">${label}</button>`;
  pop.innerHTML = u
    ? `<div class="acc-head">
        <span class="acc-avatar big" aria-hidden="true">${esc(initials(profileName, email))}</span>
        <span class="acc-who"><b>${esc(profileName || email.split('@')[0])}</b><small>${esc(email)}</small>
          <button class="acc-link" data-acc="profile">Ver perfil</button></span>
      </div>
      ${b('settings', '⚙ Ajustes de cuenta')}${b('group', '👥 Tu grupo')}<hr />${b('contact', '✉ Contáctanos')}${b('help', '? Ayuda')}<hr />${b('out', 'Cerrar sesión')}`
    : `<div class="acc-head"><span class="acc-avatar big" aria-hidden="true">👤</span><span class="acc-who"><b>Sin cuenta</b><small>Tus canciones se guardan en este dispositivo.</small></span></div>
      ${nube().cloudEnabled ? b('auth', 'Entrar o crear cuenta', 'primary') : ''}<hr />${b('contact', '✉ Contáctanos')}${b('help', '? Ayuda')}`;
}

function close() {
  pop.hidden = true;
  btn.setAttribute('aria-expanded', 'false');
}
