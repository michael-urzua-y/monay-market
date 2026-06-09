import { ValueTransformer } from 'typeorm';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENCRYPTION_PREFIX = 'enc:v1:';
const ENCRYPTION_SEPARATOR = '.';
const IV_LENGTH = 12;

function getEncryptionKey(): Buffer | null {
  const rawKey = process.env.APP_DATA_ENCRYPTION_KEY?.trim();
  if (!rawKey) {
    return null;
  }

  return createHash('sha256').update(rawKey, 'utf8').digest();
}

function encryptValue(value: string): string {
  const key = getEncryptionKey();
  if (!key) {
    return value;
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url'),
  ].join(ENCRYPTION_SEPARATOR);
}

function decryptValue(value: string): string {
  if (!value.startsWith(ENCRYPTION_PREFIX)) {
    return value;
  }

  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      'APP_DATA_ENCRYPTION_KEY es obligatorio para leer secretos cifrados',
    );
  }

  const parts = value.split(ENCRYPTION_SEPARATOR);
  if (parts.length !== 4) {
    throw new Error('Formato de secreto cifrado inválido');
  }

  const iv = Buffer.from(parts[1], 'base64url');
  const authTag = Buffer.from(parts[2], 'base64url');
  const encrypted = Buffer.from(parts[3], 'base64url');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}

export const encryptedStringTransformer: ValueTransformer = {
  to(value: string | null | undefined): string | null {
    if (value == null || value === '') {
      return null;
    }

    if (value.startsWith(ENCRYPTION_PREFIX)) {
      return value;
    }

    return encryptValue(value);
  },

  from(value: string | null | undefined): string | null {
    if (value == null || value === '') {
      return null;
    }

    return decryptValue(value);
  },
};
