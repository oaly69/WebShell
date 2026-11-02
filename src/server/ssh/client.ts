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
  connectionMode?: 'tcp' | 'cf_tunnel';
  cfAccessClientId?: string;
  cfAccessClientSecret?: string;
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

export function isIpv6Address(host: string): boolean {
  if (!host) return false;
  const clean = host.replace(/^\[|\]$/g, '').trim();
  const colonCount = (clean.match(/:/g) || []).length;
  return colonCount >= 2;
}

export function isIpv4Address(host: string): boolean {
  if (!host) return false;
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host.trim());
}

export function parseTunnelPrefix(rawHost: string): {
  strippedHost: string;
  isTunnelPrefix: boolean;
  scheme: 'http' | 'https';
} {
  const trimmed = (rawHost || '').trim();
  const match = trimmed.match(/^(wss?|https?|cf|tunnel):\/\/(.+)$/i);
  if (!match) {
    return { strippedHost: trimmed, isTunnelPrefix: false, scheme: 'https' };
  }
  const proto = match[1].toLowerCase();
  const rest = match[2].replace(/\/.*$/, '').trim();
  const scheme = proto === 'ws' || proto === 'http' ? 'http' : 'https';
  return { strippedHost: rest, isTunnelPrefix: true, scheme };
}

export function normalizeHostAddress(rawHost: string, defaultPort: number = 22): { hostname: string; port: number } {
  const { strippedHost } = parseTunnelPrefix(rawHost);
  let host = strippedHost;
  let port = defaultPort;

  // Handle [ipv6]:port, e.g. [2001:db8::1]:2222
  const bracketPortMatch = host.match(/^\[([a-fA-F0-9:]+)\]:(\d+)$/);
  if (bracketPortMatch) {
    host = bracketPortMatch[1];
    port = parseInt(bracketPortMatch[2], 10) || defaultPort;
  } else {
    // Handle [ipv6] without port, e.g. [2001:db8::1]
    const bracketMatch = host.match(/^\[([a-fA-F0-9:]+)\]$/);
    if (bracketMatch) {
      host = bracketMatch[1];
    } else {
      // Handle ipv4:port or domain:port (e.g. 1.2.3.4:2222 or my.host.com:2222)
      // Must have exactly one colon so raw IPv6 like 2001:db8::1 is not treated as host:port
      const colonCount = (host.match(/:/g) || []).length;
      if (colonCount === 1) {
        const portMatch = host.match(/^([a-zA-Z0-9.-]+):(\d+)$/);
        if (portMatch) {
          host = portMatch[1];
          port = parseInt(portMatch[2], 10) || defaultPort;
        }
      }
    }
  }

  // Ensure clean hostname without square brackets
  host = host.replace(/^\[|\]$/g, '').trim();

  return { hostname: host, port };
}

