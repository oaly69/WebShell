import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useSyncStore } from './store/useSyncStore';
import { useSessionStore } from './store/useSessionStore';
import { Navbar } from './components/layout/Navbar';
import { AuthModal } from './components/auth/AuthModal';
import { OverviewDashboard } from './components/overview/OverviewDashboard';
import { HostManagerModal } from './components/hosts/HostManagerModal';
import { UserManagementModal } from './components/admin/UserManagementModal';
import { TerminalTab } from './components/terminal/TerminalTab';
import { MonitorPanel } from './components/monitor/MonitorPanel';
import { SftpPanel } from './components/sftp/SftpPanel';
import { SnippetsDrawer } from './components/snippets/SnippetsDrawer';
import { MobileKeyBar } from './components/terminal/MobileKeyBar';
import { Activity, FolderOpen, Terminal } from 'lucide-react';

export const App: React.FC = () => {
  const { checkAuthStatus, token } = useAuthStore();
  const { fetchHosts, fetchSnippets } = useSyncStore();
  const { sessions, activeSessionId } = useSessionStore();

  const [isOverviewActive, setIsOverviewActive] = useState(true);
  const [isHostManagerOpen, setIsHostManagerOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isSnippetsOpen, setIsSnippetsOpen] = useState(false);

  // Mobile sub-panel tab: 'terminal' | 'monitor' | 'sftp'
  const [mobileActiveView, setMobileActiveView] = useState<'terminal' | 'monitor' | 'sftp'>('terminal');

  // PWA Install Prompt
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstallPwa, setCanInstallPwa] = useState(false);

  useEffect(() => {
    checkAuthStatus();

    // Listen for PWA beforeinstallprompt
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstallPwa(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  useEffect(() => {
    if (token) {
      fetchHosts();
      fetchSnippets();
    }
  }, [token]);

  // When active session changes or a new session is opened, switch to terminal view
  useEffect(() => {
    if (sessions.length > 0 && activeSessionId) {
      setIsOverviewActive(false);
    } else {
      setIsOverviewActive(true);
    }
  }, [sessions.length, activeSessionId]);

  const handleInstallPwa = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstallPwa(false);
    }
    setDeferredPrompt(null);
  };

  const activeSession = sessions.find((s) => s.sessionId === activeSessionId);

  return (
    <div className="flex h-screen w-screen flex-col bg-fs-bg text-fs-text overflow-hidden select-none">
      {/* 1. Login & Admin Initialization Modal */}
      <AuthModal />

      {/* 2. Top Navigation Bar */}
      <Navbar
        onOpenHostManager={() => setIsHostManagerOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onToggleSnippets={() => setIsSnippetsOpen(!isSnippetsOpen)}
        onOpenOverview={() => setIsOverviewActive(true)}
        isOverviewActive={isOverviewActive || !activeSession}
        onInstallPwa={handleInstallPwa}
        canInstallPwa={canInstallPwa}
      />

      {/* 3. Main Workspace Area */}
      <div className="flex flex-1 overflow-hidden relative">
        {isOverviewActive || !activeSession ? (
          <OverviewDashboard
            onOpenHostManager={() => setIsHostManagerOpen(true)}
            onOpenUserManagement={() => setIsUserManagementOpen(true)}
            onOpenSnippets={() => setIsSnippetsOpen(true)}
            onInstallPwa={handleInstallPwa}
            canInstallPwa={canInstallPwa}
          />
        ) : (
          <div className="flex flex-1 h-full w-full overflow-hidden">
            {/* Desktop Left: Monitor Panel */}
            <div className="hidden lg:flex h-full">
              {activeSession.isMonitorOpen && <MonitorPanel metrics={activeSession.metrics} />}
            </div>

            {/* Middle/Center: Terminal & Mobile View Switcher */}
            <div className="flex flex-1 flex-col h-full w-full overflow-hidden">
              {/* Mobile View Switcher Tab Bar */}
              <div className="flex lg:hidden h-8 items-center justify-around border-b border-fs-border bg-fs-surface text-xs shrink-0">
                <button
                  onClick={() => setMobileActiveView('terminal')}
                  className={`flex items-center space-x-1.5 py-1 px-3 rounded-md transition-colors ${
                    mobileActiveView === 'terminal' ? 'bg-fs-primary text-white font-medium' : 'text-fs-textMuted'
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                  <span>终端</span>
                </button>
                <button
                  onClick={() => setMobileActiveView('monitor')}
                  className={`flex items-center space-x-1.5 py-1 px-3 rounded-md transition-colors ${
                    mobileActiveView === 'monitor' ? 'bg-fs-primary text-white font-medium' : 'text-fs-textMuted'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>实时监控</span>
                </button>
                <button
                  onClick={() => setMobileActiveView('sftp')}
                  className={`flex items-center space-x-1.5 py-1 px-3 rounded-md transition-colors ${
                    mobileActiveView === 'sftp' ? 'bg-fs-primary text-white font-medium' : 'text-fs-textMuted'
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>SFTP 文件</span>
                </button>
              </div>

              {/* Main Content Area based on View Mode */}
              <div className="flex-1 w-full overflow-hidden relative">
                {/* Terminal View */}
                <div
                  className={`h-full w-full ${
                    mobileActiveView === 'terminal' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'
                  }`}
                >
                  <TerminalTab key={activeSession.sessionId} session={activeSession} />
                  {/* Mobile Virtual Key Bar */}
                  <MobileKeyBar />
                </div>

                {/* Mobile Monitor View */}
                <div className={`h-full w-full lg:hidden ${mobileActiveView === 'monitor' ? 'block' : 'hidden'}`}>
                  <MonitorPanel metrics={activeSession.metrics} />
                </div>

                {/* Mobile SFTP View */}
                <div className={`h-full w-full lg:hidden ${mobileActiveView === 'sftp' ? 'block' : 'hidden'}`}>
                  <SftpPanel session={activeSession} />
                </div>
              </div>

              {/* Desktop Bottom: SFTP Panel */}
              <div className="hidden lg:block shrink-0">
                {activeSession.isSftpOpen && <SftpPanel session={activeSession} />}
              </div>
            </div>
          </div>
        )}

        {/* Snippets Drawer */}
        <SnippetsDrawer isOpen={isSnippetsOpen} onClose={() => setIsSnippetsOpen(false)} />
      </div>

      {/* Host Manager Dialog */}
      <HostManagerModal isOpen={isHostManagerOpen} onClose={() => setIsHostManagerOpen(false)} />

      {/* Admin User Management Dialog */}
      <UserManagementModal isOpen={isUserManagementOpen} onClose={() => setIsUserManagementOpen(false)} />
    </div>
  );
};
