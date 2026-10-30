import { create } from 'zustand';
import { useAuthStore } from './useAuthStore';
import type { DecryptedHost, SystemMetrics, SftpEntry } from '@shared/types';
import {
  FrameType,
  parseIncomingFrame,
  encodeControlMsg,
  encodePtyData,
  type ServerControlMsg,
} from '@shared/ws-protocol';

export interface TerminalSession {
  sessionId: string;
  host: DecryptedHost;
  status: 'connecting' | 'connected' | 'disconnected' | 'error';
  errorMessage?: string;
  metrics: SystemMetrics | null;
  isMonitorOpen: boolean;
  isSftpOpen: boolean;
  sftpPath: string;
  sftpEntries: SftpEntry[];
  sftpLoading: boolean;
  sftpError?: string;
  ws: WebSocket | null;
  onPtyDataCallbacks: Set<(data: Uint8Array) => void>;
  onControlMsgCallbacks: Set<(msg: any) => void>;
  ptyLogs: Uint8Array[];
  term?: any;
  fitAddon?: any;
}

interface SessionStoreState {
  sessions: TerminalSession[];
  activeSessionId: string | null;
  activeTab: string; // 'overview' | sessionId
  isBroadcastMode: boolean;

  setBroadcastMode: (enabled: boolean) => void;
  openSession: (host: DecryptedHost) => void;
  closeSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string) => void;
  setActiveTab: (tab: string) => void;

  toggleMonitor: (sessionId: string) => void;
  toggleSftp: (sessionId: string) => void;

  sendInputToActive: (text: string, autoEnter?: boolean) => void;
  broadcastCommand: (text: string, autoEnter?: boolean) => void;

  sftpNavigate: (sessionId: string, path: string) => void;
  sftpRefresh: (sessionId: string) => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  activeTab: 'overview',
  isBroadcastMode: false,

  setBroadcastMode: (enabled) => set({ isBroadcastMode: enabled }),

  setActiveSession: (sessionId) => set({ activeSessionId: sessionId, activeTab: sessionId }),
  setActiveTab: (tab) => set({ activeTab: tab }),

  openSession: (host: DecryptedHost) => {
    const sessionId = crypto.randomUUID();
    const callbacks = new Set<(data: Uint8Array) => void>();
    const controlCallbacks = new Set<(msg: any) => void>();

    const { token } = useAuthStore.getState();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/ssh?sessionId=${sessionId}&token=${encodeURIComponent(token || '')}`;
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    const newSession: TerminalSession = {
      sessionId,
      host,
      status: 'connecting',
      metrics: null,
      isMonitorOpen: true,
      isSftpOpen: true,
      sftpPath: '/',
      sftpEntries: [],
      sftpLoading: false,
      ws,
      onPtyDataCallbacks: callbacks,
      onControlMsgCallbacks: controlCallbacks,
      ptyLogs: [],
    };

    ws.onopen = async () => {
      let creds = host.credentials;
      const { masterKey } = useAuthStore.getState();
      if ((!creds || (!creds.password && !creds.privateKey)) && masterKey && host.encrypted_cred) {
        try {
          const { decryptCredentials } = await import('../crypto/vault');
          creds = await decryptCredentials(masterKey, host.encrypted_cred);
        } catch (e) {
          console.error('Failed to decrypt host credentials on connect:', e);
        }
      }

      // Send connect handshake
      const handshake = encodeControlMsg({
        type: 'connect',
        hostId: host.id,
        hostname: host.hostname,
        port: host.port,
        username: host.username,
        authType: host.auth_type,
        password: creds?.password,
        privateKey: creds?.privateKey,
        passphrase: creds?.passphrase,
        cols: 80,
        rows: 24,
      });
      ws.send(handshake);

      // Enable monitoring by default
      const monitorReq = encodeControlMsg({
        type: 'monitor_toggle',
        enabled: true,
      });
      ws.send(monitorReq);
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const { type, rawPayload } = parseIncomingFrame(event.data);
        const { sessions } = get();
        const current = sessions.find((s) => s.sessionId === sessionId);
        if (!current) return;

        if (type === FrameType.PTY_DATA) {
          current.ptyLogs.push(rawPayload);
          if (current.ptyLogs.length > 3000) {
            current.ptyLogs.splice(0, current.ptyLogs.length - 2000);
          }
          for (const cb of current.onPtyDataCallbacks) {
            cb(rawPayload);
          }
        } else if (type === FrameType.MONITOR_JSON) {
          const jsonStr = new TextDecoder().decode(rawPayload);
          const metrics = JSON.parse(jsonStr) as SystemMetrics;
          set((state) => ({
            sessions: state.sessions.map((s) =>
              s.sessionId === sessionId ? { ...s, metrics } : s
            ),
          }));
        } else if (type === FrameType.CONTROL_JSON) {
          const jsonStr = new TextDecoder().decode(rawPayload);
          const msg = JSON.parse(jsonStr) as ServerControlMsg;

          for (const cb of current.onControlMsgCallbacks) {
            try {
              cb(msg);
            } catch (cbErr) {
              console.error('Control message callback error', cbErr);
            }
          }

          if (msg.type === 'status') {
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.sessionId === sessionId
                  ? { ...s, status: msg.state, errorMessage: msg.message }
                  : s
              ),
            }));

            if (msg.state === 'connected') {
              // Trigger initial SFTP home directory list via realpath('.')
              get().sftpNavigate(sessionId, '.');
            }
          } else if (msg.type === 'sftp_list_result') {
            set((state) => ({
              sessions: state.sessions.map((s) =>
                s.sessionId === sessionId
                  ? {
                      ...s,
                      sftpLoading: false,
                      sftpPath: msg.success ? msg.path : s.sftpPath,
                      sftpEntries: msg.success ? msg.entries || [] : s.sftpEntries,
                      sftpError: msg.success ? undefined : msg.error || '读取目录失败',
                    }
                  : s
              ),
            }));
          } else if (msg.type === 'sftp_op_result') {
            if (msg.success) {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.sessionId === sessionId ? { ...s, sftpError: undefined } : s
                ),
              }));
              get().sftpRefresh(sessionId);
            } else {
              set((state) => ({
                sessions: state.sessions.map((s) =>
                  s.sessionId === sessionId
                    ? { ...s, sftpError: msg.error || `SFTP ${msg.action} 操作失败` }
                    : s
                ),
              }));
            }
          }
        }
      } catch (err) {
        console.error('WebSocket frame error', err);
      }
    };

    ws.onclose = () => {
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionId === sessionId ? { ...s, status: 'disconnected' } : s
        ),
      }));
    };

    set((state) => ({
      sessions: [...state.sessions, newSession],
      activeSessionId: sessionId,
      activeTab: sessionId,
    }));
  },

  closeSession: (sessionId) => {
    const { sessions, activeSessionId } = get();
    const session = sessions.find((s) => s.sessionId === sessionId);
    if (session && session.ws) {
      session.ws.close();
    }

    const remaining = sessions.filter((s) => s.sessionId !== sessionId);
    let nextActive = activeSessionId;
    if (activeSessionId === sessionId) {
      nextActive = remaining.length > 0 ? remaining[remaining.length - 1].sessionId : null;
    }

    set({
      sessions: remaining,
      activeSessionId: nextActive,
      activeTab: nextActive || 'overview',
    });
  },

  toggleMonitor: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, isMonitorOpen: !s.isMonitorOpen } : s
      ),
    }));
  },

  toggleSftp: (sessionId) => {
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, isSftpOpen: !s.isSftpOpen } : s
      ),
    }));
  },

  sendInputToActive: (text, autoEnter = false) => {
    const { activeSessionId, sessions, broadcastCommand, isBroadcastMode } = get();
    if (isBroadcastMode) {
      broadcastCommand(text, autoEnter);
      return;
    }

    const current = sessions.find((s) => s.sessionId === activeSessionId);
    if (current && current.ws && current.ws.readyState === WebSocket.OPEN) {
      const payload = autoEnter ? `${text}\r` : text;
      current.ws.send(encodePtyData(payload));
    }
  },

  broadcastCommand: (text, autoEnter = false) => {
    const { sessions } = get();
    const payload = autoEnter ? `${text}\r` : text;
    const packet = encodePtyData(payload);

    for (const s of sessions) {
      if (s.ws && s.ws.readyState === WebSocket.OPEN) {
        s.ws.send(packet);
      }
    }
  },

  sftpNavigate: (sessionId, path) => {
    const { sessions } = get();
    const current = sessions.find((s) => s.sessionId === sessionId);
    if (!current || !current.ws || current.ws.readyState !== WebSocket.OPEN) return;

    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionId === sessionId ? { ...s, sftpLoading: true } : s
      ),
    }));

    const reqId = crypto.randomUUID();
    current.ws.send(
      encodeControlMsg({
        type: 'sftp_list',
        reqId,
        path,
      })
    );
  },

  sftpRefresh: (sessionId) => {
    const { sessions } = get();
    const current = sessions.find((s) => s.sessionId === sessionId);
    if (current) {
      get().sftpNavigate(sessionId, current.sftpPath || '/');
    }
  },
}));
