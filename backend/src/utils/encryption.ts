import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * One-way SHA-256 hash of a national ID (NIK).
 * Used for storing/querying NIK without keeping the plaintext in the DB.
 */
export function hashNationalId(nik: string): string {
  return crypto.createHash('sha256').update(nik.trim().toLowerCase()).digest('hex');
}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Returns the 32-byte encryption key from the hex-encoded env var.
 */
function getKey(): Buffer {
  return Buffer.from(env.ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a combined string: iv:authTag:ciphertext (all hex-encoded).
 */
export function encryptField(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string previously encrypted with encryptField.
 * Input format: iv:authTag:ciphertext (all hex-encoded).
 */
export function decryptField(encryptedValue: string): string {
  const parts = encryptedValue.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted field format. Expected iv:authTag:ciphertext');
  }

  const [ivHex, authTagHex, ciphertext] = parts as [string, string, string];
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Redact a field value for responses where the caller doesn't have access.
 */
export function redactField(_value: string): string {
  return '***REDACTED***';
}
