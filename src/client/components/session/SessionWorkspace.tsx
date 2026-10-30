import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { TerminalSession } from '../../store/useSessionStore';
import { MonitorPanel } from '../monitor/MonitorPanel';
import { TerminalTab } from '../terminal/TerminalTab';
import { SftpPanel } from '../sftp/SftpPanel';
import { SnippetsPanel } from '../snippets/SnippetsPanel';
import { MobileKeyBar } from '../terminal/MobileKeyBar';
import {
  Terminal,
  Activity,
  FolderOpen,
  Code2,
  GripVertical,
  GripHorizontal,
} from 'lucide-react';

interface SessionWorkspaceProps {
  session: TerminalSession;
  isVisible: boolean;
}

export const SessionWorkspace: React.FC<SessionWorkspaceProps> = ({ session, isVisible }) => {
  // Saved layout dimensions from localStorage
  const [monitorWidth, setMonitorWidth] = useState<number>(() => {
    const saved = localStorage.getItem('fs_layout_monitor_width');
    return saved ? Math.max(160, Math.min(500, parseInt(saved, 10))) : 260;
  });

  const [bottomHeight, setBottomHeight] = useState<number>(() => {
    const saved = localStorage.getItem('fs_layout_bottom_height');
    return saved ? Math.max(120, Math.min(600, parseInt(saved, 10))) : 280;
  });

  const [sftpRatio, setSftpRatio] = useState<number>(() => {
    const saved = localStorage.getItem('fs_layout_sftp_ratio');
    return saved ? Math.max(20, Math.min(80, parseInt(saved, 10))) : 50;
  });

  // Mobile active view tab: 'terminal' | 'monitor' | 'sftp' | 'snippets'
  const [mobileActiveView, setMobileActiveView] = useState<'terminal' | 'monitor' | 'sftp' | 'snippets'>('terminal');

  // Dragging interaction state
  const [activeDrag, setActiveDrag] = useState<'monitor' | 'bottom' | 'sftp' | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{
    startX: number;
    startY: number;
    startMonitorWidth: number;
    startBottomHeight: number;
    startSftpRatio: number;
    bottomWidth: number;
  }>({
    startX: 0,
    startY: 0,
    startMonitorWidth: 260,
    startBottomHeight: 280,
    startSftpRatio: 50,
    bottomWidth: 800,
  });

  // Refit terminal whenever session visibility or layout toggles change
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        window.dispatchEvent(new Event('terminal-refit'));
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, session.isMonitorOpen, session.isSftpOpen]);

  // Monitor drag start
  const handleMonitorDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startMonitorWidth: monitorWidth,
      startBottomHeight: bottomHeight,
      startSftpRatio: sftpRatio,
      bottomWidth: bottomRef.current?.getBoundingClientRect().width || 800,
    };
    setActiveDrag('monitor');
  };

  // Bottom height drag start
  const handleBottomDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startMonitorWidth: monitorWidth,
      startBottomHeight: bottomHeight,
      startSftpRatio: sftpRatio,
      bottomWidth: bottomRef.current?.getBoundingClientRect().width || 800,
    };
    setActiveDrag('bottom');
  };

  // SFTP vs Snippets ratio drag start
  const handleSftpRatioDragStart = (e: React.PointerEvent) => {
    e.preventDefault();
    const bottomRect = bottomRef.current?.getBoundingClientRect();
    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startMonitorWidth: monitorWidth,
      startBottomHeight: bottomHeight,
      startSftpRatio: sftpRatio,
      bottomWidth: bottomRect?.width || 800,
    };
    setActiveDrag('sftp');
  };

  // Handle pointer move and pointer up globally while dragging
  useEffect(() => {
    if (!activeDrag) return;

    const handlePointerMove = (e: PointerEvent) => {
      if (activeDrag === 'monitor') {
        const deltaX = e.clientX - dragStartRef.current.startX;
        const newWidth = Math.max(160, Math.min(500, dragStartRef.current.startMonitorWidth + deltaX));
        setMonitorWidth(newWidth);
      } else if (activeDrag === 'bottom') {
        // Dragging upward increases bottom height
        const deltaY = dragStartRef.current.startY - e.clientY;
        const maxH = window.innerHeight - 180;
        const newHeight = Math.max(120, Math.min(maxH, dragStartRef.current.startBottomHeight + deltaY));
        setBottomHeight(newHeight);
      } else if (activeDrag === 'sftp') {
        if (bottomRef.current) {
          const rect = bottomRef.current.getBoundingClientRect();
          const currentX = e.clientX - rect.left;
          const ratio = Math.max(20, Math.min(80, Math.round((currentX / rect.width) * 100)));
          setSftpRatio(ratio);
        }
      }
    };

    const handlePointerUp = () => {
      if (activeDrag === 'monitor') {
        localStorage.setItem('fs_layout_monitor_width', String(monitorWidth));
      } else if (activeDrag === 'bottom') {
        localStorage.setItem('fs_layout_bottom_height', String(bottomHeight));
      } else if (activeDrag === 'sftp') {
        localStorage.setItem('fs_layout_sftp_ratio', String(sftpRatio));
      }
      setActiveDrag(null);
      // Trigger terminal and layout refit
      window.dispatchEvent(new Event('terminal-refit'));
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [activeDrag, monitorWidth, bottomHeight, sftpRatio]);

  return (
    <div ref={containerRef} className="flex flex-1 h-full w-full overflow-hidden relative select-none">
      {/* Invisible global capture overlay while dragging to prevent iframe/canvas event hijacking */}
      {activeDrag && (
        <div
          className={`fixed inset-0 z-50 select-none ${
            activeDrag === 'bottom' ? 'cursor-row-resize' : 'cursor-col-resize'
          }`}
        />
      )}

      {/* ===================== DESKTOP LAYOUT (lg:flex) ===================== */}
      <div className="hidden lg:flex flex-1 h-full w-full overflow-hidden">
        {/* 1. Left: Real-time Monitor Panel */}
        {session.isMonitorOpen && (
          <>
            <div
              style={{ width: `${monitorWidth}px` }}
              className="h-full shrink-0 overflow-hidden bg-fs-surface"
            >
              <MonitorPanel metrics={session.metrics} className="h-full w-full" />
            </div>

            {/* Monitor Vertical Drag Resizer */}
            <div
              onPointerDown={handleMonitorDragStart}
              title="按住左右拖动调整监控面板宽度"
              className="group relative w-1 hover:w-1.5 bg-fs-border hover:bg-fs-primary cursor-col-resize shrink-0 transition-all z-20 flex items-center justify-center"
            >
              <div className="w-0.5 h-6 rounded-full bg-fs-textMuted/40 group-hover:bg-white transition-colors" />
            </div>
          </>
        )}

        {/* 2. Center Column: Terminal on Top, SFTP + Snippets on Bottom */}
        <div className="flex flex-1 flex-col h-full min-w-0 overflow-hidden">
          {/* Top: Terminal & Log Area */}
          <div className="flex flex-1 h-full min-h-0 w-full overflow-hidden relative bg-fs-bg">
            <TerminalTab session={session} />
          </div>

          {/* Bottom Container: SFTP and Snippets */}
          {session.isSftpOpen && (
            <>
              {/* Horizontal Drag Resizer between Terminal and Bottom Panel */}
              <div
                onPointerDown={handleBottomDragStart}
                title="按住上下拖动调整下方面板高度"
                className="group relative h-1 hover:h-1.5 bg-fs-border hover:bg-fs-primary cursor-row-resize shrink-0 transition-all z-20 flex items-center justify-center"
              >
                <div className="h-0.5 w-10 rounded-full bg-fs-textMuted/40 group-hover:bg-white transition-colors" />
              </div>

              {/* Bottom Split Container */}
              <div
                ref={bottomRef}
                style={{ height: `${bottomHeight}px` }}
                className="flex w-full shrink-0 overflow-hidden bg-fs-surface"
              >
                {/* Left Half: SFTP File Panel */}
                <div
                  style={{ width: `${sftpRatio}%` }}
                  className="h-full shrink-0 overflow-hidden border-r border-fs-border"
                >
                  <SftpPanel session={session} className="h-full w-full" />
                </div>

                {/* Vertical Drag Resizer between SFTP and Snippets */}
                <div
                  onPointerDown={handleSftpRatioDragStart}
                  title="按住左右拖动调整 SFTP 与快捷命令面板占比"
                  className="group relative w-1 hover:w-1.5 bg-fs-border hover:bg-fs-primary cursor-col-resize shrink-0 transition-all z-20 flex items-center justify-center"
                >
                  <div className="w-0.5 h-6 rounded-full bg-fs-textMuted/40 group-hover:bg-white transition-colors" />
                </div>

                {/* Right Half: Snippets Quick Command Panel */}
                <div
                  style={{ width: `${100 - sftpRatio}%` }}
                  className="flex-1 h-full min-w-0 overflow-hidden bg-fs-surface"
                >
                  <SnippetsPanel session={session} className="h-full w-full" />
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ===================== MOBILE LAYOUT (lg:hidden) ===================== */}
      <div className="flex lg:hidden flex-1 flex-col h-full w-full overflow-hidden">
        {/* Mobile View Switcher Tab Bar */}
        <div className="flex h-9 items-center justify-around border-b border-fs-border bg-fs-surface px-1 text-xs shrink-0">
          <button
            onClick={() => setMobileActiveView('terminal')}
            className={`flex items-center space-x-1 py-1 px-2.5 rounded-lg transition-colors ${
              mobileActiveView === 'terminal'
                ? 'bg-fs-primary text-white font-medium'
                : 'text-fs-textMuted hover:text-fs-text'
            }`}
          >
            <Terminal className="w-3.5 h-3.5" />
            <span>终端</span>
          </button>

          <button
            onClick={() => setMobileActiveView('monitor')}
            className={`flex items-center space-x-1 py-1 px-2.5 rounded-lg transition-colors ${
              mobileActiveView === 'monitor'
                ? 'bg-fs-primary text-white font-medium'
                : 'text-fs-textMuted hover:text-fs-text'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>监控</span>
          </button>

          <button
            onClick={() => setMobileActiveView('sftp')}
            className={`flex items-center space-x-1 py-1 px-2.5 rounded-lg transition-colors ${
              mobileActiveView === 'sftp'
                ? 'bg-fs-primary text-white font-medium'
                : 'text-fs-textMuted hover:text-fs-text'
            }`}
          >
            <FolderOpen className="w-3.5 h-3.5" />
            <span>SFTP</span>
          </button>

          <button
            onClick={() => setMobileActiveView('snippets')}
            className={`flex items-center space-x-1 py-1 px-2.5 rounded-lg transition-colors ${
              mobileActiveView === 'snippets'
                ? 'bg-fs-primary text-white font-medium'
                : 'text-fs-textMuted hover:text-fs-text'
            }`}
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>快捷命令</span>
          </button>
        </div>

        {/* Mobile Panels Container (TerminalTab kept alive in DOM) */}
        <div className="flex-1 w-full overflow-hidden relative">
          {/* Terminal View */}
          <div
            className={`h-full w-full ${
              mobileActiveView === 'terminal' ? 'flex flex-col' : 'hidden'
            }`}
          >
            <TerminalTab session={session} />
            <MobileKeyBar />
          </div>

          {/* Monitor View */}
          {mobileActiveView === 'monitor' && (
            <div className="h-full w-full overflow-hidden">
              <MonitorPanel metrics={session.metrics} className="h-full w-full" />
            </div>
          )}

          {/* SFTP View */}
          {mobileActiveView === 'sftp' && (
            <div className="h-full w-full overflow-hidden">
              <SftpPanel session={session} className="h-full w-full" />
            </div>
          )}

          {/* Snippets View */}
          {mobileActiveView === 'snippets' && (
            <div className="h-full w-full overflow-hidden">
              <SnippetsPanel session={session} className="h-full w-full" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
