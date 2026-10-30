import React, { useRef, useState } from 'react';
import type { TerminalSession } from '../../store/useSessionStore';
import { useSessionStore } from '../../store/useSessionStore';
import Editor from '@monaco-editor/react';
import {
  Folder,
  FileCode,
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Trash2,
  Download,
  X,
  Save,
  Upload,
  Edit3,
  AlertCircle,
} from 'lucide-react';
import { encodeControlMsg } from '@shared/ws-protocol';

interface SftpPanelProps {
  session: TerminalSession;
}

export const SftpPanel: React.FC<SftpPanelProps> = ({ session }) => {
  const { sftpNavigate, sftpRefresh } = useSessionStore();
  const [editingFile, setEditingFile] = useState<{ path: string; content: string } | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const currentPath = session.sftpPath || '/';

  const navigateUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    sftpNavigate(session.sessionId, upPath || '/');
  };

  const handleEntryClick = (entry: any) => {
    if (entry.isDirectory) {
      sftpNavigate(session.sessionId, entry.path);
    }
  };

  const handleEntryDoubleClick = (entry: any) => {
    if (entry.isDirectory) {
      sftpNavigate(session.sessionId, entry.path);
    } else {
      openEditor(entry.path);
    }
  };

  const openEditor = (filePath: string) => {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    setEditorLoading(true);

    const reqId = crypto.randomUUID();
    const handleFileContent = (event: MessageEvent) => {
      try {
        const u8 = new Uint8Array(event.data);
        if (u8[0] === 0x00) {
          const json = JSON.parse(new TextDecoder().decode(u8.subarray(1)));
          if (json.type === 'sftp_file_content' && json.reqId === reqId) {
            session.ws?.removeEventListener('message', handleFileContent);
            setEditorLoading(false);
            if (json.error) {
              alert(`打开文件失败: ${json.error}`);
            } else {
              setEditingFile({ path: filePath, content: json.content });
            }
          }
        }
      } catch {}
    };

    session.ws.addEventListener('message', handleFileContent);
    session.ws.send(
      encodeControlMsg({
        type: 'sftp_readfile',
        reqId,
        path: filePath,
      })
    );
  };

  const handleDownload = (entry: any) => {
    if (!session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    const reqId = crypto.randomUUID();
    const handleFileContent = (event: MessageEvent) => {
      try {
        const u8 = new Uint8Array(event.data);
        if (u8[0] === 0x00) {
          const json = JSON.parse(new TextDecoder().decode(u8.subarray(1)));
          if (json.type === 'sftp_file_content' && json.reqId === reqId) {
            session.ws?.removeEventListener('message', handleFileContent);
            if (json.error) {
              alert(`下载文件失败: ${json.error}`);
              return;
            }
            const blob = new Blob([json.content], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = entry.name;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        }
      } catch {}
    };

    session.ws.addEventListener('message', handleFileContent);
    session.ws.send(
      encodeControlMsg({
        type: 'sftp_readfile',
        reqId,
        path: entry.path,
      })
    );
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    setUploading(true);
    try {
      const arrayBuf = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuf);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
      }
      const base64Content = btoa(binary);
      const targetPath = currentPath.endsWith('/')
        ? `${currentPath}${file.name}`
        : `${currentPath}/${file.name}`;

      const reqId = crypto.randomUUID();
      session.ws.send(
        encodeControlMsg({
          type: 'sftp_writefile',
          reqId,
          path: targetPath,
          content: base64Content,
          encoding: 'base64',
        })
      );
    } catch (err: any) {
      alert(`上传失败: ${err.message}`);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const saveEditedFile = () => {
    if (!editingFile || !session.ws || session.ws.readyState !== WebSocket.OPEN) return;
    setSaveLoading(true);

    const reqId = crypto.randomUUID();
    session.ws.send(
      encodeControlMsg({
        type: 'sftp_writefile',
        reqId,
        path: editingFile.path,
        content: editingFile.content,
        encoding: 'utf-8',
      })
    );

    setTimeout(() => {
      setSaveLoading(false);
      setEditingFile(null);
    }, 300);
  };

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

  const handleCreateFolder = () => {
    const name = prompt('请输入新文件夹名称:');
    if (!name) return;
    const newDir = currentPath.endsWith('/') ? `${currentPath}${name}` : `${currentPath}/${name}`;
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

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="flex h-56 w-full flex-col border-t border-fs-border bg-fs-surface select-none">
      {/* 1. Header Toolbar & Breadcrumb */}
      <div className="flex h-8 items-center justify-between border-b border-fs-border px-3 bg-fs-bg/40 text-xs">
        <div className="flex items-center space-x-1 flex-1 mr-4 overflow-hidden">
          <button
            onClick={navigateUp}
            disabled={currentPath === '/'}
            title="返回上一级"
            className="p-1 rounded hover:bg-fs-hover disabled:opacity-30 text-fs-text"
          >
            <ArrowUp className="w-3.5 h-3.5" />
          </button>
          <span className="font-mono text-fs-text truncate">{currentPath}</span>
          {editorLoading && (
            <span className="text-[11px] text-fs-info animate-pulse ml-2">正在读取文件...</span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
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
            className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-fs-hover text-fs-text text-[11px] disabled:opacity-50"
          >
            <Upload className="w-3.5 h-3.5 text-fs-info" />
            <span>{uploading ? '上传中...' : '上传'}</span>
          </button>
          <button
            onClick={handleCreateFolder}
            title="新建文件夹"
            className="flex items-center space-x-1 px-2 py-0.5 rounded hover:bg-fs-hover text-fs-text text-[11px]"
          >
            <FolderPlus className="w-3.5 h-3.5 text-fs-accent" />
            <span>新建目录</span>
          </button>
          <button
            onClick={() => sftpRefresh(session.sessionId)}
            title="刷新"
            className="p-1 rounded hover:bg-fs-hover text-fs-text"
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
          <thead className="sticky top-0 bg-fs-surface text-fs-textMuted border-b border-fs-border">
            <tr>
              <th className="py-1 px-3">文件名</th>
              <th className="py-1 px-3 w-24">大小</th>
              <th className="py-1 px-3 w-24">权限</th>
              <th className="py-1 px-3 w-28 text-right">操作</th>
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
              session.sftpEntries.map((entry) => (
                <tr
                  key={entry.path}
                  onClick={() => handleEntryClick(entry)}
                  onDoubleClick={() => handleEntryDoubleClick(entry)}
                  className="hover:bg-fs-hover cursor-pointer group"
                >
                  <td className="py-1.5 px-3 flex items-center space-x-2">
                    {entry.isDirectory ? (
                      <Folder className="w-3.5 h-3.5 text-fs-warning shrink-0" />
                    ) : (
                      <FileCode className="w-3.5 h-3.5 text-fs-info shrink-0" />
                    )}
                    <span className="truncate max-w-sm">{entry.name}</span>
                  </td>
                  <td className="py-1.5 px-3 font-mono text-fs-textMuted">
                    {entry.isDirectory ? '-' : formatFileSize(entry.size)}
                  </td>
                  <td className="py-1.5 px-3 font-mono text-fs-textMuted">{entry.permissions}</td>
                  <td className="py-1.5 px-3 text-right space-x-1">
                    {!entry.isDirectory && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditor(entry.path);
                          }}
                          title="在线编辑"
                          className="opacity-70 group-hover:opacity-100 p-1 rounded hover:bg-fs-active text-fs-info transition-opacity"
                        >
                          <Edit3 className="w-3 h-3 inline" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(entry);
                          }}
                          title="下载文件"
                          className="opacity-70 group-hover:opacity-100 p-1 rounded hover:bg-fs-active text-fs-accent transition-opacity"
                        >
                          <Download className="w-3 h-3 inline" />
                        </button>
                      </>
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.path, entry.isDirectory);
                      }}
                      title="删除"
                      className="opacity-70 group-hover:opacity-100 p-1 rounded hover:bg-fs-active text-fs-danger transition-opacity"
                    >
                      <Trash2 className="w-3 h-3 inline" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 3. Monaco Online Editor Modal */}
      {editingFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-5xl flex-col rounded-xl border border-fs-border bg-fs-surface shadow-2xl overflow-hidden">
            <div className="flex h-10 items-center justify-between border-b border-fs-border px-4 bg-fs-bg">
              <span className="font-mono text-xs text-white truncate max-w-md">
                编辑文件: {editingFile.path}
              </span>
              <div className="flex items-center space-x-2">
                <button
                  onClick={saveEditedFile}
                  disabled={saveLoading}
                  className="flex items-center space-x-1.5 rounded bg-fs-accent hover:bg-fs-accent/90 px-3 py-1 text-xs font-medium text-black"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saveLoading ? '保存中...' : '保存 (Ctrl+S)'}</span>
                </button>
                <button
                  onClick={() => setEditingFile(null)}
                  className="p-1 rounded hover:bg-fs-hover text-fs-textMuted"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 w-full bg-[#1e1e1e]">
              <Editor
                height="100%"
                theme="vs-dark"
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

