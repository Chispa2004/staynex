import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const FORMAT_PREFIX = 'v1';

export class EncryptionConfigurationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EncryptionConfigurationError';
  }
}

const getEncryptionKey = () => {
  const rawKey = process.env.PMS_SECRET_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new EncryptionConfigurationError('PMS_SECRET_ENCRYPTION_KEY is required to encrypt PMS secrets');
  }

  if (/^[a-f0-9]{64}$/i.test(rawKey)) {
    return Buffer.from(rawKey, 'hex');
  }

  try {
    const decoded = Buffer.from(rawKey, 'base64');

    if (decoded.length === 32) {
      return decoded;
    }
  } catch {
    // Fall through to deterministic hash.
  }

  return createHash('sha256').update(rawKey).digest();
};

export const encryptSecret = (secret) => {
  if (!secret) {
    return null;
  }

  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH
  });
  const encrypted = Buffer.concat([
    cipher.update(String(secret), 'utf8'),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    FORMAT_PREFIX,
    iv.toString('base64url'),
    authTag.toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
};

export const decryptSecret = (encryptedSecret) => {
  if (!encryptedSecret) {
    return null;
  }

  const [version, ivValue, authTagValue, encryptedValue] = String(encryptedSecret).split(':');

  if (version !== FORMAT_PREFIX || !ivValue || !authTagValue || !encryptedValue) {
    throw new Error('Unsupported encrypted secret format');
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivValue, 'base64url'), {
    authTagLength: AUTH_TAG_LENGTH
  });

  decipher.setAuthTag(Buffer.from(authTagValue, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final()
  ]).toString('utf8');
};
