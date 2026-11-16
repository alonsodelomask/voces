import * as cloud from '../cloud/cloud';

/** En desarrollo, las pruebas pueden poner una nube de mentira (`window.__vocesNube`, como en la biblioteca). */
const nube = (): typeof cloud => (import.meta.env.DEV && (window as unknown as { __vocesNube?: typeof cloud }).__vocesNube) || cloud;
import { confirmDialog, esc } from '../ui/dialog';
import { saveFile } from '../native';
import { siteUrl } from '../site';
import { initials, setProfileNameShown } from './accountMenu';
import { loadPrefs, setPref } from './prefs';

/**
 * Ajustes de cuenta a pantalla completa, con una barra lateral de secciones (idea de flat.io, docs/AUDITORIA_FLAT.md):
 * Perfil (nombre, correo, con qué entras), Contraseña, Avisos (de este dispositivo), Funciones de IA y Tus datos
 * (descargarlos y eliminar la cuenta). Sin facturación, comunidad ni instrumentos: Vocify no los tiene.
 */
export interface SettingsDeps {
  toast: (msg: string, error?: boolean) => void;
  openGroup: () => void;
  openAuth: () => void;
}

type Section = 'perfil' | 'contrasena' | 'avisos' | 'ia' | 'datos';
const SECTIONS: { id: Section; label: string; icon: string; needsAccount: boolean }[] = [
  { id: 'perfil', label: 'Perfil', icon: '👤', needsAccount: true },
  { id: 'contrasena', label: 'Contraseña', icon: '🔑', needsAccount: true },
  { id: 'avisos', label: 'Avisos', icon: '🔔', needsAccount: false },
  { id: 'ia', label: 'Funciones de IA', icon: '✨', needsAccount: false },
  { id: 'datos', label: 'Tus datos', icon: '🗂', needsAccount: true },
];

let deps: SettingsDeps;
let dlg: HTMLDialogElement;
let section: Section = 'perfil';
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => dlg.querySelector(sel) as T;

export function openSettings(d: SettingsDeps, start?: string) {
  deps = d;
  dlg = document.querySelector<HTMLDialogElement>('#dlg-settings')!;
  if (!dlg.dataset.ready) build();
  const logged = nube().cloudEnabled && !!nube().user();
  section = (SECTIONS.find((s) => s.id === start)?.id ?? (logged ? 'perfil' : 'avisos')) as Section;
  if (!logged && SECTIONS.find((s) => s.id === section)!.needsAccount) section = 'avisos';
  void render();
  if (!dlg.open) dlg.showModal();
}

function build() {
  dlg.dataset.ready = '1';
  dlg.innerHTML = `
    <div class="bib aj">
      <aside class="bib-side">
        <div class="bib-brand"><b>Ajustes de cuenta</b></div>
        <nav class="bib-nav" aria-label="Secciones de los ajustes"></nav>
      </aside>
      <section class="bib-main">
        <header class="bib-head">
          <div class="bib-title"><h2 id="aj-title"></h2></div>
          <button class="btn icon bib-close" data-aj="close" title="Cerrar" aria-label="Cerrar los ajustes">✕</button>
        </header>
        <div class="aj-body" id="aj-body"></div>
      </section>
    </div>`;
  dlg.addEventListener('click', (e) => {
    const el = e.target as HTMLElement;
    const sec = el.closest<HTMLElement>('[data-aj-sec]')?.dataset.ajSec as Section | undefined;
    if (sec) {
      section = sec;
      return void render();
    }
    const a = el.closest<HTMLElement>('[data-aj]')?.dataset.aj;
    if (a) void act(a);
  });
  dlg.addEventListener('input', () => updatePasswordButton());
  dlg.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.pref) setPref(t.dataset.pref as 'autoUpdate' | 'groupNotices', t.checked);
  });
}

