/**
 * Errores de la API. El mensaje es español llano y seguro de enseñar: nunca lleva claves, SQL ni respuestas de proveedores.
 */
export const errorStatus = {
  unauthorized: 401,
  'invalid-request': 400,
  'rate-limited': 429,
  'ai-unavailable': 503,
  'ai-failed': 502,
  'not-configured': 503,
  unavailable: 503,
  internal: 500,
} as const;

export type ApiErrorCode = keyof typeof errorStatus;

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  /**
   * La IA no ha llegado a trabajar (OpenAI rechazó o no recibió la petición): no cuenta para el cupo diario. Una
   * respuesta que sí se generó (aunque llegue cortada o mal) cuesta dinero y cuenta.
   */
  readonly free: boolean;
  constructor(code: ApiErrorCode, message: string, opts: { free?: boolean } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.free = opts.free ?? false;
  }
  get status(): number {
    return errorStatus[this.code];
  }
}

/** Nombre de la clase de un error para el registro (p. ej. «TypeError»): nunca su mensaje, que podría llevar datos. */
export function errorClassName(error: unknown): string {
  const name = error !== null && typeof error === 'object' ? (error as { constructor?: { name?: unknown } }).constructor?.name : typeof error;
  return typeof name === 'string' && /^[A-Za-z_$][\w$]{0,63}$/.test(name) ? name : 'desconocido';
}
