// Diálogos sencillos construidos con <dialog>, que funcionan igual en web, iOS y Android.

export interface Field {
  name: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'checkbox' | 'textarea' | 'email' | 'password';
  value?: string | number | boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
}

export interface FormResult {
  action: string;
  values: Record<string, string>;
  checks: Record<string, boolean>;
}

export interface FormOptions {
  title: string;
  intro?: string;
  fields?: Field[];
  /** Botones extra a la izquierda (p. ej. "Eliminar"). */
  extra?: { action: string; label: string; danger?: boolean }[];
  okLabel?: string;
  cancelLabel?: string;
  /** Contenido HTML adicional ya preparado (se inserta tras los campos). */
  body?: HTMLElement;
}

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function form(opts: FormOptions): Promise<FormResult | null> {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'dlg';
    const f = document.createElement('form');
    f.method = 'dialog';
    f.className = 'form';
    let html = `<h2>${esc(opts.title)}</h2>`;
    if (opts.intro) html += `<p class="intro">${opts.intro}</p>`;
    for (const fd of opts.fields ?? []) {
      const id = 'f_' + fd.name;
      const attrs = [
        `name="${fd.name}"`,
        `id="${id}"`,
        fd.placeholder ? `placeholder="${esc(fd.placeholder)}"` : '',
        fd.min !== undefined ? `min="${fd.min}"` : '',
        fd.max !== undefined ? `max="${fd.max}"` : '',
        fd.step !== undefined ? `step="${fd.step}"` : '',
      ].join(' ');
      const hint = fd.hint ? `<small class="hint-s">${fd.hint}</small>` : '';
      switch (fd.type) {
        case 'checkbox':
          html += `<label class="check"><input type="checkbox" ${attrs} ${fd.value ? 'checked' : ''}/> ${esc(fd.label)}</label>${hint}`;
          break;
        case 'select':
          html += `<label class="field col">${esc(fd.label)}<select ${attrs}>${(fd.options ?? [])
            .map((o) => `<option value="${esc(o.value)}" ${String(fd.value) === o.value ? 'selected' : ''}>${esc(o.label)}</option>`)
            .join('')}</select>${hint}</label>`;
          break;
        case 'textarea':
          html += `<label class="field col">${esc(fd.label)}<textarea ${attrs} rows="3">${esc(String(fd.value ?? ''))}</textarea>${hint}</label>`;
          break;
        default:
          html += `<label class="field col">${esc(fd.label)}<input type="${fd.type ?? 'text'}" ${attrs} value="${esc(String(fd.value ?? ''))}"/>${hint}</label>`;
      }
    }
    f.innerHTML = html;
    if (opts.body) f.appendChild(opts.body);
    const row = document.createElement('div');
    row.className = 'row end';
    // Solo «Aceptar» envía el formulario. Intro (en un campo o en una casilla) pulsa el primer botón de envío, así que
    // si lo fueran también los extra («Quitar la letra», «Eliminar») o «Cancelar», Intro haría eso en vez de aceptar.
    const boton = (value: string, label: string, clase: string) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.value = value;
      b.className = clase;
      b.textContent = label;
      b.onclick = () => dlg.close(value);
      return b;
    };
    for (const x of opts.extra ?? []) {
      const b = boton(x.action, x.label, x.danger ? 'btn danger' : 'btn');
      b.style.marginRight = 'auto';
      row.appendChild(b);
    }
    row.appendChild(boton('cancel', opts.cancelLabel ?? 'Cancelar', 'btn'));
    if (opts.okLabel !== '') row.insertAdjacentHTML('beforeend', `<button value="ok" class="btn primary">${esc(opts.okLabel ?? 'Aceptar')}</button>`);
    f.appendChild(row);
    dlg.appendChild(f);
    document.body.appendChild(dlg);
    dlg.addEventListener('close', () => {
      const action = dlg.returnValue || 'cancel';
      const values: Record<string, string> = {};
      const checks: Record<string, boolean> = {};
      for (const el of Array.from(f.elements) as HTMLInputElement[]) {
        if (!el.name) continue;
        if (el.type === 'checkbox') checks[el.name] = el.checked;
        else values[el.name] = el.value;
      }
      dlg.remove();
      resolve(action === 'cancel' ? null : { action, values, checks });
    });
    dlg.showModal();
    const first = f.querySelector<HTMLElement>('input:not([type=checkbox]),textarea,select');
    first?.focus();
  });
}

export function confirmDialog(title: string, text: string, okLabel = 'Aceptar'): Promise<boolean> {
  return form({ title, intro: esc(text), okLabel }).then((r) => !!r);
}
