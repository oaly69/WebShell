import { DurableObject } from 'cloudflare:workers';
import {
  FrameType,
  parseIncomingFrame,
  encodeControlMsg,
  encodePtyData,
  encodeMonitorData,
  type ClientControlMsg,
} from '@shared/ws-protocol';
import { SshClient, normalizeHostAddress } from '../ssh/client';
import { SftpClient } from '../ssh/sftp';
import { MONITOR_SHELL_COMMAND, MetricsParser } from '../ssh/monitor';

export class SshSessionDO extends DurableObject {
  private ws: WebSocket | null = null;
  private ssh: SshClient | null = null;
  private sftp: SftpClient | null = null;
  private sshConnectPromise: Promise<void> | null = null;
  private sftpInitPromise: Promise<void> | null = null;
  private monitorParser = new MetricsParser();
  private monitorBuffer = '';
  private isMonitorEnabled = false;
  private isMonitorRunning = false;

  async fetch(request: Request): Promise<Response> {
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected WebSocket upgrade', { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    this.ws = server;
    server.accept();

    server.addEventListener('message', async (event: MessageEvent) => {
      try {
        await this.handleClientMessage(event.data);
      } catch (err: any) {
        this.sendControl({
          type: 'status',
          state: 'error',
          message: err.message || 'Error processing message',
        });
      }
    });

    server.addEventListener('close', () => {
      this.cleanup();
      try {
        server.close(1000, 'Normal Closure');
      } catch {}
    });

    server.addEventListener('error', () => {
      this.cleanup();
      try {
        server.close(1011, 'Internal Error');
      } catch {}
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  private async handleClientMessage(data: any): Promise<void> {
    let buffer: Uint8Array;
    if (data instanceof ArrayBuffer) {
      buffer = new Uint8Array(data);
    } else if (data instanceof Uint8Array) {
      buffer = data;
    } else if (typeof data === 'string') {
      buffer = new TextEncoder().encode(data);
    } else {
      return;
    }

    const { type, rawPayload } = parseIncomingFrame(buffer);

    switch (type) {
      case FrameType.CONTROL_JSON: {
        const jsonStr = new TextDecoder().decode(rawPayload);
        const msg = JSON.parse(jsonStr) as ClientControlMsg;
        await this.handleControlMessage(msg);
        break;
      }
      case FrameType.PTY_DATA: {
        if (this.ssh) {
          await this.ssh.writeShellData(rawPayload);
        }
        break;
      }
      case FrameType.SFTP_CHUNK: {
        // Binary chunk for upload streaming
        break;
      }
    }
  }

  private async handleControlMessage(msg: ClientControlMsg): Promise<void> {
    switch (msg.type) {
      case 'connect': {
        this.sendControl({ type: 'status', state: 'connecting' });
        this.isMonitorRunning = false;
        this.sftp = null;
        this.sftpInitPromise = null;

        const { hostname: cleanHost, port: cleanPort } = normalizeHostAddress(msg.hostname, msg.port);

        this.ssh = new SshClient({
          hostname: cleanHost,
          port: cleanPort,
          username: msg.username,
          authType: msg.authType,
          password: msg.password,
          privateKey: msg.privateKey,
          passphrase: msg.passphrase,
          cols: msg.cols || 80,
          rows: msg.rows || 24,
          onShellData: (data) => {
            this.sendPty(data);
          },
          onExecData: (data) => {
            this.handleMonitorRawData(data);
          },
          onSftpData: (data) => {
            if (this.sftp) {
              this.sftp.onData(data);
            }
          },
          onClose: (reason) => {
            this.sendControl({ type: 'status', state: 'disconnected', message: reason });
          },
        });

        this.sshConnectPromise = this.ssh.connect();
        try {
          await this.sshConnectPromise;
          this.sendControl({ type: 'status', state: 'connected' });

          // If monitor_toggle arrived while connecting, start monitor channel now
          if (this.isMonitorEnabled && !this.isMonitorRunning && this.ssh) {
            this.isMonitorRunning = true;
            this.ssh.openChannel('exec', MONITOR_SHELL_COMMAND).catch(() => {
              this.isMonitorRunning = false;
            });
          }
        } catch (err: any) {
          this.sendControl({
            type: 'status',
            state: 'disconnected',
            message: err?.message || '连接失败',
          });
        }
        break;
      }

      case 'resize': {
        if (this.ssh && this.sshConnectPromise) {
          await this.sshConnectPromise.catch(() => {});
          await this.ssh.resizeShell(msg.cols, msg.rows);
        }
        break;
      }

      case 'disconnect': {
        this.cleanup();
        this.sendControl({ type: 'status', state: 'disconnected', message: '已主动断开连接' });
        try {
          if (this.ws) {
            this.ws.close(1000, 'User disconnect');
          }
        } catch {}
        break;
      }

      case 'monitor_toggle': {
        this.isMonitorEnabled = msg.enabled;
        if (this.isMonitorEnabled && this.ssh && this.sshConnectPromise && !this.isMonitorRunning) {
          await this.sshConnectPromise;
          if (!this.isMonitorRunning && this.ssh) {
            this.isMonitorRunning = true;
            await this.ssh.openChannel('exec', MONITOR_SHELL_COMMAND).catch(() => {
              this.isMonitorRunning = false;
            });
          }
        }
        break;
      }

      case 'sftp_list': {
        try {
          await this.ensureSftp();
          let targetPath = msg.path;
          if (!targetPath || targetPath === '.') {
            targetPath = await this.sftp!.realpath('.');
          }
          let entries;
          try {
            entries = await this.sftp!.readdir(targetPath);
          } catch (dirErr: any) {
            // If '/root' was requested for a non-root user, fallback to user's home directory
            if (targetPath === '/root') {
              const homePath = await this.sftp!.realpath('.');
              if (homePath && homePath !== '/root') {
                targetPath = homePath;
                entries = await this.sftp!.readdir(targetPath);
              } else {
                targetPath = '/';
                entries = await this.sftp!.readdir('/');
              }
            } else {
              throw dirErr;
            }
          }
          this.sendControl({
            type: 'sftp_list_result',
            reqId: msg.reqId,
            success: true,
            path: targetPath,
            entries,
          });
        } catch (err: any) {
          this.sendControl({
            type: 'sftp_list_result',
            reqId: msg.reqId,
            success: false,
            path: msg.path,
            error: err.message,
          });
        }
        break;
      }

      case 'sftp_mkdir': {
        try {
          await this.ensureSftp();
          const ok = await this.sftp!.mkdir(msg.path);
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'mkdir', success: ok });
        } catch (err: any) {
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'mkdir', success: false, error: err.message });
        }
        break;
      }

      case 'sftp_rm': {
        try {
          await this.ensureSftp();
          const ok = await this.sftp!.remove(msg.path, msg.isDirectory);
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'remove', success: ok });
        } catch (err: any) {
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'remove', success: false, error: err.message });
        }
        break;
      }

      case 'sftp_rename': {
        try {
          await this.ensureSftp();
          const ok = await this.sftp!.rename(msg.oldPath, msg.newPath);
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'rename', success: ok });
        } catch (err: any) {
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'rename', success: false, error: err.message });
        }
        break;
      }

      case 'sftp_readfile': {
        try {
          await this.ensureSftp();
          const encoding = (msg as any).encoding || 'utf-8';
          const maxBytes = (msg as any).maxBytes || 50 * 1024 * 1024;
          const res = await this.sftp!.readFile(msg.path, maxBytes, encoding);
          this.sendControl({
            type: 'sftp_file_content',
            reqId: msg.reqId,
            path: msg.path,
            content: res.content,
            encoding: res.encoding,
            truncated: res.truncated,
          });
        } catch (err: any) {
          this.sendControl({
            type: 'sftp_file_content',
            reqId: msg.reqId,
            path: msg.path,
            content: '',
            encoding: 'utf-8',
            error: err.message,
          });
        }
        break;
      }

      case 'sftp_writefile': {
        try {
          await this.ensureSftp();
          const bytes =
            msg.encoding === 'base64'
              ? Uint8Array.from(atob(msg.content), (c) => c.charCodeAt(0))
              : new TextEncoder().encode(msg.content);
          const ok = await this.sftp!.writeFile(msg.path, bytes);
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'writefile', success: ok });
        } catch (err: any) {
          this.sendControl({ type: 'sftp_op_result', reqId: msg.reqId, action: 'writefile', success: false, error: err.message });
        }
        break;
      }
    }
  }

  private async ensureSftp(): Promise<void> {
    if (!this.ssh || !this.sshConnectPromise) {
      throw new Error('SSH 会话尚未建立');
    }
    await this.sshConnectPromise;

    if (this.sftpInitPromise) {
      await this.sftpInitPromise;
      return;
    }

    this.sftpInitPromise = (async () => {
      try {
        this.sftp = new SftpClient(async (bytes) => {
          await this.ssh!.writeSftpData(bytes);
        });
        await this.ssh!.openChannel('sftp');
        await this.sftp.init();
      } catch (err) {
        this.sftp = null;
        this.sftpInitPromise = null;
        throw err;
      }
    })();

    await this.sftpInitPromise;
  }

  private handleMonitorRawData(chunk: Uint8Array): void {
    const text = new TextDecoder('utf-8').decode(chunk);
    this.monitorBuffer += text;

    const startTag = '---FS_METRIC_START---';
    const endTag = '---FS_METRIC_END---';

    while (this.monitorBuffer.includes(endTag)) {
      const startIndex = this.monitorBuffer.indexOf(startTag);
      const endIndex = this.monitorBuffer.indexOf(endTag);

      if (startIndex !== -1 && endIndex > startIndex) {
        const block = this.monitorBuffer.substring(startIndex + startTag.length, endIndex);
        this.monitorBuffer = this.monitorBuffer.substring(endIndex + endTag.length);

        const metrics = this.monitorParser.parseBlock(block);
        if (metrics && this.ws) {
          const packet = encodeMonitorData(metrics);
          this.ws.send(packet);
        }
      } else {
        break;
      }
    }
  }

  private sendControl(msg: any): void {
    if (this.ws) {
      this.ws.send(encodeControlMsg(msg));
    }
  }

  private sendPty(data: Uint8Array): void {
    if (this.ws) {
      this.ws.send(encodePtyData(data));
    }
  }

  private cleanup(): void {
    if (this.ssh) {
      this.ssh.close('Session closed');
      this.ssh = null;
    }
    this.sftp = null;
    this.ws = null;
  }
}
