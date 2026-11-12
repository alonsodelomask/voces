import { AppleCodeRejectedError, type AppleClient } from './apple/client.ts';
import { decryptToken, encryptToken } from './apple/crypto.ts';
import { ApiError, errorClassName } from './errors.ts';
import type { Store } from './store.ts';

/** Reintentos de la revocación de Apple: 1 h, 2 h, 4 h… hasta 24 h, como mucho 8 intentos (unos tres días). */
const MAX_ATTEMPTS = 8;
const backoffMs = (attempts: number) => Math.min(24, 2 ** Math.max(0, attempts - 1)) * 3600_000;

/**
 * Cuenta: guardar el token de «Iniciar sesión con Apple» (cifrado) y borrar la cuenta revocándolo antes, como exige
 * Apple (norma 5.1.1(v)). Si Apple no responde, el borrado sigue y la revocación queda en cola. Igual que en Baulify.
 */
export class AccountService {
  private readonly store: Store;
  private readonly apple: { client: AppleClient; key: Buffer } | null;

  constructor(options: { store: Store; apple: { client: AppleClient; key: Buffer } | null }) {
    this.store = options.store;
    this.apple = options.apple;
  }

  get appleEnabled() {
    return this.apple !== null;
  }

  /** Canjea el código de Apple del inicio de sesión y guarda el refresh token cifrado, si es de esta cuenta. */
  async registerAppleCode(userId: string, code: string): Promise<void> {
    if (!this.apple) throw new ApiError('not-configured', 'La revocación de Apple no está configurada en el servidor.');
    let exchange;
    try {
      exchange = await this.apple.client.exchangeCode(code);
    } catch (error) {
      if (error instanceof AppleCodeRejectedError) throw new ApiError('invalid-request', 'El código de Apple ha caducado. Vuelve a iniciar sesión.');
      throw new ApiError('unavailable', 'Apple no responde ahora mismo. Prueba más tarde.');
    }
    const linked = await this.store.appleIdentity(userId);
    if (!exchange.subject || !linked || exchange.subject !== linked) {
      // Un código de otra identidad nunca se guarda; su token se revoca (o se encola).
      await this.revokeOrQueue(encryptToken(this.apple.key, exchange.refreshToken));
      throw new ApiError('invalid-request', 'Ese inicio de sesión de Apple no es de tu cuenta.');
    }
    await this.store.saveAppleToken(userId, encryptToken(this.apple.key, exchange.refreshToken));
  }

  /** Revoca el token de Apple (o lo encola) y después borra la cuenta y sus datos. */
  async deleteAccount(userId: string): Promise<void> {
    const sealed = await this.store.appleToken(userId);
    if (sealed && this.apple) await this.revokeOrQueue(sealed);
    else if (sealed) await this.store.queueRevocation(sealed); // sin credenciales todavía: se revocará cuando las haya
    await this.store.deleteAccount(userId);
  }

  private async revokeOrQueue(sealed: string): Promise<void> {
    try {
      await this.apple!.client.revoke(decryptToken(this.apple!.key, sealed));
    } catch (error) {
      console.warn(`[voces] revocación de Apple aplazada (${errorClassName(error)})`);
      await this.store.queueRevocation(sealed);
    }
  }

  /** Reintenta las revocaciones pendientes. Lo llama un temporizador del servidor. */
  async retryRevocations(): Promise<number> {
    if (!this.apple) return 0;
    let done = 0;
    for (const r of await this.store.dueRevocations(20)) {
      try {
        await this.apple.client.revoke(decryptToken(this.apple.key, r.token));
        await this.store.revocationDone(r.id);
        done++;
      } catch {
        const attempts = r.attempts + 1;
        if (attempts >= MAX_ATTEMPTS) await this.store.revocationDone(r.id);
        else await this.store.revocationLater(r.id, attempts, new Date(Date.now() + backoffMs(attempts)));
      }
    }
    return done;
  }
}
