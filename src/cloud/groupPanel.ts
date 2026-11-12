import { uid, type Song } from '../model';
import { confirmDialog, esc, form } from '../ui/dialog';
import * as cloud from './cloud';
import { appleSignInAvailable } from '../native';

export interface GroupDeps {
  song: () => Song;
  openSong: (s: Song) => void;
  /** Guarda localmente y sube a la nube. */
  saveAndSync: () => Promise<void>;
  toast: (msg: string, error?: boolean) => void;
}

/** Panel «Grupo y cuenta»: iniciar sesión, crear/unirse a grupos, invitar y compartir canciones. */
export async function openGroupPanel(deps: GroupDeps) {
  const dlg = document.createElement('dialog');
  dlg.className = 'dlg group-dlg';
  document.body.appendChild(dlg);
  dlg.addEventListener('close', () => dlg.remove());
  dlg.showModal();
  let selected: string | null = deps.song().groupId ?? null;

  const close = `<div class="row end"><button class="btn" data-close>Cerrar</button></div>`;
  const wireClose = () => dlg.querySelectorAll<HTMLButtonElement>('[data-close]').forEach((b) => (b.onclick = () => dlg.close()));

  async function render() {
    if (!cloud.cloudEnabled) {
      dlg.innerHTML = `<h2>Grupo y cuenta</h2><p class="intro">Esta instalación de Voces todavía no tiene la nube configurada, así que las canciones se guardan solo en este dispositivo. Para compartir con tu grupo hay que conectar un proyecto de Supabase (ver <code>docs/BACKEND.md</code>).</p>${close}`;
      return wireClose();
    }
    if (!cloud.user()) return renderLogin();
    dlg.innerHTML = `<h2>Grupo y cuenta</h2><p class="intro">Cargando…</p>`;
    try {
      const [name, groups] = await Promise.all([cloud.getProfileName(), cloud.myGroups()]);
      if (!name) {
        const r = await form({ title: '¿Cómo te llamas?', intro: 'Así te verán tus compañeros del grupo.', fields: [{ name: 'n', label: 'Nombre', value: cloud.user()?.email?.split('@')[0] ?? '' }], okLabel: 'Guardar' });
        if (r?.values.n.trim()) await cloud.setProfileName(r.values.n.trim());
      }
      if (!selected && groups.length) selected = groups[0].id;
      const g = groups.find((x) => x.id === selected) ?? null;
      dlg.innerHTML = `
        <h2>Grupo y cuenta</h2>
        <div class="acct">
          <span>👤 <b>${esc(name || cloud.user()?.email || '')}</b> <small>${esc(cloud.user()?.email ?? '')}</small></span>
          <span class="acct-btns">
            <button class="btn small" id="g-rename">Cambiar nombre</button>
            <button class="btn small" id="g-out">Cerrar sesión</button>
          </span>
        </div>
        <div class="group-tabs">
          ${groups.map((x) => `<button class="chip ${x.id === selected ? 'on' : ''}" data-g="${x.id}">${esc(x.name)}</button>`).join('')}
          <button class="chip add" id="g-new">＋ Crear grupo</button>
          <button class="chip add" id="g-join">🔑 Unirme con código</button>
        </div>
        <div id="g-body">${g ? '' : '<p class="intro">Aún no estás en ningún grupo. Crea uno para tu banda o únete con el código que te pase alguien.</p>'}</div>
        <div class="row end">
          <button class="btn danger" id="g-delete" style="margin-right:auto">Eliminar mi cuenta</button>
          <button class="btn" data-close>Cerrar</button>
        </div>`;
      wireClose();
      dlg.querySelectorAll<HTMLButtonElement>('[data-g]').forEach((b) => (b.onclick = () => ((selected = b.dataset.g!), render())));
      dlg.querySelector<HTMLButtonElement>('#g-new')!.onclick = createGroup;
      dlg.querySelector<HTMLButtonElement>('#g-join')!.onclick = joinGroup;
      dlg.querySelector<HTMLButtonElement>('#g-out')!.onclick = async () => {
        await cloud.signOut();
        render();
      };
      dlg.querySelector<HTMLButtonElement>('#g-rename')!.onclick = async () => {
        const r = await form({ title: 'Tu nombre', fields: [{ name: 'n', label: 'Nombre', value: name }], okLabel: 'Guardar' });
        if (r?.values.n.trim()) {
          await cloud.setProfileName(r.values.n.trim());
          render();
        }
      };
      dlg.querySelector<HTMLButtonElement>('#g-delete')!.onclick = async () => {
        if (!(await confirmDialog('Eliminar cuenta', 'Se borrará tu cuenta y saldrás de todos tus grupos. Las canciones de este dispositivo no se tocan. Esto no se puede deshacer.', 'Eliminar cuenta'))) return;
        try {
          await cloud.deleteAccount();
          deps.toast('Cuenta eliminada.');
          render();
        } catch (e) {
          deps.toast((e as Error).message, true);
        }
      };
      if (g) await renderGroup(g, dlg.querySelector<HTMLElement>('#g-body')!);
    } catch (e) {
      dlg.innerHTML = `<h2>Grupo y cuenta</h2><p class="err">${esc((e as Error).message)}</p>${close}`;
      wireClose();
    }
  }

  async function renderGroup(g: cloud.Group, box: HTMLElement) {
    const [mem, songs] = await Promise.all([cloud.members(g.id), cloud.groupSongs(g.id)]);
    const owner = g.role === 'owner';
    const me = cloud.user()?.id;
    const names = new Map(mem.map((m) => [m.user_id, m.display_name]));
    const cur = deps.song();
    box.innerHTML = `
      <div class="invite">
        <div><small>Código de invitación</small><b class="code">${esc(g.invite_code)}</b></div>
        <button class="btn small" id="g-copy">Copiar</button>
        <button class="btn small" id="g-share">Compartir</button>
        ${owner ? '<button class="btn small" id="g-regen" title="Invalida el código anterior">Nuevo código</button>' : ''}
      </div>
      <h3>Canciones del grupo (${songs.length})</h3>
      <div class="g-songs">${
        songs.length
          ? songs
              .map(
                (s) => `<div class="lib-item"><div class="meta" data-open="${esc(s.id)}"><b></b><small>${esc(names.get(s.updated_by ?? '') ?? '¿?')} · ${new Date(s.updated_at).toLocaleString()}</small></div>${s.id === cur.id ? '<span class="chip on">abierta</span>' : ''}</div>`,
              )
              .join('')
          : '<p class="intro">Todavía no hay canciones compartidas.</p>'
      }</div>
      <div class="row">
        <button class="btn primary" id="g-upload">${cur.groupId === g.id ? '✓ «' + esc(cur.title) + '» ya está en el grupo' : '⇪ Compartir «' + esc(cur.title) + '» con el grupo'}</button>
      </div>
      <h3>Miembros (${mem.length}/${g.max_members})</h3>
      <div class="g-members">${mem
        .map(
          (m) => `<div class="member"><span>${m.role === 'owner' ? '⭐' : '🎤'} ${esc(m.display_name)}${m.user_id === me ? ' <small>(tú)</small>' : ''}</span>${owner && m.user_id !== me ? `<button class="btn small" data-kick="${m.user_id}">Quitar</button>` : ''}</div>`,
        )
        .join('')}</div>
      <div class="row">
        ${owner ? `<label class="field">Máximo de miembros <input type="number" id="g-max" min="${mem.length}" max="200" value="${g.max_members}"/></label>` : ''}
        <button class="btn danger" id="g-leave" style="margin-left:auto">Salir del grupo</button>
      </div>`;
    // Títulos con textContent (evita inyectar HTML).
    box.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => {
      el.querySelector('b')!.textContent = songs.find((s) => s.id === el.dataset.open)?.title ?? '';
      el.onclick = async () => {
        try {
          deps.openSong(await cloud.fetchSong(el.dataset.open!));
          dlg.close();
        } catch (e) {
          deps.toast((e as Error).message, true);
        }
      };
    });
    const inviteText = `Únete a «${g.name}» en Voces con el código ${g.invite_code}`;
    box.querySelector<HTMLButtonElement>('#g-copy')!.onclick = async () => {
      await navigator.clipboard?.writeText(g.invite_code);
      deps.toast('Código copiado.');
    };
    box.querySelector<HTMLButtonElement>('#g-share')!.onclick = async () => {
      if (navigator.share) await navigator.share({ title: 'Voces', text: inviteText, url: location.href.split('#')[0] }).catch(() => {});
      else {
        await navigator.clipboard?.writeText(inviteText);
        deps.toast('Invitación copiada.');
      }
    };
    box.querySelector<HTMLButtonElement>('#g-regen')?.addEventListener('click', async () => {
      await cloud.regenerateInvite(g.id);
      render();
    });
    box.querySelector<HTMLInputElement>('#g-max')?.addEventListener('change', async (e) => {
      try {
        await cloud.setMaxMembers(g.id, parseInt((e.target as HTMLInputElement).value));
        deps.toast('Límite actualizado.');
      } catch (err) {
        deps.toast((err as Error).message, true);
      }
    });
    box.querySelectorAll<HTMLButtonElement>('[data-kick]').forEach(
      (b) =>
        (b.onclick = async () => {
          if (!(await confirmDialog('Quitar miembro', `¿Quitar a ${names.get(b.dataset.kick!)} del grupo?`, 'Quitar'))) return;
          await cloud.removeMember(g.id, b.dataset.kick!);
          render();
        }),
    );
    box.querySelector<HTMLButtonElement>('#g-upload')!.onclick = async () => {
      const s = deps.song();
      if (s.groupId === g.id) return;
      try {
        if (s.groupId && s.groupId !== g.id) {
          // Ya está en otro grupo: se comparte una copia.
          const copy: Song = JSON.parse(JSON.stringify(s));
          copy.id = uid();
          copy.groupId = g.id;
          copy.remoteUpdatedAt = undefined;
          deps.openSong(copy);
        } else {
          s.groupId = g.id;
        }
        await deps.saveAndSync();
        deps.toast(`Compartida con «${g.name}». Los cambios se sincronizan solos.`);
        render();
      } catch (e) {
        deps.toast((e as Error).message, true);
      }
    };
    box.querySelector<HTMLButtonElement>('#g-leave')!.onclick = async () => {
      if (!(await confirmDialog('Salir del grupo', `¿Salir de «${g.name}»? Dejarás de ver sus canciones.`, 'Salir'))) return;
      await cloud.leaveGroup(g.id);
      selected = null;
      render();
    };
  }

  async function createGroup() {
    const r = await form({
      title: 'Crear grupo',
      intro: 'Tu banda o coro. Después compartes el código para que se unan los demás.',
      fields: [
        { name: 'name', label: 'Nombre del grupo', placeholder: 'Los de los martes' },
        { name: 'max', label: 'Número máximo de miembros', type: 'number', value: 8, min: 1, max: 200 },
      ],
      okLabel: 'Crear',
    });
    if (!r?.values.name.trim()) return;
    try {
      const g = await cloud.createGroup(r.values.name.trim());
      const max = parseInt(r.values.max);
      if (max && max !== g.max_members) await cloud.setMaxMembers(g.id, max);
      selected = g.id;
      deps.toast(`Grupo creado. Código: ${g.invite_code}`);
    } catch (e) {
      deps.toast((e as Error).message, true);
    }
    render();
  }

  async function joinGroup() {
    const r = await form({ title: 'Unirme a un grupo', fields: [{ name: 'code', label: 'Código de invitación', placeholder: 'A1B2C3D4' }], okLabel: 'Unirme' });
    if (!r?.values.code.trim()) return;
    try {
      const g = await cloud.joinGroup(r.values.code);
      selected = g.id;
      deps.toast(`¡Bienvenido a «${g.name}»!`);
    } catch (e) {
      deps.toast((e as Error).message, true);
    }
    render();
  }

  function renderLogin() {
    dlg.innerHTML = `
      <h2>Entrar en Voces</h2>
      <p class="intro">Con una cuenta puedes crear el grupo de tu banda, compartir canciones y usar la IA.</p>
      ${appleSignInAvailable ? '<button type="button" class="btn apple-btn" id="l-apple"> Iniciar sesión con Apple</button><p class="or">o con tu email (te mandamos un correo para entrar)</p>' : '<p class="intro">Te mandamos un correo para entrar: sin contraseñas.</p>'}
      <form class="form" id="l-form">
        <label class="field col">Email <input type="email" id="l-email" required autocomplete="email" placeholder="tu@email.com"/></label>
        <div id="l-code-row" hidden><label class="field col">Código de 6 dígitos <input id="l-code" inputmode="numeric" autocomplete="one-time-code" maxlength="10"/></label></div>
        <div id="l-pass-row" hidden><label class="field col">Contraseña <input type="password" id="l-pass" autocomplete="current-password"/></label></div>
        <p class="err" id="l-err"></p>
        <p class="legal">Al entrar aceptas la <a href="https://voces-web.onrender.com/privacidad.html" target="_blank" rel="noopener">política de privacidad</a>.</p>
        <div class="row end"><button type="button" class="btn small" id="l-mode" style="margin-right:auto">Usar contraseña</button><button type="button" class="btn" data-close>Cerrar</button><button class="btn primary" id="l-go">Enviarme el correo</button></div>
      </form>`;
    wireClose();
    dlg.querySelector<HTMLButtonElement>('#l-apple')?.addEventListener('click', async () => {
      const err = dlg.querySelector<HTMLElement>('#l-err')!;
      err.textContent = '';
      try {
        if ((await cloud.signInWithApple()) === 'signed-in') await render();
      } catch (ex) {
        err.textContent = (ex as Error).message;
      }
    });
    let sent = false;
    let passMode = false;
    dlg.querySelector<HTMLButtonElement>('#l-mode')!.onclick = (e) => {
      passMode = !passMode;
      sent = false;
      dlg.querySelector<HTMLElement>('#l-pass-row')!.hidden = !passMode;
      dlg.querySelector<HTMLElement>('#l-code-row')!.hidden = true;
      (e.target as HTMLButtonElement).textContent = passMode ? 'Usar código por email' : 'Usar contraseña';
      dlg.querySelector<HTMLButtonElement>('#l-go')!.textContent = passMode ? 'Entrar' : 'Enviarme el correo';
    };
    const err = dlg.querySelector<HTMLElement>('#l-err')!;
    const go = dlg.querySelector<HTMLButtonElement>('#l-go')!;
    dlg.querySelector<HTMLFormElement>('#l-form')!.onsubmit = async (e) => {
      e.preventDefault();
      err.textContent = '';
      const email = dlg.querySelector<HTMLInputElement>('#l-email')!.value.trim();
      go.disabled = true;
      try {
        if (passMode) {
          await cloud.signInWithPassword(email, dlg.querySelector<HTMLInputElement>('#l-pass')!.value);
          await render();
        } else if (!sent) {
          await cloud.sendCode(email);
          sent = true;
          dlg.querySelector<HTMLElement>('#l-code-row')!.hidden = false;
          dlg.querySelector<HTMLInputElement>('#l-code')!.focus();
          go.textContent = 'Entrar';
          err.textContent = 'Te hemos enviado un correo: pulsa el enlace para entrar (o escribe aquí el código, si trae uno). Revisa también el spam.';
        } else {
          await cloud.verifyCode(email, dlg.querySelector<HTMLInputElement>('#l-code')!.value);
          await render();
        }
      } catch (ex) {
        err.textContent = (ex as Error).message;
      } finally {
        go.disabled = false;
      }
    };
  }

  await render();
}
