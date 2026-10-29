import React from 'react';
import { useSessionStore } from '../../store/useSessionStore';
import { useSyncStore } from '../../store/useSyncStore';
import {
  Server,
  Plus,
  X,
  Radio,
  Terminal,
  FolderOpen,
  Activity,
  Lock,
  Code2,
} from 'lucide-react';

interface NavbarProps {
  onOpenHostManager: () => void;
  onToggleSnippets: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenHostManager, onToggleSnippets }) => {
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

  const { lock } = useSyncStore();
  const activeSession = sessions.find((s) => s.sessionId === activeSessionId);

  return (
    <header className="flex h-11 w-full items-center justify-between border-b border-fs-border bg-fs-surface px-2 select-none">
      {/* Left: Brand + Multi-Tab Bar */}
      <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none pr-2">
        <div className="flex items-center space-x-2 px-2.5 py-1 text-xs font-bold text-white tracking-wide shrink-0">
          <Terminal className="w-4 h-4 text-fs-info" />
          <span>FinalShell Web</span>
        </div>

        <button
          onClick={onOpenHostManager}
          title="管理主机连接"
          className="flex items-center space-x-1 rounded bg-fs-hover hover:bg-fs-active px-2.5 py-1 text-xs text-fs-text transition-colors shrink-0"
        >
          <Server className="w-3.5 h-3.5 text-fs-accent" />
          <span>服务器列表</span>
        </button>

        <div className="h-4 w-px bg-fs-border shrink-0 mx-1" />

        {/* Tab list */}
        {sessions.map((session) => {
          const isActive = session.sessionId === activeSessionId;
          const isConnected = session.status === 'connected';

          return (
            <div
              key={session.sessionId}
              onClick={() => setActiveSession(session.sessionId)}
              className={`group flex items-center space-x-2 rounded px-2.5 py-1 text-xs cursor-pointer transition-colors shrink-0 max-w-[180px] ${
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
                className="opacity-0 group-hover:opacity-100 hover:text-fs-danger p-0.5 rounded transition-opacity"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right: Actions & Tools */}
      <div className="flex items-center space-x-1 shrink-0 pl-2">
        {activeSession && (
          <>
            <button
              onClick={() => toggleMonitor(activeSession.sessionId)}
              title="切换实时监控面板"
              className={`p-1.5 rounded transition-colors ${
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
              className={`p-1.5 rounded transition-colors ${
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
          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors ${
            isBroadcastMode
              ? 'bg-fs-danger text-white animate-pulse'
              : 'text-fs-textMuted hover:bg-fs-hover hover:text-fs-text'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">广播模式</span>
        </button>

        <button
          onClick={onToggleSnippets}
          title="快捷命令库"
          className="p-1.5 rounded text-fs-textMuted hover:bg-fs-hover hover:text-fs-text transition-colors"
        >
          <Code2 className="w-4 h-4" />
        </button>

        <button
          onClick={lock}
          title="锁定密码箱"
          className="p-1.5 rounded text-fs-textMuted hover:bg-fs-hover hover:text-fs-danger transition-colors ml-1"
        >
          <Lock className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
