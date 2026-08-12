const PBKDF2_ITERATIONS = 210_000;
const AES_KEY_BITS = 256;
const IV_BYTES = 12;

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) {
    throw new Error('This browser does not support Web Crypto, which MedLog needs to encrypt records.');
  }
  return globalThis.crypto.subtle;
}

export function randomBytes(length: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

export function toBase64(bytes: Uint8Array | ArrayBuffer): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < view.length; i += 1) binary += String.fromCharCode(view[i]!);
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function deriveBits(password: string, salt: string, bits: number): Promise<ArrayBuffer> {
  const material = await subtle().importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  return subtle().deriveBits(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    material,
    bits,
  );
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  return toHex(await deriveBits(password, salt, 256));
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  return toHex(await subtle().digest('SHA-256', bytes as unknown as ArrayBuffer));
}

export async function deriveRecordKey(password: string, salt: string): Promise<string> {
  return toBase64(await deriveBits(password, salt, AES_KEY_BITS));
}

async function importKey(rawKeyBase64: string): Promise<CryptoKey> {
  return subtle().importKey(
    'raw',
    fromBase64(rawKeyBase64) as unknown as ArrayBuffer,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}

export interface EncryptedBlob {
  iv: string;
  ciphertext: string;
}

export async function encryptBytes(rawKeyBase64: string, plaintext: Uint8Array): Promise<EncryptedBlob> {
  const iv = randomBytes(IV_BYTES);
  const ciphertext = await subtle().encrypt(
    { name: 'AES-GCM', iv: iv as unknown as ArrayBuffer },
    await importKey(rawKeyBase64),
    plaintext as unknown as ArrayBuffer,
  );

  return { iv: toBase64(iv), ciphertext: toBase64(ciphertext) };
}

export async function decryptBytes(rawKeyBase64: string, blob: EncryptedBlob): Promise<Uint8Array> {
  const plaintext = await subtle().decrypt(
    { name: 'AES-GCM', iv: fromBase64(blob.iv) as unknown as ArrayBuffer },
    await importKey(rawKeyBase64),
    fromBase64(blob.ciphertext) as unknown as ArrayBuffer,
  );

  return new Uint8Array(plaintext);
}

export function newId(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return toBase64(randomBytes(16)).replace(/[^a-z0-9]/gi, '').slice(0, 22);
}
