import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';
import { Lock, ShieldCheck, UserCheck, KeyRound, AlertCircle, Terminal } from 'lucide-react';

export const AuthModal: React.FC = () => {
  const { isSystemInitialized, isChecking, token, initAdmin, login } = useAuthStore();
  const { fetchHosts, fetchSnippets } = useSyncStore();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // If already logged in or still checking status, don't show
  if (isChecking || token) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!isSystemInitialized) {
        // Setup initial Super Admin
        if (password.length < 6) {
          throw new Error('管理员密码长度不能少于 6 位');
        }
        if (password !== confirmPassword) {
          throw new Error('两次输入的密码不一致');
        }
        await initAdmin(username.trim(), password);
      } else {
        // Normal user or admin login
        await login(username.trim(), password);
      }

      // Fetch user data after login
      await fetchHosts();
      await fetchSnippets();
    } catch (err: any) {
      setError(err.message || '操作失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 select-none">
      <div className="w-full max-w-md rounded-2xl border border-fs-border bg-fs-surface p-7 shadow-2xl">
        <div className="flex items-center space-x-3.5 mb-6">
          <div className="p-3.5 rounded-xl bg-fs-primary/15 text-fs-info border border-fs-primary/20">
            {!isSystemInitialized ? (
              <ShieldCheck className="w-7 h-7 text-fs-accent" />
            ) : (
              <Terminal className="w-7 h-7 text-fs-info" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">
              {!isSystemInitialized ? '初始化超级管理员' : '登录 Web FinalShell'}
            </h2>
            <p className="text-xs text-fs-textMuted mt-0.5">
              {!isSystemInitialized
                ? '首次部署创建管理员账号。系统关闭公开注册，后续用户由管理员添加'
                : '基于零知识端到端加密，管理员与服务端均不可解密你的凭据'}
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-5 flex items-start space-x-2.5 rounded-xl bg-fs-danger/10 border border-fs-danger/30 p-3.5 text-xs text-fs-danger">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-fs-text mb-1.5">用户名 (Username)</label>
            <div className="relative">
              <input
                type="text"
                required
                autoFocus
                placeholder={!isSystemInitialized ? 'admin' : '请输入用户名'}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-fs-border bg-fs-bg px-3.5 py-2.5 text-sm text-white placeholder-fs-textMuted focus:border-fs-primary focus:outline-none transition-colors"
              />
              <UserCheck className="absolute right-3.5 top-3 w-4 h-4 text-fs-textMuted" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-fs-text mb-1.5">
              {!isSystemInitialized ? '设置管理员主密码' : '密码 / 主密码 (Password)'}
            </label>
            <div className="relative">
              <input
                type="password"
                required
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-fs-border bg-fs-bg px-3.5 py-2.5 text-sm text-white placeholder-fs-textMuted focus:border-fs-primary focus:outline-none transition-colors"
              />
              <KeyRound className="absolute right-3.5 top-3 w-4 h-4 text-fs-textMuted" />
            </div>
          </div>

          {!isSystemInitialized && (
            <div>
              <label className="block text-xs font-medium text-fs-text mb-1.5">确认主密码</label>
              <div className="relative">
                <input
                  type="password"
                  required
                  placeholder="再次输入主密码"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-xl border border-fs-border bg-fs-bg px-3.5 py-2.5 text-sm text-white placeholder-fs-textMuted focus:border-fs-primary focus:outline-none transition-colors"
                />
                <Lock className="absolute right-3.5 top-3 w-4 h-4 text-fs-textMuted" />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 rounded-xl bg-fs-primary hover:bg-fs-primaryHover py-3 text-sm font-semibold text-white shadow-lg shadow-fs-primary/20 transition-all disabled:opacity-50"
          >
            {loading
              ? '正在计算零知识加密密钥...'
              : !isSystemInitialized
              ? '创建超级管理员并进入系统'
              : '登录并解锁安全工作台'}
          </button>
        </form>

        <div className="mt-5 border-t border-fs-border/60 pt-4 text-center">
          <p className="text-[11px] text-fs-textMuted leading-relaxed">
            🛡️ 隐私声明：每位用户的 SSH 密码与密钥均在客户端独立加密 (PBKDF2 + AES-GCM)，无主密码任何人都无法读取。
          </p>
        </div>
      </div>
    </div>
  );
};
