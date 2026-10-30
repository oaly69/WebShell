import type { DecryptedHost } from '@shared/types';

/**
 * Standard RFC 1321 MD5 hash implementation in pure TypeScript
 */
function md5(data: Uint8Array): Uint8Array {
  function safeAdd(x: number, y: number): number {
    const lsw = (x & 0xffff) + (y & 0xffff);
    const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
    return (msw << 16) | (lsw & 0xffff);
  }

  function bitRol(num: number, cnt: number): number {
    return (num << cnt) | (num >>> (32 - cnt));
  }

  function cmn(q: number, a: number, b: number, x: number, s: number, t: number): number {
    return safeAdd(bitRol(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
  }

  function ff(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & c) | (~b & d), a, b, x, s, t);
  }
  function gg(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn((b & d) | (c & ~d), a, b, x, s, t);
  }
  function hh(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(b ^ c ^ d, a, b, x, s, t);
  }
  function ii(a: number, b: number, c: number, d: number, x: number, s: number, t: number): number {
    return cmn(c ^ (b | ~d), a, b, x, s, t);
  }

  const nblk = ((data.length + 8) >> 6) + 1;
  const blks = new Array(nblk * 16).fill(0);
  for (let i = 0; i < data.length; i++) {
    blks[i >> 2] |= data[i] << ((i % 4) * 8);
  }
  blks[data.length >> 2] |= 0x80 << ((data.length % 4) * 8);
  blks[nblk * 16 - 2] = (data.length * 8) & 0xffffffff;
  blks[nblk * 16 - 1] = Math.floor((data.length * 8) / 0x100000000);

  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;

  for (let i = 0; i < blks.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;

    a = ff(a, b, c, d, blks[i + 0], 7, -680876936);
    d = ff(d, a, b, c, blks[i + 1], 12, -389564586);
    c = ff(c, d, a, b, blks[i + 2], 17, 606105819);
    b = ff(b, c, d, a, blks[i + 3], 22, -1044525330);
    a = ff(a, b, c, d, blks[i + 4], 7, -176418897);
    d = ff(d, a, b, c, blks[i + 5], 12, 1200080426);
    c = ff(c, d, a, b, blks[i + 6], 17, -1473231341);
    b = ff(b, c, d, a, blks[i + 7], 22, -45705983);
    a = ff(a, b, c, d, blks[i + 8], 7, 1770035416);
    d = ff(d, a, b, c, blks[i + 9], 12, -1958414417);
    c = ff(c, d, a, b, blks[i + 10], 17, -42063);
    b = ff(b, c, d, a, blks[i + 11], 22, -1990404162);
    a = ff(a, b, c, d, blks[i + 12], 7, 1804603682);
    d = ff(d, a, b, c, blks[i + 13], 12, -40341101);
    c = ff(c, d, a, b, blks[i + 14], 17, -1502002290);
    b = ff(b, c, d, a, blks[i + 15], 22, 1236535329);

    a = gg(a, b, c, d, blks[i + 1], 5, -165796510);
    d = gg(d, a, b, c, blks[i + 6], 9, -1069501632);
    c = gg(c, d, a, b, blks[i + 11], 14, 643717713);
    b = gg(b, c, d, a, blks[i + 0], 20, -373897302);
    a = gg(a, b, c, d, blks[i + 5], 5, -701558691);
    d = gg(d, a, b, c, blks[i + 10], 9, 38016083);
    c = gg(c, d, a, b, blks[i + 15], 14, -660478335);
    b = gg(b, c, d, a, blks[i + 4], 20, -405537848);
    a = gg(a, b, c, d, blks[i + 9], 5, 568446438);
    d = gg(d, a, b, c, blks[i + 14], 9, -1019803690);
    c = gg(c, d, a, b, blks[i + 3], 14, -187363961);
    b = gg(b, c, d, a, blks[i + 8], 20, 1163531501);
    a = gg(a, b, c, d, blks[i + 13], 5, -1444681467);
    d = gg(d, a, b, c, blks[i + 2], 9, -51403784);
    c = gg(c, d, a, b, blks[i + 7], 14, 1735328473);
    b = gg(b, c, d, a, blks[i + 12], 20, -1926607734);

    a = hh(a, b, c, d, blks[i + 5], 4, -378558);
    d = hh(d, a, b, c, blks[i + 8], 11, -2022574463);
    c = hh(c, d, a, b, blks[i + 11], 16, 1839030562);
    b = hh(b, c, d, a, blks[i + 14], 23, -35309556);
    a = hh(a, b, c, d, blks[i + 1], 4, -1530992060);
    d = hh(d, a, b, c, blks[i + 4], 11, 1272893353);
    c = hh(c, d, a, b, blks[i + 7], 16, -155497632);
    b = hh(b, c, d, a, blks[i + 10], 23, -1094730640);
    a = hh(a, b, c, d, blks[i + 13], 4, 681279174);
    d = hh(d, a, b, c, blks[i + 0], 11, -358537222);
    c = hh(c, d, a, b, blks[i + 3], 16, -722521979);
    b = hh(b, c, d, a, blks[i + 6], 23, 76029189);
    a = hh(a, b, c, d, blks[i + 9], 4, -640364487);
    d = hh(d, a, b, c, blks[i + 12], 11, -421815835);
    c = hh(c, d, a, b, blks[i + 15], 16, 530742520);
    b = hh(b, c, d, a, blks[i + 2], 23, -995338651);

    a = ii(a, b, c, d, blks[i + 0], 6, -198630844);
    d = ii(d, a, b, c, blks[i + 7], 10, 1126891415);
    c = ii(c, d, a, b, blks[i + 14], 15, -1416354905);
    b = ii(b, c, d, a, blks[i + 5], 21, -57434055);
    a = ii(a, b, c, d, blks[i + 12], 6, 1700485571);
    d = ii(d, a, b, c, blks[i + 3], 10, -1894986606);
    c = ii(c, d, a, b, blks[i + 10], 15, -1051523);
    b = ii(b, c, d, a, blks[i + 1], 21, -2054922799);
    a = ii(a, b, c, d, blks[i + 8], 6, 1873313359);
    d = ii(d, a, b, c, blks[i + 15], 10, -30611744);
    c = ii(c, d, a, b, blks[i + 6], 15, -1560198380);
    b = ii(b, c, d, a, blks[i + 13], 21, 1309151649);
    a = ii(a, b, c, d, blks[i + 4], 6, -145523070);
    d = ii(d, a, b, c, blks[i + 11], 10, -1120210379);
    c = ii(c, d, a, b, blks[i + 2], 15, 718787259);
    b = ii(b, c, d, a, blks[i + 9], 21, -343485551);

    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }

  const out = new Uint8Array(16);
  const words = [a, b, c, d];
  for (let i = 0; i < 4; i++) {
    out[i * 4 + 0] = words[i] & 0xff;
    out[i * 4 + 1] = (words[i] >>> 8) & 0xff;
    out[i * 4 + 2] = (words[i] >>> 16) & 0xff;
    out[i * 4 + 3] = (words[i] >>> 24) & 0xff;
  }
  return out;
}

