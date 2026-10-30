import { SFTP_MSG, SFTP_STATUS, SFTP_OPEN, SFTP_ATTR } from './constants';
import { SshPacketReader, SshPacketWriter } from './buffer';
import type { SftpEntry } from '@shared/types';

export class SftpClient {
  private sendChannelData: (data: Uint8Array) => Promise<void>;
  private nextRequestId = 1;
  private pendingRequests = new Map<
    number,
    {
      resolve: (res: { type: number; reader: SshPacketReader }) => void;
      reject: (err: Error) => void;
      timer: any;
    }
  >();
  private incomingBuffer = new Uint8Array(0);
  private isInitialized = false;
  private versionResolve: (() => void) | null = null;

  constructor(sendChannelData: (data: Uint8Array) => Promise<void>) {
    this.sendChannelData = sendChannelData;
  }

  // Handle raw bytes coming from SSH subsystem channel
  public onData(chunk: Uint8Array): void {
    const next = new Uint8Array(this.incomingBuffer.length + chunk.length);
    next.set(this.incomingBuffer, 0);
    next.set(chunk, this.incomingBuffer.length);
    this.incomingBuffer = next;

    this.processPackets();
  }

  private processPackets(): void {
    while (this.incomingBuffer.length >= 4) {
      const view = new DataView(this.incomingBuffer.buffer, this.incomingBuffer.byteOffset, 4);
      const packetLen = view.getUint32(0);
      const totalNeeded = 4 + packetLen;

      if (this.incomingBuffer.length < totalNeeded) {
        return;
      }

      const packetData = this.incomingBuffer.slice(4, totalNeeded);
      this.incomingBuffer = this.incomingBuffer.slice(totalNeeded);

      const reader = new SshPacketReader(packetData);
      const type = reader.readByte();

      if (type === SFTP_MSG.VERSION) {
        const _version = reader.readUint32();
        this.isInitialized = true;
        if (this.versionResolve) {
          const resolve = this.versionResolve;
          this.versionResolve = null;
          resolve();
        }
        continue;
      }

      // Read requestId
      const requestId = reader.readUint32();
      const pending = this.pendingRequests.get(requestId);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingRequests.delete(requestId);
        pending.resolve({ type, reader });
      }
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;

    const versionPromise = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.versionResolve = null;
        reject(new Error('SFTP 子系统握手超时'));
      }, 10000);
      this.versionResolve = () => {
        clearTimeout(timer);
        resolve();
      };
    });

    const writer = new SshPacketWriter();
    writer.writeUint32(5); // length = 1 (type) + 4 (version)
    writer.writeByte(SFTP_MSG.INIT);
    writer.writeUint32(3); // SFTP version 3
    await this.sendChannelData(writer.toUint8Array());
    await versionPromise;
  }

  private async request(
    type: number,
    buildPayload: (writer: SshPacketWriter, id: number) => void
  ): Promise<{ type: number; reader: SshPacketReader }> {
    const id = this.nextRequestId++;
    const payload = new SshPacketWriter();
    buildPayload(payload, id);

    const payloadBytes = payload.toUint8Array();
    const packet = new SshPacketWriter();
    packet.writeUint32(payloadBytes.length + 1); // length prefix includes type
    packet.writeByte(type);
    packet.writeBytes(payloadBytes);

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error('SFTP 请求响应超时'));
      }, 15000);

      this.pendingRequests.set(id, { resolve, reject, timer });
      this.sendChannelData(packet.toUint8Array()).catch((err) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  // Resolve canonical path (e.g. '.' -> '/root' or '/home/ubuntu')
  public async realpath(remotePath: string): Promise<string> {
    try {
      const res = await this.request(SFTP_MSG.REALPATH, (w, id) => {
        w.writeUint32(id);
        w.writeString(remotePath);
      });
      if (res.type === SFTP_MSG.NAME) {
        const count = res.reader.readUint32();
        if (count > 0) {
          return res.reader.readString() || '/';
        }
      }
      return '/';
    } catch {
      return '/';
    }
  }

  // List Directory Entries
  public async readdir(remotePath: string): Promise<SftpEntry[]> {
    // 1. Open Directory Handle
    const openRes = await this.request(SFTP_MSG.OPENDIR, (w, id) => {
      w.writeUint32(id);
      w.writeString(remotePath);
    });

    if (openRes.type !== SFTP_MSG.HANDLE) {
      if (openRes.type === SFTP_MSG.STATUS) {
        openRes.reader.readUint32(); // status code
        const errMsg = openRes.reader.readString();
        throw new Error(`无法打开目录 (${remotePath}): ${errMsg}`);
      }
      throw new Error(`无法打开目录: ${remotePath}`);
    }
    const handle = openRes.reader.readStringBytes();
    const entries: SftpEntry[] = [];

    // 2. Loop Read Directory
    try {
      while (true) {
        const readRes = await this.request(SFTP_MSG.READDIR, (w, id) => {
          w.writeUint32(id);
          w.writeStringBytes(handle);
        });

        if (readRes.type === SFTP_MSG.STATUS) {
          const status = readRes.reader.readUint32();
          if (status === SFTP_STATUS.EOF) break;
          const msg = readRes.reader.readString();
          throw new Error(`SFTP readdir error: ${msg}`);
        }

        if (readRes.type === SFTP_MSG.NAME) {
          const count = readRes.reader.readUint32();
          for (let i = 0; i < count; i++) {
            const filename = readRes.reader.readString();
            const longname = readRes.reader.readString();
            const flags = readRes.reader.readUint32();
            let size = 0;
            let uid = 0;
            let gid = 0;
            let mode = 0;
            let mtime = 0;

            if (flags & SFTP_ATTR.SIZE) size = Number(readRes.reader.readUint64());
            if (flags & SFTP_ATTR.UIDGID) {
              uid = readRes.reader.readUint32();
              gid = readRes.reader.readUint32();
            }
            if (flags & SFTP_ATTR.PERMISSIONS) mode = readRes.reader.readUint32();
            if (flags & SFTP_ATTR.ACMODTIME) {
              readRes.reader.readUint32(); // atime
              mtime = readRes.reader.readUint32();
            }
            if (flags & SFTP_ATTR.EXTENDED) {
              const extCount = readRes.reader.readUint32();
              for (let e = 0; e < extCount; e++) {
                readRes.reader.readStringBytes();
                readRes.reader.readStringBytes();
              }
            }

            if (filename !== '.' && filename !== '..') {
              const isDirectory = (mode & 0o040000) === 0o040000;
              const isSymlink = (mode & 0o120000) === 0o120000;
              const fullPath = remotePath.endsWith('/')
                ? `${remotePath}${filename}`
                : `${remotePath}/${filename}`;

              entries.push({
                name: filename,
                path: fullPath,
                isDirectory,
                isSymlink,
                size,
                permissions: longname.split(/\s+/)[0] || (isDirectory ? 'drwxr-xr-x' : '-rw-r--r--'),
                mode,
                uid,
                gid,
                mtime,
              });
            }
          }
        }
      }
    } finally {
      // 3. Close Handle
      await this.request(SFTP_MSG.CLOSE, (w, id) => {
        w.writeUint32(id);
        w.writeStringBytes(handle);
      }).catch(() => {});
    }

    return entries;
  }

  // Make Directory
  public async mkdir(remotePath: string): Promise<boolean> {
    const res = await this.request(SFTP_MSG.MKDIR, (w, id) => {
      w.writeUint32(id);
      w.writeString(remotePath);
      w.writeUint32(0); // attrs
    });
    return res.type === SFTP_MSG.STATUS && res.reader.readUint32() === SFTP_STATUS.OK;
  }

  // Remove File or Directory
  public async remove(remotePath: string, isDirectory: boolean = false): Promise<boolean> {
    const type = isDirectory ? SFTP_MSG.RMDIR : SFTP_MSG.REMOVE;
    const res = await this.request(type, (w, id) => {
      w.writeUint32(id);
      w.writeString(remotePath);
    });
    return res.type === SFTP_MSG.STATUS && res.reader.readUint32() === SFTP_STATUS.OK;
  }

  // Rename File
  public async rename(oldPath: string, newPath: string): Promise<boolean> {
    const res = await this.request(SFTP_MSG.RENAME, (w, id) => {
      w.writeUint32(id);
      w.writeString(oldPath);
      w.writeString(newPath);
    });
    return res.type === SFTP_MSG.STATUS && res.reader.readUint32() === SFTP_STATUS.OK;
  }

  // Read File Content (for Monaco Editor)
  public async readFile(remotePath: string, maxBytes: number = 5 * 1024 * 1024): Promise<{ content: string; truncated: boolean }> {
    const openRes = await this.request(SFTP_MSG.OPEN, (w, id) => {
      w.writeUint32(id);
      w.writeString(remotePath);
      w.writeUint32(SFTP_OPEN.READ);
      w.writeUint32(0); // attrs
    });

    if (openRes.type !== SFTP_MSG.HANDLE) {
      throw new Error(`Failed to open file: ${remotePath}`);
    }

    const handle = openRes.reader.readStringBytes();
    const chunks: Uint8Array[] = [];
    let offset = 0n;
    let totalRead = 0;
    let truncated = false;

    try {
      while (totalRead < maxBytes) {
        const readLen = Math.min(32768, maxBytes - totalRead);
        const res = await this.request(SFTP_MSG.READ, (w, id) => {
          w.writeUint32(id);
          w.writeStringBytes(handle);
          w.writeUint64(offset);
          w.writeUint32(readLen);
        });

        if (res.type === SFTP_MSG.STATUS) {
          const status = res.reader.readUint32();
          if (status === SFTP_STATUS.EOF) break;
          throw new Error('SFTP file read error');
        }

        if (res.type === SFTP_MSG.DATA) {
          const data = res.reader.readStringBytes();
          if (data.length === 0) break;
          chunks.push(data);
          totalRead += data.length;
          offset += BigInt(data.length);
        }
      }

      if (totalRead >= maxBytes) {
        truncated = true;
      }
    } finally {
      await this.request(SFTP_MSG.CLOSE, (w, id) => {
        w.writeUint32(id);
        w.writeStringBytes(handle);
      });
    }

    const full = new Uint8Array(totalRead);
    let cur = 0;
    for (const c of chunks) {
      full.set(c, cur);
      cur += c.length;
    }

    return {
      content: new TextDecoder('utf-8').decode(full),
      truncated,
    };
  }

  // Write File Content (from Monaco Editor or Chunk Upload)
  public async writeFile(remotePath: string, data: Uint8Array): Promise<boolean> {
    const openRes = await this.request(SFTP_MSG.OPEN, (w, id) => {
      w.writeUint32(id);
      w.writeString(remotePath);
      w.writeUint32(SFTP_OPEN.WRITE | SFTP_OPEN.CREAT | SFTP_OPEN.TRUNC);
      w.writeUint32(0); // attrs
    });

    if (openRes.type !== SFTP_MSG.HANDLE) {
      throw new Error(`Failed to open file for writing: ${remotePath}`);
    }

    const handle = openRes.reader.readStringBytes();
    let offset = 0n;
    let pos = 0;

    try {
      while (pos < data.length) {
        const chunkSize = Math.min(32768, data.length - pos);
        const chunk = data.subarray(pos, pos + chunkSize);

        const writeRes = await this.request(SFTP_MSG.WRITE, (w, id) => {
          w.writeUint32(id);
          w.writeStringBytes(handle);
          w.writeUint64(offset);
          w.writeStringBytes(chunk);
        });

        if (writeRes.type !== SFTP_MSG.STATUS || writeRes.reader.readUint32() !== SFTP_STATUS.OK) {
          throw new Error('SFTP file write error');
        }

        pos += chunkSize;
        offset += BigInt(chunkSize);
      }
    } finally {
      await this.request(SFTP_MSG.CLOSE, (w, id) => {
        w.writeUint32(id);
        w.writeStringBytes(handle);
      });
    }

    return true;
  }
}
