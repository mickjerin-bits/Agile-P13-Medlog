import { describe, expect, it } from 'vitest';
import { decryptBuffer, encryptBuffer } from '../src/services/crypto.js';

describe('AES-256-GCM record encryption', () => {
  it('round-trips a buffer', () => {
    const plaintext = Buffer.from('Discharge summary: patient stable.');
    const encrypted = encryptBuffer(plaintext);

    expect(encrypted.ciphertext.toString('utf8')).not.toContain('Discharge');
    expect(decryptBuffer(encrypted.ciphertext, encrypted.iv, encrypted.authTag)).toEqual(plaintext);
  });

  it('uses a fresh IV for identical input', () => {
    const plaintext = Buffer.from('same content');

    expect(encryptBuffer(plaintext).iv).not.toBe(encryptBuffer(plaintext).iv);
  });

  it('fails closed when the ciphertext is tampered with', () => {
    const encrypted = encryptBuffer(Buffer.from('original content'));
    const tampered = Buffer.from(encrypted.ciphertext);
    tampered[0] ^= 0xff;

    expect(() => decryptBuffer(tampered, encrypted.iv, encrypted.authTag)).toThrow();
  });

  it('fails closed when the auth tag does not match', () => {
    const encrypted = encryptBuffer(Buffer.from('original content'));
    const otherTag = encryptBuffer(Buffer.from('other content')).authTag;

    expect(() => decryptBuffer(encrypted.ciphertext, encrypted.iv, otherTag)).toThrow();
  });
});