async function connectViaCfTunnel(
  cleanHost: string,
  cleanPort: number,
  scheme: 'http' | 'https' = 'https',
  cfAccessClientId?: string,
  cfAccessClientSecret?: string
): Promise<{
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
  opened: Promise<void>;
  closed: Promise<void>;
  close: () => void;
}> {
  const hostHeader = isIpv6Address(cleanHost) ? `[${cleanHost}]` : cleanHost;
  const isDefaultPort =
    cleanPort === 22 ||
    (scheme === 'https' && cleanPort === 443) ||
    (scheme === 'http' && cleanPort === 80);
  const targetUrl = isDefaultPort
    ? `${scheme}://${hostHeader}/`
    : `${scheme}://${hostHeader}:${cleanPort}/`;

  const headers: Record<string, string> = {
    Upgrade: 'websocket',
    'User-Agent': 'cloudflared/2025.2.0',
  };
  if (cfAccessClientId && cfAccessClientId.trim()) {
    headers['CF-Access-Client-Id'] = cfAccessClientId.trim();
  }
  if (cfAccessClientSecret && cfAccessClientSecret.trim()) {
    headers['CF-Access-Client-Secret'] = cfAccessClientSecret.trim();
  }

  let res: Response;
  try {
    res = await fetch(targetUrl, {
      headers,
      redirect: 'manual',
    });
  } catch (err: any) {
    throw new Error(
      `CF Tunnel 隧道请求失败 (${cleanHost})：${err?.message || '无法建立 WebSocket 连接'}`
    );
  }

  const ws = (res as any).webSocket as WebSocket | undefined;
  if (!ws) {
    const location = res.headers.get('location') || '';
    if (
      res.status === 302 ||
      res.status === 301 ||
      res.status === 401 ||
      res.status === 403 ||
      location.includes('cloudflareaccess.com')
    ) {
      throw new Error(
        `CF Tunnel 连接被 Cloudflare Access 零信任策略拦截 (HTTP ${res.status})。\n若该域名开启了 Zero Trust Access 保护，请在主机编辑界面填入 CF-Access-Client-Id 与 CF-Access-Client-Secret 服务令牌，或在 Cloudflare Zero Trust 后台将策略设为 Bypass。`
      );
    }
    if (res.status === 530 || res.status === 502 || res.status === 504) {
      throw new Error(
        `CF Tunnel 隧道不在线或内网目标 SSH 未响应 (HTTP ${res.status})。\n请检查：\n1. 目标内网服务器上的 cloudflared 进程是否正常运行；\n2. cloudflared 后台 Public Hostname 的 Service Type 是否已设为 SSH (如 ssh://localhost:22)。`
      );
    }
    throw new Error(
      `无法通过 CF Tunnel 建立 WebSocket 隧道连接 (${cleanHost}, HTTP ${res.status})。\n请确认该域名已在 Cloudflare Zero Trust -> Tunnels -> Public Hostname 中配置为 SSH 服务类型 (ssh://localhost:22)。`
    );
  }

  ws.accept();

  let closeResolve!: () => void;
  let closeReject!: (err: Error) => void;
  const closed = new Promise<void>((resolve, reject) => {
    closeResolve = resolve;
    closeReject = reject;
  });

  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      ws.addEventListener('message', (event: MessageEvent) => {
        try {
          if (event.data instanceof ArrayBuffer) {
            controller.enqueue(new Uint8Array(event.data));
          } else if (event.data instanceof Uint8Array) {
            controller.enqueue(event.data);
          } else if (typeof event.data === 'string') {
            controller.enqueue(new TextEncoder().encode(event.data));
          }
        } catch {}
      });

      ws.addEventListener('close', () => {
        try {
          controller.close();
        } catch {}
        closeResolve();
      });

      ws.addEventListener('error', (err: any) => {
        const error = new Error(err?.message || 'CF Tunnel WebSocket 连接异常中断');
        try {
          controller.error(error);
        } catch {}
        closeReject(error);
      });
    },
    cancel() {
      try {
        ws.close(1000, 'Stream cancelled');
      } catch {}
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      ws.send(chunk);
    },
    close() {
      try {
        ws.close(1000, 'Normal closure');
      } catch {}
    },
    abort() {
      try {
        ws.close(1000, 'Aborted');
      } catch {}
    },
  });

  return {
    readable,
    writable,
    opened: Promise.resolve(),
    closed,
    close: () => {
      try {
        ws.close(1000, 'Client closed');
      } catch {}
    },
  };
}

