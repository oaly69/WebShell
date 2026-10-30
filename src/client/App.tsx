import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/useAuthStore';
import { useSyncStore } from './store/useSyncStore';
import { useSessionStore } from './store/useSessionStore';
import { Navbar } from './components/layout/Navbar';
import { AuthModal } from './components/auth/AuthModal';
import { OverviewDashboard } from './components/overview/OverviewDashboard';
import { HostManagerModal } from './components/hosts/HostManagerModal';
import { UserManagementModal } from './components/admin/UserManagementModal';
import { SessionWorkspace } from './components/session/SessionWorkspace';
import { SnippetsDrawer } from './components/snippets/SnippetsDrawer';
import { ErrorBoundary } from './components/common/ErrorBoundary';

export const App: React.FC = () => {
  const { checkAuthStatus, token, masterKey } = useAuthStore();
  const { fetchHosts, fetchSnippets } = useSyncStore();
  const { sessions, activeSessionId, activeTab, setActiveTab } = useSessionStore();

  const [isHostManagerOpen, setIsHostManagerOpen] = useState(false);
  const [isUserManagementOpen, setIsUserManagementOpen] = useState(false);
  const [isSnippetsOpen, setIsSnippetsOpen] = useState(false);
  const [initialEditHost, setInitialEditHost] = useState<any>(null);

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

    const handleOpenSnippets = () => setIsSnippetsOpen(true);
    const handleOpenEditHost = (e: any) => {
      setInitialEditHost(e.detail || null);
      setIsHostManagerOpen(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('open-snippets', handleOpenSnippets);
    window.addEventListener('open-edit-host', handleOpenEditHost);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('open-snippets', handleOpenSnippets);
      window.removeEventListener('open-edit-host', handleOpenEditHost);
    };
  }, []);

  useEffect(() => {
    if (token) {
      fetchHosts();
      fetchSnippets();
    }
  }, [token, masterKey]);

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
  const isOverview = activeTab === 'overview' || !activeSession || sessions.length === 0;

  return (
    <div className="flex h-screen w-screen flex-col bg-fs-bg text-fs-text overflow-hidden select-none">
      {/* 1. Login & Admin Initialization Modal */}
      <AuthModal />

      {/* 2. Top Navigation Bar */}
      <Navbar
        onOpenHostManager={() => setIsHostManagerOpen(true)}
        onOpenUserManagement={() => setIsUserManagementOpen(true)}
        onToggleSnippets={() => setIsSnippetsOpen(!isSnippetsOpen)}
        onOpenOverview={() => setActiveTab('overview')}
        isOverviewActive={isOverview}
        onInstallPwa={handleInstallPwa}
        canInstallPwa={canInstallPwa}
      />

      {/* 3. Main Workspace Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <ErrorBoundary fallbackTitle="工作区加载异常" onReset={() => setActiveTab('overview')}>
          {/* Overview Dashboard (Kept in DOM so state isn't reset) */}
          <div className={`h-full w-full ${isOverview ? 'flex flex-1' : 'hidden'}`}>
            <OverviewDashboard
              onOpenHostManager={() => setIsHostManagerOpen(true)}
              onOpenUserManagement={() => setIsUserManagementOpen(true)}
              onOpenSnippets={() => setIsSnippetsOpen(true)}
              onInstallPwa={handleInstallPwa}
              canInstallPwa={canInstallPwa}
            />
          </div>

          {/* Persistent SSH Sessions: All active sessions kept alive in DOM so terminal logs and connections are never cleared */}
          {sessions.map((session) => {
            const isVisible = !isOverview && session.sessionId === activeSessionId;
            return (
              <div
                key={session.sessionId}
                className={`h-full w-full ${isVisible ? 'flex flex-1' : 'hidden'}`}
              >
                <SessionWorkspace session={session} isVisible={isVisible} />
              </div>
            );
          })}
        </ErrorBoundary>

        {/* Snippets Drawer */}
        <SnippetsDrawer isOpen={isSnippetsOpen} onClose={() => setIsSnippetsOpen(false)} />
      </div>

      {/* Host Manager Dialog */}
      <HostManagerModal
        isOpen={isHostManagerOpen}
        onClose={() => {
          setIsHostManagerOpen(false);
          setInitialEditHost(null);
        }}
        initialEditHost={initialEditHost}
      />

      {/* Admin User Management Dialog */}
      <UserManagementModal isOpen={isUserManagementOpen} onClose={() => setIsUserManagementOpen(false)} />
    </div>
  );
};
