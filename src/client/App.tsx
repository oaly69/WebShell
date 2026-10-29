import React, { useEffect, useState } from 'react';
import { useSyncStore } from './store/useSyncStore';
import { useSessionStore } from './store/useSessionStore';
import { Navbar } from './components/layout/Navbar';
import { VaultModal } from './components/vault/VaultModal';
import { HostManagerModal } from './components/hosts/HostManagerModal';
import { TerminalTab } from './components/terminal/TerminalTab';
import { MonitorPanel } from './components/monitor/MonitorPanel';
import { SftpPanel } from './components/sftp/SftpPanel';
import { SnippetsDrawer } from './components/snippets/SnippetsDrawer';
import { Terminal, Plus } from 'lucide-react';

export const App: React.FC = () => {
  const { checkVaultStatus, isUnlocked } = useSyncStore();
  const { sessions, activeSessionId } = useSessionStore();

  const [isHostManagerOpen, setIsHostManagerOpen] = useState(false);
  const [isSnippetsOpen, setIsSnippetsOpen] = useState(false);

  useEffect(() => {
    checkVaultStatus();
  }, []);

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId);

  return (
    <div className="flex h-screen w-screen flex-col bg-fs-bg text-fs-text overflow-hidden select-none">
      {/* 1. Master Password Vault Modal */}
      <VaultModal />

      {/* 2. Top Navigation Bar */}
      <Navbar
        onOpenHostManager={() => setIsHostManagerOpen(true)}
        onToggleSnippets={() => setIsSnippetsOpen(!isSnippetsOpen)}
      />

      {/* 3. Main Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {activeSession ? (
          <div className="flex flex-1 h-full w-full overflow-hidden">
            {/* Left: Server Monitor Panel */}
            {activeSession.isMonitorOpen && <MonitorPanel metrics={activeSession.metrics} />}

            {/* Right: Terminal and SFTP Workspace */}
            <div className="flex flex-1 flex-col h-full w-full overflow-hidden">
              {/* Terminal Area */}
              <div className="flex-1 w-full overflow-hidden">
                <TerminalTab key={activeSession.sessionId} session={activeSession} />
              </div>

              {/* Bottom: SFTP Panel */}
              {activeSession.isSftpOpen && <SftpPanel session={activeSession} />}
            </div>
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center text-center p-8">
            <div className="rounded-2xl border border-fs-border bg-fs-surface/60 p-8 max-w-sm flex flex-col items-center">
              <div className="p-4 rounded-xl bg-fs-primary/10 text-fs-info mb-4">
                <Terminal className="w-10 h-10" />
              </div>
              <h2 className="text-base font-bold text-white mb-1">网页版 FinalShell</h2>
              <p className="text-xs text-fs-textMuted mb-6">
                原生部署在 Cloudflare Workers 边缘，支持 SSH 终端、SFTP、实时监控与多端云同步
              </p>
              <button
                onClick={() => setIsHostManagerOpen(true)}
                disabled={!isUnlocked}
                className="flex items-center space-x-2 rounded-lg bg-fs-primary hover:bg-fs-primaryHover px-4 py-2 text-xs font-medium text-white transition-colors disabled:opacity-40"
              >
                <Plus className="w-4 h-4" />
                <span>打开服务器列表</span>
              </button>
            </div>
          </div>
        )}

        {/* Snippets Drawer */}
        <SnippetsDrawer isOpen={isSnippetsOpen} onClose={() => setIsSnippetsOpen(false)} />
      </div>

      {/* Host Manager Dialog */}
      <HostManagerModal
        isOpen={isHostManagerOpen}
        onClose={() => setIsHostManagerOpen(false)}
      />
    </div>
  );
};
