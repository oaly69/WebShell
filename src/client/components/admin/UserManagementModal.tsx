import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../store/useAuthStore';
import { Users, UserPlus, Trash2, X, Shield, User, AlertCircle, CheckCircle, Ban } from 'lucide-react';

interface ManagedUser {
  id: string;
  username: string;
  role: 'admin' | 'user';
  status: 'active' | 'disabled';
  created_at: number;
}

interface UserManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const UserManagementModal: React.FC<UserManagementModalProps> = ({ isOpen, onClose }) => {
  const { token, user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add User Form State
  const [isAdding, setIsAdding] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  useEffect(() => {
    if (isOpen && token && currentUser?.role === 'admin') {
      fetchUsers();
    }
  }, [isOpen, token, currentUser]);

  if (!isOpen || currentUser?.role !== 'admin') return null;

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('获取用户列表失败');
      const list = (await res.json()) as ManagedUser[];
      setUsers(list);
    } catch (err: any) {
      setError(err.message || '加载用户失败');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername || !newPassword) return;
    setError(null);

    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
        }),
      });

      const data = (await res.json()) as any;
      if (!res.ok) throw new Error(data.error || '添加用户失败');

      setNewUsername('');
      setNewPassword('');
      setIsAdding(false);
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleToggleStatus = async (user: ManagedUser) => {
    const nextStatus = user.status === 'active' ? 'disabled' : 'active';
    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: nextStatus }),
      });
      if (!res.ok) {
        const d = (await res.json()) as any;
        throw new Error(d.error || '更新用户状态失败');
      }
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleDeleteUser = async (user: ManagedUser) => {
    if (!confirm(`确定彻底删除用户 "${user.username}" 及其所有已保存数据吗？此操作不可逆！`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const d = (await res.json()) as any;
        throw new Error(d.error || '删除用户失败');
      }
      await fetchUsers();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 select-none">
      <div className="flex h-[580px] w-full max-w-3xl flex-col rounded-2xl border border-fs-border bg-fs-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex h-13 items-center justify-between border-b border-fs-border px-5 bg-fs-bg/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-lg bg-fs-primary/15 text-fs-info">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">用户权限与成员管理</h2>
              <p className="text-[11px] text-fs-textMuted">不可自助注册，仅管理员可分配新账号。用户数据绝对物理与密钥隔离</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-fs-hover text-fs-textMuted hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-3 flex items-center space-x-2 rounded-lg bg-fs-danger/10 border border-fs-danger/30 p-2.5 text-xs text-fs-danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-fs-border/60 bg-fs-surface">
          <span className="text-xs font-medium text-fs-text">成员列表 ({users.length})</span>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="flex items-center space-x-1.5 rounded-lg bg-fs-primary hover:bg-fs-primaryHover px-3 py-1.5 text-xs font-medium text-white transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>添加新用户</span>
          </button>
        </div>

        {/* Add User Drawer */}
        {isAdding && (
          <form onSubmit={handleAddUser} className="border-b border-fs-border p-4 bg-fs-bg/60 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-fs-textMuted mb-1">用户名</label>
                <input
                  type="text"
                  required
                  placeholder="例如: alice"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full rounded-lg bg-fs-surface border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] text-fs-textMuted mb-1">初始密码</label>
                <input
                  type="password"
                  required
                  placeholder="至少 6 位密码"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full rounded-lg bg-fs-surface border border-fs-border px-3 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                />
              </div>
              <div>
                <label className="block text-[11px] text-fs-textMuted mb-1">角色权限</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as any)}
                  className="w-full rounded-lg bg-fs-surface border border-fs-border px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                >
                  <option value="user">普通成员 (User)</option>
                  <option value="admin">管理员 (Admin)</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-fs-textMuted">
                💡 用户登录后将在其本地生成私有根密钥，管理员亦无法窥探其 SSH 凭据
              </span>
              <div className="flex space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="rounded-lg bg-fs-hover px-3 py-1.5 text-xs text-fs-text"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-fs-primary hover:bg-fs-primaryHover px-4 py-1.5 text-xs font-medium text-white"
                >
                  确认添加
                </button>
              </div>
            </div>
          </form>
        )}

        {/* User List Table */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex h-40 items-center justify-center text-xs text-fs-textMuted">正在加载成员列表...</div>
          ) : users.length === 0 ? (
            <div className="flex h-40 items-center justify-center text-xs text-fs-textMuted">暂无用户</div>
          ) : (
            <table className="w-full text-xs text-left">
              <thead className="sticky top-0 bg-fs-bg/80 backdrop-blur-sm text-fs-textMuted border-b border-fs-border">
                <tr>
                  <th className="py-2.5 px-5">用户名</th>
                  <th className="py-2.5 px-4">角色</th>
                  <th className="py-2.5 px-4">状态</th>
                  <th className="py-2.5 px-4">创建时间</th>
                  <th className="py-2.5 px-5 text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-fs-border/40 text-fs-text">
                {users.map((u) => {
                  const isSelf = u.id === currentUser?.id;
                  return (
                    <tr key={u.id} className="hover:bg-fs-hover/50">
                      <td className="py-3 px-5 font-medium text-white flex items-center space-x-2">
                        {u.role === 'admin' ? (
                          <Shield className="w-3.5 h-3.5 text-fs-warning" />
                        ) : (
                          <User className="w-3.5 h-3.5 text-fs-info" />
                        )}
                        <span>{u.username}</span>
                        {isSelf && (
                          <span className="text-[10px] rounded bg-fs-primary/20 text-fs-info px-1.5 py-0.5">
                            当前账号
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded font-mono ${
                            u.role === 'admin'
                              ? 'bg-fs-warning/15 text-fs-warning'
                              : 'bg-fs-surface text-fs-textMuted'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded ${
                            u.status === 'active'
                              ? 'bg-fs-accent/15 text-fs-accent'
                              : 'bg-fs-danger/15 text-fs-danger'
                          }`}
                        >
                          {u.status === 'active' ? (
                            <CheckCircle className="w-3 h-3" />
                          ) : (
                            <Ban className="w-3 h-3" />
                          )}
                          <span>{u.status === 'active' ? '正常' : '已停用'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[11px] text-fs-textMuted">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-5 text-right space-x-2">
                        {!isSelf && (
                          <>
                            <button
                              onClick={() => handleToggleStatus(u)}
                              className={`text-[11px] px-2 py-1 rounded transition-colors ${
                                u.status === 'active'
                                  ? 'hover:bg-fs-warning/20 text-fs-warning'
                                  : 'hover:bg-fs-accent/20 text-fs-accent'
                              }`}
                            >
                              {u.status === 'active' ? '禁用' : '解禁'}
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u)}
                              className="text-[11px] px-2 py-1 rounded hover:bg-fs-danger/20 text-fs-danger transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5 inline" />
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};
