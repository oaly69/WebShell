import type { SystemMetrics } from '@shared/types';

export const MONITOR_SHELL_COMMAND = `
TAG="FS"
while true; do
  echo "---"\${TAG}"_METRIC_START---"
  date +%s
  echo "==="\${TAG}"_LOAD==="
  (cat /proc/loadavg 2>/dev/null || uptime 2>/dev/null)
  echo "==="\${TAG}"_MEM==="
  (cat /proc/stat 2>/dev/null | grep '^cpu ')
  (cat /proc/meminfo 2>/dev/null | grep -E '^(MemTotal|MemFree|MemAvailable|Buffers|Cached|SwapTotal|SwapFree):')
  [ -f /sys/fs/cgroup/memory.current ] && printf "CGROUP_MEM_CURRENT=%s\\n" "$(cat /sys/fs/cgroup/memory.current 2>/dev/null)"
  [ -f /sys/fs/cgroup/memory.max ] && printf "CGROUP_MEM_MAX=%s\\n" "$(cat /sys/fs/cgroup/memory.max 2>/dev/null)"
  [ -f /sys/fs/cgroup/memory/memory.usage_in_bytes ] && printf "CGROUP_MEM_CURRENT=%s\\n" "$(cat /sys/fs/cgroup/memory/memory.usage_in_bytes 2>/dev/null)"
  [ -f /sys/fs/cgroup/memory/memory.limit_in_bytes ] && printf "CGROUP_MEM_MAX=%s\\n" "$(cat /sys/fs/cgroup/memory/memory.limit_in_bytes 2>/dev/null)"
  (free -b 2>/dev/null || free -k 2>/dev/null || free -m 2>/dev/null || free 2>/dev/null)
  echo "==="\${TAG}"_NET==="
  (cat /proc/net/dev 2>/dev/null || (for d in /sys/class/net/*; do [ -d "$d" ] && printf "%s: %s 0 0 0 0 0 0 0 %s\\n" "$(basename "$d")" "$(cat "$d/statistics/rx_bytes" 2>/dev/null || echo 0)" "$(cat "$d/statistics/tx_bytes" 2>/dev/null || echo 0)"; done 2>/dev/null))
  echo "==="\${TAG}"_DF==="
  (df -kP 2>/dev/null || df -k 2>/dev/null || df 2>/dev/null); (df -kP / 2>/dev/null || df -k / 2>/dev/null || df / 2>/dev/null)
  echo "==="\${TAG}"_PS==="
  (ps -eo pid,user,pcpu,pmem,comm --sort=-pcpu 2>/dev/null || ps aux 2>/dev/null || top -b -n 1 2>/dev/null || ps -ef 2>/dev/null || ps 2>/dev/null) | grep -v 'FS_' | grep -v 'METRIC_' | head -n 25
  echo "==="\${TAG}"_SYS==="
  OS=""; [ -f /etc/os-release ] && OS=$(grep -m 1 '^PRETTY_NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"'); [ -z "$OS" ] && [ -f /etc/os-release ] && OS=$(grep -m 1 '^NAME=' /etc/os-release 2>/dev/null | cut -d= -f2- | tr -d '"'); [ -z "$OS" ] && [ -f /etc/redhat-release ] && OS=$(cat /etc/redhat-release 2>/dev/null); [ -z "$OS" ] && [ -f /etc/alpine-release ] && OS="Alpine Linux $(cat /etc/alpine-release 2>/dev/null)"; [ -z "$OS" ] && [ -f /etc/issue ] && OS=$(head -n 1 /etc/issue 2>/dev/null | sed 's/\\\\.*//'); [ -z "$OS" ] && OS="Linux"; printf "PRETTY_NAME=%s\\n" "$OS"
  printf "UNAME=%s\\n" "$(uname -s -r -m 2>/dev/null)"
  printf "HOSTNAME=%s\\n" "$(cat /etc/hostname 2>/dev/null || uname -n 2>/dev/null || hostname 2>/dev/null)"
  printf "UPTIME=%s\\n" "$(cat /proc/uptime 2>/dev/null || uptime 2>/dev/null)"
  printf "CPUMODEL=%s\\n" "$(grep -E '^(model name|Hardware|Processor)' /proc/cpuinfo 2>/dev/null | head -n 1 | sed 's/.*:[ \\t]*//' || lscpu 2>/dev/null | grep 'Model name:' | sed 's/.*:[ \\t]*//' || uname -m 2>/dev/null)"
  printf "CPUCORES=%s\\n" "$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || getconf _NPROCESSORS_ONLN 2>/dev/null || echo 1)"
  echo "---"\${TAG}"_METRIC_END---"
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
      const rawTimestamp = blockText.match(/^\s*(\d+)/) || blockText.match(/---FS_METRIC_START---\s*(?:\r?\n)?\s*(\d+)/);
      const timestamp = rawTimestamp ? parseInt(rawTimestamp[1], 10) * 1000 : Date.now();

      // Extract section texts using line-anchored regex
      const getSection = (name: string): string => {
        const regex = new RegExp(`(?:^|\\r?\\n)===${name}===\\s*\\r?\\n([\\s\\S]*?)(?=(?:\\r?\\n===FS_|\\r?\\n---FS_METRIC_END---|$))`);
        const match = blockText.match(regex);
        return match ? match[1].trim() : '';
      };

      // 1. Load Average
      let loadAvg: [number, number, number] = [0, 0, 0];
      const loadSection = getSection('FS_LOAD') || (blockText.includes('===FS_') ? '' : blockText);
      const loadMatch = loadSection.match(/(\d+\.\d+)(?:,\s*|\s+)(\d+\.\d+)(?:,\s*|\s+)(\d+\.\d+)/);
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
      let cgroupMemCurrent = 0;
      let cgroupMemMax = 0;
      let currentCpu: CpuTimes | null = null;

      let freeMemTotal = 0;
      let freeMemUsed = 0;
      let freeMemFree = 0;
      let freeMemAvail = 0;
      let freeSwapTotal = 0;
      let freeSwapFree = 0;

      for (const rawLine of memSection.split('\n')) {
        const line = rawLine.replace(/^\/proc\/[a-z]+:/, '').trim().replace(/^-n\s+/, '');
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
        } else if (line.startsWith('CGROUP_MEM_CURRENT=')) {
          cgroupMemCurrent = parseInt(line.substring(19).trim(), 10) || 0;
        } else if (line.startsWith('CGROUP_MEM_MAX=')) {
          const val = line.substring(15).trim();
          if (/^\d+$/.test(val)) {
            cgroupMemMax = parseInt(val, 10) || 0;
          }
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
        } else if (line.startsWith('Mem:')) {
          const nums = line.split(/\s+/).slice(1).map((v) => parseInt(v, 10)).filter((v) => !isNaN(v));
          if (nums.length >= 3) {
            let mult = 1;
            if (nums[0] < 100000) mult = 1024 * 1024;
            else if (nums[0] < 50000000) mult = 1024;
            freeMemTotal = nums[0] * mult;
            freeMemUsed = nums[1] * mult;
            freeMemFree = nums[2] * mult;
            freeMemAvail = nums.length >= 6 ? nums[5] * mult : freeMemFree;
          }
        } else if (line.startsWith('Swap:')) {
          const nums = line.split(/\s+/).slice(1).map((v) => parseInt(v, 10)).filter((v) => !isNaN(v));
          if (nums.length >= 3) {
            let mult = 1;
            if (nums[0] < 100000) mult = 1024 * 1024;
            else if (nums[0] < 50000000) mult = 1024;
            freeSwapTotal = nums[0] * mult;
            freeSwapFree = nums[2] * mult;
          }
        }
      }

      // Fallback to free command if /proc/meminfo was missing/empty
      if (memTotal === 0 && freeMemTotal > 0) {
        memTotal = freeMemTotal;
        memAvail = freeMemAvail > 0 ? freeMemAvail : freeMemFree;
        if (swapTotal === 0 && freeSwapTotal > 0) {
          swapTotal = freeSwapTotal;
          swapFree = freeSwapFree;
        }
      }

      // Container cgroup override:
      // If cgroup memory limit is set (< 100TB, i.e. not unlimited 2^63-1)
      if (cgroupMemMax > 0 && cgroupMemMax < 100000000000000) {
        if (memTotal === 0 || cgroupMemMax < memTotal) {
          memTotal = cgroupMemMax;
        }
      }

      if (cgroupMemCurrent > 0 && memTotal > 0) {
        memAvail = Math.max(0, memTotal - cgroupMemCurrent);
      } else if (memAvail === 0 && (memFree > 0 || memBuffers > 0 || memCached > 0)) {
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

      // 3. Network Interfaces (/proc/net/dev or /sys/class/net)
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
            totalTx += parseInt(stats[8] || stats[stats.length - 1], 10) || 0;
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
      const ignoredFs = new Set(['tmpfs', 'devtmpfs', 'squashfs', 'udev', 'none', 'shm', 'run']);
      const seenMounts = new Set<string>();

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

        if (p.length >= 5) {
          const fs = p[0];
          const mount = p[p.length - 1];

          if (seenMounts.has(mount)) continue;
          if (ignoredFs.has(fs) && mount !== '/') continue;

          let sizeKb = 0;
          let usedKb = 0;
          let availKb = 0;
          let percent = 0;

          if (p.length >= 6) {
            sizeKb = parseInt(p[1], 10) || 0;
            usedKb = parseInt(p[2], 10) || 0;
            availKb = parseInt(p[3], 10) || 0;
            const percentStr = p[4] || p[p.length - 2];
            percent = parseInt(percentStr.replace('%', ''), 10) || 0;
          } else {
            sizeKb = parseInt(p[1], 10) || 0;
            usedKb = parseInt(p[2], 10) || 0;
            availKb = parseInt(p[3], 10) || 0;
            if (sizeKb > 0) {
              percent = Math.round((usedKb / sizeKb) * 100);
            }
          }

          if (sizeKb > 0) {
            seenMounts.add(mount);
            disks.push({
              fs,
              type: fs.includes('overlay') ? 'overlay' : 'ext4',
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

      let isTopHeader = false;
      for (const rawLine of psLines) {
        const line = rawLine.trim();
        if (!line) continue;

        // Detect header lines
        if (line.includes('PID') && (line.includes('USER') || line.includes('COMMAND') || line.includes('CMD') || line.includes('PPID'))) {
          if (line.includes('PPID') && line.includes('%CPU')) {
            isTopHeader = true;
          }
          continue;
        }
        if (line.startsWith('Mem:') || line.startsWith('CPU:') || line.startsWith('Load average:')) {
          continue;
        }

        const p = line.split(/\s+/);
        if (p.length < 4) continue;

        let pid = 0;
        let user = 'root';
        let cpu = 0;
        let mem = 0;
        let command = '';

        if (isTopHeader && p.length >= 8 && /^\d+$/.test(p[0])) {
          // BusyBox / toybox top -b -n 1:
          // PID PPID USER STAT VSZ %VSZ %CPU COMMAND...
          pid = parseInt(p[0], 10) || 0;
          user = p[2] || 'root';
          mem = parseFloat(p[5]?.replace('%', '')) || 0;
          cpu = parseFloat(p[6]?.replace('%', '')) || 0;
          command = p.slice(7).join(' ');
        } else if (/^\d+$/.test(p[0])) {
          // First column is numeric PID:
          pid = parseInt(p[0], 10) || 0;
          user = p[1] || 'root';

          if (p.length >= 5 && (/^\d+(\.\d+)?$/.test(p[2]) || /^\d+(\.\d+)?$/.test(p[3]))) {
            // ps -eo pid,user,pcpu,pmem,comm
            cpu = parseFloat(p[2]) || 0;
            mem = parseFloat(p[3]) || 0;
            command = p.slice(4).join(' ');
          } else if (p.length === 4) {
            // BusyBox ps: PID USER TIME COMMAND
            cpu = 0;
            mem = 0;
            command = p[3];
          } else {
            // BusyBox ps: PID USER VSZ STAT COMMAND...
            cpu = 0;
            mem = 0;
            command = p.slice(4).join(' ') || p[p.length - 1];
          }
        } else if (/^\d+$/.test(p[1])) {
          // Second column is numeric PID (e.g. ps aux or ps -ef):
          pid = parseInt(p[1], 10) || 0;
          user = p[0];

          if (p.length >= 11 && /^\d+(\.\d+)?$/.test(p[2]) && /^\d+(\.\d+)?$/.test(p[3])) {
            // ps aux: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND...
            cpu = parseFloat(p[2]) || 0;
            mem = parseFloat(p[3]) || 0;
            command = p.slice(10).join(' ');
          } else if (p.length >= 8) {
            // ps -ef: UID PID PPID C STIME TTY TIME CMD...
            cpu = parseFloat(p[3]) || 0;
            mem = 0;
            command = p.slice(7).join(' ');
          } else {
            command = p.slice(2).join(' ');
          }
        }

        if (pid > 0 && command && !command.includes('FS_') && !command.includes('METRIC_')) {
          procs.push({ pid, user, cpu, mem, command });
        }
      }

      // If /proc/stat was restricted, estimate CPU % from top processes
      if (!currentCpu && procs.length > 0) {
        const sumCpu = procs.reduce((acc, p) => acc + (p.cpu || 0), 0);
        if (sumCpu > 0) {
          cpuPercent = Math.min(100, Math.round(sumCpu));
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

        const sysLines = sysSection.split('\n').map((l) => l.trim().replace(/^-n\s+/, '')).filter(Boolean);
        for (const line of sysLines) {
          if (line.startsWith('PRETTY_NAME=')) {
            os = line.substring(12).replace(/^["']|["']$/g, '').trim();
          } else if (line.startsWith('NAME=') && !os) {
            os = line.substring(5).replace(/^["']|["']$/g, '').trim();
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
            if (!upval.includes(':') && /^\d+(\.\d+)?/.test(upval)) {
              // /proc/uptime seconds format
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
            } else if (upval.includes('up ')) {
              // uptime command string format
              const match = upval.match(/up\s+([^,]+(?:,\s*[^,]+)?)/);
              if (match) {
                let s = match[1].trim();
                s = s.replace(/days?/g, '天').replace(/hours?|hrs?/g, '小时').replace(/minutes?|mins?/g, '分');
                uptimeStr = s;
              } else {
                uptimeStr = upval;
              }
            }
          } else if (line.startsWith('CPUMODEL=')) {
            cpuModel = line.substring(9).trim();
          } else if (line.startsWith('CPUCORES=')) {
            cpuCores = parseInt(line.substring(9).trim(), 10) || 1;
          } else if (/^(Linux|Darwin|FreeBSD|OpenBSD)\s+(\S+)\s+(\S+)/i.test(line)) {
            const uparts = line.split(/\s+/);
            kernel = uparts[1] || '';
            arch = uparts[2] || '';
          } else if (/^\d+(\.\d+)?\s+\d+/.test(line)) {
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
          } else if (!hostname && !/\s/.test(line) && /^[a-zA-Z0-9][-a-zA-Z0-9_.]{0,62}$/.test(line)) {
            hostname = line;
          }
        }

        // Sanitize extracted fields against corrupted inputs
        if (kernel && (kernel.includes('printf') || kernel.includes('%') || kernel.includes('='))) {
          kernel = '';
        }
        if (arch && (!/^[a-zA-Z0-9_-]+$/.test(arch) || arch.includes('%') || arch.includes('='))) {
          arch = '';
        }
        if (cpuModel && (cpuModel.includes('PRETTY_NAME') || cpuModel.includes('%') || cpuModel.includes('='))) {
          cpuModel = '';
        }

        if (os || kernel || arch || hostname || uptimeStr || cpuModel) {
          sysInfo = {
            os: os || 'Linux',
            kernel,
            arch,
            hostname,
            uptime: uptimeStr || '刚启动',
            cpuModel: cpuModel || (arch ? `${arch} CPU` : 'Virtual CPU'),
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
