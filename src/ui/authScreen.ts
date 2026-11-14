// Pantalla de entrada: a la izquierda (arriba en el móvil) las líneas de Voces en movimiento; a la derecha, entrar,
// registrarse, recuperar la contraseña o seguir sin cuenta. La misma pantalla sirve en la web y dentro de la app.
import * as cloud from '../cloud/cloud';
import { siteUrl } from '../site';
import { demoSong } from '../demo';
import { appleSignInAvailable, isNative } from '../native';
import { Visualizer } from '../viz/visualizer';

type Mode = 'login' | 'signup' | 'magic' | 'forgot' | 'newpass';

export interface AuthOptions {
  /** Muestra «Continuar sin cuenta» (al abrir la app). Si no, una ✕ para volver. */
  allowSkip: boolean;
  mode?: Mode;
  onClose?: (signedIn: boolean) => void;
}

const TITLES: Record<Mode, string> = {
  login: 'Entra en Vocify',
  signup: 'Crea tu cuenta',
  magic: 'Entra con un enlace',
  forgot: 'Recupera tu contraseña',
  newpass: 'Elige una contraseña nueva',
};

let open: HTMLElement | null = null;

export function authScreenOpen() {
  return open !== null;
}

export function showAuthScreen(opts: AuthOptions): void {
  if (open) return;
  let mode: Mode = opts.mode ?? 'login';
  const root = document.createElement('div');
  root.className = 'auth';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'a-title');
  root.innerHTML = `
    <div class="auth-hero" aria-hidden="true">
      <canvas></canvas>
      <div class="auth-tag">
        <p class="auth-slogan">Todas las voces de tu grupo,<br/>en color.</p>
        <p class="auth-sub">Importa la partitura, escucha cada voz y ensayad juntos.</p>
      </div>
    </div>
    <div class="auth-panel">
      ${opts.allowSkip ? '' : '<button class="btn icon small auth-close" id="a-close" aria-label="Cerrar">✕</button>'}
      <div class="auth-box">
        <div class="auth-brand"><img src="./icon.svg" alt="" /><span>Vocify</span></div>
        <h1 id="a-title"></h1>
        <p class="auth-intro" id="a-intro"></p>
        <div id="a-social">
          ${appleSignInAvailable ? '<button type="button" class="btn apple-btn" id="a-apple"> Iniciar sesión con Apple</button><div class="auth-or"><span>o</span></div>' : ''}
        </div>
        <form id="a-form" novalidate>
          <label class="auth-field" data-for="name">Tu nombre <small>(lo verán los de tu grupo)</small>
            <input id="a-name" autocomplete="name" maxlength="60" placeholder="Nombre" />
          </label>
          <label class="auth-field" data-for="email">Correo electrónico
            <input id="a-email" type="email" autocomplete="email" inputmode="email" placeholder="tu@correo.com" />
          </label>
          <label class="auth-field" data-for="password"><span class="auth-label-row">Contraseña <button type="button" class="auth-link" id="a-forgot">¿La has olvidado?</button></span>
            <input id="a-password" type="password" autocomplete="current-password" placeholder="Mínimo 8 caracteres" />
          </label>
          <label class="auth-field" data-for="password2">Repite la contraseña
            <input id="a-password2" type="password" autocomplete="new-password" />
          </label>
          <p class="auth-msg" id="a-msg" role="status" aria-live="polite"></p>
          <button class="btn primary auth-submit" id="a-submit"></button>
        </form>
        <div class="auth-alt">
          ${isNative ? '' : '<button type="button" class="auth-link" id="a-magic">Prefiero que me mandéis un enlace por correo</button>'}
          <button type="button" class="auth-link" id="a-back">← Volver a entrar con contraseña</button>
        </div>
        <p class="auth-switch" id="a-switch"></p>
        ${opts.allowSkip ? '<button type="button" class="btn ghost auth-skip" id="a-skip">Continuar sin cuenta</button><p class="legal">Sin cuenta todo funciona en este dispositivo. La cuenta sirve para compartir con tu grupo y usar la IA.</p>' : ''}
        <p class="legal">Al continuar aceptas las <a href="${siteUrl('condiciones/')}" target="_blank" rel="noopener">condiciones de uso</a> y la <a href="${siteUrl('privacidad/')}" target="_blank" rel="noopener">política de privacidad</a>.</p>
      </div>
    </div>`;
  document.body.appendChild(root);
  open = root;
  const $ = <T extends HTMLElement>(id: string) => root.querySelector('#' + id) as T;

  // ---- Fondo animado ----
  const canvas = root.querySelector('canvas')!;
  const viz = new Visualizer(canvas);
  viz.opts = { zoom: 0.9, showTitle: false, showChord: true, showNames: false, showLyrics: false, watermark: '' };
  const song = demoSong();
  viz.setSong(song);
  const dur = song.voices.reduce((e, v) => Math.max(e, ...v.notes.map((n) => n.start + n.dur)), 0) || 1;
  const t0 = performance.now();
  let raf = 0;
  const frame = () => {
    viz.render(((performance.now() - t0) / 1000 + 2) % dur, true);
    raf = requestAnimationFrame(frame);
  };
  frame();

  // ---- Modos ----
  const show = (sel: string, on: boolean) => root.querySelectorAll<HTMLElement>(sel).forEach((e) => (e.hidden = !on));
  const msg = (text: string, kind: 'err' | 'ok' | '' = '') => {
    const m = $('a-msg');
    m.textContent = text;
    m.className = 'auth-msg ' + kind;
  };
  function setMode(m: Mode) {
    mode = m;
    $('a-title').textContent = TITLES[m];
    const intro: Record<Mode, string> = {
      login: '',
      signup: 'Con una cuenta puedes crear el grupo de tu banda, compartir canciones y usar la IA.',
      magic: 'Te mandamos un correo con un enlace: lo pulsas y entras, sin contraseña.',
      forgot: 'Te mandamos un correo con un enlace para elegir una contraseña nueva.',
      newpass: 'Escribe la contraseña nueva para tu cuenta.',
    };
    $('a-intro').textContent = intro[m];
    show('[data-for=name]', m === 'signup');
    show('[data-for=email]', m !== 'newpass');
    show('[data-for=password]', m === 'login' || m === 'signup' || m === 'newpass');
    show('[data-for=password2]', m === 'signup' || m === 'newpass');
    show('#a-forgot', m === 'login');
    show('#a-social', m === 'login' || m === 'signup');
    root.querySelector<HTMLElement>('#a-magic')?.toggleAttribute('hidden', m !== 'login');
    show('#a-back', m === 'magic' || m === 'forgot');
    $<HTMLInputElement>('a-password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
    $('a-submit').textContent = { login: 'Entrar', signup: 'Crear cuenta', magic: 'Enviarme el enlace', forgot: 'Enviarme el correo', newpass: 'Guardar contraseña' }[m];
    $('a-switch').innerHTML =
      m === 'login'
        ? '¿Aún no tienes cuenta? <button type="button" class="auth-link strong" data-m="signup">Regístrate</button>'
        : m === 'signup'
          ? '¿Ya tienes cuenta? <button type="button" class="auth-link strong" data-m="login">Entra</button>'
          : '';
    msg('');
    (m === 'newpass' ? $('a-password') : m === 'signup' ? $('a-name') : $('a-email')).focus({ preventScroll: true });
  }
  setMode(mode);

  root.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-m]');
    if (b) setMode(b.dataset.m as Mode);
  });
  $('a-forgot').onclick = () => setMode('forgot');
  $('a-back').onclick = () => setMode('login');
  root.querySelector<HTMLElement>('#a-magic')?.addEventListener('click', () => setMode('magic'));

  let signedIn = false;
  const close = () => {
    cancelAnimationFrame(raf);
    unsub();
    root.remove();
    open = null;
    document.removeEventListener('keydown', onKey);
    opts.onClose?.(signedIn);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !opts.allowSkip) close();
  };
  document.addEventListener('keydown', onKey);
  root.querySelector<HTMLElement>('#a-close')?.addEventListener('click', close);
  root.querySelector<HTMLElement>('#a-skip')?.addEventListener('click', () => {
    try {
      localStorage.setItem('voces.sinCuenta', '1');
    } catch {
      /* nada */
    }
    close();
  });
  // En cuanto hay sesión (contraseña, Apple o el enlace del correo en otra pestaña), se cierra.
  const unsub = cloud.onAuth((u) => {
    if (u && mode !== 'newpass') {
      signedIn = true;
      close();
    }
  });

  root.querySelector('#a-apple')?.addEventListener('click', async () => {
    msg('');
    try {
      if ((await cloud.signInWithApple()) === 'signed-in') {
        signedIn = true;
        close();
      }
    } catch (ex) {
      msg((ex as Error).message, 'err');
    }
  });

  $<HTMLFormElement>('a-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = $<HTMLInputElement>('a-name').value.trim();
    const email = $<HTMLInputElement>('a-email').value.trim();
    const pw = $<HTMLInputElement>('a-password').value;
    const pw2 = $<HTMLInputElement>('a-password2').value;
    if (mode !== 'newpass' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return msg('Escribe un correo válido.', 'err');
    if ((mode === 'signup' || mode === 'newpass') && pw.length < 8) return msg('La contraseña necesita al menos 8 caracteres.', 'err');
    if ((mode === 'signup' || mode === 'newpass') && pw !== pw2) return msg('Las dos contraseñas no coinciden.', 'err');
    if (mode === 'login' && !pw) return msg('Escribe tu contraseña.', 'err');
    const submit = $<HTMLButtonElement>('a-submit');
    submit.disabled = true;
    msg('Un momento…');
    try {
      switch (mode) {
        case 'login':
          await cloud.signInWithPassword(email, pw);
          signedIn = true;
          close();
          return;
        case 'signup': {
          const r = await cloud.signUp(email, pw, name);
          if (r === 'signed-in') {
            signedIn = true;
            close();
            return;
          }
          setMode('login');
          $<HTMLInputElement>('a-email').value = email;
          msg(`¡Casi está! Te hemos enviado un correo a ${email}. Ábrelo y pulsa el enlace para activar la cuenta; después entra aquí con tu contraseña.`, 'ok');
          return;
        }
        case 'magic':
          await cloud.sendCode(email);
          msg(`Te hemos enviado un enlace a ${email}. Ábrelo en este mismo navegador para entrar. Revisa también el spam.`, 'ok');
          return;
        case 'forgot':
          await cloud.resetPassword(email);
          msg(
            isNative
              ? `Te hemos enviado un correo a ${email}. Ábrelo, elige la contraseña nueva en la web y vuelve aquí para entrar con ella.`
              : `Te hemos enviado un correo a ${email}. Ábrelo en este navegador para elegir la contraseña nueva.`,
            'ok',
          );
          return;
        case 'newpass':
          await cloud.updatePassword(pw);
          signedIn = true;
          close();
          return;
      }
    } catch (ex) {
      msg((ex as Error).message, 'err');
    } finally {
      submit.disabled = false;
    }
  };
}

