import { SshPacketWriter } from './buffer';

// Compute SHA-256 hash using WebCrypto
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return new Uint8Array(hash);
}

// Compute SHA-1 hash (fallback)
export async function sha1(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-1', data as unknown as BufferSource);
  return new Uint8Array(hash);
}

// Compute HMAC-SHA2-256
export async function hmacSha256(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes as unknown as BufferSource,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, data as unknown as BufferSource);
  return new Uint8Array(signature);
}

// RFC 4253 Section 7.2: Key Derivation Function
export async function deriveKey(
  K: Uint8Array,
  H: Uint8Array,
  X: string,
  sessionId: Uint8Array,
  neededLength: number
): Promise<Uint8Array> {
  const xByte = new TextEncoder().encode(X)[0];

  const writer = new SshPacketWriter();
  writer.writeMpint(K);
  writer.writeBytes(H);
  writer.writeByte(xByte);
  writer.writeBytes(sessionId);

  let key = await sha256(writer.toUint8Array());

  while (key.length < neededLength) {
    const extWriter = new SshPacketWriter();
    extWriter.writeMpint(K);
    extWriter.writeBytes(H);
    extWriter.writeBytes(key);
    const nextChunk = await sha256(extWriter.toUint8Array());
    const combined = new Uint8Array(key.length + nextChunk.length);
    combined.set(key, 0);
    combined.set(nextChunk, key.length);
    key = combined;
  }

  return key.subarray(0, neededLength);
}

// Generate ECDH P-256 Key Pair for ecdh-sha2-nistp256 KEX
export async function generateEcdhP256KeyPair(): Promise<{
  keyPair: CryptoKeyPair;
  clientPublicBytes: Uint8Array;
}> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const rawPublic = await crypto.subtle.exportKey('raw', keyPair.publicKey);
  const clientPublicBytes = new Uint8Array(rawPublic);

  return { keyPair, clientPublicBytes };
}

// Compute Shared Secret K from Client Private Key and Server Public Key bytes
export async function computeEcdhSharedSecret(
  privateKey: CryptoKey,
  serverPublicBytes: Uint8Array
): Promise<Uint8Array> {
  const serverPubKey = await crypto.subtle.importKey(
    'raw',
    serverPublicBytes as unknown as BufferSource,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const sharedBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: serverPubKey },
    privateKey,
    256
  );

  return new Uint8Array(sharedBits);
}

// CTR Counter increment helper (16-byte IV for AES-CTR)
export function incrementCtr(iv: Uint8Array): void {
  for (let i = iv.length - 1; i >= 0; i--) {
    iv[i] = (iv[i] + 1) & 0xff;
    if (iv[i] !== 0) break;
  }
}

// Symmetric Cipher State for Inbound/Outbound SSH traffic
export class SshCipherState {
  private key: CryptoKey | null = null;
  private iv: Uint8Array;
  private macKey: Uint8Array | null = null;
  private sequenceNumber: number = 0;

  constructor(_cipherName: string, _keyBytes: Uint8Array, ivBytes: Uint8Array, macKeyBytes?: Uint8Array) {
    this.iv = new Uint8Array(ivBytes);
    if (macKeyBytes) {
      this.macKey = new Uint8Array(macKeyBytes);
    }
  }

  async init(keyBytes: Uint8Array): Promise<void> {
    this.key = await crypto.subtle.importKey(
      'raw',
      keyBytes as unknown as BufferSource,
      { name: 'AES-CTR' },
      false,
      ['encrypt', 'decrypt']
    );
  }

  get seq(): number {
    return this.sequenceNumber;
  }

  incrementSeq(): void {
    this.sequenceNumber = (this.sequenceNumber + 1) >>> 0;
  }

  async encrypt(data: Uint8Array): Promise<{ ciphertext: Uint8Array; mac?: Uint8Array }> {
    if (!this.key) {
      return { ciphertext: data };
    }

    const currentIv = new Uint8Array(this.iv);
    const encryptedBuf = await crypto.subtle.encrypt(
      { name: 'AES-CTR', counter: currentIv as unknown as BufferSource, length: 128 },
      this.key,
      data as unknown as BufferSource
    );
    const ciphertext = new Uint8Array(encryptedBuf);

    const blocks = Math.ceil(data.length / 16);
    for (let i = 0; i < blocks; i++) {
      incrementCtr(this.iv);
    }

    let mac: Uint8Array | undefined;
    if (this.macKey) {
      const macPayload = new SshPacketWriter();
      macPayload.writeUint32(this.sequenceNumber);
      macPayload.writeBytes(ciphertext);
      mac = await hmacSha256(this.macKey, macPayload.toUint8Array());
    }

    this.incrementSeq();
    return { ciphertext, mac };
  }

  async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
    if (!this.key) {
      return ciphertext;
    }

    const currentIv = new Uint8Array(this.iv);
    const decryptedBuf = await crypto.subtle.decrypt(
      { name: 'AES-CTR', counter: currentIv as unknown as BufferSource, length: 128 },
      this.key,
      ciphertext as unknown as BufferSource
    );
    const plaintext = new Uint8Array(decryptedBuf);

    const blocks = Math.ceil(ciphertext.length / 16);
    for (let i = 0; i < blocks; i++) {
      incrementCtr(this.iv);
    }

    this.incrementSeq();
    return plaintext;
  }
}
