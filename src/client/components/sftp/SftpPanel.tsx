import React, { useRef, useState, useEffect } from 'react';
import type { TerminalSession } from '../../store/useSessionStore';
import type { SftpEntry } from '@shared/types';
import { useSessionStore } from '../../store/useSessionStore';
import { useThemeStore } from '../../store/useThemeStore';
import Editor from '@monaco-editor/react';
import {
  Folder,
  FileCode,
  ArrowUp,
  RefreshCw,
  FolderPlus,
  FilePlus,
  Trash2,
  Download,
  X,
  Save,
  Upload,
  Edit3,
  Edit2,
  AlertCircle,
  Home,
  Loader2,
} from 'lucide-react';
import { encodeControlMsg } from '@shared/ws-protocol';

interface SftpPanelProps {
  session: TerminalSession;
  className?: string;
}

export const SftpPanel: React.FC<SftpPanelProps> = ({ session, className = '' }) => {
  const { sftpNavigate, sftpRefresh } = useSessionStore();
  const { theme } = useThemeStore();
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentPath = session.sftpPath || '/';
  const [pathInput, setPathInput] = useState(currentPath);

  useEffect(() => {
    setPathInput(currentPath);
  }, [currentPath]);

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pathInput.trim()) {
      sftpNavigate(session.sessionId, pathInput.trim());
    }
  };

  const navigateUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    sftpNavigate(session.sessionId, upPath || '/');
  };

  const navigateHome = () => {
    sftpNavigate(session.sessionId, '.');
  };

  const handleEntryClick = (entry: SftpEntry) => {
    if (entry.isDirectory) {
      sftpNavigate(session.sessionId, entry.path);
    }
  };

  const handleEntryDoubleClick = (entry: SftpEntry) => {
    if (entry.isDirectory) {
      sftpNavigate(session.sessionId, entry.path);
    } else {
      openEditor(entry.path);
    }
  };

  // Open file in Monaco Editor
  const openEditor = (filePath: string) => {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) {
      alert('SSH/SFTP 会话未连接');
      return;
    }
    setEditorLoading(true);

    const reqId = crypto.randomUUID();
    const timer = setTimeout(() => {
      session.onControlMsgCallbacks.delete(onControl);
      setEditorLoading(false);
      alert('读取文件超时，请检查网络或重试');
    }, 15000);

    const onControl = (msg: any) => {
      if (msg.type === 'sftp_file_content' && msg.reqId === reqId) {
        clearTimeout(timer);
        session.onControlMsgCallbacks.delete(onControl);
        setEditorLoading(false);

        if (!msg.error) {
          let content = msg.content || '';
          if (msg.encoding === 'base64') {
            try {
              const binaryStr = atob(content);
              const bytes = new Uint8Array(binaryStr.length);
              for (let i = 0; i < binaryStr.length; i++) {
                bytes[i] = binaryStr.charCodeAt(i);
              }
              content = new TextDecoder('utf-8').decode(bytes);
            } catch {
              content = msg.content;
            }
          }
          setEditingFile({ path: filePath, content });
        } else {
          alert(`读取文件失败: ${msg.error}`);
        }
      }
    };

    session.onControlMsgCallbacks.add(onControl);
    session.ws.send(
      encodeControlMsg({
        type: 'sftp_readfile',
        reqId,
        path: filePath,
        encoding: 'utf-8',
        maxBytes: 10 * 1024 * 1024,
      })
    );
  };

  // Save edited file back to server
  const saveEditedFile = () => {
    if (!editingFile || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    setSaveLoading(true);

    const reqId = crypto.randomUUID();
    const timer = setTimeout(() => {
      session.onControlMsgCallbacks.delete(onControl);
      setSaveLoading(false);
      alert('保存文件超时');
    }, 15000);

    const onControl = (msg: any) => {
      if (msg.type === 'sftp_op_result' && msg.reqId === reqId && msg.action === 'writefile') {
        clearTimeout(timer);
        session.onControlMsgCallbacks.delete(onControl);
        setSaveLoading(false);

        if (msg.success) {
          setEditingFile(null);
          sftpRefresh(session.sessionId);
        } else {
          alert(`保存文件失败: ${msg.error || '未知错误'}`);
        }
      }
    };

    session.onControlMsgCallbacks.add(onControl);
    session.ws.send(
      encodeControlMsg({
        type: 'sftp_writefile',
        reqId,
        path: editingFile.path,
        content: editingFile.content,
        encoding: 'utf-8',
      })
    );
  };

  // File Upload
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;

    if (file.size > 50 * 1024 * 1024) {
      alert('网页版暂支持上传 50MB 以内的文件');
      return;
    }

    setUploading(true);
    const targetFilePath = currentPath.endsWith('/')
      ? `${currentPath}${file.name}`
      : `${currentPath}/${file.name}`;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binaryStr = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binaryStr += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as any);
      }
      const base64Content = btoa(binaryStr);

      const reqId = crypto.randomUUID();
      const timer = setTimeout(() => {
        session.onControlMsgCallbacks.delete(onControl);
        setUploading(false);
      }, 30000);

      const onControl = (msg: any) => {
        if (msg.type === 'sftp_op_result' && msg.reqId === reqId && msg.action === 'writefile') {
          clearTimeout(timer);
          session.onControlMsgCallbacks.delete(onControl);
          setUploading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';

          if (msg.success) {
            sftpRefresh(session.sessionId);
          } else {
            alert(`上传失败: ${msg.error}`);
          }
        }
      };

      session.onControlMsgCallbacks.add(onControl);
      session.ws.send(
        encodeControlMsg({
          type: 'sftp_writefile',
          reqId,
          path: targetFilePath,
          content: base64Content,
          encoding: 'base64',
        })
      );
    } catch (err: any) {
      setUploading(false);
      alert(`读取本地文件失败: ${err.message}`);
    }
  };

  // File Download (Supports all binary files via base64 transfer)
  const handleDownload = (entry: SftpEntry) => {
    if (entry.isDirectory) return;
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) {
      alert('SSH/SFTP 会话未连接');
      return;
    }

    setDownloadingPath(entry.path);
    const reqId = crypto.randomUUID();
    const timer = setTimeout(() => {
      session.onControlMsgCallbacks.delete(onControl);
      setDownloadingPath(null);
      alert('下载超时，请重试');
    }, 30000);

    const onControl = (msg: any) => {
      if (msg.type === 'sftp_file_content' && msg.reqId === reqId) {
        clearTimeout(timer);
        session.onControlMsgCallbacks.delete(onControl);
        setDownloadingPath(null);

        if (!msg.error) {
          let blob: Blob;
          if (msg.encoding === 'base64') {
            const binaryStr = atob(msg.content);
            const len = binaryStr.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
              bytes[i] = binaryStr.charCodeAt(i);
            }
            blob = new Blob([bytes], { type: 'application/octet-stream' });
          } else {
            blob = new Blob([msg.content], { type: 'text/plain;charset=utf-8' });
          }

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = entry.name;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          alert(`下载失败: ${msg.error}`);
        }
      }
    };

    session.onControlMsgCallbacks.add(onControl);
    session.ws.send(
      encodeControlMsg({
        type: 'sftp_readfile',
        reqId,
        path: entry.path,
        encoding: 'base64',
        maxBytes: 50 * 1024 * 1024,
      })
    );
  };

  // Create New File
  const handleCreateFile = () => {
    const name = prompt('请输入新文件名称:');
    if (!name || !name.trim()) return;
    const newFile = currentPath.endsWith('/')
      ? `${currentPath}${name.trim()}`
      : `${currentPath}/${name.trim()}`;

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      const reqId = crypto.randomUUID();
      session.ws.send(
        encodeControlMsg({
          type: 'sftp_writefile',
          reqId,
          path: newFile,
          content: '',
          encoding: 'utf-8',
        })
      );
    }
  };

  // Create New Folder
  const handleCreateFolder = () => {
    const name = prompt('请输入新文件夹名称:');
    if (!name || !name.trim()) return;
    const newDir = currentPath.endsWith('/')
      ? `${currentPath}${name.trim()}`
      : `${currentPath}/${name.trim()}`;

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      const reqId = crypto.randomUUID();
      session.ws.send(
        encodeControlMsg({
          type: 'sftp_mkdir',
          reqId,
          path: newDir,
        })
      );
    }
  };

  // Rename File / Folder
  const handleRename = (entry: SftpEntry) => {
    const newName = prompt(`请输入「${entry.name}」的新名称:`, entry.name);
    if (!newName || !newName.trim() || newName.trim() === entry.name) return;

    const parentDir = entry.path.substring(0, entry.path.lastIndexOf('/')) || '/';
    const targetPath = parentDir.endsWith('/')
      ? `${parentDir}${newName.trim()}`
      : `${parentDir}/${newName.trim()}`;

    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      const reqId = crypto.randomUUID();
      session.ws.send(
        encodeControlMsg({
          type: 'sftp_rename',
          reqId,
          oldPath: entry.path,
          newPath: targetPath,
        })
      );
    }
  };

  // Delete File / Folder
  const handleDelete = (path: string, isDirectory: boolean) => {
    if (!confirm(`确定删除 ${isDirectory ? '文件夹' : '文件'} ${path} 吗?`)) return;
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
      const reqId = crypto.randomUUID();
      session.ws.send(
        encodeControlMsg({
          type: 'sftp_rm',
          reqId,
          path,
          isDirectory,
        })
      );
    }
  };

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={`flex h-full w-full flex-col bg-fs-surface select-none overflow-hidden ${className}`}>
      {/* 1. Header Tab & Action Toolbar (FinalShell Style) */}
      <div className="flex h-8 items-center justify-between border-b border-fs-border px-2.5 bg-fs-bg/60 text-xs shrink-0">
        {/* Left: Tab Title & Navigation Controls */}
        <div className="flex items-center space-x-1 flex-1 mr-2 overflow-hidden">
          <div className="flex items-center space-x-1.5 px-2 py-0.5 rounded font-semibold text-fs-text shrink-0">
            <Folder className="w-3.5 h-3.5 text-fs-accent" />
            <span className="hidden sm:inline">文件 (SFTP)</span>
          </div>

          <div className="h-3.5 w-px bg-fs-border shrink-0 mx-1" />

          {/* Navigation Buttons: Back / Up / Home */}
          <button
            onClick={navigateUp}
            disabled={currentPath === '/' || currentPath === ''}
            title="返回上一级目录"
            className="p-1 rounded hover:bg-fs-hover disabled:opacity-30 text-fs-text shrink-0 transition-colors"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={navigateHome}
            title="回到用户家目录 (~)"
            className="p-1 rounded hover:bg-fs-hover text-fs-text shrink-0 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
          </button>

          {/* Path Address Input (Press Enter to navigate) */}
          <form onSubmit={handlePathSubmit} className="flex-1 min-w-[120px] max-w-md">
            <input
              type="text"
              value={pathInput}
              onChange={(e) => setPathInput(e.target.value)}
              placeholder="/path/to/dir"
              title="输入路径回车直接跳转"
              className="w-full bg-fs-bg border border-fs-border rounded px-2 py-0.5 font-mono text-[11px] text-fs-text focus:outline-none focus:border-fs-primary"
            />
          </form>

          {editorLoading && (
            <span className="text-[11px] text-fs-info animate-pulse shrink-0 hidden sm:inline flex items-center space-x-1">
              <Loader2 className="w-3 h-3 animate-spin inline" />
              <span>正在读取文件...</span>
            </span>
          )}
        </div>

        {/* Right Action Buttons */}
        <div className="flex items-center space-x-1 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            title="上传文件到当前目录"
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-fs-hover text-fs-text text-[11px] disabled:opacity-50 transition-colors"
          >
            <Upload className={`w-3.5 h-3.5 text-fs-info ${uploading ? 'animate-bounce' : ''}`} />
            <span>{uploading ? '上传中...' : '上传'}</span>
          </button>
          <button
            onClick={handleCreateFile}
            title="新建文件"
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-fs-hover text-fs-text text-[11px] transition-colors"
          >
            <FilePlus className="w-3.5 h-3.5 text-fs-info" />
            <span className="hidden sm:inline">新建文件</span>
          </button>
          <button
            onClick={handleCreateFolder}
            title="新建文件夹"
            className="flex items-center space-x-1 px-2 py-1 rounded hover:bg-fs-hover text-fs-text text-[11px] transition-colors"
          >
            <FolderPlus className="w-3.5 h-3.5 text-fs-accent" />
            <span className="hidden sm:inline">新建目录</span>
          </button>
          <button
            onClick={() => sftpRefresh(session.sessionId)}
            title="刷新文件列表"
            className="p-1.5 rounded hover:bg-fs-hover text-fs-text transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${session.sftpLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {session.sftpError && (
        <div className="flex items-center space-x-1.5 bg-fs-danger/10 border-b border-fs-danger/30 px-3 py-1 text-[11px] text-fs-danger">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{session.sftpError}</span>
        </div>
      )}

      {/* 2. File Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px] text-left">
          <thead className="sticky top-0 bg-fs-surface text-fs-textMuted border-b border-fs-border z-10">
            <tr>
              <th className="py-1 px-3">文件名</th>
              <th className="py-1 px-3 w-24">大小</th>
              <th className="py-1 px-3 w-24">权限</th>
              <th className="py-1 px-3 w-32 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-fs-border/40 text-fs-text">
            {session.sftpEntries.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-8 text-fs-textMuted">
                  {session.sftpLoading ? '正在加载目录...' : '空目录'}
                </td>
              </tr>
            ) : (
              session.sftpEntries.map((entry) => {
                const isDownloading = downloadingPath === entry.path;

                return (
                  <tr
                    key={entry.path}
                    onClick={() => handleEntryClick(entry)}
                    onDoubleClick={() => handleEntryDoubleClick(entry)}
                    className="hover:bg-fs-hover/80 cursor-pointer transition-colors group"
                  >
                    <td className="py-1.5 px-3 flex items-center space-x-2 truncate">
                      {entry.isDirectory ? (
                        <Folder className="w-4 h-4 text-fs-warning shrink-0" />
                      ) : (
                        <FileCode className="w-4 h-4 text-fs-info shrink-0" />
                      )}
                      <span className="truncate font-mono">{entry.name}</span>
                    </td>
                    <td className="py-1.5 px-3 font-mono text-fs-textMuted">
                      {entry.isDirectory ? '-' : formatFileSize(entry.size)}
                    </td>
                    <td className="py-1.5 px-3 font-mono text-fs-textMuted">
                      {entry.permissions || '-'}
                    </td>
                    <td className="py-1.5 px-3 text-right space-x-1 shrink-0">
                      {!entry.isDirectory && (
                        <>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditor(entry.path);
                            }}
                            title="在线编辑"
                            className="p-1 rounded hover:bg-fs-active text-fs-textMuted hover:text-fs-info"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDownload(entry);
                            }}
                            disabled={isDownloading}
                            title="下载文件"
                            className="p-1 rounded hover:bg-fs-active text-fs-textMuted hover:text-fs-accent disabled:opacity-50"
                          >
                            {isDownloading ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-fs-accent" />
                            ) : (
                              <Download className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRename(entry);
                        }}
                        title="重命名"
                        className="p-1 rounded hover:bg-fs-active text-fs-textMuted hover:text-fs-warning"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(entry.path, entry.isDirectory);
                        }}
                        title="删除"
                        className="p-1 rounded hover:bg-fs-active text-fs-textMuted hover:text-fs-danger"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* 3. Online Monaco Editor Modal */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="flex h-[85vh] w-[90vw] max-w-5xl flex-col rounded-2xl border border-fs-border bg-fs-surface shadow-2xl overflow-hidden">
            <div className="flex h-10 items-center justify-between border-b border-fs-border px-4 bg-fs-bg/60">
              <span className="font-mono text-xs font-semibold text-fs-text truncate">
                在线编辑: {editingFile.path}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={saveEditedFile}
                  disabled={saveLoading}
                  className="flex items-center space-x-1.5 rounded bg-fs-accent hover:bg-fs-accent/90 px-3 py-1 text-xs font-medium text-white shadow transition-colors disabled:opacity-50"
                >
                  {saveLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>{saveLoading ? '保存中...' : '保存'}</span>
                </button>
                <button
                  onClick={() => setEditingFile(null)}
                  className="p-1 rounded hover:bg-fs-hover text-fs-textMuted hover:text-fs-text"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 w-full bg-fs-surface overflow-hidden">
              <Editor
                height="100%"
                theme={theme === 'dark' ? 'vs-dark' : 'light'}
                path={editingFile.path}
                value={editingFile.content}
                onChange={(val) => setEditingFile({ ...editingFile, content: val || '' })}
                options={{
                  fontSize: 13,
                  minimap: { enabled: false },
                  automaticLayout: true,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
