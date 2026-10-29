import React, { useState } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { DecryptedHost } from '@shared/types';
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
} from 'lucide-react';

interface HostManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const HostManagerModal: React.FC<HostManagerModalProps> = ({ isOpen, onClose }) => {
  const { hosts, saveHost, deleteHost } = useSyncStore();
  const { openSession } = useSessionStore();

  const [search, setSearch] = useState('');
  const [editingHost, setEditingHost] = useState<DecryptedHost | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  if (!isOpen) return null;

  // Group hosts by group_name
  const groupedHosts = hosts.reduce<Record<string, DecryptedHost[]>>((acc, host) => {
    if (search && !host.name.toLowerCase().includes(search.toLowerCase()) && !host.hostname.includes(search)) {
      return acc;
    }
    const grp = host.group_name || '默认分组';
    if (!acc[grp]) acc[grp] = [];
    acc[grp].push(host);
    return acc;
  }, {});

  const toggleGroup = (grp: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [grp]: !prev[grp] }));
  };

  const handleConnect = (host: DecryptedHost) => {
    openSession(host);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="flex h-[560px] w-full max-w-4xl overflow-hidden rounded-xl border border-fs-border bg-fs-surface shadow-2xl">
        {/* Left: Host Tree List */}
        <div className="flex w-1/2 flex-col border-r border-fs-border bg-fs-bg/60">
          <div className="flex items-center justify-between border-b border-fs-border p-3">
            <div className="flex items-center space-x-2 text-sm font-semibold text-white">
              <Server className="w-4 h-4 text-fs-accent" />
              <span>所有服务器 ({hosts.length})</span>
            </div>
            <button
              onClick={() => {
                setEditingHost({
                  id: '',
                  name: '',
                  group_name: '默认分组',
                  hostname: '',
                  port: 22,
                  username: 'root',
                  auth_type: 'password',
                  credentials: { password: '' },
                  sort_order: 0,
                  updated_at: Date.now(),
                });
                setIsFormOpen(true);
              }}
              className="flex items-center space-x-1 rounded bg-fs-primary hover:bg-fs-primaryHover px-2.5 py-1 text-xs text-white transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新建主机</span>
            </button>
          </div>

          <div className="p-2 border-b border-fs-border">
            <div className="relative">
              <input
                type="text"
                placeholder="搜索主机名或 IP..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded bg-fs-surface border border-fs-border px-3 py-1.5 pl-8 text-xs text-white placeholder-fs-textMuted focus:outline-none focus:border-fs-primary"
              />
              <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-fs-textMuted" />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {Object.keys(groupedHosts).length === 0 ? (
              <div className="text-center py-12 text-xs text-fs-textMuted">暂无主机，请点击右上角新建</div>
            ) : (
              Object.entries(groupedHosts).map(([group, groupList]) => {
                const isCollapsed = collapsedGroups[group];
                return (
                  <div key={group} className="select-none">
                    <div
                      onClick={() => toggleGroup(group)}
                      className="flex items-center space-x-1.5 px-2 py-1 text-xs font-medium text-fs-textMuted hover:text-white cursor-pointer"
                    >
                      {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      <Folder className="w-3.5 h-3.5 text-fs-warning" />
                      <span>{group}</span>
                      <span className="text-[10px] text-fs-textMuted">({groupList.length})</span>
                    </div>

                    {!isCollapsed && (
                      <div className="pl-5 space-y-1 mt-0.5">
                        {groupList.map((host) => (
                          <div
                            key={host.id}
                            onDoubleClick={() => handleConnect(host)}
                            className="group flex items-center justify-between rounded p-2 text-xs hover:bg-fs-hover cursor-pointer"
                          >
                            <div className="flex flex-col">
                              <span className="font-medium text-white">{host.name}</span>
                              <span className="text-[11px] text-fs-textMuted">
                                {host.username}@{host.hostname}:{host.port}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
              })
            )}
          </div>
        </div>

        {/* Right: Add/Edit Host Form or Hint */}
        <div className="flex w-1/2 flex-col bg-fs-surface">
          <div className="flex items-center justify-between border-b border-fs-border p-3">
            <h3 className="text-sm font-semibold text-white">
              {isFormOpen ? (editingHost?.id ? '编辑主机连接' : '新建主机连接') : '连接信息'}
            </h3>
            <button onClick={onClose} className="p-1 rounded hover:bg-fs-hover text-fs-textMuted">
              <X className="w-4 h-4" />
            </button>
          </div>

          {isFormOpen && editingHost ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await saveHost(editingHost);
                setIsFormOpen(false);
              }}
              className="flex-1 overflow-y-auto p-4 space-y-3.5"
            >
              <div>
                <label className="block text-xs text-fs-text mb-1">主机显示名称</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 生产环境主节点"
                  value={editingHost.name}
                  onChange={(e) => setEditingHost({ ...editingHost, name: e.target.value })}
                  className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-fs-text mb-1">所属分组</label>
                  <input
                    type="text"
                    placeholder="默认分组"
                    value={editingHost.group_name}
                    onChange={(e) => setEditingHost({ ...editingHost, group_name: e.target.value })}
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs text-fs-text mb-1">SSH 端口</label>
                  <input
                    type="number"
                    value={editingHost.port}
                    onChange={(e) => setEditingHost({ ...editingHost, port: parseInt(e.target.value, 10) || 22 })}
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-fs-text mb-1">主机名 / IP 地址</label>
                  <input
                    type="text"
                    required
                    placeholder="192.168.1.1 或域名"
                    value={editingHost.hostname}
                    onChange={(e) => setEditingHost({ ...editingHost, hostname: e.target.value })}
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
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
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                  />
                </div>
              </div>

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
                  <label className="block text-xs text-fs-text mb-1">SSH 密码</label>
                  <input
                    type="password"
                    placeholder="请输入密码（将在客户端加密存储）"
                    value={editingHost.credentials.password || ''}
                    onChange={(e) =>
                      setEditingHost({
                        ...editingHost,
                        credentials: { ...editingHost.credentials, password: e.target.value },
                      })
                    }
                    className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
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
                    className="w-full rounded bg-fs-bg border border-fs-border p-2 text-xs font-mono text-white focus:outline-none focus:border-fs-primary"
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
                  className="rounded bg-fs-primary hover:bg-fs-primaryHover px-4 py-1.5 text-xs font-medium text-white"
                >
                  保存连接
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
    </div>
  );
};
