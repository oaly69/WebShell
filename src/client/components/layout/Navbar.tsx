import React, { useState } from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useAuthStore } from '../../store/useAuthStore';
import {
  Server,
  Plus,
  X,
  Radio,
  Terminal,
  FolderOpen,
  Activity,
  LogOut,
  Code2,
  Users,
  LayoutDashboard,
  Menu,
  Download,
} from 'lucide-react';

interface NavbarProps {
  onOpenHostManager: () => void;
  onOpenUserManagement: () => void;
  onToggleSnippets: () => void;
  onOpenOverview: () => void;
  isOverviewActive: boolean;
  onInstallPwa?: () => void;
  canInstallPwa?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenHostManager,
  onOpenUserManagement,
  onToggleSnippets,
  onOpenOverview,
  isOverviewActive,
  onInstallPwa,
  canInstallPwa,
}) => {
  const {
    sessions,
    activeSessionId,
    setActiveSession,
    closeSession,
    isBroadcastMode,
    setBroadcastMode,
    toggleMonitor,
    toggleSftp,
  } = useSessionStore();

  const { user, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId);

  return (
    <header className="relative flex h-11 w-full items-center justify-between border-b border-fs-border bg-fs-surface px-2 sm:px-3 select-none shrink-0 z-30">
      {/* Left: Brand + Overview + Multi-Tab Bar */}
      <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pr-2">
        <div
          onClick={onOpenOverview}
          className="flex items-center space-x-1.5 px-2 py-1 text-xs font-bold text-white tracking-wide shrink-0 cursor-pointer"
        >
          <Terminal className="w-4 h-4 text-fs-info" />
          <span className="hidden sm:inline">FinalShell</span>
        </div>

        {/* 1. Permanent Overview Tab */}
        <button
          onClick={onOpenOverview}
          className={`flex items-center space-x-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors shrink-0 ${
            isOverviewActive
              ? 'bg-fs-bg text-white border-t-2 border-fs-primary shadow-inner'
              : 'text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5 text-fs-info" />
          <span>概览</span>
        </button>

        <button
          onClick={onOpenHostManager}
          title="管理主机连接"
          className="hidden md:flex items-center space-x-1 rounded-lg bg-fs-hover hover:bg-fs-active px-2.5 py-1 text-xs text-fs-text transition-colors shrink-0"
        >
          <Server className="w-3.5 h-3.5 text-fs-accent" />
          <span>服务器</span>
        </button>

        <div className="h-4 w-px bg-fs-border shrink-0 mx-1" />

        {/* Dynamic Terminal Tabs */}
        {sessions.map((session) => {
          const isActive = !isOverviewActive && session.sessionId === activeSessionId;
          const isConnected = session.status === 'connected';

          return (
            <div
              key={session.sessionId}
              onClick={() => setActiveSession(session.sessionId)}
              className={`group flex items-center space-x-2 rounded-lg px-2.5 py-1 text-xs cursor-pointer transition-colors shrink-0 max-w-[140px] sm:max-w-[180px] ${
                isActive
                  ? 'bg-fs-bg text-white border-t-2 border-fs-primary shadow-inner'
                  : 'text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
              }`}
            >
              <div
                className={`w-2 h-2 rounded-full shrink-0 ${
                  isConnected
                    ? 'bg-fs-accent'
                    : session.status === 'connecting'
                    ? 'bg-fs-warning animate-pulse'
                    : 'bg-fs-danger'
                }`}
              />
              <span className="truncate">{session.host.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeSession(session.sessionId);
                }}
                className="opacity-60 group-hover:opacity-100 hover:text-fs-danger p-0.5 rounded transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right Desktop Actions */}
      <div className="hidden sm:flex items-center space-x-1 shrink-0 pl-2">
        {activeSession && !isOverviewActive && (
          <>
            <button
              onClick={() => toggleMonitor(activeSession.sessionId)}
              title="切换实时监控面板"
              className={`p-1.5 rounded-lg transition-colors ${
                activeSession.isMonitorOpen
                  ? 'bg-fs-primary/20 text-fs-info'
                  : 'text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
              }`}
            >
              <Activity className="w-4 h-4" />
            </button>

            <button
              onClick={() => toggleSftp(activeSession.sessionId)}
              title="切换 SFTP 文件面板"
              className={`p-1.5 rounded-lg transition-colors ${
                activeSession.isSftpOpen
                  ? 'bg-fs-primary/20 text-fs-accent'
                  : 'text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
            </button>
          </>
        )}

        <button
          onClick={() => setBroadcastMode(!isBroadcastMode)}
          title={isBroadcastMode ? '多标签广播已开启（输入命令将发送给所有服务器）' : '开启多标签同步广播'}
          className={`flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
            isBroadcastMode
              ? 'bg-fs-danger text-white animate-pulse'
              : 'text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">广播模式</span>
        </button>

        <button
          onClick={onToggleSnippets}
          title="快捷命令库"
          className="p-1.5 rounded-lg text-fs-textMuted hover:bg-fs-hover hover:text-fs-text transition-colors"
        >
          <Code2 className="w-4 h-4" />
        </button>

        {user?.role === 'admin' && (
          <button
            onClick={onOpenUserManagement}
            title="管理多用户成员"
            className="p-1.5 rounded-lg text-fs-textMuted hover:bg-fs-hover hover:text-fs-warning transition-colors"
          >
            <Users className="w-4 h-4" />
          </button>
        )}

        {canInstallPwa && onInstallPwa && (
          <button
            onClick={onInstallPwa}
            title="安装 PWA 桌面/移动应用"
            className="p-1.5 rounded-lg text-fs-accent hover:bg-fs-hover transition-colors"
          >
            <Download className="w-4 h-4" />
          </button>
        )}

        <button
          onClick={logout}
          title={`退出当前账号 (${user?.username})`}
          className="p-1.5 rounded-lg text-fs-textMuted hover:bg-fs-hover hover:text-fs-danger transition-colors ml-1"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Mobile Hamburger Button */}
      <div className="flex sm:hidden items-center space-x-1 shrink-0">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-1.5 rounded-lg text-fs-text hover:bg-fs-hover"
        >
          <Menu className="w-5 h-5" />
        </button>
      </div>

      {/* Mobile Dropdown Menu Drawer */}
      {mobileMenuOpen && (
        <div className="sm:hidden absolute top-11 right-2 w-48 rounded-2xl border border-fs-border bg-fs-surface p-2 shadow-2xl flex flex-col space-y-1 z-50">
          <div className="px-3 py-1.5 text-xs font-semibold text-white border-b border-fs-border/60">
            {user?.username} ({user?.role === 'admin' ? '管理员' : '成员'})
          </div>

          <button
            onClick={() => {
              onOpenHostManager();
              setMobileMenuOpen(false);
            }}
            className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-fs-text hover:bg-fs-hover text-left"
          >
            <Server className="w-4 h-4 text-fs-accent" />
            <span>服务器列表</span>
          </button>

          <button
            onClick={() => {
              onToggleSnippets();
              setMobileMenuOpen(false);
            }}
            className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-fs-text hover:bg-fs-hover text-left"
          >
            <Code2 className="w-4 h-4 text-fs-info" />
            <span>快捷命令库</span>
          </button>

          {user?.role === 'admin' && (
            <button
              onClick={() => {
                onOpenUserManagement();
                setMobileMenuOpen(false);
              }}
              className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-fs-text hover:bg-fs-hover text-left"
            >
              <Users className="w-4 h-4 text-fs-warning" />
              <span>用户成员管理</span>
            </button>
          )}

          {canInstallPwa && onInstallPwa && (
            <button
              onClick={() => {
                onInstallPwa();
                setMobileMenuOpen(false);
              }}
              className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-fs-accent hover:bg-fs-hover text-left"
            >
              <Download className="w-4 h-4" />
              <span>安装为 PWA 应用</span>
            </button>
          )}

          <div className="h-px bg-fs-border/60 my-1" />

          <button
            onClick={() => {
              logout();
              setMobileMenuOpen(false);
            }}
            className="flex items-center space-x-2 px-3 py-2 rounded-xl text-xs text-fs-danger hover:bg-fs-hover text-left"
          >
            <LogOut className="w-4 h-4" />
            <span>退出登录</span>
          </button>
        </div>
      )}
    </header>
  );
};
