import React, { useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { DecryptedHost } from '@shared/types';
import {
  Server,
  Terminal,
  Activity,
  Code2,
  ShieldCheck,
  Plus,
  Play,
  Search,
  Folder,
  Layers,
  Download,
  Users,
  Cpu,
} from 'lucide-react';

interface OverviewDashboardProps {
  onOpenHostManager: () => void;
  onOpenUserManagement: () => void;
  onOpenSnippets: () => void;
  onInstallPwa?: () => void;
  canInstallPwa?: boolean;
}

export const OverviewDashboard: React.FC<OverviewDashboardProps> = ({
  onOpenHostManager,
  onOpenUserManagement,
  onOpenSnippets,
  onInstallPwa,
  canInstallPwa,
}) => {
  const { user } = useAuthStore();
  const { hosts, snippets, getHostGroups } = useSyncStore();
  const { sessions, openSession } = useSessionStore();

  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');

  // Compute all groups including custom created ones
  const groups = getHostGroups();

  // Filter hosts
  const filteredHosts = hosts.filter((h) => {
    const matchesSearch =
      h.name.toLowerCase().includes(search.toLowerCase()) ||
      h.hostname.includes(search) ||
      h.username.includes(search);
    const matchesGroup = selectedGroup === 'all' || (h.group_name || '默认分组') === selectedGroup;
    return matchesSearch && matchesGroup;
  });

  const handleConnect = (host: DecryptedHost) => {
    openSession(host);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-fs-bg p-4 sm:p-6 lg:p-8 select-none">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        {/* 1. Header Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-fs-border bg-gradient-to-r from-fs-surface via-fs-surface/80 to-fs-primary/10 p-5 sm:p-7 shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3.5">
              <div className="p-3.5 rounded-xl bg-fs-primary/20 text-fs-info border border-fs-primary/30">
                <Terminal className="w-7 h-7 sm:w-8 sm:h-8" />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className="text-lg sm:text-xl font-bold text-white tracking-wide">
                    FinalShell 边缘控制台
                  </h1>
                  <span
                    className={`text-[10px] sm:text-xs font-mono px-2 py-0.5 rounded-full ${
                      user?.role === 'admin'
                        ? 'bg-fs-warning/15 text-fs-warning border border-fs-warning/30'
                        : 'bg-fs-primary/15 text-fs-info border border-fs-primary/30'
                    }`}
                  >
                    {user?.role === 'admin' ? '超级管理员' : '普通成员'}
                  </span>
                </div>
                <p className="text-xs text-fs-textMuted mt-1">
                  Cloudflare Workers 原生运行 · 纯 TS 协议栈 · 客户端 E2EE 绝对隐私隔离
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onOpenHostManager}
                className="flex items-center space-x-1.5 rounded-xl bg-fs-primary hover:bg-fs-primaryHover px-3.5 py-2 text-xs font-semibold text-white shadow-md shadow-fs-primary/20 transition-all"
              >
                <Plus className="w-4 h-4" />
                <span>新建服务器</span>
              </button>

              {user?.role === 'admin' && (
                <button
                  onClick={onOpenUserManagement}
                  className="flex items-center space-x-1.5 rounded-xl bg-fs-surface hover:bg-fs-hover border border-fs-border px-3.5 py-2 text-xs font-medium text-white transition-colors"
                >
                  <Users className="w-4 h-4 text-fs-warning" />
                  <span>用户管理</span>
                </button>
              )}

              {canInstallPwa && onInstallPwa && (
                <button
                  onClick={onInstallPwa}
                  className="flex items-center space-x-1.5 rounded-xl bg-fs-surface hover:bg-fs-hover border border-fs-border px-3.5 py-2 text-xs font-medium text-fs-accent transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>安装 PWA</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 2. Metric Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="rounded-xl border border-fs-border bg-fs-surface p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-fs-textMuted mb-2">
              <span className="text-xs font-medium">配置服务器</span>
              <Server className="w-4 h-4 text-fs-accent" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white">{hosts.length}</div>
            <span className="text-[10px] text-fs-textMuted mt-1">{groups.length} 个自定义分组</span>
          </div>

          <div className="rounded-xl border border-fs-border bg-fs-surface p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-fs-textMuted mb-2">
              <span className="text-xs font-medium">活跃连接</span>
              <Activity className="w-4 h-4 text-fs-info" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-fs-info">
              {sessions.filter((s) => s.status === 'connected').length}
            </div>
            <span className="text-[10px] text-fs-textMuted mt-1">
              共开启 {sessions.length} 个多标签会话
            </span>
          </div>

          <div className="rounded-xl border border-fs-border bg-fs-surface p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-fs-textMuted mb-2">
              <span className="text-xs font-medium">快捷命令库</span>
              <Code2 className="w-4 h-4 text-fs-warning" />
            </div>
            <div className="text-2xl sm:text-3xl font-bold font-mono text-white">{snippets.length}</div>
            <span className="text-[10px] text-fs-textMuted mt-1">支持多机一键广播</span>
          </div>

          <div className="rounded-xl border border-fs-border bg-fs-surface p-4 flex flex-col justify-between shadow-sm">
            <div className="flex items-center justify-between text-fs-textMuted mb-2">
              <span className="text-xs font-medium">安全状态</span>
              <ShieldCheck className="w-4 h-4 text-fs-accent" />
            </div>
            <div className="text-sm sm:text-base font-bold text-fs-accent truncate">端到端零知识</div>
            <span className="text-[10px] text-fs-textMuted mt-1">AES-256 本地密钥加解密</span>
          </div>
        </div>

        {/* 3. Server List Section */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center space-x-2">
                <Server className="w-4 h-4 text-fs-info" />
                <span>我的服务器工作台</span>
              </h2>
              <p className="text-[11px] text-fs-textMuted mt-0.5">点击直接发起 SSH 连接并载入监控与 SFTP</p>
            </div>

            <div className="flex items-center space-x-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <input
                  type="text"
                  placeholder="搜索服务器或 IP..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-xl bg-fs-surface border border-fs-border px-3 py-1.5 pl-8 text-xs text-white placeholder-fs-textMuted focus:outline-none focus:border-fs-primary"
                />
                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-fs-textMuted" />
              </div>
            </div>
          </div>

          {/* Group Filter Pills */}
          {groups.length > 0 && (
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none">
              <button
                onClick={() => setSelectedGroup('all')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                  selectedGroup === 'all'
                    ? 'bg-fs-primary text-white'
                    : 'bg-fs-surface text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
                }`}
              >
                全部 ({hosts.length})
              </button>
              {groups.map((grp) => (
                <button
                  key={grp}
                  onClick={() => setSelectedGroup(grp)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors shrink-0 flex items-center space-x-1 ${
                    selectedGroup === grp
                      ? 'bg-fs-primary text-white'
                      : 'bg-fs-surface text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
                  }`}
                >
                  <Folder className="w-3 h-3 text-fs-warning" />
                  <span>{grp}</span>
                  <span className="text-[10px]">
                    ({hosts.filter((h) => (h.group_name || '默认分组') === grp).length})
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Host Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredHosts.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-fs-border p-10 text-center bg-fs-surface/30">
                <Server className="w-10 h-10 mx-auto text-fs-border mb-3" />
                <p className="text-xs text-fs-text font-medium">暂无匹配的服务器</p>
                <p className="text-[11px] text-fs-textMuted mt-1">点击右上角“新建服务器”快速添加你的第一台主机</p>
                <button
                  onClick={onOpenHostManager}
                  className="mt-4 rounded-xl bg-fs-primary hover:bg-fs-primaryHover px-4 py-2 text-xs font-medium text-white transition-colors"
                >
                  添加连接
                </button>
              </div>
            ) : (
              filteredHosts.map((host) => {
                const isOnline = sessions.some(
                  (s) => s.host.id === host.id && s.status === 'connected'
                );

                return (
                  <div
                    key={host.id}
                    onDoubleClick={() => handleConnect(host)}
                    className="group rounded-2xl border border-fs-border bg-fs-surface p-4 hover:border-fs-primary/60 transition-all flex flex-col justify-between shadow-sm hover:shadow-lg"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <div
                            className={`w-2.5 h-2.5 rounded-full ${
                              isOnline ? 'bg-fs-accent shadow-sm shadow-fs-accent/50' : 'bg-fs-textMuted/40'
                            }`}
                          />
                          <h3 className="font-semibold text-white text-sm truncate max-w-[170px]">
                            {host.name}
                          </h3>
                        </div>
                        <span className="text-[10px] rounded-md bg-fs-bg px-2 py-0.5 text-fs-textMuted border border-fs-border/60">
                          {host.group_name || '默认'}
                        </span>
                      </div>

                      <div className="space-y-1 my-3 text-xs font-mono text-fs-textMuted">
                        <div className="truncate text-fs-text">
                          {host.username}@{host.hostname}:{host.port}
                        </div>
                        <div className="text-[11px] text-fs-textMuted/80 flex items-center space-x-2">
                          <span>认证: {host.auth_type === 'password' ? '密码' : '私钥'}</span>
                          <span>•</span>
                          <span>保活: {host.keepalive_interval || 30}s</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t border-fs-border/50 pt-3">
                      <span className="text-[10px] text-fs-textMuted/70">
                        {isOnline ? '🟢 已建立连接' : '双击或点击连接'}
                      </span>
                      <button
                        onClick={() => handleConnect(host)}
                        className="flex items-center space-x-1.5 rounded-xl bg-fs-primary/15 hover:bg-fs-primary text-fs-info hover:text-white px-3 py-1.5 text-xs font-medium transition-colors"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>连接</span>
                      </button>
                    </div>
                  </div>
                );
              })
            )}

            {/* Quick Add Card */}
            <div
              onClick={onOpenHostManager}
              className="rounded-2xl border border-dashed border-fs-border/80 bg-fs-surface/20 hover:bg-fs-surface/60 hover:border-fs-primary/50 p-6 flex flex-col items-center justify-center cursor-pointer transition-all min-h-[140px]"
            >
              <Plus className="w-6 h-6 text-fs-textMuted mb-2" />
              <span className="text-xs font-medium text-fs-text">新建服务器连接</span>
              <span className="text-[10px] text-fs-textMuted mt-0.5">支持 SSH 密码、证书、跳板机</span>
            </div>
          </div>
        </div>

        {/* 4. Quick Commands / Snippets Preview */}
        {snippets.length > 0 && (
          <div className="rounded-2xl border border-fs-border bg-fs-surface p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center space-x-2">
                <Code2 className="w-4 h-4 text-fs-warning" />
                <h3 className="text-xs font-bold text-white">快捷命令库速览</h3>
              </div>
              <button
                onClick={onOpenSnippets}
                className="text-xs text-fs-info hover:underline"
              >
                查看全部 ({snippets.length})
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {snippets.slice(0, 8).map((s) => (
                <div
                  key={s.id}
                  onClick={onOpenSnippets}
                  className="rounded-xl border border-fs-border bg-fs-bg/60 hover:bg-fs-hover px-3 py-1.5 text-xs text-fs-text flex items-center space-x-2 cursor-pointer transition-colors"
                >
                  <span className="font-medium text-white">{s.title}</span>
                  <span className="text-[10px] text-fs-textMuted font-mono truncate max-w-[140px]">
                    {s.command}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