async function render() {
  const logged = nube().cloudEnabled && !!nube().user();
  $('.bib-nav').innerHTML = SECTIONS.filter((s) => logged || !s.needsAccount)
    .map((s) => `<button class="bib-sec${s.id === section ? ' on' : ''}" data-aj-sec="${s.id}"><span>${s.icon} ${s.label}</span></button>`)
    .join('');
  const sec = SECTIONS.find((s) => s.id === section)!;
  $('#aj-title').textContent = sec.label;
  const body = $('#aj-body');
  if (section === 'perfil') {
    body.innerHTML = `<div class="aj-card"><p class="intro">Cargando…</p></div>`;
    const u = nube().user()!;
    let name = '';
    try {
      name = await nube().getProfileName();
    } catch {
      /* sin conexión */
    }
    if (section !== 'perfil') return;
    const methods = nube().signInMethods();
    const pendingEmail = (u as { new_email?: string }).new_email;
    body.innerHTML = `
      <div class="aj-card">
        <div class="aj-who"><span class="acc-avatar big" aria-hidden="true">${esc(initials(name, u.email ?? ''))}</span>
          <span><b>${esc(name || (u.email ?? '').split('@')[0])}</b><small>Cuenta creada el ${new Date(u.created_at).toLocaleDateString('es')}</small></span></div>
        <h3>Información de la cuenta</h3>
        <label class="aj-field">Nombre para mostrar <small>Así te ven los de tu grupo.</small>
          <input id="aj-name" maxlength="60" value="${esc(name)}" autocomplete="name" /></label>
        <label class="aj-field">Correo electrónico
          <input id="aj-email" type="email" value="${esc(u.email ?? '')}" autocomplete="email" /></label>
        ${pendingEmail ? `<p class="aj-note">Falta confirmar el cambio a <b>${esc(pendingEmail)}</b>: abre el enlace que te hemos enviado allí.</p>` : ''}
        <div class="row"><button class="btn primary" data-aj="save-profile">Guardar cambios</button></div>
      </div>
      <div class="aj-card">
        <h3>Cómo entras</h3>
        <div class="aj-method"><span>✉ Correo y contraseña (o enlace por correo)</span><b class="${methods.includes('email') ? 'ok' : ''}">${methods.includes('email') ? 'Activado' : 'No'}</b></div>
        <div class="aj-method"><span> Iniciar sesión con Apple</span><b class="${methods.includes('apple') ? 'ok' : ''}">${methods.includes('apple') ? 'Vinculado' : 'Solo desde la app del iPhone'}</b></div>
      </div>
      <div class="aj-card">
        <h3>Tu grupo</h3>
        <p class="intro">Crear un grupo, unirte con un código, invitar y ver quién está.</p>
        <div class="row"><button class="btn" data-aj="group">👥 Abrir tu grupo</button></div>
      </div>`;
  } else if (section === 'contrasena') {
    body.innerHTML = `
      <div class="aj-card">
        <h3>Nueva contraseña</h3>
        <label class="aj-field">Nueva contraseña <small>Mínimo 8 caracteres.</small>
          <input id="aj-pass1" type="password" autocomplete="new-password" placeholder="Elige una contraseña" /></label>
        <label class="aj-field">Repite la contraseña
          <input id="aj-pass2" type="password" autocomplete="new-password" placeholder="Vuelve a escribirla" /></label>
        <p class="aj-note" id="aj-pass-hint"></p>
        <div class="row"><button class="btn primary" data-aj="save-pass" disabled>Cambiar mi contraseña</button></div>
      </div>`;
  } else if (section === 'avisos') {
    const p = loadPrefs();
    body.innerHTML = `
      <div class="aj-card">
        <h3>Cuando el grupo cambia una canción</h3>
        <label class="aj-toggle"><input type="checkbox" data-pref="autoUpdate" ${p.autoUpdate ? 'checked' : ''} />
          <span><b>Ponerla al día sola</b><small>Si la tienes abierta y otra persona del grupo la cambia, ves su versión al momento. Si lo quitas, te avisamos y la pones al día tú.</small></span></label>
        <label class="aj-toggle"><input type="checkbox" data-pref="groupNotices" ${p.groupNotices ? 'checked' : ''} />
          <span><b>Avisarme de los cambios del grupo</b><small>Un mensaje abajo cuando otra persona cambia la canción abierta o la quita del grupo.</small></span></label>
        <p class="aj-note">Estos avisos son de este dispositivo. Vocify no manda correos de avisos: solo los de tu cuenta (entrar, confirmar el correo, cambiar la contraseña).</p>
      </div>`;
  } else if (section === 'ia') {
    body.innerHTML = `
      <div class="aj-card">
        <h3>El asistente con IA</h3>
        <p>En <i>Editar › ✨ Asistente › IA</i> puedes pedir arreglos en lenguaje normal («añade una voz de bajo en los cuatro primeros compases») y ves la propuesta antes de aplicarla.</p>
        <ul class="aj-list">
          <li><b>Qué se envía:</b> tu petición y la canción abierta en texto (notas, acordes, nombres de las voces y tempo). Ni tu correo, ni tu nombre, ni audio.</li>
          <li><b>A quién:</b> a OpenAI, a través del servidor de Vocify. Pedimos que no guarde nada, y no lo usa para entrenar sus modelos.</li>
          <li><b>Límite:</b> 40 peticiones al día por persona, para que el servicio siga siendo gratuito.</li>
          <li><b>Sin la IA:</b> Revisar, Acordes y Crear voces funcionan en tu dispositivo sin enviar nada.</li>
        </ul>
        <p class="aj-note">Más detalle en la <a href="${esc(siteUrl('privacidad/'))}" target="_blank" rel="noopener">política de privacidad</a>.</p>
      </div>`;
  } else if (section === 'datos') {
    body.innerHTML = `
      <div class="aj-card">
        <h3>Descargar mis datos</h3>
        <p class="intro">Tu cuenta, tus grupos, sus miembros y las canciones compartidas, en un archivo JSON. Las canciones que solo están en este dispositivo se exportan desde la biblioteca (⋯ › Exportar).</p>
        <div class="row"><button class="btn" data-aj="export">⇣ Descargar mis datos</button></div>
      </div>
      <div class="aj-card aj-danger">
        <h3>Eliminar mi cuenta</h3>
        <p class="intro">Se borra tu cuenta y sales de todos tus grupos. Las canciones que compartiste se quedan en el grupo, sin tu nombre. Las de este dispositivo no se tocan. No se puede deshacer.</p>
        <div class="row"><button class="btn danger" data-aj="delete">Eliminar mi cuenta</button></div>
      </div>`;
  }
}

