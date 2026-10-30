import type { SystemMetrics } from '@shared/types';

export const MONITOR_SHELL_COMMAND = `
while true; do
  echo "---FS_METRIC_START---"
  date +%s
  echo "===FS_LOAD==="
  cat /proc/loadavg 2>/dev/null
  echo "===FS_MEM==="
  grep -h -E '^(cpu |MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree)' /proc/meminfo /proc/stat 2>/dev/null
  echo "===FS_NET==="
  cat /proc/net/dev 2>/dev/null
  echo "===FS_DF==="
  df -kP 2>/dev/null || df -k 2>/dev/null || df 2>/dev/null
  echo "===FS_PS==="
  (ps -eo pid,user,pcpu,pmem,comm --sort=-pcpu 2>/dev/null || ps aux 2>/dev/null || ps 2>/dev/null) | head -n 15
  echo "===FS_SYS==="
  cat /etc/os-release 2>/dev/null | grep -E '^(PRETTY_NAME|NAME)=' | head -n 1
  echo -n "UNAME="; uname -s -r -m 2>/dev/null
  echo -n "HOSTNAME="; cat /etc/hostname 2>/dev/null || uname -n 2>/dev/null
  echo -n "UPTIME="; cat /proc/uptime 2>/dev/null
  echo -n "CPUMODEL="; grep -E '^(model name|Hardware|Processor)' /proc/cpuinfo 2>/dev/null | head -n 1 | sed 's/.*:[ \t]*//'
  echo -n "CPUCORES="; (grep -c '^processor' /proc/cpuinfo 2>/dev/null || nproc 2>/dev/null || echo 1)
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
      // Split block by custom section delimiters
      const rawTimestamp = blockText.match(/---FS_METRIC_START---\s*\n\s*(\d+)/);
      const timestamp = rawTimestamp ? parseInt(rawTimestamp[1], 10) * 1000 : Date.now();

      // Extract section texts
      const getSection = (name: string): string => {
        const regex = new RegExp(`===${name}===([\\s\\S]*?)(?=(===FS_|---FS_METRIC_END---|$))`);
        const match = blockText.match(regex);
        return match ? match[1].trim() : '';
      };

      // 1. Load Average
      let loadAvg: [number, number, number] = [0, 0, 0];
      const loadSection = getSection('FS_LOAD') || (blockText.includes('===FS_') ? '' : blockText);
      const loadMatch = loadSection.match(/(\d+\.\d+)\s+(\d+\.\d+)\s+(\d+\.\d+)/);
      if (loadMatch) {
        loadAvg = [parseFloat(loadMatch[1]) || 0, parseFloat(loadMatch[2]) || 0, parseFloat(loadMatch[3]) || 0];
      }

      // 2. Memory & CPU lines
      const memSection = getSection('FS_MEM') || blockText;
      let memTotal = 0;
      let memFree = 0;
      let memAvail = 0;
      let memBuffers = 0;
      let memCached = 0;
      let swapTotal = 0;
      let swapFree = 0;
      let currentCpu: CpuTimes | null = null;

      for (const rawLine of memSection.split('\n')) {
        const line = rawLine.replace(/^\/proc\/[a-z]+:/, '').trim();
        if (line.startsWith('MemTotal:')) {
          memTotal = (parseInt(line.replace(/[^0-9]/g, ''), 10) || 0) * 1024;
        } else if (line.startsWith('MemFree:')) {
          memFree = (parseInt(line.replace(/[^0-9]/g, ''), 10) || 0) * 1024;
        } else if (line.startsWith('MemAvailable:')) {
          memAvail = (parseInt(line.replace(/[^0-9]/g, ''), 10) || 0) * 1024;
        } else if (line.startsWith('Buffers:')) {
          memBuffers = (parseInt(line.replace(/[^0-9]/g, ''), 10) || 0) * 1024;
        } else if (line.startsWith('Cached:')) {
          memCached = (parseInt(line.replace(/[^0-9]/g, ''), 10) || 0) * 1024;
        } else if (line.startsWith('SwapTotal:')) {
          swapTotal = (parseInt(line.replace(/[^0-9]/g, ''), 10) || 0) * 1024;
        } else if (line.startsWith('SwapFree:')) {
          swapFree = (parseInt(line.replace(/[^0-9]/g, ''), 10) || 0) * 1024;
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
      }

      if (memAvail === 0 && (memFree > 0 || memBuffers > 0 || memCached > 0)) {
        memAvail = memFree + memBuffers + memCached;
      }

      // Compute CPU %
      let cpuPercent = 0;
      if (currentCpu) {
        const currTotal =
          currentCpu.user +
          currentCpu.nice +
          currentCpu.system +
          currentCpu.idle +
          currentCpu.iowait +
          currentCpu.irq +
          currentCpu.softirq +
          currentCpu.steal;

        if (this.prevCpu) {
          const prevTotal =
            this.prevCpu.user +
            this.prevCpu.nice +
            this.prevCpu.system +
            this.prevCpu.idle +
            this.prevCpu.iowait +
            this.prevCpu.irq +
            this.prevCpu.softirq +
            this.prevCpu.steal;

          const totalDiff = currTotal - prevTotal;
          const idleDiff =
            currentCpu.idle + currentCpu.iowait - (this.prevCpu.idle + this.prevCpu.iowait);

          if (totalDiff > 0) {
            cpuPercent = Math.max(
              0,
              Math.min(100, Math.round(((totalDiff - idleDiff) / totalDiff) * 100))
            );
          }
        } else if (currTotal > 0) {
          const busy = currTotal - (currentCpu.idle + currentCpu.iowait);
          cpuPercent = Math.max(0, Math.min(100, Math.round((busy / currTotal) * 100)));
        }
      }
      this.prevCpu = currentCpu;

      // Compute Memory %
      const memUsed = Math.max(0, memTotal - memAvail);
      const memPercent = memTotal > 0 ? Math.round((memUsed / memTotal) * 100) : 0;
      const swapUsed = Math.max(0, swapTotal - swapFree);
      const swapPercent = swapTotal > 0 ? Math.round((swapUsed / swapTotal) * 100) : 0;

      // 3. Network Interfaces (/proc/net/dev)
      const netSection = getSection('FS_NET');
      let totalRx = 0;
      let totalTx = 0;
      for (const line of netSection.split('\n')) {
        if (line.includes(':')) {
          const parts = line.split(':');
          const iface = parts[0].trim();
          if (iface !== 'lo') {
            const stats = parts[1].trim().split(/\s+/);
            totalRx += parseInt(stats[0], 10) || 0;
            totalTx += parseInt(stats[8], 10) || 0;
          }
        }
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

      // 4. Disks (df -kP or df -k)
      const dfSection = getSection('FS_DF');
      const disks: SystemMetrics['disks'] = [];
      const ignoredFs = new Set(['tmpfs', 'devtmpfs', 'squashfs', 'udev', 'none', 'overlay', 'shm', 'run']);

      const dfLines = dfSection.split('\n');
      for (let i = 0; i < dfLines.length; i++) {
        let line = dfLines[i].trim();
        if (!line || line.startsWith('Filesystem') || line.startsWith('文件系统')) continue;

        let p = line.split(/\s+/);
        // If filesystem name is on its own line (common in some df outputs when device path is long)
        if (p.length === 1 && i + 1 < dfLines.length) {
          i++;
          p = [p[0], ...dfLines[i].trim().split(/\s+/)];
        }

        if (p.length >= 6) {
          const fs = p[0];
          const mount = p[p.length - 1];
          // Skip pseudo filesystems unless it's root mount
          if (ignoredFs.has(fs) && mount !== '/') continue;

          // Units in 1K blocks -> multiply by 1024 to get bytes
          const sizeKb = parseInt(p[1], 10) || 0;
          const usedKb = parseInt(p[2], 10) || 0;
          const availKb = parseInt(p[3], 10) || 0;
          const percentStr = p[4] || p[p.length - 2];
          const percent = parseInt(percentStr.replace('%', ''), 10) || 0;

          if (sizeKb > 0) {
            disks.push({
              fs,
              type: 'ext4',
              size: sizeKb * 1024,
              used: usedKb * 1024,
              avail: availKb * 1024,
              percent,
              mount,
            });
          }
        }
      }

      // 5. Processes (ps)
      const psSection = getSection('FS_PS');
      const procs: SystemMetrics['procs'] = [];
      const psLines = psSection.split('\n');

      let isHeader = true;
      for (const rawLine of psLines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Detect header
        if (isHeader && (line.includes('PID') || line.includes('%CPU') || line.includes('COMMAND'))) {
          isHeader = false;
          continue;
        }

        const p = line.split(/\s+/);
        // Supports both `ps -eo pid,user,pcpu,pmem,comm` (5+ fields) and `ps aux` (11+ fields)
        if (p.length >= 5) {
          // Check if first column is numeric PID
          if (/^\d+$/.test(p[0])) {
            // `ps -eo pid,user,pcpu,pmem,comm`
            const pid = parseInt(p[0], 10) || 0;
            const user = p[1];
            const cpu = parseFloat(p[2]) || 0;
            const mem = parseFloat(p[3]) || 0;
            const command = p.slice(4).join(' ');
            procs.push({ pid, user, cpu, mem, command });
          } else if (p.length >= 11 && /^\d+$/.test(p[1])) {
            // `ps aux` -> user, pid, %cpu, %mem, vsz, rss, tty, stat, start, time, command
            const user = p[0];
            const pid = parseInt(p[1], 10) || 0;
            const cpu = parseFloat(p[2]) || 0;
            const mem = parseFloat(p[3]) || 0;
            const command = p.slice(10).join(' ');
            procs.push({ pid, user, cpu, mem, command });
          }
        }
      }

      // 6. System Information (sys)
      const sysSection = getSection('FS_SYS');
      let sysInfo: SystemMetrics['sys'] = undefined;
      if (sysSection) {
        let os = '';
        let kernel = '';
        let arch = '';
        let hostname = '';
        let uptimeStr = '';
        let cpuModel = '';
        let cpuCores = 1;

        const sysLines = sysSection.split('\n').map((l) => l.trim()).filter(Boolean);
        for (const line of sysLines) {
          if (line.startsWith('PRETTY_NAME=') || line.startsWith('NAME=')) {
            os = line.replace(/^(PRETTY_NAME|NAME)=/, '').replace(/^["']|["']$/g, '');
          } else if (line.startsWith('UNAME=')) {
            const uval = line.substring(6).trim();
            const uparts = uval.split(/\s+/);
            if (uparts.length >= 3) {
              kernel = uparts[1] || '';
              arch = uparts[2] || '';
            } else {
              kernel = uval;
            }
          } else if (line.startsWith('HOSTNAME=')) {
            hostname = line.substring(9).trim();
          } else if (line.startsWith('UPTIME=')) {
            const upval = line.substring(7).trim();
            const totalSeconds = parseFloat(upval.split(/\s+/)[0]) || 0;
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);

            if (days > 0) {
              uptimeStr = `${days}天 ${hours}小时 ${minutes}分`;
            } else if (hours > 0) {
              uptimeStr = `${hours}小时 ${minutes}分`;
            } else {
              uptimeStr = `${Math.max(1, minutes)}分钟`;
            }
          } else if (line.startsWith('CPUMODEL=')) {
            cpuModel = line.substring(9).trim();
          } else if (line.startsWith('CPUCORES=')) {
            cpuCores = parseInt(line.substring(9).trim(), 10) || 1;
          } else if (line.includes('Linux') || line.includes('Darwin') || line.includes('BSD')) {
            const uparts = line.split(/\s+/);
            if (uparts.length >= 3) {
              kernel = uparts[1] || '';
              arch = uparts[2] || '';
            } else {
              kernel = line;
            }
          } else if (/^\d+(\.\d+)?\s+\d+/.test(line)) {
            // /proc/uptime: e.g. "345678.90 123456.78"
            const totalSeconds = parseFloat(line.split(/\s+/)[0]) || 0;
            const days = Math.floor(totalSeconds / 86400);
            const hours = Math.floor((totalSeconds % 86400) / 3600);
            const minutes = Math.floor((totalSeconds % 3600) / 60);

            if (days > 0) {
              uptimeStr = `${days}天 ${hours}小时 ${minutes}分`;
            } else if (hours > 0) {
              uptimeStr = `${hours}小时 ${minutes}分`;
            } else {
              uptimeStr = `${Math.max(1, minutes)}分钟`;
            }
          } else if (!hostname && line.length < 64 && !line.includes('/')) {
            hostname = line;
          }
        }

        if (os || kernel || arch || hostname || uptimeStr || cpuModel) {
          sysInfo = {
            os: os || 'Linux',
            kernel,
            arch,
            hostname,
            uptime: uptimeStr || '刚启动',
            cpuModel: cpuModel || undefined,
            cpuCores: cpuCores || 1,
          };
        }
      }

      return {
        timestamp,
        cpu: {
          percent: cpuPercent,
          cores: sysInfo?.cpuCores || 1,
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
        sys: sysInfo,
      };
    } catch {
      return null;
    }
  }
}
