import React from 'react';
import type { SystemMetrics } from '@shared/types';
import { Cpu, HardDrive, Wifi, Activity, Layers } from 'lucide-react';

interface MonitorPanelProps {
  metrics: SystemMetrics | null;
}

export const MonitorPanel: React.FC<MonitorPanelProps> = ({ metrics }) => {
  if (!metrics) {
    return (
      <div className="flex h-full w-full items-center justify-center text-xs text-fs-textMuted bg-fs-surface border-r border-fs-border">
        <span>等待服务器实时数据流...</span>
      </div>
    );
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec < 1024) return `${bytesPerSec} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / (1024 * 1024)).toFixed(2)} MB/s`;
  };

  return (
    <div className="flex h-full w-64 flex-col overflow-y-auto border-r border-fs-border bg-fs-surface p-2.5 space-y-3.5 text-xs select-none">
      {/* 1. CPU Section */}
      <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border">
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center space-x-1.5 font-medium text-white">
            <Cpu className="w-3.5 h-3.5 text-fs-info" />
            <span>CPU 使用率</span>
          </div>
          <span className="font-mono font-bold text-fs-info">{metrics.cpu.percent}%</span>
        </div>
        <div className="h-1.5 w-full rounded-full bg-fs-surface overflow-hidden">
          <div
            className={`h-full transition-all duration-500 ${
              metrics.cpu.percent > 80 ? 'bg-fs-danger' : metrics.cpu.percent > 50 ? 'bg-fs-warning' : 'bg-fs-info'
            }`}
            style={{ width: `${metrics.cpu.percent}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] text-fs-textMuted">
          <span>负载</span>
          <span className="font-mono">{(metrics.cpu?.loadAvg || []).map((v) => v.toFixed(2)).join(' ')}</span>
        </div>
      </div>

      {/* 2. Memory & Swap */}
      <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border space-y-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center space-x-1.5 font-medium text-white">
              <Layers className="w-3.5 h-3.5 text-fs-accent" />
              <span>内存</span>
            </div>
            <span className="font-mono font-bold text-fs-accent">{metrics.mem.percent}%</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-fs-surface overflow-hidden">
            <div
              className="h-full bg-fs-accent transition-all duration-500"
              style={{ width: `${metrics.mem.percent}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-fs-textMuted font-mono">
            <span>{formatBytes(metrics.mem.used)}</span>
            <span>{formatBytes(metrics.mem.total)}</span>
          </div>
        </div>

        {metrics.swap.total > 0 && (
          <div>
            <div className="flex justify-between text-[10px] text-fs-textMuted mb-0.5">
              <span>Swap</span>
              <span>{metrics.swap.percent}%</span>
            </div>
            <div className="h-1 w-full rounded-full bg-fs-surface overflow-hidden">
              <div
                className="h-full bg-fs-warning transition-all duration-500"
                style={{ width: `${metrics.swap.percent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Real-time Network */}
      <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border">
        <div className="flex items-center space-x-1.5 font-medium text-white mb-2">
          <Wifi className="w-3.5 h-3.5 text-fs-warning" />
          <span>实时网络</span>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center font-mono">
          <div className="rounded bg-fs-surface/80 p-1.5">
            <div className="text-[10px] text-fs-textMuted">下行 (入站)</div>
            <div className="font-bold text-fs-accent mt-0.5">{formatSpeed(metrics.net.rxSpeed)}</div>
          </div>
          <div className="rounded bg-fs-surface/80 p-1.5">
            <div className="text-[10px] text-fs-textMuted">上行 (出站)</div>
            <div className="font-bold text-fs-info mt-0.5">{formatSpeed(metrics.net.txSpeed)}</div>
          </div>
        </div>
      </div>

      {/* 4. Disks */}
      <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border">
        <div className="flex items-center space-x-1.5 font-medium text-white mb-2">
          <HardDrive className="w-3.5 h-3.5 text-fs-primary" />
          <span>存储空间</span>
        </div>
        <div className="space-y-2">
          {(metrics.disks || []).map((d, idx) => (
            <div key={idx} className="text-[10px]">
              <div className="flex justify-between text-fs-text mb-0.5">
                <span className="font-mono truncate max-w-[120px]">{d.mount}</span>
                <span className="text-fs-textMuted font-mono">
                  {formatBytes(d.used)} / {formatBytes(d.size)}
                </span>
              </div>
              <div className="h-1 w-full rounded-full bg-fs-surface overflow-hidden">
                <div
                  className={`h-full ${d.percent > 90 ? 'bg-fs-danger' : 'bg-fs-primary'}`}
                  style={{ width: `${d.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Top Processes */}
      <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border flex-1">
        <div className="flex items-center space-x-1.5 font-medium text-white mb-1.5">
          <Activity className="w-3.5 h-3.5 text-fs-danger" />
          <span>Top 进程</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono text-left">
            <thead>
              <tr className="text-fs-textMuted border-b border-fs-border">
                <th className="pb-1">PID</th>
                <th className="pb-1">名称</th>
                <th className="pb-1 text-right">CPU%</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-fs-border/40 text-fs-text">
              {(metrics.procs || []).slice(0, 6).map((p) => (
                <tr key={p.pid} className="hover:bg-fs-hover">
                  <td className="py-1 text-fs-textMuted">{p.pid}</td>
                  <td className="py-1 truncate max-w-[80px]" title={p.command}>
                    {p.command}
                  </td>
                  <td className="py-1 text-right font-bold text-fs-info">{p.cpu.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
