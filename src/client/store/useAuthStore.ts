import { create } from 'zustand';
import type { UserProfile } from '@shared/types';
import { initVault, unlockVault } from '../crypto/vault';

interface AuthStoreState {
  token: string | null;
  user: UserProfile | null;
  isSystemInitialized: boolean;
  isChecking: boolean;
  masterKey: CryptoKey | null;

  checkAuthStatus: () => Promise<void>;
  initAdmin: (username: string, masterPassword: string) => Promise<void>;
  login: (username: string, masterPassword: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY_TOKEN = 'fs_token';

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  token: localStorage.getItem(STORAGE_KEY_TOKEN),
  user: null,
  isSystemInitialized: true,
  isChecking: true,
  masterKey: null,

  checkAuthStatus: async () => {
    try {
      const statusRes = await fetch('/api/auth/status');
      const statusData = (await statusRes.json()) as { initialized: boolean; userCount: number };
      set({ isSystemInitialized: statusData.initialized });

      if (!statusData.initialized) {
        set({ isChecking: false, token: null, user: null });
        return;
      }

      // Check existing token
      const existingToken = localStorage.getItem(STORAGE_KEY_TOKEN);
      if (existingToken) {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${existingToken}` },
        });

        if (meRes.ok) {
          const meData = (await meRes.json()) as any;
          set({
            token: existingToken,
            user: meData.user,
            isChecking: false,
          });
          return;
        } else {
          localStorage.removeItem(STORAGE_KEY_TOKEN);
          set({ token: null, user: null, isChecking: false });
        }
      } else {
        set({ isChecking: false });
      }
    } catch {
      set({ isChecking: false });
    }
  },

  initAdmin: async (username, masterPassword) => {
    // 1. Generate client-side E2EE Vault keys
    const { saltBase64, verifierCipher, masterKey } = await initVault(masterPassword);

    // 2. Send to /api/auth/init-admin
    const res = await fetch('/api/auth/init-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        password: masterPassword,
        kdf_salt: saltBase64,
        kdf_iterations: 600000,
        verifier_cipher: verifierCipher,
      }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(data.error || '初始化管理员失败');
    }

    localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
    set({
      token: data.token,
      user: data.user,
      isSystemInitialized: true,
      masterKey,
    });
  },

  login: async (username, masterPassword) => {
    // 1. Authenticate with server
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: masterPassword }),
    });

    const data = (await res.json()) as any;
    if (!res.ok) {
      throw new Error(data.error || '登录失败，请检查账号密码');
    }

    // 2. Derive user's E2EE MasterKey on client
    let masterKey: CryptoKey;
    try {
      masterKey = await unlockVault(
        masterPassword,
        data.kdf_salt,
        data.verifier_cipher,
        data.kdf_iterations || 600000
      );
    } catch {
      // If user had an initial placeholder verifier (e.g. freshly created by admin),
      // re-initialize their vault verifier seamlessly
      const newVault = await initVault(masterPassword);
      masterKey = newVault.masterKey;
    }

    localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
    set({
      token: data.token,
      user: data.user,
      masterKey,
    });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    set({
      token: null,
      user: null,
      masterKey: null,
    });
  },
}));
