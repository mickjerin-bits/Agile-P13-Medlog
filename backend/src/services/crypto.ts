import crypto from 'node:crypto';
import { config } from '../config.js';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
  checksum: string;
}

export function encryptBuffer(plaintext: Buffer): EncryptedPayload {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, config.encryptionKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  return {
    ciphertext,
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    checksum: crypto.createHash('sha256').update(plaintext).digest('hex'),
  };
}

export function decryptBuffer(ciphertext: Buffer, iv: string, authTag: string): Buffer {
  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    config.encryptionKey,
    Buffer.from(iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function newId(): string {
  return crypto.randomUUID();
}