/**
 * Standard FIPS PUB 46-3 DES implementation in pure TypeScript
 */
const IP = [
  58, 50, 42, 34, 26, 18, 10, 2, 60, 52, 44, 36, 28, 20, 12, 4,
  62, 54, 46, 38, 30, 22, 14, 6, 64, 56, 48, 40, 32, 24, 16, 8,
  57, 49, 41, 33, 25, 17, 9, 1, 59, 51, 43, 35, 27, 19, 11, 3,
  61, 53, 45, 37, 29, 21, 13, 5, 63, 55, 47, 39, 31, 23, 15, 7,
];

const FP = [
  40, 8, 48, 16, 56, 24, 64, 32, 39, 7, 47, 15, 55, 23, 63, 31,
  38, 6, 46, 14, 54, 22, 62, 30, 37, 5, 45, 13, 53, 21, 61, 29,
  36, 4, 44, 12, 52, 20, 60, 28, 35, 3, 43, 11, 51, 19, 59, 27,
  34, 2, 42, 10, 50, 18, 58, 26, 33, 1, 41, 9, 49, 17, 57, 25,
];

const E = [
  32, 1, 2, 3, 4, 5, 4, 5, 6, 7, 8, 9,
  8, 9, 10, 11, 12, 13, 12, 13, 14, 15, 16, 17,
  16, 17, 18, 19, 20, 21, 20, 21, 22, 23, 24, 25,
  24, 25, 26, 27, 28, 29, 28, 29, 30, 31, 32, 1,
];

const P = [
  16, 7, 20, 21, 29, 12, 28, 17, 1, 15, 23, 26, 5, 18, 31, 10,
  2, 8, 24, 14, 32, 27, 3, 9, 19, 13, 30, 6, 22, 11, 4, 25,
];

