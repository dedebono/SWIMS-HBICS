import { describe, it, expect } from 'vitest';
import { encryptField, decryptField, hashNationalId, redactField } from '../../utils/encryption.js';

/**
 * AES-256-GCM guards the welfare/incident records behind this app, so these
 * tests focus on the properties that actually keep PHI out of a dump:
 * round-trip fidelity, tamper detection, and correct key derivation.
 */
describe('utils/encryption', () => {
  describe('encryptField / decryptField', () => {
    it('round-trips an ASCII string', () => {
      const plaintext = 'Sehat jasmani, nilai hemoglobin 11.2';
      expect(decryptField(encryptField(plaintext))).toBe(plaintext);
    });

    it('round-trips Indonesian text with punctuation and dashes', () => {
      const plaintext = 'Rina Febriani —(domain) saya观察 @ 08:30, 2026-10-09';
      expect(decryptField(encryptField(plaintext))).toBe(plaintext);
    });

    it('round-trips an empty string', () => {
      expect(decryptField(encryptField(''))).toBe('');
    });

    it('round-trips a long multi-line note', () => {
      const plaintext = Array.from({ length: 200 }, (_, i) => `baris ${i}`).join('\n');
      expect(decryptField(encryptField(plaintext))).toBe(plaintext);
    });

    it('emits iv:authTag:ciphertext — three hex segments', () => {
      const parts = encryptField('halo').split(':');
      expect(parts).toHaveLength(3);
      for (const p of parts) expect(p).toMatch(/^[0-9a-f]*$/);
    });

    it('never leaks the plaintext into the ciphertext', () => {
      const secret = 'RAHASIA_TIDAK_BOLEH_MUNCUL';
      expect(encryptField(secret)).not.toContain(secret);
    });

    it('uses a fresh IV every time (same input → different ciphertext)', () => {
      const a = encryptField('nilai sama');
      const b = encryptField('nilai sama');
      expect(a).not.toBe(b);
      expect(a.split(':')[0]).not.toBe(b.split(':')[0]);
    });

    it('rejects a tampered ciphertext (GCM auth tag catches it)', () => {
      const [iv, tag, ct] = encryptField('data sensitif').split(':');
      // Flip the last hex nibble of the ciphertext.
      const flipped = (ct!.slice(0, -1) + (ct!.endsWith('a') ? 'b' : 'a'));
      expect(() => decryptField(`${iv}:${tag}:${flipped}`)).toThrow();
    });

    it('rejects a tampered auth tag', () => {
      const [iv, tag, ct] = encryptField('data sensitif').split(':');
      const badTag = tag!.slice(0, -1) + (tag!.endsWith('0') ? '1' : '0');
      expect(() => decryptField(`${iv}:${badTag}:${ct}`)).toThrow();
    });

    it('rejects a swapped auth tag from a different message', () => {
      const a = encryptField('pesan A').split(':');
      const b = encryptField('pesan B').split(':');
      expect(() => decryptField(`${a[0]}:${b[1]}:${a[2]}`)).toThrow();
    });

    it('rejects a wrong-segment-count string', () => {
      expect(() => decryptField('only:two')).toThrow(/Invalid encrypted field format/);
      expect(() => decryptField('')).toThrow(/Invalid encrypted field format/);
    });

    it('decrypts fields written by an earlier call (persistence round-trip)', () => {
      const stored = encryptField('nilai hemoglobin 11.2');
      // A later process reads the same string back.
      expect(decryptField(stored)).toBe('nilai hemoglobin 11.2');
    });
  });

  describe('hashNationalId', () => {
    it('is deterministic', () => {
      expect(hashNationalId('1234567890123456')).toBe(hashNationalId('1234567890123456'));
    });

    it('is a 64-char SHA-256 hex digest', () => {
      expect(hashNationalId('1234567890123456')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('normalises whitespace and case so lookup still matches', () => {
      expect(hashNationalId('  1234567890123456 ')).toBe(hashNationalId('1234567890123456'));
      expect(hashNationalId('ABC')).toBe(hashNationalId('abc'));
    });

    it('distinguishes different NIKs', () => {
      expect(hashNationalId('1234567890123456')).not.toBe(hashNationalId('1234567890123457'));
    });

    it('does not contain the original NIK', () => {
      expect(hashNationalId('1234567890123456')).not.toContain('1234567890123456');
    });
  });

  describe('redactField', () => {
    it('replaces the value with a fixed marker', () => {
      expect(redactField('rahasia')).toBe('***REDACTED***');
    });

    it('never echoes the input, whatever it is', () => {
      expect(redactField('x')).toBe('***REDACTED***');
      expect(redactField('')).toBe('***REDACTED***');
      expect(redactField('a-very-secret-value')).not.toContain('a-very-secret-value');
    });
  });
});