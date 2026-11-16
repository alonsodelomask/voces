/**
 * Preferencias de este dispositivo (Ajustes de cuenta › Avisos). Van en `localStorage`: son de cada teléfono u
 * ordenador, no de la cuenta.
 */
export interface Prefs {
  /** Cuando otra persona del grupo cambia la canción abierta, ponerla al día sola (si no, se avisa con un botón). */
  autoUpdate: boolean;
  /** Avisos (mensajes abajo) de lo que pasa en el grupo. */
  groupNotices: boolean;
}

const KEY = 'voces.ajustes.v1';
const DEFAULTS: Prefs = { autoUpdate: true, groupNotices: true };

export function loadPrefs(): Prefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Prefs>;
    return {
      autoUpdate: typeof p.autoUpdate === 'boolean' ? p.autoUpdate : DEFAULTS.autoUpdate,
      groupNotices: typeof p.groupNotices === 'boolean' ? p.groupNotices : DEFAULTS.groupNotices,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  const p = { ...loadPrefs(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: vale para esta vez */
  }
}
