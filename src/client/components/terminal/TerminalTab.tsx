import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import '@xterm/xterm/css/xterm.css';
import type { TerminalSession } from '../../store/useSessionStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useThemeStore } from '../../store/useThemeStore';
import { encodePtyData, encodeControlMsg } from '@shared/ws-protocol';
import {
  RefreshCw,
  AlertCircle,
  Eraser,
  Zap,
  Copy,
  ClipboardPaste,
  Search,
  Settings,
  ArrowDown,
  Maximize2,
  Minimize2,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Radio,
} from 'lucide-react';

interface TerminalTabProps {
  session: TerminalSession;
}

const getXtermTheme = (mode: 'dark' | 'light') => {
  if (mode === 'light') {
    return {
      background: '#ffffff',
      foreground: '#24292e',
      cursor: '#2563eb',
      selectionBackground: '#c8e1ff',
      black: '#24292e',
      red: '#cf222e',
      green: '#116329',
      yellow: '#b08800',
      blue: '#0969da',
      magenta: '#8250df',
      cyan: '#1b7c83',
      white: '#6e7781',
      brightBlack: '#57606a',
      brightRed: '#a40e26',
      brightGreen: '#1a7f37',
      brightYellow: '#633c01',
      brightBlue: '#0550ae',
      brightMagenta: '#6639ba',
      brightCyan: '#3192aa',
      brightWhite: '#24292e',
    };
  }
  return {
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
  };
};

