import React, { useState } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { useSessionStore, type TerminalSession } from '../../store/useSessionStore';
import type { SnippetRecord } from '@shared/types';
import { GroupManagerModal } from '../common/GroupManagerModal';
import {
  Code2,
  Plus,
  Trash2,
  Play,
  Search,
  Radio,
  FolderCog,
  Edit2,
  Check,
  CornerDownLeft,
  X,
} from 'lucide-react';

interface SnippetsPanelProps {
  session?: TerminalSession;
  className?: string;
}

export const SnippetsPanel: React.FC<SnippetsPanelProps> = ({ session, className = '' }) => {
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
  const [executedId, setExecutedId] = useState<string | null>(null);

  // Form states
  const [newTitle, setNewTitle] = useState('');
  const [newCategory, setNewCategory] = useState('通用');
  const [newCommand, setNewCommand] = useState('');
  const [autoEnter, setAutoEnter] = useState(true);

  // Category management
  const [isCategoryManagerOpen, setIsCategoryManagerOpen] = useState(false);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');

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
    setExecutedId(snippet.id);
    setTimeout(() => {
      setExecutedId(null);
    }, 800);
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
    <div className={`flex h-full w-full flex-col bg-fs-surface select-none overflow-hidden ${className}`}>
      {/* 1. Header Toolbar */}
      <div className="flex h-8 items-center justify-between border-b border-fs-border px-3 bg-fs-bg/40 text-xs shrink-0">
        <div className="flex items-center space-x-2 overflow-hidden">
          <Code2 className="w-3.5 h-3.5 text-fs-info shrink-0" />
          <span className="font-semibold text-white whitespace-nowrap">快捷命令 ({filteredSnippets.length})</span>
          {isBroadcastMode && (
            <span className="flex items-center space-x-1 text-[10px] text-fs-danger bg-fs-danger/10 px-1.5 py-0.5 rounded border border-fs-danger/20 font-medium">
              <Radio className="w-2.5 h-2.5 animate-pulse" />
              <span>广播</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsCategoryManagerOpen(true)}
            title="管理分类"
            className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-fs-hover text-fs-warning text-[11px] transition-colors"
          >
            <FolderCog className="w-3 h-3" />
            <span className="hidden sm:inline">分类</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            title="新建快捷命令"
            className="flex items-center space-x-1 px-2 py-0.5 rounded bg-fs-primary hover:bg-fs-primaryHover text-white text-[11px] font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>新建</span>
          </button>
        </div>
      </div>

      {/* 2. Sub-Header: Search & Category Pills */}
      <div className="flex items-center space-x-2 border-b border-fs-border px-2.5 py-1.5 bg-fs-surface/80 shrink-0">
        <div className="relative flex-1 max-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-fs-textMuted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索命令或标题..."
            className="w-full rounded-md border border-fs-border bg-fs-bg pl-6 pr-2 py-0.5 text-[11px] text-fs-text placeholder-fs-textMuted/60 focus:border-fs-primary focus:outline-hidden"
          />
        </div>

        {/* Categories scroll row */}
        <div className="flex items-center space-x-1 overflow-x-auto scrollbar-none flex-1 py-0.5">
          <button
            type="button"
            onClick={() => setSelectedCategory('all')}
            className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap transition-colors ${
              selectedCategory === 'all'
                ? 'bg-fs-primary text-white font-medium'
                : 'bg-fs-hover text-fs-textMuted hover:text-white'
            }`}
          >
            全部
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCategory(cat)}
              className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap transition-colors ${
                selectedCategory === cat
                  ? 'bg-fs-primary text-white font-medium'
                  : 'bg-fs-hover text-fs-textMuted hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Snippets List or Empty State */}
      <div className="flex-1 overflow-y-auto divide-y divide-fs-border/40 p-1">
        {filteredSnippets.length === 0 ? (
          <div className="flex h-36 flex-col items-center justify-center text-xs text-fs-textMuted space-y-1">
            <span>暂无快捷命令</span>
            <button
              onClick={handleOpenAdd}
              className="text-fs-primary hover:underline text-[11px]"
            >
              点击新建一个
            </button>
          </div>
        ) : (
          filteredSnippets.map((snippet) => {
            const isJustRan = executedId === snippet.id;
            return (
              <div
                key={snippet.id}
                className="group flex items-center justify-between p-2 rounded-lg hover:bg-fs-hover/70 transition-colors"
              >
                <div className="flex flex-col min-w-0 flex-1 mr-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="text-xs font-medium text-white truncate">{snippet.title}</span>
                    <span className="rounded bg-fs-bg border border-fs-border px-1.5 py-0.2 text-[10px] text-fs-textMuted">
                      {snippet.category}
                    </span>
                    {snippet.auto_enter === 1 ? (
                      <span className="flex items-center text-[10px] text-fs-accent/80" title="执行后自动回车">
                        <CornerDownLeft className="w-2.5 h-2.5 mr-0.5" />
                        <span>自动回车</span>
                      </span>
                    ) : (
                      <span className="text-[10px] text-fs-textMuted/60" title="仅填入命令，不自动执行">
                        仅填入
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-fs-info/90 truncate bg-fs-bg/60 px-2 py-0.5 rounded border border-fs-border/50 select-text">
                    {snippet.command}
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={() => handleRun(snippet)}
                    title={isBroadcastMode ? '广播执行' : '发送至终端执行'}
                    className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      isJustRan
                        ? 'bg-fs-accent text-white scale-105'
                        : 'bg-fs-primary/20 text-fs-info hover:bg-fs-primary hover:text-white'
                    }`}
                  >
                    {isJustRan ? (
                      <>
                        <Check className="w-3 h-3" />
                        <span>已发送</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3 h-3 fill-current" />
                        <span>执行</span>
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleOpenEdit(snippet)}
                    title="编辑命令"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-white transition-opacity"
                  >
                    <Edit2 className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => deleteSnippet(snippet.id)}
                    title="删除"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-danger transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. Add/Edit Inline Modal/Drawer */}
      {isAdding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-xl border border-fs-border bg-fs-surface p-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-fs-border pb-3 mb-4">
              <span className="text-sm font-semibold text-white">
                {editingSnippetId ? '编辑快捷命令' : '新建快捷命令'}
              </span>
              <button
                onClick={() => setIsAdding(false)}
                className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-fs-textMuted mb-1">命令名称 / 描述</label>
                <input
                  type="text"
                  required
                  placeholder="例如: 查看端口占用、重启 Nginx"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full rounded-lg border border-fs-border bg-fs-bg px-3 py-1.5 text-white focus:border-fs-primary focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-fs-textMuted mb-1">分组分类</label>
                <div className="flex items-center space-x-2">
                  <select
                    value={newCategory}
                    onChange={(e) => {
                      if (e.target.value === '__new__') {
                        setIsCreatingCategory(true);
                      } else {
                        setIsCreatingCategory(false);
                        setNewCategory(e.target.value);
                      }
                    }}
                    className="flex-1 rounded-lg border border-fs-border bg-fs-bg px-3 py-1.5 text-white focus:border-fs-primary focus:outline-hidden"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__new__">+ 新建分类...</option>
                  </select>
                </div>

                {isCreatingCategory && (
                  <div className="mt-2 flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="输入新分类名称"
                      value={newCategoryInput}
                      onChange={(e) => setNewCategoryInput(e.target.value)}
                      className="flex-1 rounded-lg border border-fs-border bg-fs-bg px-3 py-1 text-white focus:border-fs-primary focus:outline-hidden"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const trimmed = newCategoryInput.trim();
                        if (trimmed) {
                          addSnippetCategory(trimmed);
                          setNewCategory(trimmed);
                          setIsCreatingCategory(false);
                          setNewCategoryInput('');
                        }
                      }}
                      className="px-3 py-1 rounded bg-fs-primary text-white font-medium hover:bg-fs-primaryHover"
                    >
                      确定
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-fs-textMuted mb-1">Shell 命令内容</label>
                <textarea
                  required
                  rows={3}
                  placeholder="输入要执行的 Linux 命令，例如: netstat -tlpn"
                  value={newCommand}
                  onChange={(e) => setNewCommand(e.target.value)}
                  className="w-full font-mono rounded-lg border border-fs-border bg-fs-bg px-3 py-1.5 text-white focus:border-fs-primary focus:outline-hidden"
                />
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="auto_enter_checkbox"
                  checked={autoEnter}
                  onChange={(e) => setAutoEnter(e.target.checked)}
                  className="rounded border-fs-border bg-fs-bg text-fs-primary focus:ring-fs-primary"
                />
                <label htmlFor="auto_enter_checkbox" className="text-fs-text cursor-pointer select-none">
                  点击后自动回车执行（取消勾选则只填入命令行不执行）
                </label>
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-fs-border">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-3 py-1.5 rounded-lg border border-fs-border text-fs-text hover:bg-fs-hover"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-fs-primary hover:bg-fs-primaryHover text-white font-medium shadow"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Manager Modal */}
      <GroupManagerModal
        isOpen={isCategoryManagerOpen}
        onClose={() => setIsCategoryManagerOpen(false)}
        title="管理快捷命令分类"
        groups={categories}
        onAddGroup={addSnippetCategory}
        onRenameGroup={renameSnippetCategory}
        onDeleteGroup={deleteSnippetCategory}
      />
    </div>
  );
};
