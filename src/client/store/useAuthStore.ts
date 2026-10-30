import { create } from 'zustand';
import type { UserProfile } from '@shared/types';
import {
  initVault,
  unlockVault,
  exportMasterKey,
  importMasterKey,
} from '../crypto/vault';

interface VaultMetadata {
  kdf_salt: string;
  kdf_iterations: number;
  verifier_cipher: string;
}

interface AuthStoreState {
  token: string | null;
  user: UserProfile | null;
  isSystemInitialized: boolean;
  isChecking: boolean;
  masterKey: CryptoKey | null;
  isVaultLocked: boolean;
  vaultMeta: VaultMetadata | null;

  checkAuthStatus: () => Promise<void>;
  initAdmin: (username: string, masterPassword: string) => Promise<void>;
  login: (username: string, masterPassword: string) => Promise<void>;
  unlockVaultWithPassword: (password: string) => Promise<void>;
  logout: () => void;
}

const STORAGE_KEY_TOKEN = 'fs_token';
const SESSION_KEY_VAULT = 'fs_vault_key';

export const useAuthStore = create<AuthStoreState>((set, get) => ({
  token: localStorage.getItem(STORAGE_KEY_TOKEN),
  user: null,
  isSystemInitialized: true,
  isChecking: true,
  masterKey: null,
  isVaultLocked: false,
  vaultMeta: null,

  checkAuthStatus: async () => {
    try {
      const statusRes = await fetch('/api/auth/status');
      const statusData = (await statusRes.json()) as { initialized: boolean; userCount: number };
      set({ isSystemInitialized: statusData.initialized });

      if (!statusData.initialized) {
        set({ isChecking: false, token: null, user: null, masterKey: null, isVaultLocked: false });
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
          let restoredMasterKey: CryptoKey | null = null;
          const cachedSessionKey = sessionStorage.getItem(SESSION_KEY_VAULT);
          if (cachedSessionKey) {
            try {
              restoredMasterKey = await importMasterKey(cachedSessionKey);
            } catch {
              sessionStorage.removeItem(SESSION_KEY_VAULT);
            }
          }

          set({
            token: existingToken,
            user: meData.user,
            isChecking: false,
            masterKey: restoredMasterKey,
            isVaultLocked: !restoredMasterKey,
            vaultMeta: {
              kdf_salt: meData.kdf_salt,
              kdf_iterations: meData.kdf_iterations || 600000,
              verifier_cipher: meData.verifier_cipher,
            },
          });
          return;
        } else {
          localStorage.removeItem(STORAGE_KEY_TOKEN);
          sessionStorage.removeItem(SESSION_KEY_VAULT);
          set({ token: null, user: null, masterKey: null, isChecking: false, isVaultLocked: false });
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

    try {
      const exported = await exportMasterKey(masterKey);
      sessionStorage.setItem(SESSION_KEY_VAULT, exported);
    } catch {}

    localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
    set({
      token: data.token,
      user: data.user,
      isSystemInitialized: true,
      masterKey,
      isVaultLocked: false,
      vaultMeta: {
        kdf_salt: saltBase64,
        kdf_iterations: 600000,
        verifier_cipher: verifierCipher,
      },
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
    let finalSalt = data.kdf_salt;
    let finalIterations = data.kdf_iterations || 600000;
    let finalVerifier = data.verifier_cipher;

    if (data.verifier_cipher === 'INITIAL_VERIFIER') {
      // Freshly created user by admin without initialized verifier: initialize and persist to server
      const newVault = await initVault(masterPassword);
      masterKey = newVault.masterKey;
      finalSalt = newVault.saltBase64;
      finalVerifier = newVault.verifierCipher;
      await fetch('/api/auth/vault', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.token}`,
        },
        body: JSON.stringify({
          kdf_salt: finalSalt,
          kdf_iterations: finalIterations,
          verifier_cipher: finalVerifier,
        }),
      });
    } else {
      masterKey = await unlockVault(
        masterPassword,
        finalSalt,
        finalVerifier,
        finalIterations
      );
    }

    try {
      const exported = await exportMasterKey(masterKey);
      sessionStorage.setItem(SESSION_KEY_VAULT, exported);
    } catch {}

    localStorage.setItem(STORAGE_KEY_TOKEN, data.token);
    set({
      token: data.token,
      user: data.user,
      masterKey,
      isVaultLocked: false,
      vaultMeta: {
        kdf_salt: finalSalt,
        kdf_iterations: finalIterations,
        verifier_cipher: finalVerifier,
      },
    });
  },

  unlockVaultWithPassword: async (password: string) => {
    const { vaultMeta, token } = get();
    if (!vaultMeta) throw new Error('未获取到密码箱元数据，请重新登录');

    let masterKey: CryptoKey;
    let nextMeta = vaultMeta;

    if (vaultMeta.verifier_cipher === 'INITIAL_VERIFIER') {
      const newVault = await initVault(password);
      masterKey = newVault.masterKey;
      nextMeta = {
        kdf_salt: newVault.saltBase64,
        kdf_iterations: 600000,
        verifier_cipher: newVault.verifierCipher,
      };
      if (token) {
        await fetch('/api/auth/vault', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(nextMeta),
        });
      }
    } else {
      masterKey = await unlockVault(
        password,
        vaultMeta.kdf_salt,
        vaultMeta.verifier_cipher,
        vaultMeta.kdf_iterations || 600000
      );
    }

    try {
      const exported = await exportMasterKey(masterKey);
      sessionStorage.setItem(SESSION_KEY_VAULT, exported);
    } catch {}

    set({
      masterKey,
      isVaultLocked: false,
      vaultMeta: nextMeta,
    });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    sessionStorage.removeItem(SESSION_KEY_VAULT);
    set({
      token: null,
      user: null,
      masterKey: null,
      isVaultLocked: false,
      vaultMeta: null,
    });
  },
}));
