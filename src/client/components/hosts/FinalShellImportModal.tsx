import React, { useState, useRef } from 'react';
import { useSyncStore } from '../../store/useSyncStore';
import { useAuthStore } from '../../store/useAuthStore';
import { parseFinalShellConfig } from '../../crypto/finalshellDecoder';
import type { DecryptedHost } from '@shared/types';
import {
  Upload,
  FileText,
  CheckCircle2,
  AlertCircle,
  X,
  Server,
  Key,
  Lock,
  Loader2,
  Folder,
  CheckSquare,
  Square,
  FileCode2,
} from 'lucide-react';

interface FinalShellImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const FinalShellImportModal: React.FC<FinalShellImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { saveHost, addHostGroup, getHostGroups, fetchHosts } = useSyncStore();
  const { isVaultLocked, masterKey } = useAuthStore();

  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [pasteText, setPasteText] = useState('');
  const [parsedHosts, setParsedHosts] = useState<Partial<DecryptedHost>[]>([]);
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const availableGroups = getHostGroups();

  if (!isOpen) return null;

  const handleFiles = async (files: FileList | File[]) => {
    setError(null);
    setSuccessCount(null);
    const hostList: Partial<DecryptedHost>[] = [];

    try {
      for (const file of Array.from(files)) {
        const text = await file.text();
        const extracted = parseFinalShellConfig(text);
        hostList.push(...extracted);
      }

      if (hostList.length === 0) {
        setError('未能从所选文件中解析出有效的 FinalShell 主机连接配置。');
        return;
      }

      setParsedHosts(hostList);
      setSelectedIndices(new Set(hostList.map((_, i) => i)));
    } catch (err: any) {
      setError(err.message || '读取文件失败，请检查文件格式');
    }
  };

  const handlePasteParse = () => {
    setError(null);
    setSuccessCount(null);
    if (!pasteText.trim()) {
      setError('请先粘贴 FinalShell 配置内容');
      return;
    }

    const extracted = parseFinalShellConfig(pasteText);
    if (extracted.length === 0) {
      setError('未能解析出有效的服务器连接，请确保粘贴了正确的 FinalShell JSON 数据。');
      return;
    }

    setParsedHosts(extracted);
    setSelectedIndices(new Set(extracted.map((_, i) => i)));
  };

  const toggleSelectAll = () => {
    if (selectedIndices.size === parsedHosts.length) {
      setSelectedIndices(new Set());
    } else {
      setSelectedIndices(new Set(parsedHosts.map((_, i) => i)));
    }
  };

  const toggleSelect = (index: number) => {
    const next = new Set(selectedIndices);
    if (next.has(index)) {
      next.delete(index);
    } else {
      next.add(index);
    }
    setSelectedIndices(next);
  };

  const updateHostGroup = (index: number, newGroup: string) => {
    setParsedHosts((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], group_name: newGroup };
      return copy;
    });
  };

  const handleStartImport = async () => {
    if (selectedIndices.size === 0) {
      setError('请至少勾选一台要导入的服务器');
      return;
    }

    if (isVaultLocked || !masterKey) {
      setError('安全密码箱已锁定，请先解锁后再导入服务器配置');
      return;
    }

    setError(null);
    setIsProcessing(true);
    const toImport = parsedHosts.filter((_, idx) => selectedIndices.has(idx));
    setProgress({ current: 0, total: toImport.length });

    let count = 0;
    try {
      for (let i = 0; i < toImport.length; i++) {
        const item = toImport[i];
        const group = (item.group_name || '默认分组').trim();
        if (group && !availableGroups.includes(group)) {
          addHostGroup(group);
        }

        await saveHost({
          name: item.name || item.hostname || '未命名服务器',
          group_name: group,
          hostname: item.hostname || '',
          port: item.port || 22,
          username: item.username || 'root',
          auth_type: item.auth_type || 'password',
          credentials: item.credentials || {},
          sort_order: i,
        });

        count++;
        setProgress({ current: count, total: toImport.length });
      }

      await fetchHosts();
      setSuccessCount(count);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1200);
    } catch (err: any) {
      console.error('Import FinalShell failed:', err);
      setError(err.message || '导入服务器配置失败，请检查网络后重试');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-3 sm:p-6 select-none">
      <div className="flex flex-col w-full max-w-3xl max-h-[90vh] rounded-2xl border border-fs-border bg-fs-surface shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-fs-border px-5 py-4 bg-fs-bg/60">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-fs-primary/15 text-fs-accent border border-fs-primary/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-fs-text">
                导入 FinalShell 服务器配置
              </h3>
              <p className="text-[11px] text-fs-textMuted mt-0.5">
                支持 FinalShell 导出的 JSON 文件、conn 目录配置及 DES 加密密码自动解析
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-1.5 rounded-lg hover:bg-fs-hover text-fs-textMuted hover:text-fs-text transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {error && (
            <div className="flex items-start space-x-2 rounded-xl bg-fs-danger/10 border border-fs-danger/30 p-3 text-xs text-fs-danger">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successCount !== null && (
            <div className="flex items-center space-x-2 rounded-xl bg-fs-accent/15 border border-fs-accent/40 p-3 text-xs text-fs-accent font-medium">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <span>成功导入 {successCount} 台服务器！正在同步...</span>
            </div>
          )}

          {parsedHosts.length === 0 ? (
            <div className="space-y-4">
              {/* Mode switch */}
              <div className="flex rounded-xl bg-fs-bg p-1 border border-fs-border max-w-xs">
                <button
                  type="button"
                  onClick={() => setMode('upload')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center space-x-1.5 ${
                    mode === 'upload'
                      ? 'bg-fs-surface text-fs-text shadow-sm'
                      : 'text-fs-textMuted hover:text-fs-text'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>选择文件导入</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMode('paste')}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center justify-center space-x-1.5 ${
                    mode === 'paste'
                      ? 'bg-fs-surface text-fs-text shadow-sm'
                      : 'text-fs-textMuted hover:text-fs-text'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>粘贴配置文本</span>
                </button>
              </div>

              {mode === 'upload' ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files) {
                      handleFiles(e.dataTransfer.files);
                    }
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-fs-border hover:border-fs-primary/60 rounded-2xl p-8 sm:p-12 text-center cursor-pointer bg-fs-bg/30 hover:bg-fs-bg/60 transition-all flex flex-col items-center justify-center space-y-3"
                >
                  <div className="p-4 rounded-2xl bg-fs-primary/10 text-fs-info">
                    <FileCode2 className="w-10 h-10" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-fs-text">
                      点击选择或将 FinalShell 导出文件拖入此处
                    </p>
                    <p className="text-xs text-fs-textMuted mt-1">
                      支持选择单个或多个 <code className="text-fs-accent">.json</code> 文件（如 FinalShell conn 目录中的配置）
                    </p>
                  </div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    multiple
                    accept=".json,application/json,text/plain"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files) {
                        handleFiles(e.target.files);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-xl bg-fs-primary hover:bg-fs-primaryHover px-4 py-2 text-xs font-semibold text-white shadow transition-all"
                  >
                    浏览文件
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-fs-textMuted">
                    请将从 FinalShell 导出的 JSON 内容粘贴在下方文本框中：
                  </p>
                  <textarea
                    rows={8}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder='例如: [{"name":"服务器1","host":"1.2.3.4","port":22,"user_name":"root","password":"..."}, ...]'
                    className="w-full rounded-xl bg-fs-bg border border-fs-border p-3 text-xs font-mono text-fs-text placeholder-fs-textMuted focus:outline-none focus:border-fs-primary resize-y"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handlePasteParse}
                      className="rounded-xl bg-fs-primary hover:bg-fs-primaryHover px-4 py-2 text-xs font-semibold text-white transition-all shadow"
                    >
                      解析配置
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Parsed host preview list */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-fs-textMuted pb-2 border-b border-fs-border">
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={toggleSelectAll}
                    className="flex items-center space-x-1.5 font-medium text-fs-text hover:text-fs-accent"
                  >
                    {selectedIndices.size === parsedHosts.length ? (
                      <CheckSquare className="w-4 h-4 text-fs-accent" />
                    ) : (
                      <Square className="w-4 h-4 text-fs-textMuted" />
                    )}
                    <span>全选 ({selectedIndices.size}/{parsedHosts.length})</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setParsedHosts([]);
                    setSelectedIndices(new Set());
                    setPasteText('');
                    setError(null);
                  }}
                  className="text-xs text-fs-textMuted hover:text-fs-danger transition-colors"
                >
                  重新选择
                </button>
              </div>

              {/* Server table */}
              <div className="max-h-[360px] overflow-y-auto space-y-2 pr-1">
                {parsedHosts.map((host, idx) => {
                  const isChecked = selectedIndices.has(idx);
                  const hasPassword = !!host.credentials?.password;
                  const hasKey = !!host.credentials?.privateKey;

                  return (
                    <div
                      key={idx}
                      onClick={() => toggleSelect(idx)}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'border-fs-primary/40 bg-fs-primary/5'
                          : 'border-fs-border bg-fs-bg/40 opacity-70'
                      }`}
                    >
                      <div className="flex items-center space-x-3 mb-2 sm:mb-0">
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-fs-accent shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-fs-textMuted shrink-0" />
                        )}
                        <div>
                          <div className="flex items-center space-x-2 font-medium text-fs-text">
                            <Server className="w-3.5 h-3.5 text-fs-accent" />
                            <span>{host.name}</span>
                          </div>
                          <div className="text-[11px] text-fs-textMuted mt-0.5 font-mono">
                            {host.username}@{host.hostname}:{host.port}
                          </div>
                        </div>
                      </div>

                      <div
                        className="flex items-center space-x-3 sm:space-x-4 pl-7 sm:pl-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {/* Auth badge */}
                        <div className="flex items-center space-x-1 text-[11px]">
                          {host.auth_type === 'private_key' || hasKey ? (
                            <span className="flex items-center space-x-1 text-fs-info bg-fs-info/10 px-2 py-0.5 rounded">
                              <Key className="w-3 h-3" />
                              <span>私钥认证</span>
                            </span>
                          ) : hasPassword ? (
                            <span className="flex items-center space-x-1 text-fs-accent bg-fs-accent/10 px-2 py-0.5 rounded">
                              <Lock className="w-3 h-3" />
                              <span>密码已解密</span>
                            </span>
                          ) : (
                            <span className="text-fs-textMuted bg-fs-hover px-2 py-0.5 rounded">
                              无密码
                            </span>
                          )}
                        </div>

                        {/* Group selector / input */}
                        <div className="flex items-center space-x-1">
                          <Folder className="w-3.5 h-3.5 text-fs-warning" />
                          <input
                            type="text"
                            value={host.group_name || '默认分组'}
                            onChange={(e) => updateHostGroup(idx, e.target.value)}
                            placeholder="分组名称"
                            className="w-24 sm:w-28 rounded bg-fs-surface border border-fs-border px-2 py-1 text-[11px] text-fs-text focus:outline-none focus:border-fs-primary"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-fs-border px-5 py-3.5 bg-fs-bg/60">
          <div className="text-xs text-fs-textMuted">
            {parsedHosts.length > 0 && (
              <span>已选 {selectedIndices.size} / {parsedHosts.length} 台服务器</span>
            )}
          </div>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="rounded-xl bg-fs-hover hover:bg-fs-active px-4 py-2 text-xs text-fs-text transition-colors"
            >
              取消
            </button>
            {parsedHosts.length > 0 && (
              <button
                type="button"
                onClick={handleStartImport}
                disabled={isProcessing || selectedIndices.size === 0}
                className="flex items-center space-x-1.5 rounded-xl bg-fs-primary hover:bg-fs-primaryHover px-4 py-2 text-xs font-semibold text-white shadow disabled:opacity-50 transition-all"
              >
                {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>
                  {isProcessing
                    ? `正在导入 (${progress?.current || 0}/${progress?.total || 0})...`
                    : `确认导入 (${selectedIndices.size} 台)`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
