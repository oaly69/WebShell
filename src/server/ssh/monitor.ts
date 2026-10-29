import type { SystemMetrics } from '@shared/types';

export const MONITOR_SHELL_COMMAND = `
while true; do
  echo "---FS_METRIC_START---"
  date +%s
  cat /proc/uptime /proc/loadavg 2>/dev/null
  grep -E '^(cpu |MemTotal|MemAvailable|Buffers|Cached|SwapTotal|SwapFree)' /proc/meminfo /proc/stat 2>/dev/null
  cat /proc/net/dev 2>/dev/null
  df -P -B1 -x tmpfs -x devtmpfs -x squashfs 2>/dev/null
  ps -eo pid,user,pcpu,pmem,comm --sort=-pcpu 2>/dev/null | head -n 11
  echo "---FS_METRIC_END---"
  sleep 2
done
`;

interface CpuTimes {
  user: number;
  nice: number;
  system: number;
  idle: number;
  iowait: number;
  irq: number;
  softirq: number;
  steal: number;
}

export class MetricsParser {
  private prevCpu: CpuTimes | null = null;
  private prevNet: { rx: number; tx: number; time: number } | null = null;

  public parseBlock(blockText: string): SystemMetrics | null {
    try {
      const lines = blockText.trim().split('\n');
      if (lines.length < 5) return null;

      const timestamp = parseInt(lines[0], 10) * 1000 || Date.now();
      let lineIdx = 1;

      // 1. Load Average
      const loadLine = lines[lineIdx++];
      const loadParts = loadLine.trim().split(/\s+/);
      const loadAvg: [number, number, number] = [
        parseFloat(loadParts[0]) || 0,
        parseFloat(loadParts[1]) || 0,
        parseFloat(loadParts[2]) || 0,
      ];

      // 2. Memory & CPU lines
      let memTotal = 0;
      let memAvail = 0;
      let swapTotal = 0;
      let swapFree = 0;
      let currentCpu: CpuTimes | null = null;

      while (lineIdx < lines.length) {
        const line = lines[lineIdx].trim();
        if (line.startsWith('Inter-|') || line.startsWith('face |') || line.startsWith('Filesystem')) {
          break;
        }

        if (line.startsWith('MemTotal:')) {
          memTotal = parseInt(line.replace(/[^0-9]/g, ''), 10) * 1024;
        } else if (line.startsWith('MemAvailable:')) {
          memAvail = parseInt(line.replace(/[^0-9]/g, ''), 10) * 1024;
        } else if (line.startsWith('SwapTotal:')) {
          swapTotal = parseInt(line.replace(/[^0-9]/g, ''), 10) * 1024;
        } else if (line.startsWith('SwapFree:')) {
          swapFree = parseInt(line.replace(/[^0-9]/g, ''), 10) * 1024;
        } else if (line.startsWith('cpu ')) {
          const p = line.split(/\s+/);
          currentCpu = {
            user: parseInt(p[1], 10) || 0,
            nice: parseInt(p[2], 10) || 0,
            system: parseInt(p[3], 10) || 0,
            idle: parseInt(p[4], 10) || 0,
            iowait: parseInt(p[5], 10) || 0,
            irq: parseInt(p[6], 10) || 0,
            softirq: parseInt(p[7], 10) || 0,
            steal: parseInt(p[8], 10) || 0,
          };
        }
        lineIdx++;
      }

      // Compute CPU %
      let cpuPercent = 0;
      if (currentCpu && this.prevCpu) {
        const prevTotal =
          this.prevCpu.user +
          this.prevCpu.nice +
          this.prevCpu.system +
          this.prevCpu.idle +
          this.prevCpu.iowait +
          this.prevCpu.irq +
          this.prevCpu.softirq +
          this.prevCpu.steal;
        const currTotal =
          currentCpu.user +
          currentCpu.nice +
          currentCpu.system +
          currentCpu.idle +
          currentCpu.iowait +
          currentCpu.irq +
          currentCpu.softirq +
          currentCpu.steal;

        const totalDiff = currTotal - prevTotal;
        const idleDiff = currentCpu.idle + currentCpu.iowait - (this.prevCpu.idle + this.prevCpu.iowait);

        if (totalDiff > 0) {
          cpuPercent = Math.max(0, Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100)));
        }
      }
      this.prevCpu = currentCpu;

      // Compute Memory %
      const memUsed = Math.max(0, memTotal - memAvail);
      const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
      const swapUsed = Math.max(0, swapTotal - swapFree);
      const swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;

      // 3. Network Interfaces (/proc/net/dev)
      let totalRx = 0;
      let totalTx = 0;
      while (lineIdx < lines.length) {
        const line = lines[lineIdx].trim();
        if (line.startsWith('Filesystem')) break;
        if (line.includes(':')) {
          const parts = line.split(':');
          const iface = parts[0].trim();
          if (iface !== 'lo') {
            const stats = parts[1].trim().split(/\s+/);
            totalRx += parseInt(stats[0], 10) || 0;
            totalTx += parseInt(stats[8], 10) || 0;
          }
        }
        lineIdx++;
      }

      let rxSpeed = 0;
      let txSpeed = 0;
      const nowSec = timestamp / 1000;
      if (this.prevNet) {
        const timeDelta = Math.max(0.5, nowSec - this.prevNet.time);
        rxSpeed = Math.max(0, Math.round((totalRx - this.prevNet.rx) / timeDelta));
        txSpeed = Math.max(0, Math.round((totalTx - this.prevNet.tx) / timeDelta));
      }
      this.prevNet = { rx: totalRx, tx: totalTx, time: nowSec };

      // 4. Disks (df)
      const disks: SystemMetrics['disks'] = [];
      while (lineIdx < lines.length) {
        const line = lines[lineIdx].trim();
        if (line.startsWith('PID') || line.includes('%CPU')) break;
        if (!line.startsWith('Filesystem') && line.length > 0) {
          const p = line.split(/\s+/);
          if (p.length >= 6) {
            const size = parseInt(p[1], 10) || 0;
            const used = parseInt(p[2], 10) || 0;
            const avail = parseInt(p[3], 10) || 0;
            const percent = parseInt(p[4].replace('%', ''), 10) || 0;
            disks.push({
              fs: p[0],
              type: 'ext4',
              size,
              used,
              avail,
              percent,
              mount: p[5],
            });
          }
        }
        lineIdx++;
      }

      // 5. Processes (ps)
      const procs: SystemMetrics['procs'] = [];
      while (lineIdx < lines.length) {
        const line = lines[lineIdx].trim();
        if (!line.startsWith('PID') && !line.includes('%CPU') && line.length > 0) {
          const p = line.split(/\s+/);
          if (p.length >= 5) {
            procs.push({
              pid: parseInt(p[0], 10) || 0,
              user: p[1],
              cpu: parseFloat(p[2]) || 0,
              mem: parseFloat(p[3]) || 0,
              command: p.slice(4).join(' '),
            });
          }
        }
        lineIdx++;
      }

      return {
        timestamp,
        cpu: {
          percent: cpuPercent,
          cores: 1,
          loadAvg,
        },
        mem: {
          total: memTotal,
          used: memUsed,
          free: memAvail,
          available: memAvail,
          percent: memPercent,
        },
        swap: {
          total: swapTotal,
          used: swapUsed,
          percent: swapPercent,
        },
        net: {
          rxSpeed,
          txSpeed,
        },
        disks,
        procs,
      };
    } catch {
      return null;
    }
  }
}
