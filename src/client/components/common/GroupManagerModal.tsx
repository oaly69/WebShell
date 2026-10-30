import React, { useState } from 'react';
import { Folder, Plus, Edit2, Trash2, X, Check, AlertCircle } from 'lucide-react';

interface GroupManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  groups: string[];
  defaultGroup?: string;
  onAddGroup: (name: string) => void;
  onRenameGroup: (oldName: string, newName: string) => Promise<void>;
  onDeleteGroup: (name: string, targetGroup?: string) => Promise<void>;
  items?: any[];
  getItemGroup?: (item: any) => string;
  getGroupCount?: (name: string) => number;
}

export const GroupManagerModal: React.FC<GroupManagerModalProps> = ({
  isOpen,
  onClose,
  title,
  groups,
  defaultGroup,
  onAddGroup,
  onRenameGroup,
  onDeleteGroup,
  items,
  getItemGroup,
  getGroupCount,
}) => {
  const effectiveDefaultGroup = defaultGroup || (groups.length > 0 ? groups[0] : '默认分组');
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroup, setEditingGroup] = useState<string | null>(null);
  const [editInput, setEditInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const calculateCount = (grp: string) => {
    if (getGroupCount) return getGroupCount(grp);
    if (items && getItemGroup) {
      return items.filter((it) => (getItemGroup(it) || effectiveDefaultGroup) === grp).length;
    }
    return 0;
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newGroupName.trim();
    if (!trimmed) return;
    if (groups.includes(trimmed)) {
      setError('该分组名称已存在');
      return;
    }
    setError(null);
    onAddGroup(trimmed);
    setNewGroupName('');
  };

  const startRename = (grp: string) => {
    setEditingGroup(grp);
    setEditInput(grp);
    setError(null);
  };

  const handleSaveRename = async (oldName: string) => {
    const trimmed = editInput.trim();
    if (!trimmed || trimmed === oldName) {
      setEditingGroup(null);
      return;
    }
    if (groups.includes(trimmed)) {
      setError('目标分组名称已存在');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onRenameGroup(oldName, trimmed);
      setEditingGroup(null);
    } catch (err: any) {
      setError(err.message || '重命名分组失败');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (grp: string) => {
    if (grp === effectiveDefaultGroup) return;
    const count = calculateCount(grp);
    const msg = count > 0
      ? `确定删除分组 "${grp}" 吗？该分组下的 ${count} 个项目将自动移至 "${effectiveDefaultGroup}"。`
      : `确定删除分组 "${grp}" 吗？`;

    if (!confirm(msg)) return;

    setLoading(true);
    setError(null);
    try {
      await onDeleteGroup(grp, effectiveDefaultGroup);
    } catch (err: any) {
      setError(err.message || '删除分组失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 select-none">
      <div className="flex flex-col w-full max-w-md rounded-2xl border border-fs-border bg-fs-surface shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex h-12 items-center justify-between border-b border-fs-border px-4 bg-fs-bg/60">
          <div className="flex items-center space-x-2 text-sm font-semibold text-fs-text">
            <Folder className="w-4 h-4 text-fs-warning" />
            <span>{title}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="m-3 flex items-center space-x-2 rounded-xl bg-fs-danger/10 border border-fs-danger/30 p-2.5 text-xs text-fs-danger">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Add Group Form */}
        <form onSubmit={handleAdd} className="flex items-center space-x-2 p-3 border-b border-fs-border bg-fs-bg/30">
          <input
            type="text"
            required
            placeholder="输入新分组名称..."
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            className="flex-1 rounded-xl bg-fs-bg border border-fs-border px-3 py-1.5 text-xs text-fs-text placeholder-fs-textMuted focus:outline-none focus:border-fs-primary"
          />
          <button
            type="submit"
            className="flex items-center space-x-1 rounded-xl bg-fs-primary hover:bg-fs-primaryHover px-3 py-1.5 text-xs font-medium text-white transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>创建</span>
          </button>
        </form>

        {/* Group List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1.5 max-h-[320px]">
          {groups.map((grp) => {
            const isDefault = grp === effectiveDefaultGroup;
            const count = calculateCount(grp);
            const isEditing = editingGroup === grp;

            return (
              <div
                key={grp}
                className="flex items-center justify-between rounded-xl bg-fs-bg/50 border border-fs-border/60 px-3 py-2 text-xs hover:border-fs-border transition-colors"
              >
                {isEditing ? (
                  <div className="flex items-center space-x-2 flex-1 mr-2">
                    <input
                      type="text"
                      autoFocus
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveRename(grp);
                        if (e.key === 'Escape') setEditingGroup(null);
                      }}
                      className="flex-1 rounded-lg bg-fs-bg border border-fs-primary px-2.5 py-1 text-xs text-fs-text focus:outline-none"
                    />
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => handleSaveRename(grp)}
                      className="p-1 rounded bg-fs-accent/20 text-fs-accent hover:bg-fs-accent/30"
                      title="保存"
                    >
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingGroup(null)}
                      className="p-1 rounded bg-fs-hover text-fs-textMuted hover:text-fs-text"
                      title="取消"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center space-x-2">
                      <Folder className="w-3.5 h-3.5 text-fs-warning shrink-0" />
                      <span className="font-medium text-fs-text">{grp}</span>
                      {isDefault && (
                        <span className="rounded bg-fs-surface px-1.5 py-0.5 text-[10px] text-fs-textMuted border border-fs-border">
                          默认
                        </span>
                      )}
                      <span className="text-[10px] text-fs-textMuted">({count})</span>
                    </div>

                    <div className="flex items-center space-x-1">
                      <button
                        type="button"
                        onClick={() => startRename(grp)}
                        title="重命名分组"
                        className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-info transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      {!isDefault && (
                        <button
                          type="button"
                          disabled={loading}
                          onClick={() => handleDelete(grp)}
                          title="删除分组"
                          className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-danger transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-3 border-t border-fs-border bg-fs-bg/40">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-fs-hover hover:bg-fs-active px-4 py-1.5 text-xs text-fs-text transition-colors"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};