const PC1 = [
  57, 49, 41, 33, 25, 17, 9, 1, 58, 50, 42, 34, 26, 18,
  10, 2, 59, 51, 43, 35, 27, 19, 11, 3, 60, 52, 44, 36,
  63, 55, 47, 39, 31, 23, 15, 7, 62, 54, 46, 38, 30, 22,
  14, 6, 61, 53, 45, 37, 29, 21, 13, 5, 28, 20, 12, 4,
];

const PC2 = [
  14, 17, 11, 24, 1, 5, 3, 28, 15, 6, 21, 10,
  23, 19, 12, 4, 26, 8, 16, 7, 27, 20, 13, 2,
  41, 52, 31, 37, 47, 55, 30, 40, 51, 45, 33, 48,
  44, 49, 39, 56, 34, 53, 46, 42, 50, 36, 29, 32,
];

const SHIFTS = [1, 1, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 1];

const SBOXES = [
  [
    14, 4, 13, 1, 2, 15, 11, 8, 3, 10, 6, 12, 5, 9, 0, 7,
    0, 15, 7, 4, 14, 2, 13, 1, 10, 6, 12, 11, 9, 5, 3, 8,
    4, 1, 14, 8, 13, 6, 2, 11, 15, 12, 9, 7, 3, 10, 5, 0,
    15, 12, 8, 2, 4, 9, 1, 7, 5, 11, 3, 14, 10, 0, 6, 13,
  ],
  [
    15, 1, 8, 14, 6, 11, 3, 4, 9, 7, 2, 13, 12, 0, 5, 10,
    3, 13, 4, 7, 15, 2, 8, 14, 12, 0, 1, 10, 6, 9, 11, 5,
    0, 14, 7, 11, 10, 4, 13, 1, 5, 8, 12, 6, 9, 3, 2, 15,
    13, 8, 10, 1, 3, 15, 4, 2, 11, 6, 7, 12, 0, 5, 14, 9,
  ],
  [
    10, 0, 9, 14, 6, 3, 15, 5, 1, 13, 12, 7, 11, 4, 2, 8,
    13, 7, 0, 9, 3, 4, 6, 10, 2, 8, 5, 14, 12, 11, 15, 1,
    13, 6, 4, 9, 8, 15, 3, 0, 11, 1, 2, 12, 5, 10, 14, 7,
    1, 10, 13, 0, 6, 9, 8, 7, 4, 15, 14, 3, 11, 5, 2, 12,
  ],
  [
    7, 13, 14, 3, 0, 6, 9, 10, 1, 2, 8, 5, 11, 12, 4, 15,
    13, 8, 11, 5, 6, 15, 0, 3, 4, 7, 2, 12, 1, 10, 14, 9,
    10, 6, 9, 0, 12, 11, 7, 13, 15, 1, 3, 14, 5, 2, 8, 4,
    3, 15, 0, 6, 10, 1, 13, 8, 9, 4, 5, 11, 12, 7, 2, 14,
  ],
  [
    2, 12, 4, 1, 7, 10, 11, 6, 8, 5, 3, 15, 13, 0, 14, 9,
    14, 11, 2, 12, 4, 7, 13, 1, 5, 0, 15, 10, 3, 9, 8, 6,
    4, 2, 1, 11, 10, 13, 7, 8, 15, 9, 12, 5, 6, 3, 0, 14,
    11, 8, 12, 7, 1, 14, 2, 13, 6, 15, 0, 9, 10, 4, 5, 3,
  ],
  [
    12, 1, 10, 15, 9, 2, 6, 8, 0, 13, 3, 4, 14, 7, 5, 11,
    10, 15, 4, 2, 7, 12, 9, 5, 6, 1, 13, 14, 0, 11, 3, 8,
    9, 14, 15, 5, 2, 8, 12, 3, 7, 0, 4, 10, 1, 13, 11, 6,
    4, 3, 2, 12, 9, 5, 15, 10, 11, 14, 1, 7, 6, 0, 8, 13,
  ],
  [
    4, 11, 2, 14, 15, 0, 8, 13, 3, 12, 9, 7, 5, 10, 6, 1,
    13, 0, 11, 7, 4, 9, 1, 10, 14, 3, 5, 12, 2, 15, 8, 6,
    1, 4, 11, 13, 12, 3, 7, 14, 10, 15, 6, 8, 0, 5, 9, 2,
    6, 11, 13, 8, 1, 4, 10, 7, 9, 5, 0, 15, 14, 2, 3, 12,
  ],
  [
    13, 2, 8, 4, 6, 15, 11, 1, 10, 9, 3, 14, 5, 0, 12, 7,
    1, 15, 13, 8, 10, 3, 7, 4, 12, 5, 6, 11, 0, 14, 9, 2,
    7, 11, 4, 1, 9, 12, 14, 2, 0, 6, 10, 13, 15, 3, 5, 8,
    2, 1, 14, 7, 4, 10, 8, 13, 15, 12, 9, 0, 3, 5, 6, 11,
  ],
];

