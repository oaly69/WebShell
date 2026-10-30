import React from 'react';
import type { SystemMetrics } from '@shared/types';
import { Cpu, HardDrive, Wifi, Activity, Layers, Server, Info, Clock } from 'lucide-react';

interface MonitorPanelProps {
  metrics: SystemMetrics | null;
  className?: string;
}

export const MonitorPanel: React.FC<MonitorPanelProps> = ({ metrics, className = '' }) => {
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

  if (!metrics) {
    return (
      <div className={`flex h-full w-full flex-col bg-fs-surface select-none ${className}`}>
        <div className="flex h-8 items-center justify-between border-b border-fs-border px-3 bg-fs-bg/60 text-xs shrink-0">
          <div className="flex items-center space-x-1.5 font-semibold text-fs-text">
            <Activity className="w-3.5 h-3.5 text-fs-info" />
            <span>状态监控</span>
          </div>
        </div>
        <div className="flex flex-1 items-center justify-center text-xs text-fs-textMuted p-4 text-center">
          <span>等待服务器实时监控数据流...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-full w-full flex-col bg-fs-surface select-none overflow-hidden ${className}`}>
      {/* FinalShell Style Header */}
      <div className="flex h-8 items-center justify-between border-b border-fs-border px-3 bg-fs-bg/60 text-xs shrink-0">
        <div className="flex items-center space-x-1.5 font-semibold text-fs-text">
          <Activity className="w-3.5 h-3.5 text-fs-info" />
          <span>状态监控</span>
        </div>
        <div className="flex items-center space-x-1 text-[10px] text-fs-accent font-mono">
          <span className="w-1.5 h-1.5 rounded-full bg-fs-accent animate-pulse" />
          <span>实时</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-3 text-xs">
        {/* 0. Server System Information (FinalShell 经典系统基本信息) */}
        {metrics.sys && (
          <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border">
            <div className="flex items-center space-x-1.5 font-medium text-fs-text mb-2">
              <Server className="w-3.5 h-3.5 text-fs-accent" />
              <span>系统信息</span>
            </div>
            <div className="space-y-1.5 text-[11px]">
              {metrics.sys.os && (
                <div className="flex justify-between items-center text-fs-text font-mono">
                  <span className="text-fs-textMuted">操作系统</span>
                  <span className="truncate max-w-[150px] font-medium" title={metrics.sys.os}>
                    {metrics.sys.os}
                  </span>
                </div>
              )}
              {metrics.sys.hostname && (
                <div className="flex justify-between items-center text-fs-text font-mono">
                  <span className="text-fs-textMuted">主机名称</span>
                  <span className="truncate max-w-[150px]" title={metrics.sys.hostname}>
                    {metrics.sys.hostname}
                  </span>
                </div>
              )}
              {metrics.sys.kernel && (
                <div className="flex justify-between items-center text-fs-text font-mono">
                  <span className="text-fs-textMuted">内核版本</span>
                  <span className="truncate max-w-[150px] text-[10px]" title={metrics.sys.kernel}>
                    {metrics.sys.kernel} {metrics.sys.arch ? `(${metrics.sys.arch})` : ''}
                  </span>
                </div>
              )}
              {metrics.sys.uptime && (
                <div className="flex justify-between items-center text-fs-text font-mono">
                  <span className="text-fs-textMuted flex items-center space-x-1">
                    <Clock className="w-3 h-3 inline" />
                    <span>运行时间</span>
                  </span>
                  <span className="text-fs-accent font-medium">{metrics.sys.uptime}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 1. CPU Section */}
        <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border">
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex items-center space-x-1.5 font-medium text-fs-text">
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
            <span>平均负载</span>
            <span className="font-mono">{(metrics.cpu?.loadAvg || []).map((v) => v.toFixed(2)).join(' ')}</span>
          </div>
        </div>

        {/* 2. Memory & Swap */}
        <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border space-y-2">
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-1.5 font-medium text-fs-text">
                <Layers className="w-3.5 h-3.5 text-fs-accent" />
                <span>物理内存</span>
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
                <span>虚拟内存 (Swap)</span>
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
          <div className="flex items-center space-x-1.5 font-medium text-fs-text mb-2">
            <Wifi className="w-3.5 h-3.5 text-fs-warning" />
            <span>网络流量</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-center font-mono">
            <div className="rounded bg-fs-surface/80 border border-fs-border/60 p-1.5">
              <div className="text-[10px] text-fs-textMuted">下行 (入站)</div>
              <div className="font-bold text-fs-accent mt-0.5">{formatSpeed(metrics.net.rxSpeed)}</div>
            </div>
            <div className="rounded bg-fs-surface/80 border border-fs-border/60 p-1.5">
              <div className="text-[10px] text-fs-textMuted">上行 (出站)</div>
              <div className="font-bold text-fs-info mt-0.5">{formatSpeed(metrics.net.txSpeed)}</div>
            </div>
          </div>
        </div>

        {/* 4. Disks */}
        <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border">
          <div className="flex items-center space-x-1.5 font-medium text-fs-text mb-2">
            <HardDrive className="w-3.5 h-3.5 text-fs-primary" />
            <span>磁盘分区</span>
          </div>
          {(!metrics.disks || metrics.disks.length === 0) ? (
            <div className="text-center py-2 text-[10px] text-fs-textMuted">暂未检测到独立挂载分区</div>
          ) : (
            <div className="space-y-2">
              {metrics.disks.map((d, idx) => (
                <div key={idx} className="text-[10px]">
                  <div className="flex justify-between text-fs-text mb-0.5">
                    <span className="font-mono truncate max-w-[120px] font-medium">{d.mount}</span>
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
          )}
        </div>

        {/* 5. Top Processes */}
        <div className="rounded-lg bg-fs-bg/60 p-2.5 border border-fs-border">
          <div className="flex items-center space-x-1.5 font-medium text-fs-text mb-1.5">
            <Activity className="w-3.5 h-3.5 text-fs-danger" />
            <span>Top 进程</span>
          </div>
          {(!metrics.procs || metrics.procs.length === 0) ? (
            <div className="text-center py-2 text-[10px] text-fs-textMuted">暂未获取到活跃进程列表</div>
          ) : (
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
                  {metrics.procs.slice(0, 6).map((p) => (
                    <tr key={p.pid} className="hover:bg-fs-hover">
                      <td className="py-1 text-fs-textMuted">{p.pid}</td>
                      <td className="py-1 truncate max-w-[80px]" title={p.command}>
                        {p.command}
                      </td>
                      <td className="py-1 text-right text-fs-danger">{(p.cpu || 0).toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
