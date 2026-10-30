import React, { useState } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore } from '../../store/useSessionStore';
import type { SnippetRecord } from '@shared/types';
import { GroupManagerModal } from '../common/GroupManagerModal';
import {
  Code2,
  Plus,
  Trash2,
  Play,
  X,
  Search,
  Radio,
  FolderCog,
  Edit2,
} from 'lucide-react';

interface SnippetsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SnippetsDrawer: React.FC<SnippetsDrawerProps> = ({ isOpen, onClose }) => {
  const {
    snippets,
    saveSnippet,
    deleteSnippet,
    getSnippetCategories,
    addSnippetCategory,
    renameSnippetCategory,
    deleteSnippetCategory,
  } = useSyncStore();
  const { sendInputToActive, isBroadcastMode } = useSessionStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isAdding, setIsAdding] = useState(false);
  const [editingSnippetId, setEditingSnippetId] = useState<string | null>(null);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('通用');
  const [newCommand, setNewCommand] = useState('');
  const [autoEnter, setAutoEnter] = useState(true);

  // Category management
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

  if (!isOpen) return null;

  const categories = getSnippetCategories();

  const filteredSnippets = snippets.filter((s) => {
    const matchesCategory = selectedCategory === 'all' || s.category === selectedCategory;
    const matchesSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      s.command.toLowerCase().includes(search.toLowerCase()) ||
      s.category.toLowerCase().includes(search.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const handleRun = (snippet: SnippetRecord) => {
    sendInputToActive(snippet.command, snippet.auto_enter === 1);
  };

  const handleOpenAdd = () => {
    setEditingSnippetId(null);
    setNewTitle('');
    setNewCategory(categories[0] || '通用');
    setNewCommand('');
    setAutoEnter(true);
    setIsCreatingCategory(false);
    setIsAdding(true);
  };

  const handleOpenEdit = (snippet: SnippetRecord) => {
    setEditingSnippetId(snippet.id);
    setNewTitle(snippet.title);
    setNewCategory(snippet.category);
    setNewCommand(snippet.command);
    setAutoEnter(snippet.auto_enter === 1);
    setIsCreatingCategory(false);
    setIsAdding(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newCommand.trim()) return;

    await saveSnippet({
      id: editingSnippetId || '',
      user_id: '',
      title: newTitle.trim(),
      category: newCategory.trim() || '通用',
      command: newCommand.trim(),
      auto_enter: autoEnter ? 1 : 0,
      sort_order: 0,
    });

    setIsAdding(false);
    setEditingSnippetId(null);
    setNewTitle('');
    setNewCommand('');
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full sm:w-88 md:w-96 flex-col border-l border-fs-border bg-fs-surface shadow-2xl select-none">
      {/* Header */}
      <div className="flex h-11 items-center justify-between border-b border-fs-border px-3 bg-fs-bg/60">
        <div className="flex items-center space-x-2 text-xs font-semibold text-white">
          <Code2 className="w-4 h-4 text-fs-info" />
          <span>快捷命令库 ({snippets.length})</span>
        </div>
        <div className="flex items-center space-x-1.5">
          <button
            type="button"
            onClick={() => setIsCategoryManagerOpen(true)}
            title="管理命令分类"
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-fs-hover text-fs-warning text-xs transition-colors"
          >
            <FolderCog className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">分类</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            title="添加快捷命令"
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-fs-primary hover:bg-fs-primaryHover text-white text-xs transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>新建</span>
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-white"
          >
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

      {/* Category Filter Pills */}
      <div className="flex items-center space-x-1 px-3 py-2 border-b border-fs-border overflow-x-auto scrollbar-none bg-fs-bg/30">
        <button
          type="button"
          onClick={() => setSelectedCategory('all')}
          className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
            selectedCategory === 'all'
              ? 'bg-fs-primary text-white'
              : 'bg-fs-hover text-fs-textMuted hover:text-white'
          }`}
        >
          全部 ({snippets.length})
        </button>
        {categories.map((cat) => {
          const count = snippets.filter((s) => s.category === cat).length;
          return (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-fs-primary text-white'
                  : 'bg-fs-hover text-fs-textMuted hover:text-white'
              }`}
            >
              {cat} ({count})
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="p-2 border-b border-fs-border">
        <div className="relative">
          <input
            type="text"
            placeholder="搜索命令名称、内容或分类..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded bg-fs-bg border border-fs-border px-3 py-1.5 pl-8 text-xs text-white placeholder-fs-textMuted focus:outline-none focus:border-fs-primary"
          />
          <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-fs-textMuted" />
        </div>
      </div>

      {/* Add / Edit Form */}
      {isAdding && (
        <form onSubmit={handleFormSubmit} className="border-b border-fs-border p-3 space-y-2.5 bg-fs-bg/60">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white">
              {editingSnippetId ? '编辑命令' : '新建命令'}
            </span>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setEditingSnippetId(null);
              }}
              className="text-[11px] text-fs-textMuted hover:text-white"
            >
              取消
            </button>
          </div>

          <input
            type="text"
            required
            placeholder="命令名称 (如: Docker 状态)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full rounded bg-fs-bg border border-fs-border px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
          />

          {/* Category Selector */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] text-fs-textMuted">命令分类</label>
              <button
                type="button"
                onClick={() => setIsCategoryManagerOpen(true)}
                className="text-[10px] text-fs-accent hover:underline flex items-center space-x-0.5"
              >
                <FolderCog className="w-3 h-3 inline" />
                <span>管理分类</span>
              </button>
            </div>
            {!isCreatingCategory ? (
              <div className="flex items-center space-x-1.5">
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="flex-1 rounded bg-fs-bg border border-fs-border px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat} className="bg-fs-surface text-white">
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingCategory(true);
                    setNewCategoryInput('');
                  }}
                  className="rounded bg-fs-hover hover:bg-fs-active px-2 py-1.5 text-xs text-fs-accent whitespace-nowrap"
                  title="新建分类"
                >
                  + 新建
                </button>
              </div>
            ) : (
              <div className="flex items-center space-x-1.5">
                <input
                  type="text"
                  autoFocus
                  placeholder="新分类名称"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newCategoryInput.trim()) {
                        addSnippetCategory(newCategoryInput.trim());
                        setNewCategory(newCategoryInput.trim());
                        setIsCreatingCategory(false);
                      }
                    }
                  }}
                  className="flex-1 rounded bg-fs-bg border border-fs-border px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-fs-primary"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCategoryInput.trim()) {
                      addSnippetCategory(newCategoryInput.trim());
                      setNewCategory(newCategoryInput.trim());
                    }
                    setIsCreatingCategory(false);
                  }}
                  className="rounded bg-fs-primary hover:bg-fs-primaryHover px-2 py-1.5 text-xs text-white whitespace-nowrap"
                >
                  确定
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingCategory(false)}
                  className="rounded bg-fs-hover hover:bg-fs-active px-1.5 py-1.5 text-xs text-fs-textMuted"
                  title="取消"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          <textarea
            rows={3}
            required
            placeholder="脚本命令内容 (支持多行)..."
            value={newCommand}
            onChange={(e) => setNewCommand(e.target.value)}
            className="w-full rounded bg-fs-bg border border-fs-border p-2 text-xs font-mono text-white focus:outline-none focus:border-fs-primary"
          />

          <div className="flex items-center justify-between text-xs pt-1">
            <label className="flex items-center space-x-1.5 cursor-pointer text-fs-text">
              <input
                type="checkbox"
                checked={autoEnter}
                onChange={(e) => setAutoEnter(e.target.checked)}
                className="rounded border-fs-border text-fs-primary focus:ring-0"
              />
              <span>自动回车执行</span>
            </label>
            <button
              type="submit"
              className="rounded bg-fs-primary hover:bg-fs-primaryHover px-3 py-1.5 text-xs font-medium text-white shadow"
            >
              {editingSnippetId ? '保存修改' : '立即创建'}
            </button>
          </div>
        </form>
      )}

      {/* Snippet List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        {filteredSnippets.length === 0 ? (
          <div className="text-center py-12 text-xs text-fs-textMuted">
            {search || selectedCategory !== 'all' ? '未找到匹配的快捷命令' : '暂无快捷命令，点击右上角新建'}
          </div>
        ) : (
          filteredSnippets.map((item) => (
            <div
              key={item.id}
              className="group rounded-lg border border-fs-border bg-fs-bg/60 p-2.5 text-xs hover:border-fs-primary/50 transition-all"
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-medium text-white">{item.title}</span>
                <span className="rounded bg-fs-surface px-1.5 py-0.5 text-[10px] text-fs-textMuted border border-fs-border/60">
                  {item.category}
                </span>
              </div>
              <pre className="font-mono text-[11px] text-fs-textMuted bg-fs-bg rounded p-1.5 overflow-x-auto whitespace-pre-wrap break-all mb-2 max-h-24">
                {item.command}
              </pre>
              <div className="flex items-center justify-between border-t border-fs-border/40 pt-1.5">
                <span className="text-[10px] text-fs-textMuted/70">
                  {item.auto_enter === 1 ? '自动执行' : '仅粘贴'}
                </span>
                <div className="flex items-center space-x-1">
                  <button
                    onClick={() => handleOpenEdit(item)}
                    title="编辑命令"
                    className="p-1 rounded hover:bg-fs-hover text-fs-info opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => deleteSnippet(item.id)}
                    title="删除命令"
                    className="p-1 rounded hover:bg-fs-hover text-fs-danger opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleRun(item)}
                    className="flex items-center space-x-1 rounded bg-fs-primary/20 hover:bg-fs-primary/30 text-fs-info px-2.5 py-1 text-xs font-medium transition-colors"
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

      {/* Snippet Category Manager Modal */}
      <GroupManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        title="快捷命令分类管理"
        groups={categories}
        items={snippets}
        getItemGroup={(s) => s.category}
        onAddGroup={(name) => addSnippetCategory(name)}
        onRenameGroup={(oldName, newName) => renameSnippetCategory(oldName, newName)}
        onDeleteGroup={(name, targetGroup) => deleteSnippetCategory(name, targetGroup)}
      />
    </div>
  );
};