function permute(src: number[], map: number[]): number[] {
  return map.map((pos) => src[pos - 1]);
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    for (let b = 7; b >= 0; b--) {
      bits.push((bytes[i] >>> b) & 1);
    }
  }
  return bits;
}

function bitsToBytes(bits: number[]): Uint8Array {
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let val = 0;
    for (let b = 0; b < 8; b++) {
      val = (val << 1) | bits[i * 8 + b];
    }
    bytes[i] = val;
  }
  return bytes;
}

function generateSubkeys(keyBytes: Uint8Array): number[][] {
  const keyBits = bytesToBits(keyBytes);
  const pc1 = permute(keyBits, PC1);
  let c = pc1.slice(0, 28);
  let d = pc1.slice(28, 56);

  const subkeys: number[][] = [];
  for (let round = 0; round < 16; round++) {
    const shift = SHIFTS[round];
    c = c.slice(shift).concat(c.slice(0, shift));
    d = d.slice(shift).concat(d.slice(0, shift));
    const cd = c.concat(d);
    subkeys.push(permute(cd, PC2));
  }
  return subkeys;
}

function desBlock(blockBits: number[], subkeys: number[][], decrypt: boolean): number[] {
  const ip = permute(blockBits, IP);
  let l = ip.slice(0, 32);
  let r = ip.slice(32, 64);

  const keys = decrypt ? [...subkeys].reverse() : subkeys;

  for (let round = 0; round < 16; round++) {
    const k = keys[round];
    const er = permute(r, E);
    const xored = er.map((bit, idx) => bit ^ k[idx]);

    const sboxOut: number[] = [];
    for (let s = 0; s < 8; s++) {
      const chunk = xored.slice(s * 6, (s + 1) * 6);
      const row = (chunk[0] << 1) | chunk[5];
      const col = (chunk[1] << 3) | (chunk[2] << 2) | (chunk[3] << 1) | chunk[4];
      const val = SBOXES[s][row * 16 + col];
      for (let b = 3; b >= 0; b--) {
        sboxOut.push((val >>> b) & 1);
      }
    }

    const f = permute(sboxOut, P);
    const nextR = l.map((bit, idx) => bit ^ f[idx]);
    l = r;
    r = nextR;
  }

  const preoutput = r.concat(l);
  return permute(preoutput, FP);
}

function desDecryptEcb(ciphertext: Uint8Array, key: Uint8Array): Uint8Array {
  const subkeys = generateSubkeys(key);
  const result: number[] = [];

  for (let offset = 0; offset < ciphertext.length; offset += 8) {
    const block = ciphertext.slice(offset, offset + 8);
    if (block.length < 8) break;
    const blockBits = bytesToBits(block);
    const decBits = desBlock(blockBits, subkeys, true);
    result.push(...decBits);
  }

  const unpadded = bitsToBytes(result);
  // PKCS5 unpad
  if (unpadded.length > 0) {
    const padLen = unpadded[unpadded.length - 1];
    if (padLen >= 1 && padLen <= 8) {
      let valid = true;
      for (let p = unpadded.length - padLen; p < unpadded.length; p++) {
        if (unpadded[p] !== padLen) {
          valid = false;
          break;
        }
      }
      if (valid) {
        return unpadded.slice(0, unpadded.length - padLen);
      }
    }
  }
  return unpadded;
}

/**
 * Java java.util.Random simulation with 48-bit LCG
 */
class JavaRandom {
  private seed: bigint;

  constructor(seed: number | bigint) {
    this.seed = (BigInt(seed) ^ 0x5deece66dn) & ((1n << 48n) - 1n);
  }

  private next(bits: number): number {
    this.seed = (this.seed * 0x5deece66dn + 0xbn) & ((1n << 48n) - 1n);
    const val = Number(this.seed >> BigInt(48 - bits));
    return (val << (32 - bits)) >> (32 - bits);
  }

  public nextInt(bound: number): number {
    let r = this.next(31);
    const m = bound - 1;
    if ((bound & m) === 0) {
      r = Number((BigInt(bound) * BigInt(r)) >> 31n);
    } else {
      let u = r;
      while (u - (r = u % bound) + m < 0) {
        u = this.next(31);
      }
    }
    return r;
  }

