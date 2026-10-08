import crypto from 'node:crypto';

const MIN_KEY_LENGTH = 32;

function getKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY;

  // Fail closed: a hardcoded fallback key makes every "encrypted" column
  // readable by anyone who has the source. Refuse to run without a real key.
  if (!secret || secret.length < MIN_KEY_LENGTH) {
    throw new Error(
      `ENCRYPTION_KEY is missing or shorter than ${MIN_KEY_LENGTH} chars. ` +
        'Generate one with: openssl rand -base64 32'
    );
  }

  // Use SHA-256 to ensure exact 32-byte buffer regardless of key length/format
  return crypto.createHash('sha256').update(secret).digest();
}

const ENCRYPTED_PREFIX = 'gcm1';

/**
 * True when a value looks like an AES-256-GCM payload produced by encrypt().
 * Lets callers distinguish "plaintext" from "encrypted but unreadable".
 */
export function isEncrypted(value: string): boolean {
  const parts = value.split(':');
  return (
    parts.length === 4 &&
    parts[0] === ENCRYPTED_PREFIX &&
    parts.slice(1).every((p) => /^[0-9a-f]*$/i.test(p))
  );
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

  // Format: gcm1:iv:authTag:ciphertext (all in hex). Versioned so key rotation
  // can distinguish new payloads from the legacy 3-part format.
  return [
    ENCRYPTED_PREFIX,
    iv.toString('hex'),
    authTag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

const LEGACY_ENCRYPTED_RE = /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i;

/**
 * Decrypt an AES-256-GCM encrypted field.
 *
 * Accepts the current `gcm1:iv:tag:data` format and the legacy
 * `iv:tag:data` format so existing rows stay readable during key rotation.
 * Throws when a payload is authenticated-but-unreadable, so tampering with
 * ciphertext is surfaced instead of being silently returned as garbage.
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';

  let parts: string[];
  if (isEncrypted(ciphertext)) {
    parts = ciphertext.split(':').slice(1);
  } else if (LEGACY_ENCRYPTED_RE.test(ciphertext)) {
    parts = ciphertext.split(':');
  } else {
    // Genuine plaintext (never encrypted) — return as-is.
    return ciphertext;
  }

  const [ivHex, tagHex, dataHex] = parts;
  const key = getKey();
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(tagHex, 'hex');
  const encryptedText = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
  return decrypted.toString('utf8');
}
