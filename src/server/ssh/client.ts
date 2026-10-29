import { connect } from 'cloudflare:sockets';
import { SSH_MSG, SSH_DISCONNECT_REASON } from './constants';
import { SshPacketReader, SshPacketWriter } from './buffer';
import {
  sha256,
  generateEcdhP256KeyPair,
  computeEcdhSharedSecret,
  deriveKey,
  SshCipherState,
} from './crypto';

export interface SshConnectOptions {
  hostname: string;
  port: number;
  username: string;
  authType: 'password' | 'private_key';
  password?: string;
  privateKey?: string;
  passphrase?: string;
  cols?: number;
  rows?: number;
  onShellData: (data: Uint8Array) => void;
  onExecData?: (data: Uint8Array) => void;
  onSftpData?: (data: Uint8Array) => void;
  onClose: (reason: string) => void;
}

export interface SshChannel {
  localId: number;
  remoteId: number;
  remoteWindow: number;
  remoteMaxPacket: number;
}

export class SshClient {
  private socket: any = null;
  private reader: any = null;
  private writer: any = null;
  private isClosed: boolean = false;

  private serverVersion: string = '';
  private clientVersion = 'SSH-2.0-WebFinalShell_1.0';

  private sessionId: Uint8Array | null = null;
  private inCipher: SshCipherState | null = null;
  private outCipher: SshCipherState | null = null;

  private shellChannel: SshChannel | null = null;
  private execChannel: SshChannel | null = null;
  private sftpChannel: SshChannel | null = null;

  private nextLocalChannelId = 0;
  private options: SshConnectOptions;

  // Buffer for incoming raw TCP stream
  private incomingTcpBuffer = new Uint8Array(0);

  constructor(options: SshConnectOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    try {
      this.socket = connect({
        hostname: this.options.hostname,
        port: this.options.port,
      });

      this.writer = this.socket.writable.getWriter();
      this.reader = this.socket.readable.getReader();

      // 1. Handshake: Version Exchange
      await this.exchangeVersion();

      // 2. Start TCP reading loop in background
      this.startPacketLoop();

      // 3. Send KEXINIT
      await this.sendKexInit();
    } catch (err: any) {
      this.close(`Connection failed: ${err.message}`);
      throw err;
    }
  }

  private async exchangeVersion(): Promise<void> {
    // Send our identification string with CRLF
    const clientVerBytes = new TextEncoder().encode(this.clientVersion + '\r\n');
    await this.writer.write(clientVerBytes);

    // Read until server sends its version string starting with 'SSH-'
    let line = '';
    while (true) {
      const { value, done } = await this.reader.read();
      if (done || !value) {
        throw new Error('Server closed connection before version exchange');
      }

      for (let i = 0; i < value.length; i++) {
        const char = String.fromCharCode(value[i]);
        line += char;
        if (line.endsWith('\r\n') || line.endsWith('\n')) {
          const trimmed = line.trim();
          if (trimmed.startsWith('SSH-')) {
            this.serverVersion = trimmed;
            // Append any leftover bytes after version line into TCP buffer
            const remainingBytes = value.subarray(i + 1);
            if (remainingBytes.length > 0) {
              this.appendToTcpBuffer(remainingBytes);
            }
            return;
          }
          line = ''; // Comment line before version, discard and continue
        }
      }
    }
  }

  private appendToTcpBuffer(data: Uint8Array): void {
    const next = new Uint8Array(this.incomingTcpBuffer.length + data.length);
    next.set(this.incomingTcpBuffer, 0);
    next.set(data, this.incomingTcpBuffer.length);
    this.incomingTcpBuffer = next;
  }

