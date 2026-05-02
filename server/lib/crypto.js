// AES-256-GCM para criptografia at-rest de chaves sensiveis.
// Deriva chave da LOCAL_AUTH_SECRET via scrypt.
// Nunca exporta a chave raw em logs.

import crypto from 'crypto';

const ALG = 'aes-256-gcm';
const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const SALT = 'nexus-tcms-kms-salt-v1'; // salt publico e constante; a seguranca vem da LOCAL_AUTH_SECRET

let _cachedKey = null;

function getKey() {
  if (_cachedKey) return _cachedKey;
  const secret = process.env.LOCAL_AUTH_SECRET;
  if (!secret) {
    throw new Error('LOCAL_AUTH_SECRET ausente: impossivel derivar chave de criptografia.');
  }
  _cachedKey = crypto.scryptSync(secret, SALT, KEY_LEN);
  return _cachedKey;
}

// Retorna string compacta: base64(iv) . base64(tag) . base64(ciphertext)
export function encrypt(plaintext) {
  if (plaintext == null) return '';
  const key = getKey();
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALG, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join('.');
}

export function decrypt(payload) {
  if (!payload) return '';
  const parts = String(payload).split('.');
  if (parts.length !== 3) throw new Error('Payload criptografado invalido.');
  const key = getKey();
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ct = Buffer.from(parts[2], 'base64');
  if (iv.length !== IV_LEN || tag.length !== TAG_LEN) throw new Error('IV/tag invalidos.');
  const decipher = crypto.createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

export default { encrypt, decrypt };
