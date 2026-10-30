import { create } from 'zustand';
import type { DecryptedHost, HostRecord, SnippetRecord } from '@shared/types';
import {
  encryptCredentials,
  decryptCredentials,
} from '../crypto/vault';
import { useAuthStore } from './useAuthStore';

const STORAGE_KEY_HOST_GROUPS = 'fs_host_groups';
const STORAGE_KEY_SNIPPET_CATS = 'fs_snippet_cats';

function loadStoredList(key: string, defaultItem: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [defaultItem];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return [defaultItem];
  } catch {
    return [defaultItem];
  }
}

interface SyncStoreState {
  hosts: DecryptedHost[];
  snippets: SnippetRecord[];
  settings: Record<string, string>;
  isLoading: boolean;
  customHostGroups: string[];
  customSnippetCategories: string[];

  fetchHosts: () => Promise<void>;
  saveHost: (host: Omit<DecryptedHost, 'updated_at'>) => Promise<void>;
  deleteHost: (id: string) => Promise<void>;
  addHostGroup: (name: string) => void;
  renameHostGroup: (oldName: string, newName: string) => Promise<void>;
  deleteHostGroup: (name: string, targetGroup?: string) => Promise<void>;
  getHostGroups: () => string[];

  fetchSnippets: () => Promise<void>;
  saveSnippet: (snippet: SnippetRecord) => Promise<void>;
  deleteSnippet: (id: string) => Promise<void>;
  addSnippetCategory: (name: string) => void;
  renameSnippetCategory: (oldName: string, newName: string) => Promise<void>;
  deleteSnippetCategory: (name: string, targetCategory?: string) => Promise<void>;
  getSnippetCategories: () => string[];
}

export const useSyncStore = create<SyncStoreState>((set, get) => ({
  hosts: [],
  snippets: [],
  settings: {},
  isLoading: false,
  customHostGroups: loadStoredList(STORAGE_KEY_HOST_GROUPS, '默认分组'),
  customSnippetCategories: loadStoredList(STORAGE_KEY_SNIPPET_CATS, '通用'),

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

  addHostGroup: (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { customHostGroups } = get();
    if (!customHostGroups.includes(trimmed)) {
      const updated = [...customHostGroups, trimmed];
      localStorage.setItem(STORAGE_KEY_HOST_GROUPS, JSON.stringify(updated));
      set({ customHostGroups: updated });
    }
  },

  renameHostGroup: async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const { customHostGroups, hosts, saveHost } = get();

    // 1. Update custom groups
    let updated = customHostGroups.map((g) => (g === oldName ? trimmed : g));
    if (!updated.includes(trimmed)) updated.push(trimmed);
    localStorage.setItem(STORAGE_KEY_HOST_GROUPS, JSON.stringify(updated));
    set({ customHostGroups: updated });

    // 2. Batch update any hosts that have this group
    const affected = hosts.filter((h) => (h.group_name || '默认分组') === oldName);
    for (const h of affected) {
      await saveHost({ ...h, group_name: trimmed });
    }
  },

  deleteHostGroup: async (name: string, targetGroup = '默认分组') => {
    if (name === targetGroup) return;
    const { customHostGroups, hosts, saveHost } = get();

    // 1. Remove from custom groups
    const updated = customHostGroups.filter((g) => g !== name);
    localStorage.setItem(STORAGE_KEY_HOST_GROUPS, JSON.stringify(updated));
    set({ customHostGroups: updated });

    // 2. Move any hosts in this group to targetGroup
    const affected = hosts.filter((h) => (h.group_name || '默认分组') === name);
    for (const h of affected) {
      await saveHost({ ...h, group_name: targetGroup });
    }
  },

  getHostGroups: () => {
    const { hosts, customHostGroups } = get();
    const setOfGroups = new Set<string>(['默认分组', ...customHostGroups]);
    for (const h of hosts) {
      if (h.group_name) setOfGroups.add(h.group_name);
    }
    return Array.from(setOfGroups);
  },

  addSnippetCategory: (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const { customSnippetCategories } = get();
    if (!customSnippetCategories.includes(trimmed)) {
      const updated = [...customSnippetCategories, trimmed];
      localStorage.setItem(STORAGE_KEY_SNIPPET_CATS, JSON.stringify(updated));
      set({ customSnippetCategories: updated });
    }
  },

  renameSnippetCategory: async (oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    const { customSnippetCategories, snippets, saveSnippet } = get();

    // 1. Update custom categories
    let updated = customSnippetCategories.map((c) => (c === oldName ? trimmed : c));
    if (!updated.includes(trimmed)) updated.push(trimmed);
    localStorage.setItem(STORAGE_KEY_SNIPPET_CATS, JSON.stringify(updated));
    set({ customSnippetCategories: updated });

    // 2. Batch update snippets
    const affected = snippets.filter((s) => (s.category || '通用') === oldName);
    for (const s of affected) {
      await saveSnippet({ ...s, category: trimmed });
    }
  },

  deleteSnippetCategory: async (name: string, targetCategory = '通用') => {
    if (name === targetCategory) return;
    const { customSnippetCategories, snippets, saveSnippet } = get();

    // 1. Remove from custom categories
    const updated = customSnippetCategories.filter((c) => c !== name);
    localStorage.setItem(STORAGE_KEY_SNIPPET_CATS, JSON.stringify(updated));
    set({ customSnippetCategories: updated });

    // 2. Move any snippets to targetCategory
    const affected = snippets.filter((s) => (s.category || '通用') === name);
    for (const s of affected) {
      await saveSnippet({ ...s, category: targetCategory });
    }
  },

  getSnippetCategories: () => {
    const { snippets, customSnippetCategories } = get();
    const setOfCats = new Set<string>(['通用', ...customSnippetCategories]);
    for (const s of snippets) {
      if (s.category) setOfCats.add(s.category);
    }
    return Array.from(setOfCats);
  },
}));
