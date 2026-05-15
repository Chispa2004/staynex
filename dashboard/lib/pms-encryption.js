import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const FORMAT_PREFIX = 'v1';

const getEncryptionKey = () => {
  const rawKey = process.env.PMS_SECRET_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error('PMS_SECRET_ENCRYPTION_KEY is required to encrypt PMS secrets');
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

  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv, {
    authTagLength: 16
  });
  const encrypted = Buffer.concat([
    cipher.update(String(secret), 'utf8'),
    cipher.final()
  ]);

  return [
    FORMAT_PREFIX,
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url')
  ].join(':');
};

export const decryptSecret = (encryptedSecret) => {
  if (!encryptedSecret) {
    return null;
  }

  const [version, iv, authTag, encrypted] = String(encryptedSecret).split(':');

  if (version !== FORMAT_PREFIX || !iv || !authTag || !encrypted) {
    throw new Error('Unsupported encrypted secret format');
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(iv, 'base64url'), {
    authTagLength: 16
  });

  decipher.setAuthTag(Buffer.from(authTag, 'base64url'));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final()
  ]).toString('utf8');
};
