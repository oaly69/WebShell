import React, { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { TerminalSession } from '../../store/useSessionStore';
import { useSessionStore } from '../../store/useSessionStore';
import { encodePtyData, encodeControlMsg } from '@shared/ws-protocol';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface TerminalTabProps {
  session: TerminalSession;
}

export const TerminalTab: React.FC<TerminalTabProps> = ({ session }) => {
  const { closeSession, openSession } = useSessionStore();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    // Initialize Xterm
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 13,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: {
        background: '#181a1f',
        foreground: '#abb2bf',
        cursor: '#528bff',
        selectionBackground: '#3e4451',
        black: '#1e2127',
        red: '#e06c75',
        green: '#98c379',
        yellow: '#d19a66',
        blue: '#61afef',
        magenta: '#c678dd',
        cyan: '#56b6c2',
        white: '#abb2bf',
        brightBlack: '#5c6370',
        brightRed: '#e06c75',
        brightGreen: '#98c379',
        brightYellow: '#d19a66',
        brightBlue: '#61afef',
        brightMagenta: '#c678dd',
        brightCyan: '#56b6c2',
        brightWhite: '#ffffff',
      },
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(containerRef.current);

    // Fit safely after layout paint
    requestAnimationFrame(() => {
      try {
        fitAddon.fit();
      } catch {}
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;

    // Send user keystrokes to WebSocket
    const onDataDisposable = term.onData((data) => {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(encodePtyData(data));
      }
    });

    // Handle Resize
    const handleResize = () => {
      if (!fitAddonRef.current || !termRef.current) return;
      try {
        fitAddonRef.current.fit();
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;

        if (session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(encodeControlMsg({ type: 'resize', cols, rows }));
        }
      } catch {}
    };

    window.addEventListener('resize', handleResize);

    // Register incoming PTY callback
    const onPtyData = (data: Uint8Array) => {
      if (termRef.current) {
        try {
          termRef.current.write(data);
        } catch {}
      }
    };
    session.onPtyDataCallbacks.add(onPtyData);

    return () => {
      window.removeEventListener('resize', handleResize);
      onDataDisposable.dispose();
      session.onPtyDataCallbacks.delete(onPtyData);
      try {
        term.dispose();
      } catch {}
      termRef.current = null;
      fitAddonRef.current = null;
    };
  }, [session.sessionId]);

  // Sync terminal dimensions once SSH connection is established
  useEffect(() => {
    if (session.status === 'connected' && fitAddonRef.current && termRef.current) {
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          const cols = termRef.current?.cols || 80;
          const rows = termRef.current?.rows || 24;
          if (session.ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(encodeControlMsg({ type: 'resize', cols, rows }));
          }
          termRef.current?.focus();
        } catch {}
      });
    }
  }, [session.status]);

  const handleReconnect = () => {
    const hostToReconnect = session.host;
    closeSession(session.sessionId);
    openSession(hostToReconnect);
  };

  return (
    <div className="relative flex-1 h-full w-full bg-fs-bg overflow-hidden">
      <div ref={containerRef} className="h-full w-full p-2" />

      {/* Disconnected / Error Overlay */}
      {session.status !== 'connected' && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-xs text-white px-4 text-center">
          {session.status === 'connecting' ? (
            <div className="flex items-center space-x-2 text-sm text-fs-info">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>正在连接 {session.host.hostname}:{session.host.port}...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center max-w-lg space-y-3.5 text-sm bg-fs-surface/95 border border-fs-border/80 p-5 rounded-2xl shadow-2xl">
              <div className="flex items-start space-x-3 text-left">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-fs-danger" />
                <div className="flex flex-col space-y-1">
                  <span className="font-semibold text-white">连接未建立或已中断</span>
                  <p className="text-xs text-fs-text whitespace-pre-wrap leading-relaxed">
                    {session.errorMessage || '会话已结束'}
                  </p>
                </div>
              </div>
              <button
                onClick={handleReconnect}
                className="flex items-center space-x-1.5 rounded-lg bg-fs-primary hover:bg-fs-primaryHover px-4 py-2 text-xs font-medium text-white transition-colors shadow"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>重新连接</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

