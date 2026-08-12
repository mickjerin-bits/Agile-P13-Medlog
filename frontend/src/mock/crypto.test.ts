import { describe, expect, it } from 'vitest';
import {
  decryptBytes,
  deriveRecordKey,
  encryptBytes,
  fromBase64,
  hashPassword,
  sha256,
  toBase64,
} from './crypto';

const bytes = (text: string) => new TextEncoder().encode(text);
const text = (value: Uint8Array) => new TextDecoder().decode(value);

describe('base64 helpers', () => {
  it('round-trips arbitrary bytes', () => {
    const original = [0, 1, 127, 128, 255, 254];
    expect([...fromBase64(toBase64(new Uint8Array(original)))]).toEqual(original);
  });
});

describe('hashPassword', () => {
  it('is deterministic for the same password and salt', async () => {
    expect(await hashPassword('Str0ngPass!', 'salt-a')).toBe(
      await hashPassword('Str0ngPass!', 'salt-a'),
    );
  });

  it('differs when the salt differs, so two users sharing a password differ', async () => {
    expect(await hashPassword('Str0ngPass!', 'salt-a')).not.toBe(
      await hashPassword('Str0ngPass!', 'salt-b'),
    );
  });

  it('differs when the password differs', async () => {
    expect(await hashPassword('Str0ngPass!', 'salt-a')).not.toBe(
      await hashPassword('WrongPass!', 'salt-a'),
    );
  });
});

describe('AES-256-GCM record encryption', () => {
  it('round-trips a payload', async () => {
    const key = await deriveRecordKey('Str0ngPass!', 'key-salt');
    const plaintext = bytes('Discharge summary: patient stable.');

    const blob = await encryptBytes(key, plaintext);
    expect(blob.ciphertext).not.toContain('Discharge');
    expect(text(await decryptBytes(key, blob))).toBe('Discharge summary: patient stable.');
  });

  it('uses a fresh IV for identical input', async () => {
    const key = await deriveRecordKey('Str0ngPass!', 'key-salt');
    const plaintext = bytes('same content');

    const first = await encryptBytes(key, plaintext);
    const second = await encryptBytes(key, plaintext);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it('fails closed when the ciphertext is tampered with', async () => {
    const key = await deriveRecordKey('Str0ngPass!', 'key-salt');
    const blob = await encryptBytes(key, bytes('original content'));

    const raw = fromBase64(blob.ciphertext);
    raw[0] ^= 0xff;

    await expect(decryptBytes(key, { ...blob, ciphertext: toBase64(raw) })).rejects.toThrow();
  });

  it('fails closed under the wrong key', async () => {
    const key = await deriveRecordKey('Str0ngPass!', 'key-salt');
    const otherKey = await deriveRecordKey('Different!', 'key-salt');
    const blob = await encryptBytes(key, bytes('original content'));

    await expect(decryptBytes(otherKey, blob)).rejects.toThrow();
  });

  it('fails closed when the IV is swapped', async () => {
    const key = await deriveRecordKey('Str0ngPass!', 'key-salt');
    const blob = await encryptBytes(key, bytes('original content'));
    const other = await encryptBytes(key, bytes('other content'));

    await expect(decryptBytes(key, { ...blob, iv: other.iv })).rejects.toThrow();
  });
});

describe('sha256', () => {
  it('detects a single changed byte', async () => {
    expect(await sha256(bytes('report v1'))).not.toBe(await sha256(bytes('report v2')));
  });
});
