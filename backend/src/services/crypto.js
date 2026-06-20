// At-rest encryption for sensitive tokens (e.g. the user's Deriv API token).
// Uses AES-256-GCM. The key comes from TOKEN_ENC_KEY when set; otherwise it is
// derived (scrypt) from the PB admin password so we never store plaintext even
// if an explicit key wasn't configured. Set TOKEN_ENC_KEY in production.
import crypto from 'node:crypto';
import { config } from '../config.js';

const PREFIX = 'enc:v1:';

function keyMaterial() {
  const explicit = config.tokenEncKey;
  if (explicit) {
    // Accept hex/base64/raw; normalize to 32 bytes via scrypt over the string.
    return crypto.scryptSync(String(explicit), 'apexbot-token-salt', 32);
  }
  const fallback = config.pb.adminPassword || 'apexbot-insecure-fallback';
  return crypto.scryptSync(String(fallback), 'apexbot-token-salt', 32);
}

// Encrypt a string. Returns "enc:v1:<ivB64>:<tagB64>:<ctB64>".
export function encryptToken(plain) {
  if (plain == null || plain === '') return '';
  const key = keyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

// Decrypt a value produced by encryptToken. If the value is NOT in our encrypted
// format (e.g. a legacy plaintext token), it is returned unchanged so existing
// data keeps working — that's the backward-compatibility path.
export function decryptToken(value) {
  if (!value) return '';
  if (!String(value).startsWith(PREFIX)) return value; // legacy / plaintext
  try {
    const [, , ivB64, tagB64, ctB64] = String(value).split(':');
    const key = keyMaterial();
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    const ct = Buffer.from(ctB64, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return '';
  }
}

// Convenience: resolve a user's usable Deriv token (decrypted) from a PB record.
export function getDerivToken(user) {
  return decryptToken(user?.deriv_token || '');
}
