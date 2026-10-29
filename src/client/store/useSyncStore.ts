import { create } from 'zustand';
import type { DecryptedHost, HostRecord, SnippetRecord, VaultMeta } from '@shared/types';
import {
  initVault,
  unlockVault,
  encryptCredentials,
  decryptCredentials,
} from '../crypto/vault';

interface SyncStoreState {
  isVaultReady: boolean;
  isUnlocked: boolean;
  vaultMeta: VaultMeta | null;
  masterKey: CryptoKey | null;

  hosts: DecryptedHost[];
  snippets: SnippetRecord[];
  settings: Record<string, string>;

  checkVaultStatus: () => Promise<void>;
  setupVault: (masterPassword: string) => Promise<void>;
  unlock: (masterPassword: string) => Promise<void>;
  lock: () => void;

  fetchHosts: () => Promise<void>;
  saveHost: (host: Omit<DecryptedHost, 'updated_at'>) => Promise<void>;
  deleteHost: (id: string) => Promise<void>;

  fetchSnippets: () => Promise<void>;
  saveSnippet: (snippet: SnippetRecord) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  isVaultReady: false,
  isUnlocked: false,
  vaultMeta: null,
  masterKey: null,

  hosts: [],
  snippets: [],
  settings: {},

  checkVaultStatus: async () => {
    try {
      const res = await fetch('/api/vault/status');
      const data = (await res.json()) as { initialized: boolean } & Partial<VaultMeta>;
      if (data.initialized) {
        set({ isVaultReady: true, vaultMeta: data as VaultMeta });
      } else {
        set({ isVaultReady: false, vaultMeta: null });
      }
    } catch {
      set({ isVaultReady: false });
    }
  },

  setupVault: async (masterPassword: string) => {
    const { saltBase64, verifierCipher, masterKey } = await initVault(masterPassword);
    const res = await fetch('/api/vault/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        salt: saltBase64,
        iterations: 600000,
        verifier: verifierCipher,
      }),
    });

    if (!res.ok) throw new Error('Failed to initialize vault on server');

    set({
      isVaultReady: true,
      isUnlocked: true,
      masterKey,
    });

    await get().fetchHosts();
    await get().fetchSnippets();
  },

  unlock: async (masterPassword: string) => {
    const { vaultMeta } = get();
    if (!vaultMeta) throw new Error('Vault not initialized');

    const masterKey = await unlockVault(
      masterPassword,
      vaultMeta.kdf_salt,
      vaultMeta.verifier_cipher,
      vaultMeta.kdf_iterations
    );

    set({ isUnlocked: true, masterKey });

    await get().fetchHosts();
    await get().fetchSnippets();
  },

  lock: () => {
    set({
      isUnlocked: false,
      masterKey: null,
      hosts: [],
    });
  },

  fetchHosts: async () => {
    const { masterKey } = get();
    if (!masterKey) return;

    try {
      const res = await fetch('/api/hosts');
      const list = (await res.json()) as HostRecord[];
      const decrypted: DecryptedHost[] = [];

      for (const item of list) {
        try {
          const creds = await decryptCredentials(masterKey, item.encrypted_cred);
          decrypted.push({
            ...item,
            credentials: creds,
          });
        } catch {
          decrypted.push({
            ...item,
            credentials: {},
          });
        }
      }

      set({ hosts: decrypted });
    } catch (err) {
      console.error('Fetch hosts failed', err);
    }
  },

  saveHost: async (hostData) => {
    const { masterKey, fetchHosts } = get();
    if (!masterKey) throw new Error('Vault locked');

    const encrypted_cred = await encryptCredentials(masterKey, hostData.credentials);

    const payload = {
      id: hostData.id,
      name: hostData.name,
      group_name: hostData.group_name,
      hostname: hostData.hostname,
      port: hostData.port,
      username: hostData.username,
      auth_type: hostData.auth_type,
      encrypted_cred,
      jump_host_id: hostData.jump_host_id,
      keepalive_interval: hostData.keepalive_interval,
      sort_order: hostData.sort_order,
    };

    const isUpdate = !!hostData.id;
    const url = isUpdate ? `/api/hosts/${hostData.id}` : '/api/hosts';
    const method = isUpdate ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Save host failed');
    await fetchHosts();
  },

  deleteHost: async (id: string) => {
    await fetch(`/api/hosts/${id}`, { method: 'DELETE' });
    await get().fetchHosts();
  },

  fetchSnippets: async () => {
    try {
      const res = await fetch('/api/snippets');
      const list = (await res.json()) as SnippetRecord[];
      set({ snippets: list });
    } catch (err) {
      console.error('Fetch snippets failed', err);
    }
  },

  saveSnippet: async (snippet) => {
    const isUpdate = !!snippet.id;
    const url = isUpdate ? `/api/snippets/${snippet.id}` : '/api/snippets';
    const method = isUpdate ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snippet),
    });
    await get().fetchSnippets();
  },

  deleteSnippet: async (id: string) => {
    await fetch(`/api/snippets/${id}`, { method: 'DELETE' });
    await get().fetchSnippets();
  },
}));
