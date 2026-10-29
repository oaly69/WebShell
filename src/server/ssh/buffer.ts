// Binary reader and writer for SSH protocol data types (RFC 4251 Section 5)

export class SshPacketReader {
  private buffer: Uint8Array;
  private offset: number = 0;

  constructor(buffer: Uint8Array | ArrayBuffer) {
    this.buffer = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  }

  get remaining(): number {
    return this.buffer.length - this.offset;
  }

  get currentOffset(): number {
    return this.offset;
  }

  readByte(): number {
    if (this.offset >= this.buffer.length) {
      throw new Error('SshPacketReader: Unexpected end of buffer');
    }
    return this.buffer[this.offset++];
  }

  readBoolean(): boolean {
    return this.readByte() !== 0;
  }

  readUint32(): number {
    if (this.offset + 4 > this.buffer.length) {
      throw new Error('SshPacketReader: Unexpected end of buffer reading uint32');
    }
    const val =
      (this.buffer[this.offset] << 24) |
      (this.buffer[this.offset + 1] << 16) |
      (this.buffer[this.offset + 2] << 8) |
      this.buffer[this.offset + 3];
    this.offset += 4;
    return val >>> 0;
  }

  readUint64(): bigint {
    const high = BigInt(this.readUint32());
    const low = BigInt(this.readUint32());
    return (high << 32n) | low;
  }

  readBytes(length: number): Uint8Array {
    if (this.offset + length > this.buffer.length) {
      throw new Error(`SshPacketReader: Insufficient bytes, need ${length}, remaining ${this.remaining}`);
    }
    const bytes = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return bytes;
  }

  readStringBytes(): Uint8Array {
    const length = this.readUint32();
    return this.readBytes(length);
  }

  readString(encoding: 'utf-8' | 'latin1' = 'utf-8'): string {
    const bytes = this.readStringBytes();
    if (encoding === 'utf-8') {
      return new TextDecoder('utf-8').decode(bytes);
    }
    let res = '';
    for (let i = 0; i < bytes.length; i++) {
      res += String.fromCharCode(bytes[i]);
    }
    return res;
  }

  readNameList(): string[] {
    const str = this.readString('utf-8');
    if (!str) return [];
    return str.split(',');
  }

  // mpint: Multiple precision integers (RFC 4251 Section 5)
  readMpint(): Uint8Array {
    return this.readStringBytes();
  }

  readRemaining(): Uint8Array {
    return this.readBytes(this.remaining);
  }
}

export class SshPacketWriter {
  private chunks: Uint8Array[] = [];
  private totalLength: number = 0;

  writeByte(val: number): this {
    const buf = new Uint8Array(1);
    buf[0] = val & 0xff;
    this.chunks.push(buf);
    this.totalLength += 1;
    return this;
  }

  writeBoolean(val: boolean): this {
    return this.writeByte(val ? 1 : 0);
  }

  writeUint32(val: number): this {
    const buf = new Uint8Array(4);
    buf[0] = (val >>> 24) & 0xff;
    buf[1] = (val >>> 16) & 0xff;
    buf[2] = (val >>> 8) & 0xff;
    buf[3] = val & 0xff;
    this.chunks.push(buf);
    this.totalLength += 4;
    return this;
  }

  writeUint64(val: bigint): this {
    this.writeUint32(Number((val >> 32n) & 0xffffffffn));
    this.writeUint32(Number(val & 0xffffffffn));
    return this;
  }

  writeBytes(bytes: Uint8Array | ArrayBuffer): this {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.chunks.push(buf);
    this.totalLength += buf.length;
    return this;
  }

  writeStringBytes(bytes: Uint8Array | ArrayBuffer): this {
    const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    this.writeUint32(buf.length);
    this.writeBytes(buf);
    return this;
  }

  writeString(str: string, encoding: 'utf-8' | 'latin1' = 'utf-8'): this {
    let bytes: Uint8Array;
    if (encoding === 'utf-8') {
      bytes = new TextEncoder().encode(str);
    } else {
      bytes = new Uint8Array(str.length);
      for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i) & 0xff;
      }
    }
    return this.writeStringBytes(bytes);
  }

  writeNameList(list: string[]): this {
    return this.writeString(list.join(','));
  }

  // mpint: Multiple precision integer
  writeMpint(bytes: Uint8Array): this {
    // Trim leading zeros, but preserve one zero if MSB has sign bit set
    let start = 0;
    while (start < bytes.length && bytes[start] === 0) {
      start++;
    }
    const trimmed = bytes.subarray(start);
    if (trimmed.length === 0) {
      this.writeUint32(0);
      return this;
    }
    if ((trimmed[0] & 0x80) !== 0) {
      // Need prefix zero to represent positive integer
      const buf = new Uint8Array(1 + trimmed.length);
      buf[0] = 0x00;
      buf.set(trimmed, 1);
      return this.writeStringBytes(buf);
    }
    return this.writeStringBytes(trimmed);
  }

  toUint8Array(): Uint8Array {
    const result = new Uint8Array(this.totalLength);
    let offset = 0;
    for (const chunk of this.chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }
}
