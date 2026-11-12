import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Cifrado del refresh token de Apple antes de guardarlo en Supabase: AES-256-GCM con `APPLE_TOKEN_ENCRYPTION_KEY`
 * (32 bytes al azar, sólo en Render). Formato «v1.<iv>.<etiqueta>.<cifrado>» en base64url. La etiqueta GCM detecta
 * cualquier cambio del texto guardado o una clave distinta: entonces no se descifra (nunca se devuelve basura).
 */
const VERSION = 'v1';
const AAD = Buffer.from('voces:apple-refresh-token:v1', 'utf8');
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** La clave en base64 (con o sin relleno, también base64url) o en hexadecimal, siempre de 32 bytes. null si no vale. */
export function parseEncryptionKey(raw: string): Buffer | null {
  const text = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(text)) return Buffer.from(text, 'hex');
  if (!/^[A-Za-z0-9+/_-]{43}={0,1}$/.test(text)) return null;
  const key = Buffer.from(text.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return key.length === 32 ? key : null;
}

export function encryptToken(key: Buffer, plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
  cipher.setAAD(AAD);
  const sealed = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), sealed.toString('base64url')].join('.');
}

/** Lanza un error sin detalles si el texto no es de esta versión, está alterado o la clave no es la suya. */
export function decryptToken(key: Buffer, sealed: string): string {
  const parts = sealed.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('apple-token-unreadable');
  const iv = Buffer.from(parts[1], 'base64url');
  const tag = Buffer.from(parts[2], 'base64url');
  // Exactamente lo que escribe `encryptToken`: IV de 12 bytes y etiqueta entera de 16 (una etiqueta recortada se rechaza).
  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) throw new Error('apple-token-unreadable');
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_BYTES });
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('apple-token-unreadable');
  }
}