export function formatSocketError(msg: string, rawHost?: string, rawPort?: number): string {
  const { hostname: cleanHost, port: cleanPort } = normalizeHostAddress(rawHost || '', rawPort || 22);
  const isIpv6 = isIpv6Address(cleanHost);
  const targetStr = isIpv6 ? `[${cleanHost}]:${cleanPort}` : `${cleanHost}:${cleanPort}`;

  if (msg.includes('CF Tunnel')) {
    return msg;
  }

  if (
    msg.includes('Stream was cancelled') ||
    msg.includes('cancelled') ||
    msg.includes('canceled')
  ) {
    if (isIpv6) {
      return `连接被远程主机中断 (Stream was cancelled)。\n目标主机为 IPv6 (${targetStr})，请检查：\n1. 目标服务器 SSH 服务是否在 IPv6 监听（检查 /etc/ssh/sshd_config 的 ListenAddress :: 或 AddressFamily any）；\n2. 云服务商安全组及系统防火墙 (ufw/ip6tables) 是否放行了 IPv6 的 ${cleanPort} 端口；\n3. 目标机器 IPv6 网络是否通畅且允许外部公网访问。`;
    }
    return `远程服务器重置或中断了连接 (Stream was cancelled)。请检查目标服务器 SSH 服务是否正常运行及防火墙设置 (${targetStr})。`;
  }

  if (
    msg.includes('proxy request failed') ||
    msg.includes('cannot connect to the specified address') ||
    msg.includes('无法建立 TCP 连接') ||
    msg.includes('TCP 连接超时')
  ) {
    if (isIpv6) {
      return `无法连接到目标 IPv6 服务器 (${targetStr})。\n排查指引：\n1. 确认该 IPv6 为公网可路由地址（若是家庭宽带内网或链路本地 fe80::、ULA fc00::/fd00::，Cloudflare 公网节点无法跨局域网直接访问，需使用公网 IPv6 或配置穿透）；\n2. 检查服务器 sshd_config 配置是否启用了 IPv6 监听（ListenAddress ::）；\n3. 检查云服务商安全组及服务器防火墙 (ufw/iptables/nftables) 是否已放行 IPv6 ${cleanPort} 入方向端口。`;
    }
    return `无法连接到目标服务器 (${targetStr})。请检查目标 IP/域名、端口及网络与防火墙设置（若是通过 CF Tunnel 穿透的内网主机，请在编辑主机中选择“CF Tunnel 内网穿透”模式并确认隧道已配置为 SSH 类型）。`;
  }

  if (msg.includes('Connection refused') || msg.includes('refused')) {
    return `目标服务器拒绝连接 (${targetStr})。请检查 SSH 服务是否正常运行并监听该端口。`;
  }

  if (
    msg.includes('Network unreachable') ||
    msg.includes('unreachable') ||
    msg.includes('No route to host')
  ) {
    return `目标网络不可达 (${targetStr})。请确认目标网络路由及地址可达性。`;
  }

  return msg || '连接异常关闭';
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
  private inSeq: number = 0;
  private outSeq: number = 0;

  private shellChannel: SshChannel | null = null;
  private execChannel: SshChannel | null = null;
  private sftpChannel: SshChannel | null = null;

  private nextLocalChannelId = 0;
  private options: SshConnectOptions;

  // Buffer for incoming raw TCP stream
  private incomingTcpBuffer = new Uint8Array(0);
  private writeChain: Promise<void> = Promise.resolve();

  // Handshake completion promise
  private connectResolve: (() => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;

  // Pending channel open confirmations
  private pendingChannels = new Map<
    number,
    {
      type: 'shell' | 'exec' | 'sftp';
      execCommand?: string;
      resolve: (localId: number) => void;
      reject: (err: Error) => void;
    }
  >();

  constructor(options: SshConnectOptions) {
    this.options = options;
  }

  async connect(): Promise<void> {
    const { isTunnelPrefix, scheme: prefixScheme } = parseTunnelPrefix(this.options.hostname);
    const { hostname: cleanHost, port: cleanPort } = normalizeHostAddress(
      this.options.hostname,
      this.options.port
    );

    const isIpv6 = isIpv6Address(cleanHost);
    const isIpv4 = isIpv4Address(cleanHost);
    const connectHost = isIpv6 ? `[${cleanHost.replace(/^\[|\]$/g, '')}]` : cleanHost;
    const targetDisplay = isIpv6 ? `${connectHost}:${cleanPort}` : `${cleanHost}:${cleanPort}`;
    const useCfTunnel = this.options.connectionMode === 'cf_tunnel' || isTunnelPrefix;

    try {
      if (useCfTunnel) {
        const scheme = isTunnelPrefix ? prefixScheme : cleanPort === 80 ? 'http' : 'https';
        this.socket = await connectViaCfTunnel(
          cleanHost,
          cleanPort,
          scheme,
          this.options.cfAccessClientId,
          this.options.cfAccessClientSecret
        );
      } else {
        this.socket = connect({
          hostname: connectHost,
          port: cleanPort,
        });

        // Wait for socket to establish connection or fail with descriptive error
        if (this.socket.opened) {
          let openTimeoutId: any;
          const openTimeoutPromise = new Promise<never>((_, reject) => {
            openTimeoutId = setTimeout(() => {
              reject(
                new Error(
                  `TCP 连接超时 (10s)。无法连接到 ${targetDisplay}，请检查目标服务器是否开机、防火墙/安全组是否放行。`
                )
              );
            }, 10000);
          });

          try {
            await Promise.race([this.socket.opened, openTimeoutPromise]).finally(() => {
              clearTimeout(openTimeoutId);
            });
          } catch (openErr: any) {
            const errMsg = openErr?.message || '';
            // Auto-fallback to CF Tunnel WebSocket if connecting to a domain name that resolves to Cloudflare Edge
            if (
              !isIpv4 &&
              !isIpv6 &&
              (errMsg.includes('cannot connect to the specified address') ||
                errMsg.includes('proxy request failed'))
            ) {
              try {
                if (this.socket) {
                  try {
                    this.socket.close();
                  } catch {}
                }
                this.socket = await connectViaCfTunnel(
                  cleanHost,
                  cleanPort,
                  cleanPort === 80 ? 'http' : 'https',
                  this.options.cfAccessClientId,
                  this.options.cfAccessClientSecret
                );
              } catch (tunnelErr: any) {
                throw new Error(tunnelErr?.message || formatSocketError(errMsg, cleanHost, cleanPort));
              }
            } else {
              throw new Error(formatSocketError(errMsg || '无法建立 TCP 连接', cleanHost, cleanPort));
            }
          }
        }
      }

      // Monitor socket.closed in background
      if (this.socket.closed) {
        this.socket.closed.catch((err: any) => {
          if (!this.isClosed) {
            const errMsg = err?.message || '';
            this.close(formatSocketError(errMsg, cleanHost, cleanPort));
          }
        });
      }

      this.writer = this.socket.writable.getWriter();
      this.reader = this.socket.readable.getReader();

      const handshakeComplete = new Promise<void>((resolve, reject) => {
        this.connectResolve = resolve;
        this.connectReject = reject;
      });

      // 1. Handshake: Version Exchange
      await this.exchangeVersion();

      // 2. Send KEXINIT before starting packet loop so clientKexInitBytes is ready
      await this.sendKexInit();

      // 3. Start TCP reading loop in background (processes any buffered bytes first)
      this.startPacketLoop();

      // 4. Wait for KEX + UserAuth + Initial Shell Channel to complete (20s timeout)
      let timeoutId: any;
      const timeoutPromise = new Promise<void>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('SSH 握手或认证超时 (20s)'));
        }, 20000);
      });

      try {
        await Promise.race([handshakeComplete, timeoutPromise]);
      } finally {
        clearTimeout(timeoutId);
      }
    } catch (err: any) {
      this.close(formatSocketError(err.message || '', cleanHost, cleanPort));
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
          const cleaned = line.replace(/\r?\n$/, '');
          if (cleaned.startsWith('SSH-')) {
            this.serverVersion = cleaned;
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
      if (this.incomingTcpBuffer.length > 0) {
        await this.processIncomingPackets();
      }
      while (!this.isClosed) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value && value.length > 0) {
          this.appendToTcpBuffer(value);
          await this.processIncomingPackets();
        }
      }
    } catch (err: any) {
      if (!this.isClosed) {
        const msg = err?.message || '';
        this.close(formatSocketError(msg, this.options.hostname, this.options.port));
      }
    } finally {
      if (!this.isClosed) {
        this.close('远程服务器已关闭连接');
      }
    }
  }

  private async processIncomingPackets(): Promise<void> {
    while (this.incomingTcpBuffer.length > 0 && !this.isClosed) {
      let packetLength = 0;
      let paddingLength = 0;
      let payload: Uint8Array;

      if (!this.inCipher) {
        // Plaintext mode (during initial KEX)
        if (this.incomingTcpBuffer.length < 5) return;
        const view = new DataView(
          this.incomingTcpBuffer.buffer,
          this.incomingTcpBuffer.byteOffset,
          5
        );
        packetLength = view.getUint32(0);
        paddingLength = view.getUint8(4);

        if (packetLength > 262144 || packetLength < 2) {
          throw new Error(`Invalid plaintext SSH packet length: ${packetLength}`);
        }

        const totalNeeded = 4 + packetLength;
        if (this.incomingTcpBuffer.length < totalNeeded) return;

        payload = this.incomingTcpBuffer.slice(5, totalNeeded - paddingLength);
        this.incomingTcpBuffer = this.incomingTcpBuffer.slice(totalNeeded);
        this.inSeq = (this.inSeq + 1) >>> 0;
      } else {
        // Cipher mode: AES-128-CTR + HMAC-SHA2-256
        const blockSize = 16;
        const macSize = 32;
        if (this.incomingTcpBuffer.length < blockSize + macSize) return;

        // Peek packet_length from first 16-byte block WITHOUT mutating IV or sequence number
        const firstBlock = this.incomingTcpBuffer.subarray(0, blockSize);
        packetLength = await this.inCipher.peekPacketLength(firstBlock);

        if (packetLength > 524288 || packetLength < 2) {
          throw new Error(`Invalid encrypted SSH packet length: ${packetLength}`);
        }

        const totalNeeded = 4 + packetLength + macSize;
        if (this.incomingTcpBuffer.length < totalNeeded) return;

        const fullCiphertext = this.incomingTcpBuffer.subarray(0, 4 + packetLength);
        const receivedMac = this.incomingTcpBuffer.subarray(4 + packetLength, totalNeeded);

        const fullDecrypted = await this.inCipher.decryptPacket(fullCiphertext, receivedMac);
        paddingLength = fullDecrypted[4];
        payload = fullDecrypted.slice(5, 4 + packetLength - paddingLength);
        this.incomingTcpBuffer = this.incomingTcpBuffer.slice(totalNeeded);
        this.inSeq = this.inCipher.seq;
      }

      if (payload.length > 0) {
        await this.handlePacket(payload);
      }
    }
  }

  private findChannelByLocalId(localId: number): SshChannel | null {
    if (this.shellChannel && this.shellChannel.localId === localId) return this.shellChannel;
    if (this.execChannel && this.execChannel.localId === localId) return this.execChannel;
    if (this.sftpChannel && this.sftpChannel.localId === localId) return this.sftpChannel;
    return null;
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
      case SSH_MSG.USERAUTH_BANNER:
        break;
      case SSH_MSG.GLOBAL_REQUEST: {
        const _reqName = reader.readString();
        const wantReply = reader.readBoolean();
        if (wantReply) {
          await this.sendPacket(new SshPacketWriter().writeByte(SSH_MSG.REQUEST_FAILURE));
        }
        break;
      }
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
      case SSH_MSG.USERAUTH_FAILURE: {
        const methods = reader.readNameList();
        this.close(`认证失败：密码或凭据错误 (支持方式: ${methods.join(',') || 'password'})`);
        break;
      }
      case SSH_MSG.CHANNEL_OPEN_CONFIRMATION:
        await this.handleChannelOpenConfirmation(reader);
        break;
      case SSH_MSG.CHANNEL_OPEN_FAILURE: {
        const localId = reader.readUint32();
        const reasonCode = reader.readUint32();
        const desc = reader.readString();
        const pending = this.pendingChannels.get(localId);
        if (pending) {
          this.pendingChannels.delete(localId);
          pending.reject(new Error(`Channel open failed (${reasonCode}): ${desc}`));
        }
        break;
      }
      case SSH_MSG.CHANNEL_DATA:
        this.handleChannelData(reader);
        break;
      case SSH_MSG.CHANNEL_EXTENDED_DATA: {
        const localId = reader.readUint32();
        const _dataTypeCode = reader.readUint32();
        const data = reader.readStringBytes();
        const ch = this.findChannelByLocalId(localId);
        if (ch && data.length > 0) {
          const adjust = new SshPacketWriter();
          adjust.writeByte(SSH_MSG.CHANNEL_WINDOW_ADJUST);
          adjust.writeUint32(ch.remoteId);
          adjust.writeUint32(data.length);
          this.sendPacket(adjust).catch(() => {});
        }
        if (this.shellChannel && this.shellChannel.localId === localId) {
          this.options.onShellData(data);
        }
        break;
      }
      case SSH_MSG.CHANNEL_WINDOW_ADJUST: {
        const localId = reader.readUint32();
        const bytesToAdd = reader.readUint32();
        const ch = this.findChannelByLocalId(localId);
        if (ch) {
          ch.remoteWindow += bytesToAdd;
        }
        break;
      }
      case SSH_MSG.CHANNEL_REQUEST: {
        const localId = reader.readUint32();
        const _reqType = reader.readString();
        const wantReply = reader.readBoolean();
        if (wantReply) {
          const ch = this.findChannelByLocalId(localId);
          if (ch) {
            await this.sendPacket(
              new SshPacketWriter().writeByte(SSH_MSG.CHANNEL_SUCCESS).writeUint32(ch.remoteId)
            );
          }
        }
        break;
      }
      case SSH_MSG.CHANNEL_EOF:
        break;
      case SSH_MSG.CHANNEL_CLOSE: {
        const localId = reader.readUint32();
        const ch = this.findChannelByLocalId(localId);
        if (ch) {
          await this.sendPacket(
            new SshPacketWriter().writeByte(SSH_MSG.CHANNEL_CLOSE).writeUint32(ch.remoteId)
          );
          if (this.shellChannel && this.shellChannel.localId === localId) {
            this.close('远程主机已关闭终端会话');
          }
        }
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
    writer.writeNameList(['ecdh-sha2-nistp256']);
    writer.writeNameList([
      'ssh-ed25519',
      'ecdsa-sha2-nistp256',
      'rsa-sha2-512',
      'rsa-sha2-256',
      'ssh-rsa',
    ]);
    writer.writeNameList(['aes128-ctr']); // Ciphers client->server
    writer.writeNameList(['aes128-ctr']); // Ciphers server->client
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
    const _signatureBytes = reader.readStringBytes();

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

    // Send SSH_MSG_NEWKEYS in plaintext, then activate outCipher
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

    this.outCipher = new SshCipherState('aes128-ctr', keyC2S, ivC2S, macC2S, this.outSeq);
    await this.outCipher.init(keyC2S);

    this.inCipher = new SshCipherState('aes128-ctr', keyS2C, ivS2C, macS2C, this.inSeq);
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
      const username = (this.options.username || '').trim();
      const auth = new SshPacketWriter();
      auth.writeByte(SSH_MSG.USERAUTH_REQUEST);
      auth.writeString(username);
      auth.writeString('ssh-connection');
      auth.writeString('password');
      auth.writeBoolean(false);
      auth.writeString(this.options.password || '');
      await this.sendPacket(auth);
    } else {
      this.close('当前仅支持密码认证方式，请在主机配置中切换为密码认证');
    }
  }

  private async handleAuthSuccess(): Promise<void> {
    console.log('[SSH] 认证成功 (USERAUTH_SUCCESS)，正在发送 shell 通道开启请求...');
    // Open Channel 0 for interactive Shell without blocking the packet processing loop
    const localId = this.nextLocalChannelId++;
    const initialWindow = 2 * 1024 * 1024; // 2MB window
    const maxPacket = 32768;

    this.shellChannel = { localId, remoteId: 0, remoteWindow: 0, remoteMaxPacket: 0 };

    const writer = new SshPacketWriter();
    writer.writeByte(SSH_MSG.CHANNEL_OPEN);
    writer.writeString('session');
    writer.writeUint32(localId);
    writer.writeUint32(initialWindow);
    writer.writeUint32(maxPacket);

    await this.sendPacket(writer);
  }

  // Open Channels (exec or sftp) called from outside the packet loop
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

    const confirmPromise = new Promise<number>((resolve, reject) => {
      this.pendingChannels.set(localId, { type, execCommand, resolve, reject });
    });

    await this.sendPacket(writer);
    return confirmPromise;
  }

  private async handleChannelOpenConfirmation(reader: SshPacketReader): Promise<void> {
    const localId = reader.readUint32();
    const remoteId = reader.readUint32();
    const remoteWindow = reader.readUint32();
    const remoteMaxPacket = reader.readUint32();

    const pending = this.pendingChannels.get(localId);
    this.pendingChannels.delete(localId);

    if (this.shellChannel && this.shellChannel.localId === localId) {
      console.log(`[SSH] Shell 通道确认成功 (local=${localId}, remote=${remoteId})，正在请求 PTY 与 Shell...`);
      this.shellChannel.remoteId = remoteId;
      this.shellChannel.remoteWindow = remoteWindow;
      this.shellChannel.remoteMaxPacket = remoteMaxPacket;

      // 1. Request PTY
      const ptyReq = new SshPacketWriter();
      ptyReq.writeByte(SSH_MSG.CHANNEL_REQUEST);
      ptyReq.writeUint32(remoteId);
      ptyReq.writeString('pty-req');
      ptyReq.writeBoolean(false);
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
      shellReq.writeBoolean(false);
      await this.sendPacket(shellReq);

      // 3. Handshake complete! Resolve connect() promise now
      if (this.connectResolve) {
        console.log('[SSH] 握手与终端交互已全部就绪');
        const resolve = this.connectResolve;
        this.connectResolve = null;
        this.connectReject = null;
        resolve();
      }
    } else if (this.execChannel && this.execChannel.localId === localId) {
      this.execChannel.remoteId = remoteId;
      this.execChannel.remoteWindow = remoteWindow;
      this.execChannel.remoteMaxPacket = remoteMaxPacket;

      if (pending?.execCommand) {
        const execReq = new SshPacketWriter();
        execReq.writeByte(SSH_MSG.CHANNEL_REQUEST);
        execReq.writeUint32(remoteId);
        execReq.writeString('exec');
        execReq.writeBoolean(false);
        execReq.writeString(pending.execCommand);
        await this.sendPacket(execReq);
      }
    } else if (this.sftpChannel && this.sftpChannel.localId === localId) {
      this.sftpChannel.remoteId = remoteId;
      this.sftpChannel.remoteWindow = remoteWindow;
      this.sftpChannel.remoteMaxPacket = remoteMaxPacket;

      // Request Subsystem 'sftp'
      const sftpReq = new SshPacketWriter();
      sftpReq.writeByte(SSH_MSG.CHANNEL_REQUEST);
      sftpReq.writeUint32(remoteId);
      sftpReq.writeString('subsystem');
      sftpReq.writeBoolean(false);
      sftpReq.writeString('sftp');
      await this.sendPacket(sftpReq);
    }

    if (pending) {
      pending.resolve(localId);
    }
  }

  private handleChannelData(reader: SshPacketReader): void {
    const localId = reader.readUint32();
    const data = reader.readStringBytes();

    const ch = this.findChannelByLocalId(localId);
    if (ch && data.length > 0) {
      // Auto adjust window using remoteId
      const adjust = new SshPacketWriter();
      adjust.writeByte(SSH_MSG.CHANNEL_WINDOW_ADJUST);
      adjust.writeUint32(ch.remoteId);
      adjust.writeUint32(data.length);
      this.sendPacket(adjust).catch(() => {});
    }

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
    const maxChunk = Math.min(this.sftpChannel.remoteMaxPacket || 32768, 32000);
    let offset = 0;
    while (offset < data.length) {
      const chunk = data.subarray(offset, offset + maxChunk);
      const writer = new SshPacketWriter();
      writer.writeByte(SSH_MSG.CHANNEL_DATA);
      writer.writeUint32(this.sftpChannel.remoteId);
      writer.writeStringBytes(chunk);
      await this.sendPacket(writer);
      offset += chunk.length;
    }
  }

  // Pack and encrypt SSH packet before writing to Cloudflare TCP socket (serialized via writeChain)
  private sendPacket(packetPayload: SshPacketWriter): Promise<void> {
    const payloadBytes = packetPayload.toUint8Array();
    const nextWrite = this.writeChain.then(async () => {
      if (this.isClosed) return;
      const blockSize = 16; // AES block size

      // RFC 4253 Section 6:
      // packet_length (4 bytes) + padding_length (1 byte) + payload + random padding
      // Total (packet_length + 4) must be a multiple of blockSize (or 8 in plaintext)
      let paddingLen = blockSize - ((4 + 1 + payloadBytes.length) % blockSize);
      if (paddingLen < 4) paddingLen += blockSize;

      const packetLen = 1 + payloadBytes.length + paddingLen;
      const paddingBytes = crypto.getRandomValues(new Uint8Array(paddingLen));

      const unencrypted = new Uint8Array(4 + packetLen);
      const view = new DataView(unencrypted.buffer, unencrypted.byteOffset, unencrypted.byteLength);
      view.setUint32(0, packetLen);
      view.setUint8(4, paddingLen);
      unencrypted.set(payloadBytes, 5);
      unencrypted.set(paddingBytes, 5 + payloadBytes.length);

      if (!this.outCipher) {
        this.outSeq = (this.outSeq + 1) >>> 0;
        await this.writer.write(unencrypted);
      } else {
        const { ciphertext, mac } = await this.outCipher.encrypt(unencrypted);
        this.outSeq = this.outCipher.seq;
        const totalOut = new Uint8Array(ciphertext.length + (mac ? mac.length : 0));
        totalOut.set(ciphertext, 0);
        if (mac) {
          totalOut.set(mac, ciphertext.length);
        }
        await this.writer.write(totalOut);
      }
    });

    this.writeChain = nextWrite.catch(() => {});
    return nextWrite;
  }

  public close(reason: string = 'Closed'): void {
    if (this.isClosed) return;
    this.isClosed = true;

    if (this.connectReject) {
      const reject = this.connectReject;
      this.connectResolve = null;
      this.connectReject = null;
      reject(new Error(reason));
    }

    for (const [, pending] of this.pendingChannels) {
      pending.reject(new Error(reason));
    }
    this.pendingChannels.clear();

    try {
      if (this.writer) this.writer.close().catch(() => {});
      if (this.socket) this.socket.close();
    } catch {}
    this.options.onClose(reason);
  }
}