function updatePasswordButton() {
  const a = dlg.querySelector<HTMLInputElement>('#aj-pass1');
  const b = dlg.querySelector<HTMLInputElement>('#aj-pass2');
  const go = dlg.querySelector<HTMLButtonElement>('[data-aj="save-pass"]');
  const hint = dlg.querySelector<HTMLElement>('#aj-pass-hint');
  if (!a || !b || !go || !hint) return;
  const short = a.value.length > 0 && a.value.length < 8;
  const differ = b.value.length > 0 && a.value !== b.value;
  hint.textContent = short ? 'Le faltan caracteres: mínimo 8.' : differ ? 'Las dos contraseñas no coinciden.' : '';
  go.disabled = a.value.length < 8 || a.value !== b.value;
}

async function act(a: string) {
  try {
    if (a === 'close') return dlg.close();
    if (a === 'group') {
      dlg.close();
      return deps.openGroup();
    }
    if (a === 'save-profile') {
      const name = $<HTMLInputElement>('#aj-name').value.trim();
      const email = $<HTMLInputElement>('#aj-email').value.trim();
      if (!name) return deps.toast('Escribe un nombre para mostrar.', true);
      await nube().setProfileName(name);
      setProfileNameShown(name);
      let msg = 'Cambios guardados.';
      if (email && email.toLowerCase() !== (nube().user()?.email ?? '').toLowerCase()) {
        await nube().changeEmail(email);
        msg = `Nombre guardado. Para cambiar el correo, abre el enlace que te hemos enviado a ${email}.`;
      }
      deps.toast(msg);
      return void render();
    }
    if (a === 'save-pass') {
      const p = $<HTMLInputElement>('#aj-pass1').value;
      if (p.length < 8 || p !== $<HTMLInputElement>('#aj-pass2').value) return;
      await nube().updatePassword(p);
      deps.toast('Contraseña cambiada.');
      return void render();
    }
    if (a === 'export') {
      await saveFile(await nube().exportMyData(), 'vocify-mis-datos.json');
      return;
    }
    if (a === 'delete') {
      if (!(await confirmDialog('Eliminar mi cuenta', 'Se borrará tu cuenta y saldrás de todos tus grupos. Las canciones de este dispositivo no se tocan. Esto no se puede deshacer.', 'Eliminar mi cuenta'))) return;
      await nube().deleteAccount();
      dlg.close();
      deps.toast('Cuenta eliminada. Tus canciones siguen en este dispositivo.');
    }
  } catch (e) {
    deps.toast((e as Error).message || 'No se ha podido.', true);
  }
}
