import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { decryptBuffer, encryptBuffer, newId } from './crypto.js';

export interface StoredBlob {
  storageKey: string;
  iv: string;
  authTag: string;
  checksum: string;
}

function resolveKey(storageKey: string): string {
  const resolved = path.resolve(config.storagePath, storageKey);
  if (!resolved.startsWith(path.resolve(config.storagePath) + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return resolved;
}

export async function storeEncrypted(ownerId: string, plaintext: Buffer): Promise<StoredBlob> {
  const { ciphertext, iv, authTag, checksum } = encryptBuffer(plaintext);
  const storageKey = path.join(ownerId, `${newId()}.enc`);
  const target = resolveKey(storageKey);

  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, ciphertext, { mode: 0o600 });

  return { storageKey, iv, authTag, checksum };
}

export async function readDecrypted(blob: StoredBlob): Promise<Buffer> {
  const ciphertext = await fs.readFile(resolveKey(blob.storageKey));
  return decryptBuffer(ciphertext, blob.iv, blob.authTag);
}

export async function deleteBlob(storageKey: string): Promise<void> {
  await fs.rm(resolveKey(storageKey), { force: true });
}
