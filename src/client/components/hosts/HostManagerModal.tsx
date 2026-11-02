import React, { useState, useEffect } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import { useAuthStore } from '../../store/useAuthStore';
import type { DecryptedHost } from '@shared/types';
import { GroupManagerModal } from '../common/GroupManagerModal';
import { FinalShellImportModal } from './FinalShellImportModal';
import { decodeFinalShellPassword } from '../../crypto/finalshellDecoder';
import {
  Server,
  Plus,
  Trash2,
  Edit,
  Play,
  X,
  Search,
  ChevronRight,
  ChevronDown,
  Folder,
  FolderCog,
  AlertCircle,
  Loader2,
  Upload,
} from 'lucide-react';

interface HostManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialEditHost?: DecryptedHost | null;
}

export const HostManagerModal: React.FC<HostManagerModalProps> = ({
  isOpen,
  onClose,
  initialEditHost,
}) => {
  const {
    hosts,
    fetchHosts,
    saveHost,
    deleteHost,
    getHostGroups,
    addHostGroup,
    renameHostGroup,
    deleteHostGroup,
  } = useSyncStore();
  const { openSession } = useSessionStore();
  const { masterKey } = useAuthStore();

  const [search, setSearch] = useState('');
  const [editingHost, setEditingHost] = useState<DecryptedHost | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Group Management states
  const [isGroupManagerOpen, setIsGroupManagerOpen] = useState(false);
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
  const [newGroupInput, setNewGroupInput] = useState('');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchHosts();
      if (initialEditHost) {
        setEditingHost(initialEditHost);
        setIsFormOpen(true);
      }
    } else {
      setEditingHost(null);
      setIsFormOpen(false);
    }
  }, [isOpen, initialEditHost]);

  if (!isOpen) return null;

  const hostGroups = getHostGroups();

  interface GroupNode {
    name: string;
    fullPath: string;
    subGroups: Record<string, GroupNode>;
    hosts: DecryptedHost[];
  }

  const buildGroupTree = (): Record<string, GroupNode> => {
    const rootGroups: Record<string, GroupNode> = {};

    const getOrCreateNode = (fullPath: string): GroupNode => {
      const parts = fullPath.split('/').map((s) => s.trim()).filter(Boolean);
      if (parts.length === 0) parts.push('默认分组');

      let currentMap = rootGroups;
      let currentPath = '';
      let node: GroupNode | null = null;

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (!currentMap[part]) {
          currentMap[part] = {
            name: part,
            fullPath: currentPath,
            subGroups: {},
            hosts: [],
          };
        }
        node = currentMap[part];
        currentMap = node.subGroups;
      }

      return node!;
    };

    // Ensure all known groups exist in tree
    for (const grp of hostGroups) {
      if (grp) getOrCreateNode(grp);
    }
    getOrCreateNode('默认分组');

    // Populate hosts
    for (const host of hosts) {
      if (
        search &&
        !host.name.toLowerCase().includes(search.toLowerCase()) &&
        !host.hostname.includes(search) &&
        !host.username.toLowerCase().includes(search.toLowerCase())
      ) {
        continue;
      }
      const grp = host.group_name || '默认分组';
      const targetNode = getOrCreateNode(grp);
      targetNode.hosts.push(host);
    }

    return rootGroups;
  };

  const groupTree = buildGroupTree();

  const getNodeTotalHostCount = (node: GroupNode): number => {
    let count = node.hosts.length;
    for (const sub of Object.values(node.subGroups)) {
      count += getNodeTotalHostCount(sub);
    }
    return count;
  };

  const toggleGroup = (grp: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [grp]: !prev[grp] }));
  };

  const renderGroupNode = (node: GroupNode, depth: number = 0): React.ReactNode => {
    const isCollapsed = collapsedGroups[node.fullPath];
    const totalCount = getNodeTotalHostCount(node);
    const subGroupList = Object.values(node.subGroups);

    return (
      <div key={node.fullPath} className="select-none">
        <div
          onClick={() => toggleGroup(node.fullPath)}
          style={{ paddingLeft: `${6 + depth * 14}px` }}
          className="flex items-center space-x-1.5 py-1 text-xs font-medium text-fs-textMuted hover:text-fs-text cursor-pointer hover:bg-fs-hover/60 rounded"
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 shrink-0 text-fs-textMuted" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 shrink-0 text-fs-textMuted" />
          )}
          <Folder className="w-3.5 h-3.5 shrink-0 text-fs-warning" />
          <span className="truncate">{node.name}</span>
          <span className="text-[10px] text-fs-textMuted shrink-0">({totalCount})</span>
        </div>

        {!isCollapsed && (
          <div className="space-y-0.5 mt-0.5">
            {/* 1. Sub-groups first */}
            {subGroupList.map((sub) => renderGroupNode(sub, depth + 1))}

            {/* 2. Direct hosts under this group */}
            {node.hosts.map((host) => (
              <div
                key={host.id}
                style={{ paddingLeft: `${22 + depth * 14}px` }}
                onDoubleClick={() => handleConnect(host)}
                className="group flex items-center justify-between rounded p-1.5 text-xs hover:bg-fs-hover cursor-pointer"
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <div className="flex items-center space-x-1.5">
                    <span className="font-medium text-fs-text truncate">{host.name}</span>
                    {host.credentials?.connectionMode === 'cf_tunnel' && (
                      <span className="shrink-0 rounded bg-fs-warning/15 border border-fs-warning/30 px-1 py-0.2 text-[9px] text-fs-warning font-mono">
                        CF Tunnel
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-fs-textMuted truncate">
                    {host.username}@{host.hostname}:{host.port}
                  </span>
                </div>

                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                  <button
                    onClick={() => handleConnect(host)}
                    title="连接"
                    className="p-1 rounded hover:bg-fs-active text-fs-accent"
                  >
                    <Play className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => {
                      setEditingHost(host);
                      setIsFormOpen(true);
                    }}
                    title="编辑"
                    className="p-1 rounded hover:bg-fs-active text-fs-info"
                  >
                    <Edit className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteHost(host.id)}
                    title="删除"
                    className="p-1 rounded hover:bg-fs-active text-fs-danger"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const handleConnect = (host: DecryptedHost) => {
    openSession(host);
    onClose();
  };

  const handleSaveHost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingHost) return;
    setSaveError(null);

    if (!editingHost.name.trim()) {
      setSaveError('请输入主机显示名称');
      return;
    }
    if (!editingHost.hostname.trim()) {
      setSaveError('请输入主机名或 IP 地址');
      return;
    }
    if (!editingHost.username.trim()) {
      setSaveError('请输入 SSH 登录用户名');
      return;
    }

    let cleanHost = editingHost.hostname.trim();
    let cleanPort = editingHost.port || 22;
    let nextConnectionMode = editingHost.credentials.connectionMode || 'tcp';

    const tunnelPrefixMatch = cleanHost.match(/^(wss?|https?|cf|tunnel):\/\/(.+)$/i);
    if (tunnelPrefixMatch) {
      cleanHost = tunnelPrefixMatch[2].replace(/\/.*$/, '').trim();
      nextConnectionMode = 'cf_tunnel';
    }

    const bracketPortMatch = cleanHost.match(/^\[([a-fA-F0-9:]+)\]:(\d+)$/);
    if (bracketPortMatch) {
      cleanHost = bracketPortMatch[1];
      cleanPort = parseInt(bracketPortMatch[2], 10) || cleanPort;
    } else {
      const bracketMatch = cleanHost.match(/^\[([a-fA-F0-9:]+)\]$/);
      if (bracketMatch) {
        cleanHost = bracketMatch[1];
      } else {
        const colonCount = (cleanHost.match(/:/g) || []).length;
        if (colonCount === 1) {
          const portMatch = cleanHost.match(/^([a-zA-Z0-9.-]+):(\d+)$/);
          if (portMatch) {
            cleanHost = portMatch[1];
            cleanPort = parseInt(portMatch[2], 10) || cleanPort;
          }
        }
      }
    }
    cleanHost = cleanHost.replace(/^\[|\]$/g, '').trim();

    setIsSaving(true);
    try {
      await saveHost({
        ...editingHost,
        hostname: cleanHost,
        port: cleanPort,
        credentials: {
          ...editingHost.credentials,
          connectionMode: nextConnectionMode,
        },
      });
      setIsFormOpen(false);
      setEditingHost(null);
    } catch (err: any) {
      console.error('Save host error:', err);
      setSaveError(err.message || '保存主机连接失败，请检查网络或重新登录');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4">
      <div className="flex flex-col md:flex-row h-[90vh] sm:h-[560px] w-full max-w-4xl overflow-hidden rounded-2xl border border-fs-border bg-fs-surface shadow-2xl">
        {/* Left: Host Tree List */}
        <div className="flex w-full md:w-1/2 flex-col border-b md:border-b-0 md:border-r border-fs-border bg-fs-bg/60 h-1/2 md:h-full">
          <div className="flex items-center justify-between border-b border-fs-border p-3">
            <div className="flex items-center space-x-2 text-sm font-semibold text-fs-text">
              <Server className="w-4 h-4 text-fs-accent" />
              <span>所有服务器 ({hosts.length})</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                title="导入从 FinalShell 导出的服务器配置"
                className="flex items-center space-x-1 rounded-lg bg-fs-hover hover:bg-fs-active px-2 py-1 text-xs text-fs-accent hover:text-fs-text transition-colors"
              >
                <Upload className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">导入</span>
              </button>
              <button
                type="button"
                onClick={() => setIsGroupManagerOpen(true)}
                title="管理服务器分组"
                className="flex items-center space-x-1 rounded-lg bg-fs-hover hover:bg-fs-active px-2 py-1 text-xs text-fs-textMuted hover:text-fs-text transition-colors"
              >
                <FolderCog className="w-3.5 h-3.5 text-fs-warning" />
                <span className="hidden sm:inline">分组</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingHost({
                    id: '',
                    user_id: '',
                    name: '',
                    group_name: hostGroups[0] || '默认分组',
                    hostname: '',
                    port: 22,
                    username: 'root',
                    auth_type: 'password',
                    credentials: { password: '', connectionMode: 'tcp' },
                    sort_order: 0,
                    updated_at: Date.now(),
                  });
                  setIsCreatingNewGroup(false);
                  setIsFormOpen(true);
                }}
                className="flex items-center space-x-1 rounded-lg bg-fs-primary hover:bg-fs-primaryHover px-2.5 py-1 text-xs text-white transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新建主机</span>
              </button>
            </div>
          </div>

          <div className="p-2 border-b border-fs-border">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索主机名或 IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded bg-fs-surface border border-fs-border px-3 py-1.5 pl-8 text-xs text-fs-text placeholder-fs-textMuted focus:outline-none focus:border-fs-primary"
              />
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-fs-textMuted" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {Object.keys(groupTree).length === 0 ? (
              <div className="text-center py-12 text-xs text-fs-textMuted">暂无主机，请点击右上角新建</div>
            ) : (
              Object.values(groupTree).map((node) => renderGroupNode(node, 0))
            )}
          </div>
        </div>

        {/* Right: Add/Edit Host Form or Hint */}
        <div className="flex w-full md:w-1/2 flex-col bg-fs-surface h-1/2 md:h-full">
          <div className="flex items-center justify-between border-b border-fs-border p-3">
            <h3 className="text-sm font-semibold text-fs-text">
              {isFormOpen ? (editingHost?.id ? '编辑主机连接' : '新建主机连接') : '连接信息'}
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-fs-hover text-fs-textMuted">
              <X className="w-4 h-4" />
            </button>
          </div>

          {isFormOpen && editingHost ? (
            <form onSubmit={handleSaveHost} className="flex-1 overflow-y-auto p-4 space-y-3.5">
              {saveError && (
                <div className="flex items-start space-x-2 rounded-xl bg-fs-danger/10 border border-fs-danger/30 p-2.5 text-xs text-fs-danger">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{saveError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs text-fs-text mb-1">主机显示名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 生产环境主节点"
                  value={editingHost.name}
                  onChange={(e) => setEditingHost({ ...editingHost, name: e.target.value })}
                  className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-fs-text focus:outline-none focus:border-fs-primary"
                />
              </div>

              {/* Connection Mode Selector (Direct TCP vs CF Tunnel) */}
              <div>
                <label className="block text-xs text-fs-text mb-1">连接通道类型</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() =>
                      setEditingHost({
                        ...editingHost,
                        credentials: { ...editingHost.credentials, connectionMode: 'tcp' },
                      })
                    }
                    className={`rounded-lg border px-2.5 py-1.5 text-center font-medium transition-colors ${
                      (editingHost.credentials.connectionMode || 'tcp') === 'tcp'
                        ? 'border-fs-primary bg-fs-primary/15 text-fs-text'
                        : 'border-fs-border bg-fs-bg text-fs-textMuted hover:text-fs-text'
                    }`}
                  >
                    标准 TCP 直连 (公网/NAT)
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setEditingHost({
                        ...editingHost,
                        credentials: { ...editingHost.credentials, connectionMode: 'cf_tunnel' },
                      })
                    }
                    className={`rounded-lg border px-2.5 py-1.5 text-center font-medium transition-colors ${
                      editingHost.credentials.connectionMode === 'cf_tunnel'
                        ? 'border-fs-warning bg-fs-warning/15 text-fs-warning'
                        : 'border-fs-border bg-fs-bg text-fs-textMuted hover:text-fs-text'
                    }`}
                  >
                    CF Tunnel 内网穿透
                  </button>
                </div>
                {editingHost.credentials.connectionMode === 'cf_tunnel' && (
                  <p className="text-[11px] text-fs-textMuted mt-1 leading-relaxed">
                    适用于无公网 IP、通过 <code className="font-mono text-fs-warning">cloudflared</code> 暴露 <code className="font-mono">ssh://localhost:22</code> 的服务器，无需安装客户端即可通过 WebSocket 直连。
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-fs-text">所属分组</label>
                    <button
                      type="button"
                      onClick={() => setIsGroupManagerOpen(true)}
                      className="text-[10px] text-fs-accent hover:underline flex items-center space-x-0.5"
                    >
                      <FolderCog className="w-3 h-3 inline" />
                      <span>管理分组</span>
                    </button>
                  </div>
                  {!isCreatingNewGroup ? (
                    <div className="flex items-center space-x-1.5">
                      <select
                        value={editingHost.group_name || hostGroups[0] || '默认分组'}
                        onChange={(e) => setEditingHost({ ...editingHost, group_name: e.target.value })}
                        className="flex-1 rounded bg-fs-bg border border-fs-border px-2.5 py-1.5 text-xs text-fs-text focus:outline-none focus:border-fs-primary"
                      >
                        {hostGroups.map((grp) => (
                          <option key={grp} value={grp} className="bg-fs-surface text-fs-text">
                            {grp.replace(/\//g, ' / ')}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setIsCreatingNewGroup(true);
                          setNewGroupInput('');
                        }}
                        className="rounded bg-fs-hover hover:bg-fs-active px-2 py-1.5 text-xs text-fs-accent whitespace-nowrap"
                        title="创建新分组"
                      >
                        + 新建
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        autoFocus
                        placeholder="新分组名称"
                        value={newGroupInput}
                        onChange={(e) => setNewGroupInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (newGroupInput.trim()) {
                              addHostGroup(newGroupInput.trim());
                              setEditingHost({ ...editingHost, group_name: newGroupInput.trim() });
                              setIsCreatingNewGroup(false);
                            }
                          }
                        }}
                        className="flex-1 rounded bg-fs-bg border border-fs-border px-2.5 py-1.5 text-xs text-fs-text focus:outline-none focus:border-fs-primary"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (newGroupInput.trim()) {
                            addHostGroup(newGroupInput.trim());
                            setEditingHost({ ...editingHost, group_name: newGroupInput.trim() });
                          }
                          setIsCreatingNewGroup(false);
                        }}
                        className="rounded bg-fs-primary hover:bg-fs-primaryHover px-2 py-1.5 text-xs text-white whitespace-nowrap"
                      >
                        确定
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsCreatingNewGroup(false)}
                        className="rounded bg-fs-hover hover:bg-fs-active px-1.5 py-1.5 text-xs text-fs-textMuted"
                        title="取消"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-fs-text mb-1">
                    {editingHost.credentials.connectionMode === 'cf_tunnel' ? '隧道端口 (默认 443/22)' : 'SSH 端口'}
                  </label>
                  <input
                    type="number"
                    value={editingHost.port}
                    onChange={(e) => setEditingHost({ ...editingHost, port: parseInt(e.target.value, 10) || 22 })}
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-fs-text focus:outline-none focus:border-fs-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-fs-text mb-1">
                    {editingHost.credentials.connectionMode === 'cf_tunnel' ? 'CF Tunnel 域名' : '主机名 / IP 地址'}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder={
                      editingHost.credentials.connectionMode === 'cf_tunnel'
                        ? 'ssh.example.com'
                        : '192.168.1.1 或域名'
                    }
                    value={editingHost.hostname}
                    onChange={(e) => setEditingHost({ ...editingHost, hostname: e.target.value })}
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-fs-text focus:outline-none focus:border-fs-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-fs-text mb-1">用户名</label>
                  <input
                    type="text"
                    required
                    placeholder="root"
                    value={editingHost.username}
                    onChange={(e) => setEditingHost({ ...editingHost, username: e.target.value })}
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-fs-text focus:outline-none focus:border-fs-primary"
                  />
                </div>
              </div>

              {editingHost.credentials.connectionMode === 'cf_tunnel' && (
                <div className="rounded-xl border border-fs-border bg-fs-bg/50 p-2.5 space-y-2">
                  <div className="text-[11px] font-medium text-fs-textMuted">
                    Cloudflare Access 零信任服务令牌 (若未启用 Access 鉴权请留空)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      placeholder="CF-Access-Client-Id (可选)"
                      value={editingHost.credentials.cfAccessClientId || ''}
                      onChange={(e) =>
                        setEditingHost({
                          ...editingHost,
                          credentials: {
                            ...editingHost.credentials,
                            cfAccessClientId: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded bg-fs-surface border border-fs-border px-2.5 py-1 text-[11px] text-fs-text focus:outline-none focus:border-fs-primary font-mono"
                    />
                    <input
                      type="password"
                      placeholder="CF-Access-Client-Secret (可选)"
                      value={editingHost.credentials.cfAccessClientSecret || ''}
                      onChange={(e) =>
                        setEditingHost({
                          ...editingHost,
                          credentials: {
                            ...editingHost.credentials,
                            cfAccessClientSecret: e.target.value,
                          },
                        })
                      }
                      className="w-full rounded bg-fs-surface border border-fs-border px-2.5 py-1 text-[11px] text-fs-text focus:outline-none focus:border-fs-primary font-mono"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-fs-text mb-1">认证方式</label>
                <div className="flex space-x-4 text-xs text-fs-text">
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      name="auth_type"
                      checked={editingHost.auth_type === 'password'}
                      onChange={() => setEditingHost({ ...editingHost, auth_type: 'password' })}
                    />
                    <span>密码认证</span>
                  </label>
                  <label className="flex items-center space-x-1 cursor-pointer">
                    <input
                      type="radio"
                      name="auth_type"
                      checked={editingHost.auth_type === 'private_key'}
                      onChange={() => setEditingHost({ ...editingHost, auth_type: 'private_key' })}
                    />
                    <span>私钥认证</span>
                  </label>
                </div>
              </div>

              {editingHost.auth_type === 'password' ? (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs text-fs-text">SSH 密码</label>
                    {editingHost.credentials.password &&
                      editingHost.credentials.password.length >= 16 &&
                      decodeFinalShellPassword(editingHost.credentials.password) !==
                        editingHost.credentials.password && (
                        <button
                          type="button"
                          onClick={() =>
                            setEditingHost({
                              ...editingHost,
                              credentials: {
                                ...editingHost.credentials,
                                password: decodeFinalShellPassword(
                                  editingHost.credentials.password || ''
                                ),
                              },
                            })
                          }
                          className="text-[10px] text-fs-accent hover:underline"
                        >
                          检测到 FinalShell 密文，点击一键解密
                        </button>
                      )}
                  </div>
                  <input
                    type="password"
                    placeholder="请输入密码（将在客户端加密存储）"
                    value={editingHost.credentials.password || ''}
                    onChange={(e) => {
                      setEditingHost({
                        ...editingHost,
                        credentials: { ...editingHost.credentials, password: e.target.value },
                      });
                    }}
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-fs-text focus:outline-none focus:border-fs-primary"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs text-fs-text mb-1">私钥内容 (OpenSSH / PEM)</label>
                  <textarea
                    rows={4}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----..."
                    value={editingHost.credentials.privateKey || ''}
                    onChange={(e) =>
                      setEditingHost({
                        ...editingHost,
                        credentials: { ...editingHost.credentials, privateKey: e.target.value },
                      })
                    }
                    className="w-full rounded bg-fs-bg border border-fs-border p-2 text-xs font-mono text-fs-text focus:outline-none focus:border-fs-primary"
                  />
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded bg-fs-hover hover:bg-fs-active px-3 py-1.5 text-xs text-fs-text"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="flex items-center space-x-1.5 rounded bg-fs-primary hover:bg-fs-primaryHover px-4 py-1.5 text-xs font-medium text-white shadow disabled:opacity-50 transition-all"
                >
                  {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{isSaving ? '正在保存...' : '保存连接'}</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center p-6 text-center text-fs-textMuted">
              <Server className="w-12 h-12 mb-3 text-fs-border" />
              <p className="text-xs">在左侧双击主机直接连接</p>
              <p className="text-[11px] text-fs-textMuted/70 mt-1">
                所有服务器密码与私钥均在浏览器本地经 AES-256 加密后安全同步
              </p>
            </div>
          )}
        </div>
      </div>

      <GroupManagerModal
        isOpen={isGroupManagerOpen}
        onClose={() => setIsGroupManagerOpen(false)}
        title="服务器分组管理"
        groups={hostGroups}
        items={hosts}
        getItemGroup={(h) => h.group_name}
        onAddGroup={(name) => addHostGroup(name)}
        onRenameGroup={(oldName, newName) => renameHostGroup(oldName, newName)}
        onDeleteGroup={(name, targetGroup) => deleteHostGroup(name, targetGroup)}
      />

      <FinalShellImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => fetchHosts()}
      />
    </div>
  );
};
