import type { SystemMetrics, SftpEntry } from './types';

export enum FrameType {
  CONTROL_JSON = 0x00,
  PTY_DATA = 0x01,
  MONITOR_JSON = 0x02,
  SFTP_CHUNK = 0x03,
}

// Client to Server Control Messages
export type ClientControlMsg =
  | {
      type: 'connect';
      hostId: string;
      hostname: string;
      port: number;
      username: string;
      authType: 'password' | 'private_key';
      password?: string;
      privateKey?: string;
      passphrase?: string;
      cols?: number;
      rows?: number;
    }
  | {
      type: 'resize';
      cols: number;
      rows: number;
    }
  | {
      type: 'monitor_toggle';
      enabled: boolean;
    }
  | {
      type: 'sftp_list';
      reqId: string;
      path: string;
    }
  | {
      type: 'sftp_mkdir';
      reqId: string;
      path: string;
    }
  | {
      type: 'sftp_rm';
      reqId: string;
      path: string;
      isDirectory?: boolean;
    }
  | {
      type: 'sftp_rename';
      reqId: string;
      oldPath: string;
      newPath: string;
    }
  | {
      type: 'sftp_readfile';
      reqId: string;
      path: string;
      encoding?: 'utf-8' | 'base64';
      maxBytes?: number;
    }
  | {
      type: 'sftp_writefile';
      reqId: string;
      path: string;
      content: string; // UTF-8 text or base64
      encoding?: 'utf-8' | 'base64';
    }
  | {
      type: 'sftp_upload_start';
      reqId: string;
      path: string;
      size: number;
    }
  | {
      type: 'sftp_upload_chunk';
      reqId: string;
      chunkIndex: number;
      totalChunks: number;
      data: string; // Base64 chunk
    }
  | {
      type: 'sftp_upload_finish';
      reqId: string;
    }
  | {
      type: 'sftp_download_start';
      reqId: string;
      path: string;
    };

// Server to Client Control Messages
export type ServerControlMsg =
  | {
      type: 'status';
      state: 'connecting' | 'connected' | 'disconnected' | 'error';
      message?: string;
    }
  | {
      type: 'sftp_list_result';
      reqId: string;
      success: boolean;
      path: string;
      entries?: SftpEntry[];
      error?: string;
    }
  | {
      type: 'sftp_op_result';
      reqId: string;
      action: string;
      success: boolean;
      error?: string;
    }
  | {
      type: 'sftp_file_content';
      reqId: string;
      path: string;
      content: string;
      encoding: 'utf-8' | 'base64';
      truncated?: boolean;
      error?: string;
    }
  | {
      type: 'sftp_download_chunk';
      reqId: string;
      chunkIndex: number;
      totalChunks: number;
      data: string; // Base64
      done: boolean;
      error?: string;
    };

// Binary packet serialization helpers
export function encodeControlMsg(msg: ClientControlMsg | ServerControlMsg): Uint8Array {
  const jsonStr = JSON.stringify(msg);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const packet = new Uint8Array(1 + jsonBytes.length);
  packet[0] = FrameType.CONTROL_JSON;
  packet.set(jsonBytes, 1);
  return packet;
}

export function encodePtyData(data: Uint8Array | string): Uint8Array {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const packet = new Uint8Array(1 + bytes.length);
  packet[0] = FrameType.PTY_DATA;
  packet.set(bytes, 1);
  return packet;
}

export function encodeMonitorData(metrics: SystemMetrics): Uint8Array {
  const jsonStr = JSON.stringify(metrics);
  const jsonBytes = new TextEncoder().encode(jsonStr);
  const packet = new Uint8Array(1 + jsonBytes.length);
  packet[0] = FrameType.MONITOR_JSON;
  packet.set(jsonBytes, 1);
  return packet;
}

export function parseIncomingFrame(buffer: ArrayBuffer | Uint8Array): {
  type: FrameType;
  rawPayload: Uint8Array;
} {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes.length === 0) {
    throw new Error('Empty frame received');
  }
  const type = bytes[0] as FrameType;
  const rawPayload = bytes.subarray(1);
  return { type, rawPayload };
}