  public nextLong(): bigint {
    const high = BigInt(this.next(32));
    const low = BigInt(this.next(32)) & 0xffffffffn;
    return (high << 32n) | low;
  }
}

/**
 * Derives the DES key from the first 8 bytes (head) of FinalShell encrypted password
 */
function deriveDesKey(head: Uint8Array): Uint8Array {
  let val = head[5];
  if (val > 127) val -= 256;

  const jrTemp = new JavaRandom(val);
  let nextIntVal = jrTemp.nextInt(127);
  if (nextIntVal === 0) nextIntVal = 1;

  const ks = 3680984568597093857n / BigInt(nextIntVal);
  const random = new JavaRandom(ks);

  const t = head[0];
  for (let i = 0; i < t; i++) {
    random.nextLong();
  }

  const n = random.nextLong();

  // 8-byte Big-Endian buffer of long n
  const buf = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    buf[i] = Number((n >> BigInt((7 - i) * 8)) & 0xffn);
  }

  const hash = md5(buf);
  return hash.slice(0, 8);
}

/**
 * Decodes a FinalShell encrypted password string
 */
export function decodeFinalShellPassword(cipherBase64: string): string {
  if (!cipherBase64 || typeof cipherBase64 !== 'string') return '';
  const trimmed = cipherBase64.trim();

  // If plaintext password without base64 length or invalid base64, return directly
  if (!/^[A-Za-z0-9+/=]+$/.test(trimmed) || trimmed.length < 16) {
    return trimmed;
  }

  try {
    const binary = atob(trimmed);
    const raw = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      raw[i] = binary.charCodeAt(i);
    }

    if (raw.length <= 8 || (raw.length - 8) % 8 !== 0) {
      return trimmed;
    }

    const head = raw.slice(0, 8);
    const body = raw.slice(8);
    const key = deriveDesKey(head);
    const decryptedBytes = desDecryptEcb(body, key);
    const result = new TextDecoder('utf-8').decode(decryptedBytes);
    return result || trimmed;
  } catch {
    return trimmed;
  }
}

/**
 * Normalizes raw JSON / text from FinalShell exports into DecryptedHost items
 */
export function parseFinalShellConfig(text: string): Partial<DecryptedHost>[] {
  const result: Partial<DecryptedHost>[] = [];
  const trimmed = text.trim();
  if (!trimmed) return result;

  // Attempt 1: direct parse (array or single object)
  let rawItems: any[] = [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      rawItems = parsed;
    } else if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.conn)) {
        rawItems = parsed.conn;
      } else if (Array.isArray(parsed.connections)) {
        rawItems = parsed.connections;
      } else if (Array.isArray(parsed.items)) {
        rawItems = parsed.items;
      } else if (Array.isArray(parsed.data)) {
        rawItems = parsed.data;
      } else {
        rawItems = [parsed];
      }
    }
  } catch {
    // Attempt 2: if text has multiple JSON objects concatenated or line-by-line
    const jsonMatches = trimmed.match(/\{[\s\S]*?\}(?=\s*\{|\s*$)/g);
    if (jsonMatches && jsonMatches.length > 0) {
      for (const m of jsonMatches) {
        try {
          const obj = JSON.parse(m);
          if (obj && typeof obj === 'object') {
            rawItems.push(obj);
          }
        } catch {}
      }
    }
  }

  for (const item of rawItems) {
    if (!item || typeof item !== 'object') continue;

    const hostname = (item.host || item.ip || item.hostname || item.address || '').trim();
    if (!hostname) continue;

    const name = (item.name || item.server_name || item.text || hostname).trim();
    const port = parseInt(item.port || item.tunnel_port, 10) || 22;
    const username = (item.user_name || item.user || item.username || 'root').trim();

    const rawPassword = item.password || item.pass || item.pwd || '';
    const decryptedPassword = decodeFinalShellPassword(rawPassword);

    const privateKey = (item.private_key || item.key || item.private_key_text || '').trim();
    // In FinalShell, auth_type: 1 is publickey/privatekey, 2 is password
    const isKey = item.auth_type === 1 || item.auth_type === 'private_key' || (privateKey.length > 0 && !decryptedPassword);

    const group_name = (
      item.parent_name ||
      item.folder ||
      item.group ||
      item.group_name ||
      item.category ||
      '默认分组'
    ).trim() || '默认分组';

    result.push({
      name,
      hostname,
      port,
      username,
      auth_type: isKey ? 'private_key' : 'password',
      credentials: {
        password: isKey ? '' : decryptedPassword,
        privateKey: isKey ? privateKey : '',
      },
      group_name,
    });
  }

  return result;
}