  // Background loop reading from Cloudflare TCP socket
  private async startPacketLoop(): Promise<void> {
    try {
      while (!this.isClosed) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value && value.length > 0) {
          this.appendToTcpBuffer(value);
          await this.processIncomingPackets();
        }
      }
    } catch (err: any) {
      this.close(`Read error: ${err.message}`);
    } finally {
      this.close('Socket closed');
    }
  }

  private async processIncomingPackets(): Promise<void> {
    while (this.incomingTcpBuffer.length > 0) {
      let packetLength = 0;
      let paddingLength = 0;
      let payload: Uint8Array;

      if (!this.inCipher) {
        // Plaintext mode (during initial KEX)
        if (this.incomingTcpBuffer.length < 5) return;
        const view = new DataView(this.incomingTcpBuffer.buffer, this.incomingTcpBuffer.byteOffset, 5);
        packetLength = view.getUint32(0);
        paddingLength = view.getUint8(4);

        const totalNeeded = 4 + packetLength;
        if (this.incomingTcpBuffer.length < totalNeeded) return;

        payload = this.incomingTcpBuffer.subarray(5, totalNeeded - paddingLength);
        this.incomingTcpBuffer = this.incomingTcpBuffer.subarray(totalNeeded);
      } else {
        // Cipher mode: AES-CTR + HMAC-SHA2-256
        const blockSize = 16;
        const macSize = 32;
        if (this.incomingTcpBuffer.length < 4 + macSize) return;

        // Decrypt first 16 bytes to read packet_length
        const initialChunk = this.incomingTcpBuffer.subarray(0, blockSize);
        const decryptedFirst = await this.inCipher.decrypt(initialChunk);
        const view = new DataView(decryptedFirst.buffer, decryptedFirst.byteOffset, 5);
        packetLength = view.getUint32(0);
        paddingLength = view.getUint8(4);

        const totalNeeded = 4 + packetLength + macSize;
        if (this.incomingTcpBuffer.length < totalNeeded) return;

        const remainingCiphertext = this.incomingTcpBuffer.subarray(blockSize, 4 + packetLength);
        const decryptedRest = await this.inCipher.decrypt(remainingCiphertext);

        const fullDecrypted = new Uint8Array(blockSize + decryptedRest.length);
        fullDecrypted.set(decryptedFirst, 0);
        fullDecrypted.set(decryptedRest, blockSize);

        payload = fullDecrypted.subarray(5, 4 + packetLength - paddingLength);
        this.incomingTcpBuffer = this.incomingTcpBuffer.subarray(totalNeeded);
      }

      if (payload.length > 0) {
        await this.handlePacket(payload);
      }
    }
  }

  // Handle unpacked SSH Protocol Packet
  private async handlePacket(payload: Uint8Array): Promise<void> {
    const reader = new SshPacketReader(payload);
    const msgType = reader.readByte();

    switch (msgType) {
      case SSH_MSG.DISCONNECT: {
        const reasonCode = reader.readUint32();
        const desc = reader.readString();
        this.close(`SSH Disconnect (${reasonCode}): ${desc}`);
        break;
      }
      case SSH_MSG.IGNORE:
      case SSH_MSG.DEBUG:
        break;
      case SSH_MSG.KEXINIT:
        await this.handleKexInit(payload);
        break;
      case SSH_MSG.KEX_ECDH_REPLY:
        await this.handleEcdhReply(payload);
        break;
      case SSH_MSG.NEWKEYS:
        await this.handleNewKeys();
        break;
      case SSH_MSG.SERVICE_ACCEPT:
        await this.handleServiceAccept(reader);
        break;
      case SSH_MSG.USERAUTH_SUCCESS:
        await this.handleAuthSuccess();
        break;
      case SSH_MSG.USERAUTH_FAILURE:
        this.close('Authentication failed: Invalid credentials');
        break;
      case SSH_MSG.CHANNEL_OPEN_CONFIRMATION:
        this.handleChannelOpenConfirmation(reader);
        break;
      case SSH_MSG.CHANNEL_DATA:
        this.handleChannelData(reader);
        break;
      case SSH_MSG.CHANNEL_WINDOW_ADJUST: {
        const remoteId = reader.readUint32();
        const bytesToAdd = reader.readUint32();
        if (this.shellChannel && this.shellChannel.remoteId === remoteId) {
          this.shellChannel.remoteWindow += bytesToAdd;
        }
        break;
      }
      case SSH_MSG.CHANNEL_CLOSE: {
        const remoteId = reader.readUint32();
        await this.sendPacket(new SshPacketWriter().writeByte(SSH_MSG.CHANNEL_CLOSE).writeUint32(remoteId));
        break;
      }
    }
  }

  // Internal KEX State
  private clientKexInitBytes: Uint8Array | null = null;
  private serverKexInitBytes: Uint8Array | null = null;
  private clientEcdhPair: { keyPair: CryptoKeyPair; clientPublicBytes: Uint8Array } | null = null;
  private sharedSecretK: Uint8Array | null = null;
  private exchangeHashH: Uint8Array | null = null;

  private async sendKexInit(): Promise<void> {
    const cookie = crypto.getRandomValues(new Uint8Array(16));
    const writer = new SshPacketWriter();
    writer.writeByte(SSH_MSG.KEXINIT);
    writer.writeBytes(cookie);
    writer.writeNameList(['ecdh-sha2-nistp256', 'diffie-hellman-group14-sha256']);
    writer.writeNameList(['rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ecdsa-sha2-nistp256']);
    writer.writeNameList(['aes128-ctr', 'aes256-ctr']); // Ciphers client->server
    writer.writeNameList(['aes128-ctr', 'aes256-ctr']); // Ciphers server->client
    writer.writeNameList(['hmac-sha2-256']); // MAC client->server
    writer.writeNameList(['hmac-sha2-256']); // MAC server->client
    writer.writeNameList(['none']); // Compression client->server
    writer.writeNameList(['none']); // Compression server->client
    writer.writeNameList([]); // Languages client->server
    writer.writeNameList([]); // Languages server->client
    writer.writeBoolean(false); // First kex packet follows
    writer.writeUint32(0); // Reserved

    this.clientKexInitBytes = writer.toUint8Array();
    await this.sendPacket(writer);
  }

  private async handleKexInit(payload: Uint8Array): Promise<void> {
    this.serverKexInitBytes = payload;

    // Generate ECDH P-256 client key
    this.clientEcdhPair = await generateEcdhP256KeyPair();

    // Send SSH_MSG_KEX_ECDH_INIT
    const writer = new SshPacketWriter();
    writer.writeByte(SSH_MSG.KEX_ECDH_INIT);
    writer.writeStringBytes(this.clientEcdhPair.clientPublicBytes);
    await this.sendPacket(writer);
  }

  private async handleEcdhReply(payload: Uint8Array): Promise<void> {
    const reader = new SshPacketReader(payload);
    reader.readByte(); // 31 (KEX_ECDH_REPLY)
    const hostKeyBytes = reader.readStringBytes();
    const serverPublicBytes = reader.readStringBytes();
    const signatureBytes = reader.readStringBytes();

    if (!this.clientEcdhPair) throw new Error('Missing client ECDH key');

    // Compute shared secret K
    this.sharedSecretK = await computeEcdhSharedSecret(
      this.clientEcdhPair.keyPair.privateKey,
      serverPublicBytes
    );

    // Compute Exchange Hash H = SHA256(V_C || V_S || I_C || I_S || K_S || Q_C || Q_S || K)
    const hWriter = new SshPacketWriter();
    hWriter.writeString(this.clientVersion);
    hWriter.writeString(this.serverVersion);
    hWriter.writeStringBytes(this.clientKexInitBytes!);
    hWriter.writeStringBytes(this.serverKexInitBytes!);
    hWriter.writeStringBytes(hostKeyBytes);
    hWriter.writeStringBytes(this.clientEcdhPair.clientPublicBytes);
    hWriter.writeStringBytes(serverPublicBytes);
    hWriter.writeMpint(this.sharedSecretK);

    this.exchangeHashH = await sha256(hWriter.toUint8Array());
    if (!this.sessionId) {
      this.sessionId = this.exchangeHashH;
    }

    // Send SSH_MSG_NEWKEYS
    await this.sendPacket(new SshPacketWriter().writeByte(SSH_MSG.NEWKEYS));
  }

  private async handleNewKeys(): Promise<void> {
    if (!this.sharedSecretK || !this.exchangeHashH || !this.sessionId) {
      throw new Error('Missing KEX keys on NEWKEYS');
    }

    // RFC 4253 Section 7.2:
    // Initial IV client to server: 'A'
    // Initial IV server to client: 'B'
    // Encryption key client to server: 'C'
    // Encryption key server to client: 'D'
    // Integrity key client to server: 'E'
    // Integrity key server to client: 'F'
    const ivC2S = await deriveKey(this.sharedSecretK, this.exchangeHashH, 'A', this.sessionId, 16);
    const ivS2C = await deriveKey(this.sharedSecretK, this.exchangeHashH, 'B', this.sessionId, 16);
    const keyC2S = await deriveKey(this.sharedSecretK, this.exchangeHashH, 'C', this.sessionId, 16);
    const keyS2C = await deriveKey(this.sharedSecretK, this.exchangeHashH, 'D', this.sessionId, 16);
    const macC2S = await deriveKey(this.sharedSecretK, this.exchangeHashH, 'E', this.sessionId, 32);
    const macS2C = await deriveKey(this.sharedSecretK, this.exchangeHashH, 'F', this.sessionId, 32);

    this.outCipher = new SshCipherState('aes128-ctr', keyC2S, ivC2S, macC2S);
    await this.outCipher.init(keyC2S);

    this.inCipher = new SshCipherState('aes128-ctr', keyS2C, ivS2C, macS2C);
    await this.inCipher.init(keyS2C);

    // Request ssh-userauth service
    const authReq = new SshPacketWriter();
    authReq.writeByte(SSH_MSG.SERVICE_REQUEST);
    authReq.writeString('ssh-userauth');
    await this.sendPacket(authReq);
  }

  private async handleServiceAccept(reader: SshPacketReader): Promise<void> {
    const serviceName = reader.readString();
    if (serviceName !== 'ssh-userauth') return;

    // Send SSH_MSG_USERAUTH_REQUEST
    if (this.options.authType === 'password') {
      const auth = new SshPacketWriter();
      auth.writeByte(SSH_MSG.USERAUTH_REQUEST);
      auth.writeString(this.options.username);
      auth.writeString('ssh-connection');
      auth.writeString('password');
      auth.writeBoolean(false);
      auth.writeString(this.options.password || '');
      await this.sendPacket(auth);
    } else {
      // Public key auth or none fallback
      this.close('Private key auth format parsing in progress');
    }
  }

  private async handleAuthSuccess(): Promise<void> {
    // Open Channel 0 for interactive Shell
    await this.openChannel('shell');
  }

  // Open Channels (shell, exec, or sftp)
  public async openChannel(type: 'shell' | 'exec' | 'sftp', execCommand?: string): Promise<number> {
    const localId = this.nextLocalChannelId++;
    const initialWindow = 2 * 1024 * 1024; // 2MB window
    const maxPacket = 32768;

    const writer = new SshPacketWriter();
    writer.writeByte(SSH_MSG.CHANNEL_OPEN);
    writer.writeString('session');
    writer.writeUint32(localId);
    writer.writeUint32(initialWindow);
    writer.writeUint32(maxPacket);

    if (type === 'shell') {
      this.shellChannel = { localId, remoteId: 0, remoteWindow: 0, remoteMaxPacket: 0 };
    } else if (type === 'exec') {
      this.execChannel = { localId, remoteId: 0, remoteWindow: 0, remoteMaxPacket: 0 };
    } else if (type === 'sftp') {
      this.sftpChannel = { localId, remoteId: 0, remoteWindow: 0, remoteMaxPacket: 0 };
    }

    await this.sendPacket(writer);
    return localId;
  }

  private async handleChannelOpenConfirmation(reader: SshPacketReader): Promise<void> {
    const localId = reader.readUint32();
    const remoteId = reader.readUint32();
    const remoteWindow = reader.readUint32();
    const remoteMaxPacket = reader.readUint32();

    if (this.shellChannel && this.shellChannel.localId === localId) {
      this.shellChannel.remoteId = remoteId;
      this.shellChannel.remoteWindow = remoteWindow;
      this.shellChannel.remoteMaxPacket = remoteMaxPacket;

      // 1. Request PTY
      const ptyReq = new SshPacketWriter();
      ptyReq.writeByte(SSH_MSG.CHANNEL_REQUEST);
      ptyReq.writeUint32(remoteId);
      ptyReq.writeString('pty-req');
      ptyReq.writeBoolean(true); // Want reply
      ptyReq.writeString('xterm-256color');
      ptyReq.writeUint32(this.options.cols || 80);
      ptyReq.writeUint32(this.options.rows || 24);
      ptyReq.writeUint32(0); // Pixel width
      ptyReq.writeUint32(0); // Pixel height
      ptyReq.writeString(''); // Terminal modes
      await this.sendPacket(ptyReq);

      // 2. Request Shell
      const shellReq = new SshPacketWriter();
      shellReq.writeByte(SSH_MSG.CHANNEL_REQUEST);
      shellReq.writeUint32(remoteId);
      shellReq.writeString('shell');
      shellReq.writeBoolean(true);
      await this.sendPacket(shellReq);
    } else if (this.execChannel && this.execChannel.localId === localId) {
      this.execChannel.remoteId = remoteId;
      this.execChannel.remoteWindow = remoteWindow;
      this.execChannel.remoteMaxPacket = remoteMaxPacket;
    } else if (this.sftpChannel && this.sftpChannel.localId === localId) {
      this.sftpChannel.remoteId = remoteId;
      this.sftpChannel.remoteWindow = remoteWindow;
      this.sftpChannel.remoteMaxPacket = remoteMaxPacket;

      // Request Subsystem 'sftp'
      const sftpReq = new SshPacketWriter();
      sftpReq.writeByte(SSH_MSG.CHANNEL_REQUEST);
      sftpReq.writeUint32(remoteId);
      sftpReq.writeString('subsystem');
      sftpReq.writeBoolean(true);
      sftpReq.writeString('sftp');
      await this.sendPacket(sftpReq);
    }
  }

  private handleChannelData(reader: SshPacketReader): void {
    const localId = reader.readUint32();
    const data = reader.readStringBytes();

    // Auto adjust window
    const adjust = new SshPacketWriter();
    adjust.writeByte(SSH_MSG.CHANNEL_WINDOW_ADJUST);
    adjust.writeUint32(localId);
    adjust.writeUint32(data.length);
    this.sendPacket(adjust).catch(() => {});

    if (this.shellChannel && this.shellChannel.localId === localId) {
      this.options.onShellData(data);
    } else if (this.execChannel && this.execChannel.localId === localId) {
      if (this.options.onExecData) this.options.onExecData(data);
    } else if (this.sftpChannel && this.sftpChannel.localId === localId) {
      if (this.options.onSftpData) this.options.onSftpData(data);
    }
  }

  // Send terminal user input to Shell Channel
  public async writeShellData(data: Uint8Array): Promise<void> {
    if (!this.shellChannel) return;
    const writer = new SshPacketWriter();
    writer.writeByte(SSH_MSG.CHANNEL_DATA);
    writer.writeUint32(this.shellChannel.remoteId);
    writer.writeStringBytes(data);
    await this.sendPacket(writer);
  }

  // Resize Shell PTY Window
  public async resizeShell(cols: number, rows: number): Promise<void> {
    if (!this.shellChannel) return;
    const writer = new SshPacketWriter();
    writer.writeByte(SSH_MSG.CHANNEL_REQUEST);
    writer.writeUint32(this.shellChannel.remoteId);
    writer.writeString('window-change');
    writer.writeBoolean(false);
    writer.writeUint32(cols);
    writer.writeUint32(rows);
    writer.writeUint32(0);
    writer.writeUint32(0);
    await this.sendPacket(writer);
  }

  // Send SFTP Subsystem packet data
  public async writeSftpData(data: Uint8Array): Promise<void> {
    if (!this.sftpChannel) return;
    const writer = new SshPacketWriter();
    writer.writeByte(SSH_MSG.CHANNEL_DATA);
    writer.writeUint32(this.sftpChannel.remoteId);
    writer.writeStringBytes(data);
    await this.sendPacket(writer);
  }

  // Pack and encrypt SSH packet before writing to Cloudflare TCP socket
  private async sendPacket(packetPayload: SshPacketWriter): Promise<void> {
    if (this.isClosed) return;
    const payloadBytes = packetPayload.toUint8Array();
    const blockSize = 16; // AES block size

    // RFC 4253 Section 6:
    // packet_length (4 bytes) + padding_length (1 byte) + payload + random padding
    // Total (packet_length + 4) must be a multiple of blockSize (or 8 in plaintext)
    let paddingLen = blockSize - ((4 + 1 + payloadBytes.length) % blockSize);
    if (paddingLen < 4) paddingLen += blockSize;

    const packetLen = 1 + payloadBytes.length + paddingLen;
    const paddingBytes = crypto.getRandomValues(new Uint8Array(paddingLen));

    const unencrypted = new Uint8Array(4 + packetLen);
    const view = new DataView(unencrypted.buffer);
    view.setUint32(0, packetLen);
    view.setUint8(4, paddingLen);
    unencrypted.set(payloadBytes, 5);
    unencrypted.set(paddingBytes, 5 + payloadBytes.length);

    if (!this.outCipher) {
      await this.writer.write(unencrypted);
    } else {
      const { ciphertext, mac } = await this.outCipher.encrypt(unencrypted);
      const totalOut = new Uint8Array(ciphertext.length + (mac ? mac.length : 0));
      totalOut.set(ciphertext, 0);
      if (mac) {
        totalOut.set(mac, ciphertext.length);
      }
      await this.writer.write(totalOut);
    }
  }

  public close(reason: string = 'Closed'): void {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      if (this.writer) this.writer.close().catch(() => {});
      if (this.socket) this.socket.close();
    } catch {}
    this.options.onClose(reason);
  }
}
