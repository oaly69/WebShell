import React from 'react';
import { useSessionStore } from '../../store/useSessionStore';

export const MobileKeyBar: React.FC = () => {
  const { sendInputToActive } = useSessionStore();

  const handleKeyClick = (code: string) => {
    sendInputToActive(code, false);
  };

  const keys = [
    { label: 'ESC', code: '\x1b' },
    { label: 'TAB', code: '\t' },
    { label: 'CTRL+C', code: '\x03' },
    { label: 'CTRL+Z', code: '\x1a' },
    { label: '↑', code: '\x1b[A' },
    { label: '↓', code: '\x1b[B' },
    { label: '←', code: '\x1b[D' },
    { label: '→', code: '\x1b[C' },
    { label: '~', code: '~' },
    { label: '/', code: '/' },
    { label: '|', code: '|' },
    { label: '-', code: '-' },
  ];

  return (
    <div className="flex sm:hidden h-10 w-full items-center space-x-1.5 overflow-x-auto border-t border-fs-border bg-fs-surface px-2 scrollbar-none shrink-0 select-none">
      {keys.map((k, idx) => (
        <button
          key={idx}
          onClick={() => handleKeyClick(k.code)}
          className="flex h-7 items-center justify-center rounded-lg bg-fs-bg hover:bg-fs-hover active:bg-fs-active border border-fs-border px-2.5 text-xs font-mono font-medium text-fs-text transition-colors shrink-0"
        >
          {k.label}
        </button>
      ))}
    </div>
  );
};
