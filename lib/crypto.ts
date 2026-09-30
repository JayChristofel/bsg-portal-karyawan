import crypto from 'node:crypto';

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY || 'default-fallback-secret-key-change-in-env-32bytes';
  // Use SHA-256 to ensure exact 32-byte buffer regardless of key length/format
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a text field using AES-256-GCM (Authenticated Encryption).
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const key = getKey();
  const iv = crypto.randomBytes(12); // Recommended 12 bytes for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all in hex)
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt an AES-256-GCM encrypted field.
 * Falls back to plaintext if the string is not encrypted (e.g. migration safety).
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    // Not in iv:tag:data format, return raw value
    return ciphertext;
  }

  const [ivHex, tagHex, dataHex] = parts;
  try {
    const key = getKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(tagHex, 'hex');
    const encryptedText = Buffer.from(dataHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedText),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    // Return original string if decryption fails
    return ciphertext;
  }
}
