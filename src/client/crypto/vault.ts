import type { HostCredentials } from '@shared/types';

const VERIFIER_PLAINTEXT = 'FINALSHELL_VAULT_OK';
const DEFAULT_ITERATIONS = 600000;

// Convert Uint8Array to Base64
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to Uint8Array safely
export function base64ToBytes(base64: string): Uint8Array {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Base64 字符串无效或为空');
  }

  // Remove potential whitespace, newlines, and normalize URL-safe characters
  let clean = base64.trim().replace(/-/g, '+').replace(/_/g, '/');
  // Pad with '=' if necessary
  while (clean.length % 4 !== 0) {
    clean += '=';
  }

  try {
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err: any) {
    throw new Error(`Base64 解码失败: ${err.message || '格式错误'}`);
  }
}

// Derive a 256-bit CryptoKey from password and salt using PBKDF2
export async function deriveMasterKey(
  password: string,
  saltBytes: Uint8Array,
  iterations: number = DEFAULT_ITERATIONS
): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(password) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes as unknown as BufferSource,
      iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt plaintext string using AES-256-GCM
export async function encryptText(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertextBuffer = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    enc.encode(plaintext) as unknown as BufferSource
  );

  const ciphertext = new Uint8Array(ciphertextBuffer);
  const combined = new Uint8Array(iv.length + ciphertext.length);
  combined.set(iv, 0);
  combined.set(ciphertext, iv.length);

  return bytesToBase64(combined);
}

// Decrypt Base64 string using AES-256-GCM
export async function decryptText(key: CryptoKey, base64Ciphertext: string): Promise<string> {
  const combined = base64ToBytes(base64Ciphertext);
  if (combined.length < 13) {
    throw new Error('Ciphertext too short');
  }

  const iv = combined.subarray(0, 12);
  const ciphertext = combined.subarray(12);

  const decryptedBuffer = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as unknown as BufferSource,
    },
    key,
    ciphertext as unknown as BufferSource
  );

  return new TextDecoder().decode(decryptedBuffer);
}

// Generate new Vault parameters
export async function initVault(
  masterPassword: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<{
  saltBase64: string;
  verifierCipher: string;
  masterKey: CryptoKey;
}> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const masterKey = await deriveMasterKey(masterPassword, salt, iterations);
  const verifierCipher = await encryptText(masterKey, VERIFIER_PLAINTEXT);

  return {
    saltBase64: bytesToBase64(salt),
    verifierCipher,
    masterKey,
  };
}

// Unlock vault
export async function unlockVault(
  masterPassword: string,
  saltBase64: string,
  verifierCipher: string,
  iterations: number = DEFAULT_ITERATIONS
): Promise<CryptoKey> {
  const salt = base64ToBytes(saltBase64);
  const masterKey = await deriveMasterKey(masterPassword, salt, iterations);

  try {
    const check = await decryptText(masterKey, verifierCipher);
    if (check !== VERIFIER_PLAINTEXT) {
      throw new Error('密码错误，请重新输入');
    }
  } catch (err: any) {
    throw new Error('密码错误或密文验证失败');
  }

  return masterKey;
}

export async function encryptCredentials(
  key: CryptoKey,
  creds: HostCredentials
): Promise<string> {
  return await encryptText(key, JSON.stringify(creds));
}

export async function decryptCredentials(
  key: CryptoKey,
  cipher: string
): Promise<HostCredentials> {
  const jsonStr = await decryptText(key, cipher);
  return JSON.parse(jsonStr) as HostCredentials;
}
