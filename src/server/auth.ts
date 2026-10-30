import type { UserProfile } from '@shared/types';

const TOKEN_SECRET = 'FINALSHELL_CF_SECRET_KEY_V1';

export type AppVariables = {
  user: { sub: string; name: string; role: 'admin' | 'user' };
};

// Convert Uint8Array to Base64
function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Convert Base64 to Uint8Array
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Compute password hash for login verification
export async function hashLoginPassword(password: string, salt: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password) as unknown as BufferSource,
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt) as unknown as BufferSource,
      iterations: 100000,
      hash: 'SHA-256',
    },
    key,
    256
  );

  return bytesToBase64(new Uint8Array(bits));
}

// Generate signed authentication token
export async function createAuthToken(user: { id: string; username: string; role: string }): Promise<string> {
  const payload = {
    sub: user.id,
    name: user.username,
    role: user.role,
    exp: Date.now() + 30 * 24 * 3600 * 1000, // 30 days
  };

  const payloadStr = JSON.stringify(payload);
  const payloadB64 = btoa(payloadStr);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(TOKEN_SECRET) as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64) as unknown as BufferSource);
  const sigB64 = bytesToBase64(new Uint8Array(sigBuf));

  return `${payloadB64}.${sigB64}`;
}

// Verify auth token and return payload
export async function verifyAuthToken(token: string): Promise<{ sub: string; name: string; role: 'admin' | 'user' } | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, sigB64] = parts;
    const enc = new TextEncoder();

    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(TOKEN_SECRET) as unknown as BufferSource,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = base64ToBytes(sigB64);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      enc.encode(payloadB64) as unknown as BufferSource
    );

    if (!valid) return null;

    const payload = JSON.parse(atob(payloadB64));
    if (payload.exp && Date.now() > payload.exp) {
      return null; // Expired
    }

    return {
      sub: payload.sub,
      name: payload.name,
      role: payload.role as 'admin' | 'user',
    };
  } catch {
    return null;
  }
}
