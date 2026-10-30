import { create } from 'zustand';
import type { DecryptedHost, HostRecord, SnippetRecord } from '@shared/types';
import {
  encryptCredentials,
  decryptCredentials,
} from '../crypto/vault';
import { useAuthStore } from './useAuthStore';

interface SyncStoreState {
  hosts: DecryptedHost[];
  snippets: SnippetRecord[];
  settings: Record<string, string>;
  isLoading: boolean;

  fetchHosts: () => Promise<void>;
  saveHost: (host: Omit<DecryptedHost, 'updated_at'>) => Promise<void>;
  deleteHost: (id: string) => Promise<void>;

  fetchSnippets: () => Promise<void>;
  saveSnippet: (snippet: SnippetRecord) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  hosts: [],
  snippets: [],
  settings: {},
  isLoading: false,

  fetchHosts: async () => {
    const { token, masterKey } = useAuthStore.getState();
    if (!token || !masterKey) return;

    set({ isLoading: true });
    try {
      const res = await fetch('/api/hosts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Fetch hosts failed');
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

      set({ hosts: decrypted, isLoading: false });
    } catch (err) {
      console.error('Fetch hosts failed', err);
      set({ isLoading: false });
    }
  },

  saveHost: async (hostData) => {
    const { token, masterKey } = useAuthStore.getState();
    if (!token || !masterKey) throw new Error('Please login first');

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
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) throw new Error('Save host failed');
    await get().fetchHosts();
  },

  deleteHost: async (id: string) => {
    const { token } = useAuthStore.getState();
    if (!token) return;

    await fetch(`/api/hosts/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await get().fetchHosts();
  },

  fetchSnippets: async () => {
    const { token } = useAuthStore.getState();
    if (!token) return;

    try {
      const res = await fetch('/api/snippets', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const list = (await res.json()) as SnippetRecord[];
        set({ snippets: list });
      }
    } catch (err) {
      console.error('Fetch snippets failed', err);
    }
  },

  saveSnippet: async (snippet) => {
    const { token } = useAuthStore.getState();
    if (!token) return;

    const isUpdate = !!snippet.id;
    const url = isUpdate ? `/api/snippets/${snippet.id}` : '/api/snippets';
    const method = isUpdate ? 'PUT' : 'POST';

    await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(snippet),
    });
    await get().fetchSnippets();
  },

  deleteSnippet: async (id: string) => {
    const { token } = useAuthStore.getState();
    if (!token) return;

    await fetch(`/api/snippets/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    await get().fetchSnippets();
  },
}));
