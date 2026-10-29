import React, { useState } from 'react';
import type { TerminalSession } from '../../store/useSessionStore';
import { useSessionStore } from '../../store/useSessionStore';
import Editor from '@monaco-editor/react';
import {
  Folder,
  File,
  FileCode,
  ArrowUp,
  RefreshCw,
  FolderPlus,
  Trash2,
  Download,
  X,
  Save,
  Upload,
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

  const currentPath = session.sftpPath || '/';

  const navigateUp = () => {
    if (currentPath === '/' || currentPath === '') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const upPath = '/' + parts.join('/');
    sftpNavigate(session.sessionId, upPath || '/');
  };

  const handleEntryDoubleClick = (entry: any) => {
    if (entry.isDirectory) {
      sftpNavigate(session.sessionId, entry.path);
    } else {
      // Open with Monaco Editor
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
            setEditingFile({ path: filePath, content: json.content });
            setEditorLoading(false);
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
      })
    );

    setTimeout(() => {
      setSaveLoading(false);
      setEditingFile(null);
      sftpRefresh(session.sessionId);
    }, 400);
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
      setTimeout(() => sftpRefresh(session.sessionId), 300);
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
      setTimeout(() => sftpRefresh(session.sessionId), 300);
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
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
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

      {/* 2. File Table */}
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-[11px] text-left">
          <thead className="sticky top-0 bg-fs-surface text-fs-textMuted border-b border-fs-border">
            <tr>
              <th className="py-1 px-3">文件名</th>
              <th className="py-1 px-3 w-24">大小</th>
              <th className="py-1 px-3 w-24">权限</th>
              <th className="py-1 px-3 w-20 text-right">操作</th>
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
                  <td className="py-1.5 px-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(entry.path, entry.isDirectory);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-fs-active text-fs-danger transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
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
