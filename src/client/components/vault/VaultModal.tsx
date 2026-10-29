import React, { useState } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { Lock, KeyRound, ShieldCheck, AlertCircle } from 'lucide-react';

export const VaultModal: React.FC = () => {
  const { isVaultReady, isUnlocked, setupVault, unlock } = useSyncStore();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (isUnlocked) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!isVaultReady) {
        // Setup new vault
        if (password.length < 6) {
          throw new Error('主密码长度不能少于 6 位');
        }
        if (password !== confirmPassword) {
          throw new Error('两次输入的密码不一致');
        }
        await setupVault(password);
      } else {
        // Unlock existing vault
        await unlock(password);
      }
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl border border-fs-border bg-fs-surface p-6 shadow-2xl">
        <div className="flex items-center space-x-3 mb-5">
          <div className="p-3 rounded-lg bg-fs-primary/20 text-fs-info">
            {isVaultReady ? <Lock className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {isVaultReady ? '解锁 FinalShell 密码箱' : '初始化零知识密码箱'}
            </h2>
            <p className="text-xs text-fs-textMuted mt-0.5">
              {isVaultReady
                ? '服务器凭据已在客户端加密，请输入主密码解密'
                : '设置主密码以对所有 SSH 密码与密钥进行端到端加密 (E2EE)'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 flex items-center space-x-2 rounded-lg bg-fs-danger/10 border border-fs-danger/30 p-3 text-xs text-fs-danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fs-text mb-1.5">
              主密码 (Master Password)
            </label>
            <div className="relative">
              <input
                type="password"
                required
                autoFocus
                placeholder="请输入主密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-fs-border bg-fs-bg px-3.5 py-2.5 text-sm text-white placeholder-fs-textMuted focus:border-fs-primary focus:outline-none"
              />
              <KeyRound className="absolute right-3 top-3 w-4 h-4 text-fs-textMuted" />
            </div>
          </div>

          {!isVaultReady && (
            <div>
              <label className="block text-xs font-medium text-fs-text mb-1.5">
                确认主密码
              </label>
              <input
                type="password"
                required
                placeholder="再次输入主密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-fs-border bg-fs-bg px-3.5 py-2.5 text-sm text-white placeholder-fs-textMuted focus:border-fs-primary focus:outline-none"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-fs-primary hover:bg-fs-primaryHover py-2.5 text-sm font-medium text-white transition-colors disabled:opacity-50"
          >
            {loading ? '正在计算 PBKDF2 派生密钥...' : isVaultReady ? '解锁密码箱' : '创建并初始化'}
          </button>
        </form>
      </div>
    </div>
  );
};