export const TerminalTab: React.FC<TerminalTabProps> = ({ session }) => {
  const {
    closeSession,
    openSession,
    disconnectSession,
    reconnectSession,
    toggleSftp,
    isBroadcastMode,
    setBroadcastMode,
  } = useSessionStore();
  const { theme } = useThemeStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const cmdInputRef = useRef<HTMLInputElement>(null);

  // Command Bar & Action States
  const [cmdInput, setCmdInput] = useState('');
  const [history, setHistory] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('fs_cmd_history') || '[]');
    } catch {
      return [];
    }
  });
  const [historyIndex, setHistoryIndex] = useState(-1);

  // Tool Menus
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isOptionsOpen, setIsOptionsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedTip, setCopiedTip] = useState(false);

  // Options
  const [autoEnter, setAutoEnter] = useState(() => localStorage.getItem('fs_opt_auto_enter') !== 'false');
  const [clearAfterSend, setClearAfterSend] = useState(() => localStorage.getItem('fs_opt_clear_send') !== 'false');
  const [fontSize, setFontSize] = useState<number>(() => {
    const s = localStorage.getItem('fs_terminal_fontsize');
    return s ? parseInt(s, 10) : 13;
  });

  useEffect(() => {
    if (!containerRef.current) return;
    containerRef.current.innerHTML = '';

    // Initialize Xterm
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize,
      fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
      theme: getXtermTheme(theme),
      scrollback: 10000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon();
    term.loadAddon(searchAddon);

    term.open(containerRef.current);

    // Replay any existing pty logs for this session so history is never lost
    if (session.ptyLogs && session.ptyLogs.length > 0) {
      for (const chunk of session.ptyLogs) {
        try {
          term.write(chunk);
        } catch {}
      }
    }

    // Fit safely after layout paint
    requestAnimationFrame(() => {
      try {
        const el = containerRef.current;
        if (!el || el.offsetParent === null || el.clientWidth < 80 || el.clientHeight < 40) return;
        fitAddon.fit();
        const cols = term.cols;
        const rows = term.rows;
        if (cols >= 20 && rows >= 4 && session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(encodeControlMsg({ type: 'resize', cols, rows }));
        }
      } catch {}
    });

    termRef.current = term;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;
    session.term = term;
    session.fitAddon = fitAddon;

    // Handle Resize / Refit with strict visibility and dimension guards
    const handleRefit = () => {
      if (!fitAddonRef.current || !termRef.current || !containerRef.current) return;
      const el = containerRef.current;
      if (el.offsetParent === null || el.clientWidth < 80 || el.clientHeight < 40) {
        return;
      }
      try {
        fitAddonRef.current.fit();
        const cols = termRef.current.cols;
        const rows = termRef.current.rows;
        if (cols >= 20 && rows >= 4 && session.ws && session.ws.readyState === WebSocket.OPEN) {
          session.ws.send(encodeControlMsg({ type: 'resize', cols, rows }));
        }
      } catch {}
    };

    window.addEventListener('resize', handleRefit);
    window.addEventListener('terminal-refit', handleRefit);

    // Register incoming PTY callback
    const onPtyData = (data: Uint8Array) => {
      if (termRef.current) {
        try {
          termRef.current.write(data);
        } catch {}
      }
    };
    session.onPtyDataCallbacks.add(onPtyData);

    // User input directly in terminal canvas
    const onDataDisposable = term.onData((data) => {
      if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        const payload = new TextEncoder().encode(data);
        const frame = encodePtyData(payload);
        session.ws.send(frame);
      }
    });

    return () => {
      window.removeEventListener('resize', handleRefit);
      window.removeEventListener('terminal-refit', handleRefit);
      onDataDisposable.dispose();
      session.onPtyDataCallbacks.delete(onPtyData);
      try {
        term.dispose();
      } catch {}
      termRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
    };
  }, [session.sessionId]);

  // Sync theme changes to xterm dynamically
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = getXtermTheme(theme);
    }
  }, [theme]);

  // Sync font size changes
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      localStorage.setItem('fs_terminal_fontsize', String(fontSize));
      fitAddonRef.current?.fit();
    }
  }, [fontSize]);

  // Sync terminal dimensions once SSH connection is established
  useEffect(() => {
    if (session.status === 'connected' && fitAddonRef.current && termRef.current && containerRef.current) {
      const el = containerRef.current;
      if (el.offsetParent === null || el.clientWidth < 80 || el.clientHeight < 40) return;
      requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          const cols = termRef.current?.cols || 80;
          const rows = termRef.current?.rows || 24;
          if (cols >= 20 && rows >= 4 && session.ws && session.ws.readyState === WebSocket.OPEN) {
            session.ws.send(encodeControlMsg({ type: 'resize', cols, rows }));
          }
          termRef.current?.focus();
        } catch {}
      });
    }
  }, [session.status]);

  const handleReconnect = () => {
    reconnectSession(session.sessionId);
  };

  const handleToggleConnection = () => {
    if (session.status === 'connected' || session.status === 'connecting') {
      disconnectSession(session.sessionId);
    } else {
      reconnectSession(session.sessionId);
    }
  };

  // Send Command from bottom input bar
  const handleSendCommand = (textToSend?: string) => {
    const text = (textToSend !== undefined ? textToSend : cmdInput).trim();
    if (!text) return;

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      const full = autoEnter ? `${text}\r` : text;
      const frame = encodePtyData(new TextEncoder().encode(full));
      session.ws.send(frame);
    }

    // Save to history
    const nextHistory = [text, ...history.filter((h) => h !== text)].slice(0, 50);
    setHistory(nextHistory);
    localStorage.setItem('fs_cmd_history', JSON.stringify(nextHistory));
    setHistoryIndex(-1);

    if (clearAfterSend) {
      setCmdInput('');
    }
  };

  // Keyboard navigation for bottom input
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSendCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = Math.min(history.length - 1, historyIndex + 1);
        setHistoryIndex(nextIdx);
        setCmdInput(history[nextIdx]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const nextIdx = historyIndex - 1;
        setHistoryIndex(nextIdx);
        setCmdInput(history[nextIdx]);
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setCmdInput('');
      }
    } else if (e.key === 'Escape') {
      cmdInputRef.current?.blur();
      setIsHistoryOpen(false);
      setIsOptionsOpen(false);
      setIsSettingsOpen(false);
    }
  };

  // Copy selected terminal text
  const handleCopy = () => {
    const sel = termRef.current?.getSelection() || cmdInput;
    if (sel) {
      navigator.clipboard.writeText(sel).then(() => {
        setCopiedTip(true);
        setTimeout(() => setCopiedTip(false), 1500);
      });
    }
  };

  // Paste from clipboard
  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(encodePtyData(new TextEncoder().encode(text)));
      }
    } catch {}
  };

  // Search Next / Prev
  const handleSearch = (direction: 'next' | 'prev') => {
    if (!searchQuery || !searchAddonRef.current) return;
    if (direction === 'next') {
      searchAddonRef.current.findNext(searchQuery);
    } else {
      searchAddonRef.current.findPrevious(searchQuery);
    }
  };

  return (
    <div className="relative flex-1 flex flex-col h-full w-full bg-fs-bg overflow-hidden select-none">
      {/* 1. FinalShell Style Sub-Header Strip */}
      <div className="flex h-7 items-center justify-between border-b border-fs-border bg-fs-surface/80 px-3 text-[11px] text-fs-textMuted shrink-0 z-10">
        <div className="flex items-center space-x-2 truncate">
          <div
            className={`w-2 h-2 rounded-full shrink-0 ${
              session.status === 'connected'
                ? 'bg-fs-accent'
                : session.status === 'connecting'
                ? 'bg-fs-warning animate-pulse'
                : 'bg-fs-danger'
            }`}
          />
          <span className="font-mono text-fs-text truncate font-medium">
            {session.host.username}@{session.host.hostname}:{session.host.port}
          </span>
          <span className="rounded bg-fs-hover px-1.5 py-0.5 text-[10px] text-fs-textMuted border border-fs-border/60">
            UTF-8
          </span>
          {isBroadcastMode && (
            <span className="flex items-center space-x-1 rounded bg-fs-danger/15 text-fs-danger px-1.5 py-0.5 text-[10px] font-medium border border-fs-danger/30">
              <Radio className="w-2.5 h-2.5 animate-pulse" />
              <span>广播中</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            onClick={() => termRef.current?.clear()}
            title="清空当前终端屏幕"
            className="flex items-center space-x-1 rounded px-2 py-0.5 hover:bg-fs-hover text-fs-textMuted hover:text-fs-text transition-colors"
          >
            <Eraser className="w-3 h-3" />
            <span>清屏</span>
          </button>
        </div>
      </div>

      {/* Floating Search Bar (if search is opened) */}
      {isSearchOpen && (
        <div className="absolute top-9 right-4 z-30 flex items-center space-x-1.5 rounded-xl border border-fs-border bg-fs-surface/95 backdrop-blur-md p-1.5 shadow-xl text-xs">
          <input
            type="text"
            autoFocus
            placeholder="搜索终端内容..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              searchAddonRef.current?.findNext(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch(e.shiftKey ? 'prev' : 'next');
              if (e.key === 'Escape') {
                searchAddonRef.current?.clearDecorations();
                setIsSearchOpen(false);
              }
            }}
            className="rounded-lg bg-fs-bg border border-fs-border px-2.5 py-1 text-xs text-fs-text placeholder-fs-textMuted focus:outline-none focus:border-fs-primary w-44"
          />
          <button
            onClick={() => handleSearch('prev')}
            title="上一个 (Shift+Enter)"
            className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-text"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => handleSearch('next')}
            title="下一个 (Enter)"
            className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-text"
          >
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => {
              searchAddonRef.current?.clearDecorations();
              setIsSearchOpen(false);
            }}
            title="关闭搜索 (Esc)"
            className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-text"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 2. Terminal Canvas Container */}
      <div className="relative flex-1 h-full w-full overflow-hidden">
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
              <div className="flex flex-col items-center max-w-lg space-y-3.5 text-sm bg-fs-surface/95 border border-fs-border/80 p-5 rounded-2xl shadow-2xl text-fs-text">
                <div className="flex items-start space-x-3 text-left">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-fs-danger" />
                  <div className="flex flex-col space-y-1">
                    <span className="font-semibold text-fs-text">连接未建立或已中断</span>
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

      {/* 3. FinalShell Signature Bottom Action / Command Bar (图2 复刻条) */}
      <div className="relative flex h-8 items-center border-t border-fs-border bg-fs-surface px-2 text-xs shrink-0 select-none z-20">
        {/* Left Command Input Field */}
        <div className="relative flex-1 mr-2 flex items-center">
          <input
            ref={cmdInputRef}
            type="text"
            value={cmdInput}
            onChange={(e) => setCmdInput(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder="命令输入 ( 双击Ctrl切换,Alt历史,Tab路径/命令,Esc关闭窗口 )"
            className="w-full rounded-md bg-fs-bg/80 border border-fs-border/80 hover:border-fs-border focus:border-fs-primary px-2.5 py-1 text-xs text-fs-text placeholder-fs-textMuted/60 focus:outline-none transition-colors font-mono"
          />
        </div>

        {/* Right Toolbar Buttons */}
        <div className="flex items-center space-x-1 text-fs-textMuted">
          {/* History Button */}
          <div className="relative">
            <button
              onClick={() => {
                setIsHistoryOpen(!isHistoryOpen);
                setIsOptionsOpen(false);
                setIsSettingsOpen(false);
              }}
              title="查看执行历史"
              className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-colors ${
                isHistoryOpen
                  ? 'bg-fs-primary text-white border-fs-primary'
                  : 'bg-fs-bg/60 border-fs-border hover:bg-fs-hover hover:text-fs-text'
              }`}
            >
              历史
            </button>
            {isHistoryOpen && (
              <div className="absolute bottom-8 right-0 w-64 max-h-56 overflow-y-auto rounded-xl border border-fs-border bg-fs-surface shadow-2xl p-1.5 text-xs z-30">
                <div className="flex items-center justify-between border-b border-fs-border pb-1 px-1 mb-1 text-[10px] text-fs-textMuted">
                  <span>最近命令 ({history.length})</span>
                  <button
                    onClick={() => {
                      setHistory([]);
                      localStorage.removeItem('fs_cmd_history');
                    }}
                    className="hover:text-fs-danger"
                  >
                    清空
                  </button>
                </div>
                {history.length === 0 ? (
                  <div className="text-center py-4 text-fs-textMuted text-[11px]">暂无命令历史</div>
                ) : (
                  history.map((cmd, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        handleSendCommand(cmd);
                        setIsHistoryOpen(false);
                      }}
                      className="truncate px-2 py-1 rounded hover:bg-fs-hover cursor-pointer font-mono text-[11px] text-fs-text"
                      title={cmd}
                    >
                      {cmd}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Options Button */}
          <div className="relative">
            <button
              onClick={() => {
                setIsOptionsOpen(!isOptionsOpen);
                setIsHistoryOpen(false);
                setIsSettingsOpen(false);
              }}
              title="命令输入选项"
              className={`px-2 py-0.5 rounded border text-[11px] font-medium transition-colors ${
                isOptionsOpen
                  ? 'bg-fs-primary text-white border-fs-primary'
                  : 'bg-fs-bg/60 border-fs-border hover:bg-fs-hover hover:text-fs-text'
              }`}
            >
              选项
            </button>
            {isOptionsOpen && (
              <div className="absolute bottom-8 right-0 w-48 rounded-xl border border-fs-border bg-fs-surface shadow-2xl p-2 text-xs z-30 space-y-1.5">
                <label className="flex items-center space-x-2 cursor-pointer text-fs-text hover:text-fs-primary">
                  <input
                    type="checkbox"
                    checked={autoEnter}
                    onChange={(e) => {
                      setAutoEnter(e.target.checked);
                      localStorage.setItem('fs_opt_auto_enter', String(e.target.checked));
                    }}
                    className="rounded text-fs-primary"
                  />
                  <span>发送后自动回车</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer text-fs-text hover:text-fs-primary">
                  <input
                    type="checkbox"
                    checked={clearAfterSend}
                    onChange={(e) => {
                      setClearAfterSend(e.target.checked);
                      localStorage.setItem('fs_opt_clear_send', String(e.target.checked));
                    }}
                    className="rounded text-fs-primary"
                  />
                  <span>发送后清空输入框</span>
                </label>
                <div className="border-t border-fs-border pt-1">
                  <label className="flex items-center space-x-2 cursor-pointer text-fs-text hover:text-fs-primary">
                    <input
                      type="checkbox"
                      checked={isBroadcastMode}
                      onChange={(e) => setBroadcastMode(e.target.checked)}
                      className="rounded text-fs-danger"
                    />
                    <span className="text-fs-danger">广播到所有终端</span>
                  </label>
                </div>
                <div className="border-t border-fs-border pt-1">
                  <div className="text-[10px] text-fs-textMuted mb-1">终端字号</div>
                  <div className="flex items-center space-x-1">
                    {[12, 13, 14, 16].map((s) => (
                      <button
                        key={s}
                        onClick={() => setFontSize(s)}
                        className={`flex-1 py-0.5 rounded text-center font-mono ${
                          fontSize === s ? 'bg-fs-primary text-white font-bold' : 'bg-fs-bg text-fs-text hover:bg-fs-hover'
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Lightning: Connect / Disconnect */}
          <button
            onClick={handleToggleConnection}
            title={
              session.status === 'connected'
                ? '断开服务器连接'
                : session.status === 'connecting'
                ? '正在连接中 (点击断开)'
                : '连接 / 重新连接服务器'
            }
            className={`p-1 rounded hover:bg-fs-hover transition-colors ${
              session.status === 'connected'
                ? 'text-fs-warning hover:text-fs-danger'
                : session.status === 'connecting'
                ? 'text-fs-info animate-pulse'
                : 'text-fs-textMuted hover:text-fs-accent'
            }`}
          >
            <Zap
              className={`w-3.5 h-3.5 ${
                session.status === 'connected' ? 'fill-fs-warning/20' : ''
              }`}
            />
          </button>

          {/* Copy Selected */}
          <button
            onClick={handleCopy}
            title={copiedTip ? '已复制！' : '复制选中文本'}
            className="p-1 rounded hover:bg-fs-hover hover:text-fs-text transition-colors relative"
          >
            {copiedTip ? <Check className="w-3.5 h-3.5 text-fs-accent" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Paste */}
          <button
            onClick={handlePaste}
            title="从剪贴板粘贴到终端"
            className="p-1 rounded hover:bg-fs-hover hover:text-fs-text transition-colors"
          >
            <ClipboardPaste className="w-3.5 h-3.5" />
          </button>

          {/* Search in Buffer */}
          <button
            onClick={() => {
              setIsSearchOpen(!isSearchOpen);
            }}
            title="在终端中查找"
            className={`p-1 rounded hover:bg-fs-hover hover:text-fs-text transition-colors ${
              isSearchOpen ? 'text-fs-primary bg-fs-primary/10' : ''
            }`}
          >
            <Search className="w-3.5 h-3.5" />
          </button>

          {/* Server Connection Properties / Edit */}
          <button
            onClick={() => {
              window.dispatchEvent(new CustomEvent('open-edit-host', { detail: session.host }));
            }}
            title="编辑服务器连接信息"
            className="p-1 rounded hover:bg-fs-hover hover:text-fs-text transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
          </button>

          {/* Scroll to Bottom */}
          <button
            onClick={() => termRef.current?.scrollToBottom()}
            title="滚动到底部"
            className="p-1 rounded hover:bg-fs-hover hover:text-fs-text transition-colors"
          >
            <ArrowDown className="w-3.5 h-3.5" />
          </button>

          {/* Toggle Maximize (Collapse/Expand SFTP Bottom Panel) */}
          <button
            onClick={() => {
              toggleSftp(session.sessionId);
              setTimeout(() => {
                fitAddonRef.current?.fit();
              }, 50);
            }}
            title={session.isSftpOpen ? '最大化终端 (隐藏下方面板)' : '还原下方面板'}
            className="p-1 rounded hover:bg-fs-hover hover:text-fs-text transition-colors"
          >
            {session.isSftpOpen ? <Maximize2 className="w-3.5 h-3.5" /> : <Minimize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>
    </div>
  );
};
