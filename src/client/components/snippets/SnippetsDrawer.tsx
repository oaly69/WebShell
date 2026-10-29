import React, { useState } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { SnippetRecord } from '@shared/types';
import {
  Code2,
  Plus,
  Trash2,
  Play,
  X,
  Search,
  Radio,
} from 'lucide-react';

interface SnippetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SnippetsDrawer: React.FC<SnippetsDrawerProps> = ({ isOpen, onClose }) => {
  const { snippets, saveSnippet, deleteSnippet } = useSyncStore();
  const { sendInputToActive, isBroadcastMode } = useSessionStore();

  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('通用');
  const [newCommand, setNewCommand] = useState('');
  const [autoEnter, setAutoEnter] = useState(true);

  if (!isOpen) return null;

  const filteredSnippets = snippets.filter(
    (s) =>
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.command.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleRun = (snippet: SnippetRecord) => {
    sendInputToActive(snippet.command, snippet.auto_enter === 1);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newCommand) return;

    await saveSnippet({
      id: '',
      title: newTitle,
      category: newCategory,
      command: newCommand,
      auto_enter: autoEnter ? 1 : 0,
      sort_order: 0,
    });

    setIsAdding(false);
    setNewTitle('');
    setNewCommand('');
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col border-l border-fs-border bg-fs-surface shadow-2xl select-none">
      {/* Header */}
      <div className="flex h-11 items-center justify-between border-b border-fs-border px-3 bg-fs-bg/60">
        <div className="flex items-center space-x-2 text-xs font-semibold text-white">
          <Code2 className="w-4 h-4 text-fs-info" />
          <span>快捷命令库</span>
        </div>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setIsAdding(!isAdding)}
            title="添加快捷命令"
            className="p-1 rounded hover:bg-fs-hover text-fs-accent"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-1 rounded hover:bg-fs-hover text-fs-textMuted">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {isBroadcastMode && (
        <div className="flex items-center space-x-1.5 bg-fs-danger/10 border-b border-fs-danger/30 px-3 py-1.5 text-[11px] text-fs-danger">
          <Radio className="w-3.5 h-3.5 animate-pulse" />
          <span>当前处于广播模式，点击将同时在所有标签执行！</span>
        </div>
      )}

      {/* Search */}
      <div className="p-2 border-b border-fs-border">
        <div className="relative">
          <input
            type="text"
            placeholder="搜索命令或分类..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 pl-8 text-xs text-white placeholder-fs-textMuted focus:outline-none focus:border-fs-primary"
          />
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-fs-textMuted" />
        </div>
      </div>

      {/* Add Form */}
      {isAdding && (
        <form onSubmit={handleAddSubmit} className="border-b border-fs-border p-3 space-y-2.5 bg-fs-bg/40">
          <input
            type="text"
            required
            placeholder="命令名称 (如: Docker 状态)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full rounded bg-fs-bg border border-fs-border px-2.5 py-1 text-xs text-white focus:outline-none focus:border-fs-primary"
          />
          <input
            type="text"
            placeholder="分类 (如: Docker, 维护)"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="w-full rounded bg-fs-bg border border-fs-border px-2.5 py-1 text-xs text-white focus:outline-none focus:border-fs-primary"
          />
          <textarea
            rows={2}
            required
            placeholder="脚本命令内容..."
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            className="w-full rounded bg-fs-bg border border-fs-border p-2 text-xs font-mono text-white focus:outline-none focus:border-fs-primary"
          />
          <div className="flex items-center justify-between text-xs">
            <label className="flex items-center space-x-1.5 cursor-pointer text-fs-text">
              <input
                type="checkbox"
                checked={autoEnter}
                onChange={(e) => setAutoEnter(e.target.checked)}
              />
              <span>自动回车执行</span>
            </label>
            <button
              type="submit"
              className="rounded bg-fs-primary hover:bg-fs-primaryHover px-3 py-1 text-xs font-medium text-white"
            >
              保存
            </button>
          </div>
        </form>
      )}

      {/* Snippet List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredSnippets.length === 0 ? (
          <div className="text-center py-12 text-xs text-fs-textMuted">暂无快捷命令</div>
        ) : (
          filteredSnippets.map((item) => (
            <div
              key={item.id}
              className="group rounded-lg border border-fs-border bg-fs-bg/60 p-2 text-xs hover:border-fs-primary/50 transition-all"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-white">{item.title}</span>
                <span className="rounded bg-fs-surface px-1.5 py-0.5 text-[10px] text-fs-textMuted">
                  {item.category}
                </span>
              </div>
              <p className="font-mono text-[11px] text-fs-textMuted truncate mb-2">{item.command}</p>
              <div className="flex items-center justify-between border-t border-fs-border/40 pt-1.5">
                <span className="text-[10px] text-fs-textMuted/70">
                  {item.auto_enter === 1 ? '自动执行' : '仅粘贴'}
                </span>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => deleteSnippet(item.id)}
                    className="p-1 rounded hover:bg-fs-hover text-fs-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => handleRun(item)}
                    className="flex items-center space-x-1 rounded bg-fs-primary/20 hover:bg-fs-primary/30 text-fs-info px-2 py-0.5 text-xs font-medium transition-colors"
                  >
                    <Play className="w-3 h-3" />
                    <span>执行</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
