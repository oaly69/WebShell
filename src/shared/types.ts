export interface VaultMeta {
  id: string; // 'default'
  kdf_salt: string; // Base64
  kdf_iterations: number; // e.g. 600,000
  verifier_cipher: string; // AES-GCM ciphertext verifying master password
  updated_at: number;
}

export interface HostCredentials {
  password?: string;
  privateKey?: string;
  passphrase?: string;
}

export interface HostRecord {
  id: string;
  name: string;
  group_name: string;
  hostname: string;
  port: number;
  username: string;
  auth_type: 'password' | 'private_key';
  encrypted_cred: string; // AES-GCM ciphertext of JSON-stringified HostCredentials
  jump_host_id?: string | null;
  keepalive_interval?: number;
  sort_order: number;
  updated_at: number;
}

// Decrypted host for in-memory use in UI
export interface DecryptedHost extends Omit<HostRecord, 'encrypted_cred'> {
  credentials: HostCredentials;
}

export interface SnippetRecord {
  id: string;
  title: string;
  category: string;
  command: string;
  auto_enter: number; // 1 or 0
  sort_order: number;
}

export interface UserSettingRecord {
  key: string;
  value: string;
}

export interface SystemMetrics {
  timestamp: number;
  cpu: {
    percent: number;
    cores: number;
    loadAvg: [number, number, number];
  };
  mem: {
    total: number;
    used: number;
    free: number;
    available: number;
    percent: number;
  };
  swap: {
    total: number;
    used: number;
    percent: number;
  };
  net: {
    rxSpeed: number; // Bytes/sec
    txSpeed: number; // Bytes/sec
  };
  disks: Array<{
    fs: string;
    type: string;
    size: number;
    used: number;
    avail: number;
    percent: number;
    mount: string;
  }>;
  procs: Array<{
    pid: number;
    user: string;
    cpu: number;
    mem: number;
    command: string;
  }>;
}

export interface SftpEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isSymlink: boolean;
  size: number;
  permissions: string;
  mode: number;
  uid: number;
  gid: number;
  mtime: number; // Unix timestamp in seconds
}
