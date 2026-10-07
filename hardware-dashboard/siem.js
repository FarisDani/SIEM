/**
 * SIEM & SOC Security Operations Center Dashboard Controller
 * DSS-V1 Luxury Minimalist Style
 */

// Global State
let streamActive = true;
let streamInterval = null;
let activeEventFilter = 'ALL';
let activeSocView = 'PROCESSES';
let logSearchQuery = '';
let procSearchQuery = '';
const windowFirstSeenMap = new Map();

// Process Sentinel State
let activeProcFilter = 'ALL';
let processViewMode = 'FLAT'; // 'FLAT' (individual PIDs) or 'GROUPED' (hierarchical tree / aggregate by app)
const expandedProcGroups = new Set();
let processSort = {
  column: 'cpu',
  direction: 'desc'
};

function setProcessViewMode(mode) {
  processViewMode = mode;
  const btnFlat = document.getElementById('proc-view-flat');
  const btnGrouped = document.getElementById('proc-view-grouped');
  const treeControls = document.getElementById('tree-toggle-controls');
  if (btnFlat && btnGrouped) {
    if (mode === 'FLAT') {
      btnFlat.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition bg-white text-[#0A0A0A] shadow-xs';
      btnGrouped.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition text-[#888886] hover:text-[#0A0A0A]';
    } else {
      btnGrouped.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition bg-white text-[#0A0A0A] shadow-xs';
      btnFlat.className = 'px-2.5 py-1 rounded-md text-[11px] font-semibold transition text-[#888886] hover:text-[#0A0A0A]';
    }
  }
  if (treeControls) {
    if (mode === 'GROUPED') {
      treeControls.classList.remove('hidden');
      treeControls.classList.add('flex');
    } else {
      treeControls.classList.add('hidden');
      treeControls.classList.remove('flex');
    }
  }
  renderProcessesTable();
}

function toggleProcGroup(groupKey) {
  if (expandedProcGroups.has(groupKey)) {
    expandedProcGroups.delete(groupKey);
  } else {
    expandedProcGroups.add(groupKey);
  }
  renderProcessesTable();
}

function expandAllProcGroups() {
  const procs = hardwareState.topProcesses || [];
  procs.forEach(p => {
    const binerName = (p.Name || p.ProcessName || 'Process').replace(/\.exe$/i, '');
    const groupKey = (p.AppName || binerName).toLowerCase();
    expandedProcGroups.add(groupKey);
  });
  renderProcessesTable();
}

function collapseAllProcGroups() {
  expandedProcGroups.clear();
  renderProcessesTable();
}

// Trend Charts State
let chartCpu = null;
let chartRam = null;
let chartDisk = null;
let chartNet = null;

let activeNodeId = localStorage.getItem('hardware_dashboard_active_node') || 'node_fc44d2b0';
let registeredNodes = [];
let hardwareState = {};

// Helper: Clipboard Copy
async function copyToClipboard(text, btnElement = null, successText = '✓ Tersalin!') {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (btnElement) {
      const origHtml = btnElement.innerHTML;
      btnElement.innerHTML = successText;
      btnElement.classList.add('badge-success');
      setTimeout(() => {
        btnElement.innerHTML = origHtml;
        btnElement.classList.remove('badge-success');
      }, 1600);
    }
    return true;
  } catch (err) {
    console.error('Gagal menyalin:', err);
    return false;
  }
}

window.copyProcAudit = function(pid, btn) {
  const procs = hardwareState.topProcesses || [];
  const p = procs.find(item => String(item.PID || item.Id) === String(pid));
  if (!p) return;
  const name = p.AppName || p.Name || 'Process';
  const win = p.WindowTitle ? ` | Window: ${p.WindowTitle}` : '';
  const cpu = (p.CPU != null ? Number(p.CPU) : (p.CPU_Pct != null ? Number(p.CPU_Pct) : 0)).toFixed(1);
  const ram = (p.RAM_MB != null ? Number(p.RAM_MB) : (p.MemMB != null ? Number(p.MemMB) : 0)).toFixed(1);
  const disk = (p.Disk_MB != null ? Number(p.Disk_MB) : 0).toFixed(1);
  const str = `PID: ${pid} | App: ${name}${win} | CPU: ${cpu}% | RAM: ${ram}MB | Disk: ${disk}MB`;
  copyToClipboard(str, btn, '✓');
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Format process memory into btop-style auto-scaling units (G, M, K)
function formatBtopMem(mb) {
  const num = Number(mb) || 0;
  if (num >= 1024) {
    return `<span class="font-bold text-[#2563EB] bg-[#EFF6FF] px-1.5 py-0.5 rounded border border-[#BFDBFE]">${(num / 1024).toFixed(1)}G</span>`;
  }
  if (num >= 1) {
    return `<span class="font-bold text-[#0A0A0A]">${num.toFixed(0)}M</span>`;
  }
  return `<span class="font-mono text-[#888886]">${(num * 1024).toFixed(0)}K</span>`;
}

// Fetch Registered Nodes and Render Top Tabs
async function loadNodes() {
  try {
    const res = await fetch('/api/nodes');
    if (!res.ok) return;
    const data = await res.json();
    registeredNodes = data.nodes || [];

    // Ensure activeNodeId is valid
    if (!registeredNodes.some(n => n.id === activeNodeId)) {
      if (registeredNodes.length > 0) {
        activeNodeId = registeredNodes[0].id;
        localStorage.setItem('hardware_dashboard_active_node', activeNodeId);
      }
    }

    renderTopNodeTabs();
  } catch (err) {
    console.error('Gagal memuat daftar node:', err);
  }
}

// Render Top Monitored Endpoint Tabs
function renderTopNodeTabs() {
  const container = document.getElementById('top-node-tabs-container');
  if (!container) return;

  container.innerHTML = registeredNodes.map(node => {
    const isActive = node.id === activeNodeId;
    const isConn = node.type === 'LOCAL_HOST' || node.connected;
    const dotClass = isConn ? 'bg-[#16A34A]' : 'bg-[#DC2626]';
    const activeClass = isActive ? 'filter-pill active' : 'filter-pill';

    return `
      <button onclick="switchActiveNode('${node.id}')" class="${activeClass}">
        <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
        <span>${escapeHtml(node.name)}</span>
        <span class="pill-count">(${node.type === 'LOCAL_HOST' ? 'Local' : node.port})</span>
      </button>
    `;
  }).join('');
}

function switchActiveNode(nodeId) {
  if (nodeId === activeNodeId) return;
  activeNodeId = nodeId;
  localStorage.setItem('hardware_dashboard_active_node', nodeId);
  renderTopNodeTabs();
  updateMetrics();
}

// Fetch Metrics from Server for Active Node
async function updateMetrics() {
  if (!streamActive) return;

  try {
    const res = await fetch(`/api/hardware-metrics?node=${encodeURIComponent(activeNodeId)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    hardwareState = data;
    renderUI();
  } catch (err) {
    console.error('Error fetching SIEM metrics:', err);
    const connBadge = document.getElementById('connection-badge');
    const connText = document.getElementById('connection-status-text');
    if (connBadge && connText) {
      connBadge.className = 'badge badge-danger flex items-center gap-1.5 py-1 px-3';
      connText.innerText = 'DISCONNECTED';
    }
  }
}

// Render Master UI
function renderUI() {
  const { host, connected, latencyMs, cpu, gpu, storage, ramSummary, activeSockets, topProcesses, osEventLogs, systemSpecs } = hardwareState;

  // Connection Badge & Header
  const connBadge = document.getElementById('connection-badge');
  const connText = document.getElementById('connection-status-text');
  const activeNodeName = document.getElementById('active-node-name');
  const hostNameElem = document.getElementById('host-name');
  const osCaptionText = document.getElementById('os-caption-text');
  const cpuModelElem = document.getElementById('cpu-model');
  const sysUptimeText = document.getElementById('sys-uptime-text');
  const rttLatencyText = document.getElementById('rtt-latency-text');

  if (activeNodeName) activeNodeName.innerText = host || 'Target Endpoint';
  if (hostNameElem) hostNameElem.innerText = host || 'TARGET-ENDPOINT';

  if (osCaptionText && systemSpecs) {
    const osStr = systemSpecs.osCaption || (systemSpecs.osName ? `${systemSpecs.osName} ${systemSpecs.osArch || ''}` : 'Windows OS');
    osCaptionText.innerText = osStr;
  }

  if (cpuModelElem) {
    const model = (systemSpecs && systemSpecs.cpuName) || (cpu && cpu.model) || 'Processor';
    cpuModelElem.innerText = model;
  }

  if (sysUptimeText && systemSpecs) {
    sysUptimeText.innerText = systemSpecs.uptime || '—';
  }

  if (rttLatencyText) {
    rttLatencyText.innerText = latencyMs != null ? `${latencyMs} ms` : '—';
  }

  const cpuPct = (cpu && (cpu.loadPct != null ? cpu.loadPct : cpu.load)) != null ? Number(cpu.loadPct != null ? cpu.loadPct : cpu.load) : (hardwareState.cpu_load_pct || 0.0);
  const ramPct = (ramSummary && ramSummary.usedPct != null) ? Number(ramSummary.usedPct) : 0.0;
  const diskPct = (storage && (storage.activityPct != null ? storage.activityPct : storage.activity)) != null ? Number(storage.activityPct != null ? storage.activityPct : storage.activity) : 0.0;
  updateDynamicStatusBadge(cpuPct, ramPct, diskPct, connected);

  // 1. CPU Saturation Sentinel
  const statCpuVal = document.getElementById('stat-cpu-val');
  const cpuLoadBar = document.getElementById('cpu-load-bar');
  const cpuLoadBadge = document.getElementById('cpu-load-badge');
  const vcoreVal = document.getElementById('vcore-val');
  const cpuTempVal = document.getElementById('cpu-temp-val');
  const cpuPowerVal = document.getElementById('cpu-power-val');

  if (cpu) {
    const loadPct = cpu.loadPct != null ? cpu.loadPct : (cpu.load != null ? cpu.load : (hardwareState.cpu_load_pct || 0.0));
    if (statCpuVal) statCpuVal.innerText = `${loadPct.toFixed(1)}%`;
    if (vcoreVal) vcoreVal.innerText = cpu.vcore != null ? `${cpu.vcore.toFixed(3)} V` : 'N/A';
    const cpuLoadAvgVal = document.getElementById('cpu-loadavg-val');
    if (cpuLoadAvgVal) {
      const lAvg = cpu.loadAvg || [0.0, 0.0, 0.0];
      cpuLoadAvgVal.innerText = `${Number(lAvg[0] || 0).toFixed(2)}  ${Number(lAvg[1] || 0).toFixed(2)}  ${Number(lAvg[2] || 0).toFixed(2)}`;
    }
    if (cpuTempVal) cpuTempVal.innerText = cpu.temp != null ? `${cpu.temp.toFixed(1)}°C` : 'N/A';
    if (cpuPowerVal) cpuPowerVal.innerText = cpu.power != null ? `${cpu.power.toFixed(1)} W` : 'N/A';
    if (cpuLoadBar) cpuLoadBar.style.width = `${Math.min(100, Math.max(0, loadPct))}%`;

    const cpuLevel = loadPct >= 85.0 ? 'critical' : (loadPct >= 70.0 ? 'warning' : 'normal');
    const cpuLabel = loadPct >= 85.0 ? 'CRITICAL' : (loadPct >= 70.0 ? 'HIGH LOAD' : 'NORMAL');
    updateComponentStatusBadge('cpu-load-badge', 'cpu-status-dot', 'cpu-status-text', cpuLevel, cpuLabel);

    // HTOP Tasks & Threads Counter
    const statTasksProcs = document.getElementById('stat-tasks-procs');
    const statTasksThreads = document.getElementById('stat-tasks-threads');
    const tasksData = hardwareState.tasks || {};
    if (statTasksProcs) statTasksProcs.innerText = tasksData.totalProcs || (hardwareState.topProcesses ? hardwareState.topProcesses.length : 0);
    if (statTasksThreads) statTasksThreads.innerText = tasksData.totalThreads ? Number(tasksData.totalThreads).toLocaleString() : '—';

    // HTOP Per-Core Digital Bars Grid
    const cpuCoresGrid = document.getElementById('cpu-cores-grid');
    if (cpuCoresGrid) {
      const coreLoads = (cpu && cpu.coreLoads && cpu.coreLoads.length > 0) ? cpu.coreLoads : [];
      if (coreLoads.length > 0) {
        cpuCoresGrid.innerHTML = coreLoads.map(cl => {
          const cNum = cl.Core != null ? cl.Core : 0;
          const cLoad = Math.min(100, Math.max(0, Number(cl.LoadPct || 0)));
          let colorClass = 'bg-[#16A34A]';
          if (cLoad > 80) colorClass = 'bg-[#DC2626]';
          else if (cLoad > 50) colorClass = 'bg-[#EAB308]';
          return `
            <div class="flex items-center gap-1.5 bg-white/70 px-1.5 py-0.5 rounded border border-[#E5E5E3]">
              <span class="text-[#888886] font-bold w-5 shrink-0">C${cNum}:</span>
              <div class="flex-1 bg-[#E5E5E3] rounded-full h-1.5 overflow-hidden">
                <div class="${colorClass} h-full rounded-full transition-all duration-300" style="width: ${cLoad}%"></div>
              </div>
              <span class="w-8 text-right font-bold text-[#0A0A0A] shrink-0">${cLoad.toFixed(1)}%</span>
            </div>
          `;
        }).join('');
      } else {
        cpuCoresGrid.innerHTML = `
          <div class="col-span-2 text-center text-[#888886] py-1 text-[10px]">
            Single Socket / Multi-Core Telemetry Standby
          </div>
        `;
      }
    }
  }

  // 2. Memory Saturation Sentinel
  const statRamVal = document.getElementById('stat-ram-val');
  const ramUsedText = document.getElementById('ram-used-text');
  const ramTotalText = document.getElementById('ram-total-text');
  const ramFreeText = document.getElementById('ram-free-text');
  const ramLoadBar = document.getElementById('ram-load-bar');
  const ramUsedSegment = document.getElementById('ram-used-segment');
  const ramCacheSegment = document.getElementById('ram-cache-segment');
  const ramDetailUsed = document.getElementById('ram-detail-used');
  const ramDetailCache = document.getElementById('ram-detail-cache');
  const ramDetailFree = document.getElementById('ram-detail-free');
  const ramCommitText = document.getElementById('ram-commit-text');
  const ramCommitBar = document.getElementById('ram-commit-bar');

  if (ramSummary) {
    const totGb = ramSummary.totalGb || 1.0;
    const usedGb = ramSummary.usedGb || 0.0;
    const cacheGb = ramSummary.cacheGb || 0.0;
    const freeGb = ramSummary.freeGb || Math.max(0, totGb - usedGb);
    const usedPct = ramSummary.usedPct != null ? ramSummary.usedPct : 0.0;

    if (statRamVal) statRamVal.innerText = `${usedPct.toFixed(1)}%`;
    if (ramUsedText) ramUsedText.innerText = `${usedGb.toFixed(1)} GB`;
    if (ramTotalText) ramTotalText.innerText = `${totGb.toFixed(1)} GB`;
    if (ramFreeText) ramFreeText.innerText = `${freeGb.toFixed(1)} GB`;
    if (ramLoadBar) ramLoadBar.style.width = `${Math.min(100, Math.max(0, usedPct))}%`;

    // Multi-segment RAM Bar (htop style)
    const segUsedPct = Math.min(100, (usedGb / totGb) * 100);
    const segCachePct = Math.min(100 - segUsedPct, (cacheGb / totGb) * 100);
    if (ramUsedSegment) ramUsedSegment.style.width = `${segUsedPct}%`;
    if (ramCacheSegment) ramCacheSegment.style.width = `${segCachePct}%`;

    // Detailed Breakdown Values
    if (ramDetailUsed) ramDetailUsed.innerText = `${usedGb.toFixed(1)} GB`;
    if (ramDetailCache) ramDetailCache.innerText = `${cacheGb.toFixed(2)} GB`;
    if (ramDetailFree) ramDetailFree.innerText = `${freeGb.toFixed(1)} GB`;

    // Commit Limit / Pagefile Meter
    const comGb = ramSummary.committedGb || 0.0;
    const limGb = ramSummary.commitLimitGb || 0.0;
    if (ramCommitText) {
      if (limGb > 0) {
        const comPct = Math.min(100, (comGb / limGb) * 100);
        ramCommitText.innerText = `${comGb.toFixed(1)} / ${limGb.toFixed(1)} GB (${comPct.toFixed(0)}%)`;
        if (ramCommitBar) ramCommitBar.style.width = `${comPct}%`;
      } else {
        ramCommitText.innerText = `${usedGb.toFixed(1)} / ${totGb.toFixed(1)} GB`;
        if (ramCommitBar) ramCommitBar.style.width = `${usedPct}%`;
      }
    }

    // Dedicated btop Swap / Pagefile Meter
    const ramSwapText = document.getElementById('ram-swap-text');
    const ramSwapPctElem = document.getElementById('ram-swap-pct');
    const ramSwapBar = document.getElementById('ram-swap-bar');
    if (ramSwapText) {
      const swapUsed = ramSummary.swapUsedGb != null ? ramSummary.swapUsedGb : Math.max(0, comGb - usedGb);
      const swapTot = ramSummary.swapTotalGb != null ? ramSummary.swapTotalGb : Math.max(0, limGb - totGb);
      const swapPct = swapTot > 0 ? Math.min(100, Math.max(0, (swapUsed / swapTot) * 100)) : 0;
      ramSwapText.innerText = `${swapUsed.toFixed(1)} / ${swapTot.toFixed(1)} GB`;
      if (ramSwapPctElem) ramSwapPctElem.innerText = `${swapPct.toFixed(0)}%`;
      if (ramSwapBar) ramSwapBar.style.width = `${swapPct}%`;
    }

    const ramLevel = usedPct >= 90.0 ? 'critical' : (usedPct >= 80.0 ? 'warning' : 'normal');
    const ramLabel = usedPct >= 90.0 ? 'OOM RISK' : (usedPct >= 80.0 ? 'HIGH LOAD' : 'OPTIMAL');
    updateComponentStatusBadge('ram-load-badge', 'ram-status-dot', 'ram-status-text', ramLevel, ramLabel);
  }

  // 3. Storage Drive Integrity & I/O (btop style)
  const storageTempVal = document.getElementById('storage-temp-val');
  const storageHealthText = document.getElementById('storage-health-text');
  const storageActivityText = document.getElementById('storage-activity-text');
  const storageReadVal = document.getElementById('storage-read-val');
  const storageWriteVal = document.getElementById('storage-write-val');
  const storageActivityBar = document.getElementById('storage-activity-bar');
  const storageModelText = document.getElementById('storage-model-text');
  const storagePartSummary = document.getElementById('storage-part-summary');

  if (storage) {
    if (storageTempVal) storageTempVal.innerText = storage.temp != null ? `${storage.temp}°C` : 'OK';
    if (storageHealthText) storageHealthText.innerText = storage.health || 'Healthy';
    const actPct = storage.activityPct != null ? storage.activityPct : (storage.activity || 0.0);
    const spd = storage.speedMbps != null ? storage.speedMbps : (storage.activityMbps || 0.0);
    const readSpd = storage.readMbps != null ? storage.readMbps : 0.0;
    const writeSpd = storage.writeMbps != null ? storage.writeMbps : 0.0;

    if (storageActivityText) {
      storageActivityText.innerText = `${Number(actPct).toFixed(1)}% (${Number(spd).toFixed(1)} MB/s)`;
    }
    if (storageReadVal) storageReadVal.innerText = `${Number(readSpd).toFixed(1)} MB/s`;
    if (storageWriteVal) storageWriteVal.innerText = `${Number(writeSpd).toFixed(1)} MB/s`;
    if (storageActivityBar) storageActivityBar.style.width = `${Math.min(100, Math.max(0, actPct))}%`;

    const primaryDisk = (hardwareState.storageDisks && hardwareState.storageDisks[0]) || null;
    if (storageModelText && primaryDisk) {
      storageModelText.innerText = primaryDisk.model || 'Physical Drive';
      storageModelText.title = primaryDisk.model || '';
    }
    if (storagePartSummary) {
      const parts = (primaryDisk && primaryDisk.partitions) || [];
      if (parts.length > 0) {
        const p0 = parts[0];
        storagePartSummary.innerText = `${p0.drive} ${(p0.usedGb || 0).toFixed(0)}/${(p0.totalGb || 0).toFixed(0)} GB (${(p0.usedPct || 0).toFixed(0)}%)`;
      } else {
        storagePartSummary.innerText = 'Primary Drive';
      }
    }

    const isDegraded = storage.health && !storage.health.toLowerCase().includes('health') && storage.health !== 'OK';
    const storageLevel = (isDegraded || actPct >= 85.0) ? 'critical' : (actPct >= 75.0 ? 'warning' : 'normal');
    const storageLabel = isDegraded ? 'DEGRADED' : (actPct >= 85.0 ? 'HEAVY I/O' : (actPct >= 75.0 ? 'BUSY' : 'HEALTHY'));
    updateComponentStatusBadge('storage-health-badge', 'storage-status-dot', 'storage-status-text', storageLevel, storageLabel);
  }

  // 4. Network Throughput
  const netRxVal = document.getElementById('net-rx-val');
  const netTxVal = document.getElementById('net-tx-val');
  const netPeakVal = document.getElementById('net-peak-val');
  const netTotalVal = document.getElementById('net-total-val');

  const netRx = hardwareState.net_rx_kbps || (hardwareState.timeseries && hardwareState.timeseries.net_rx && hardwareState.timeseries.net_rx.slice(-1)[0]) || 0;
  const netTx = hardwareState.net_tx_kbps || (hardwareState.timeseries && hardwareState.timeseries.net_tx && hardwareState.timeseries.net_tx.slice(-1)[0]) || 0;
  if (netRxVal) netRxVal.innerText = `${netRx.toFixed(1)} KB/s`;
  if (netTxVal) netTxVal.innerText = `${netTx.toFixed(1)} KB/s`;

  const netObj = hardwareState.network || {};
  const rxPeak = netObj.rxPeakKbps || (netRx > 0 ? netRx : 0.0);
  const txPeak = netObj.txPeakKbps || (netTx > 0 ? netTx : 0.0);
  const rxTotGb = netObj.rxTotalGb != null ? netObj.rxTotalGb : 0.0;
  const txTotGb = netObj.txTotalGb != null ? netObj.txTotalGb : 0.0;

  if (netPeakVal) {
    const rxPStr = rxPeak >= 1024 ? `${(rxPeak / 1024).toFixed(1)} MB/s` : `${rxPeak.toFixed(0)} KB/s`;
    const txPStr = txPeak >= 1024 ? `${(txPeak / 1024).toFixed(1)} MB/s` : `${txPeak.toFixed(0)} KB/s`;
    netPeakVal.innerText = `↓ ${rxPStr} | ↑ ${txPStr}`;
  }
  if (netTotalVal) {
    netTotalVal.innerText = `↓ ${rxTotGb.toFixed(1)} GB | ↑ ${txTotGb.toFixed(1)} GB`;
  }

  const lat = latencyMs != null ? Number(latencyMs) : null;
  const isNetCrit = !connected || (lat != null && lat >= 180);
  const isNetWarn = lat != null && lat >= 80 && lat < 180;
  const netLevel = isNetCrit ? 'critical' : (isNetWarn ? 'warning' : 'normal');
  const netLabel = !connected ? 'OFFLINE' : (isNetCrit ? 'HIGH RTT' : (isNetWarn ? 'ELEVATED' : 'STABLE'));
  updateComponentStatusBadge('net-health-badge', 'net-status-dot', 'net-status-text', netLevel, netLabel);

  // 5. GPU Engine & VRAM
  if (gpu) {
    const gpuModelVal = document.getElementById('gpu-model-val');
    const gpuVramText = document.getElementById('gpu-vram-text');
    const gpuVramBar = document.getElementById('gpu-vram-bar');
    const gpuLoadText = document.getElementById('gpu-load-text');
    if (gpuModelVal) gpuModelVal.innerText = gpu.model || 'Integrated / Direct Adapter';
    if (gpuLoadText) gpuLoadText.innerText = gpu.loadPct != null ? `${gpu.loadPct.toFixed(1)}%` : '—%';
    if (gpuVramText) {
      if (gpu.vramUsedGb != null && gpu.vramGb > 0) {
        const pct = Math.min(100, Math.max(0, (gpu.vramUsedGb / gpu.vramGb) * 100));
        gpuVramText.innerText = `${gpu.vramUsedGb.toFixed(2)} GB / ${gpu.vramGb.toFixed(1)} GB (${pct.toFixed(0)}%)`;
        if (gpuVramBar) gpuVramBar.style.width = `${pct}%`;
      } else {
        gpuVramText.innerText = gpu.vramGb > 0 ? `${gpu.vramGb} GB Dedicated` : 'Shared System Memory';
        if (gpuVramBar) gpuVramBar.style.width = '0%';
      }
    }
  }

  // Render Real-Time Trend Waveforms
  if (hardwareState.timeseries) {
    updateTrendCharts(hardwareState.timeseries);
  }

  // Render Dynamic Multi-Storage Infrastructure Disks
  renderDynamicStorage(hardwareState.storageDisks || []);

  // Render Sub-tables
  renderEventsTable();
  renderSocketsTable();
  renderProcessesTable();
}

// Dynamic Blinking Status Dot with Criticality Thresholds
function updateDynamicStatusBadge(cpuPct, ramPct, diskPct, connected) {
  const badge = document.getElementById('connection-badge');
  const dot = document.getElementById('connection-status-dot');
  const text = document.getElementById('connection-status-text');
  if (!badge || !dot || !text) return;

  if (!connected) {
    badge.className = 'badge badge-danger flex items-center gap-1.5 py-1 px-3';
    dot.className = 'status-dot pulse-fast';
    dot.style.backgroundColor = '#DC2626';
    dot.style.color = '#DC2626';
    text.innerText = 'DISCONNECTED';
    return;
  }

  // Threshold check
  if (cpuPct >= 85.0 || ramPct >= 90.0 || diskPct >= 85.0) {
    // Critical: Rapid blinking (0.35s)
    badge.className = 'badge badge-danger flex items-center gap-1.5 py-1 px-3';
    dot.className = 'status-dot pulse-fast';
    dot.style.backgroundColor = '#DC2626';
    dot.style.color = '#DC2626';
    text.innerText = `CRITICAL (${Math.max(cpuPct, ramPct, diskPct).toFixed(0)}%)`;
  } else if (cpuPct >= 70.0 || ramPct >= 80.0 || diskPct >= 75.0) {
    // Warning: Medium pulsing (1.0s)
    badge.className = 'badge badge-warning flex items-center gap-1.5 py-1 px-3';
    dot.className = 'status-dot pulse-medium';
    dot.style.backgroundColor = '#EAB308';
    dot.style.color = '#EAB308';
    text.innerText = `HIGH LOAD (${Math.max(cpuPct, ramPct).toFixed(0)}%)`;
  } else {
    // Normal: Slow breathing pulse (2.2s)
    badge.className = 'badge badge-success flex items-center gap-1.5 py-1 px-3';
    dot.className = 'status-dot pulse-slow';
    dot.style.backgroundColor = '#16A34A';
    dot.style.color = '#16A34A';
    text.innerText = `SSH ACTIVE (${cpuPct.toFixed(0)}%)`;
  }
}

// Component Status Dot and Badge Helper
function updateComponentStatusBadge(badgeId, dotId, textId, level, label) {
  const badge = document.getElementById(badgeId);
  const dot = document.getElementById(dotId);
  const text = document.getElementById(textId);
  if (!badge) return;

  if (level === 'critical') {
    badge.className = 'badge badge-danger flex items-center gap-1.5 py-0.5 px-2 font-mono';
    if (dot) {
      dot.className = 'status-dot pulse-fast';
      dot.style.backgroundColor = '#DC2626';
      dot.style.color = '#DC2626';
    }
  } else if (level === 'warning') {
    badge.className = 'badge badge-warning flex items-center gap-1.5 py-0.5 px-2 font-mono';
    if (dot) {
      dot.className = 'status-dot pulse-medium';
      dot.style.backgroundColor = '#EAB308';
      dot.style.color = '#EAB308';
    }
  } else {
    badge.className = 'badge badge-success flex items-center gap-1.5 py-0.5 px-2 font-mono';
    if (dot) {
      dot.className = 'status-dot pulse-slow';
      dot.style.backgroundColor = '#16A34A';
      dot.style.color = '#16A34A';
    }
  }

  if (text) {
    text.innerText = label;
  }
}

// Render Dynamic Multi-Storage Infrastructure Disks
function renderDynamicStorage(storageDisks) {
  const container = document.getElementById('dynamic-storage-container');
  const countBadge = document.getElementById('storage-disks-count-badge');
  if (!container) return;

  if (countBadge) {
    countBadge.innerText = `${storageDisks ? storageDisks.length : 0} Disks`;
  }

  if (!storageDisks || storageDisks.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-4 rounded-xl bg-white border border-[#E5E5E3] text-center text-xs text-[#888886]">
        Unit Penyimpanan Fisik & Partisi Sedang Dimuat...
      </div>
    `;
    return;
  }

  container.innerHTML = storageDisks.map((disk, idx) => {
    const parts = disk.partitions || [];
    const partitionsHtml = parts.length > 0 ? parts.map(p => {
      const usedPct = Math.min(100, Math.max(0, p.usedPct || 0));
      const freePct = Math.max(0, 100 - usedPct);
      let barColor = 'bg-[#16A34A]';
      if (usedPct >= 85) barColor = 'bg-[#DC2626]';
      else if (usedPct >= 70) barColor = 'bg-[#EAB308]';
      return `
        <div class="space-y-1.5 pt-2 border-t border-[#E5E5E3] text-xs">
          <div class="flex justify-between items-center text-[11px]">
            <span class="font-bold text-[#0A0A0A] flex items-center gap-1">
              <span>${p.drive}</span>
              <span class="text-[10px] text-[#888886] font-normal">[${escapeHtml(p.label || 'Mount')}]</span>
            </span>
            <span class="text-[#0A0A0A] font-mono font-semibold">${(p.usedGb || 0).toFixed(1)} / ${(p.totalGb || 0).toFixed(1)} GB <span class="text-[10px] text-[#888886]">(${usedPct.toFixed(0)}%)</span></span>
          </div>
          <!-- btop Dual-Color Bar (Used + Free) -->
          <div class="w-full bg-[#E5E5E3] rounded-full h-2 overflow-hidden flex" title="Used: ${usedPct.toFixed(0)}% | Free: ${freePct.toFixed(0)}%">
            <div class="${barColor} h-full transition-all duration-500" style="width: ${usedPct}%"></div>
            <div class="bg-[#10B981]/25 h-full transition-all duration-500" style="width: ${freePct}%"></div>
          </div>
          <div class="flex justify-between text-[10px] font-mono text-[#888886]">
            <span>Used: ${(p.usedGb || 0).toFixed(1)} GB &bull; Sisa: ${(p.freeGb || 0).toFixed(1)} GB</span>
            <span>${p.fileSystem || 'NTFS'}</span>
          </div>
        </div>
      `;
    }).join('') : `
      <div class="text-[11px] text-[#888886] italic py-1">Volume sistem / Drive partisi aktif</div>
    `;

    const statusBadge = disk.status === 'OK' || disk.status === 'Healthy'
      ? 'badge badge-success'
      : 'badge badge-warning';

    const rSpeed = Number((hardwareState.storage && hardwareState.storage.readMbps) || 0.0).toFixed(1);
    const wSpeed = Number((hardwareState.storage && hardwareState.storage.writeMbps) || 0.0).toFixed(1);

    return `
      <div class="p-4 rounded-xl bg-white border border-[#E5E5E3] hover:border-[#D0D0CE] transition flex flex-col justify-between space-y-3 shadow-sm">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center space-x-2.5">
            <div class="w-7 h-7 rounded-lg bg-[#F4F4F2] border border-[#E5E5E3] flex items-center justify-center flex-shrink-0">
              <svg class="w-3.5 h-3.5 text-[#0A0A0A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path>
              </svg>
            </div>
            <div>
              <div class="text-xs font-bold text-[#0A0A0A] truncate max-w-[220px]" title="${escapeHtml(disk.model)}">
                ${escapeHtml(disk.model)}
              </div>
              <div class="text-[10px] text-[#888886]">Disk #${disk.index != null ? disk.index : idx} &bull; ${disk.interface || 'Storage'}</div>
            </div>
          </div>
          <span class="${statusBadge} text-[10px]">
            ${disk.status || 'OK'}
          </span>
        </div>

        <div class="flex items-baseline justify-between py-1">
          <div>
            <span class="text-2xl font-bold text-[#0A0A0A]">
              ${(disk.sizeGb || 0).toFixed(0)} <span class="text-xs text-[#888886] font-normal">GB</span>
            </span>
            <div class="text-[10px] text-[#888886]">Raw Storage Capacity</div>
          </div>
          <div class="text-right text-[11px]">
            <span class="text-[#888886]">Suhu Drive:</span>
            <span class="font-bold text-[#0A0A0A] ml-1">${disk.temp != null ? `${disk.temp}°C` : 'N/A'}</span>
          </div>
        </div>

        <!-- Real-Time Disk I/O Rates (btop style) -->
        <div class="flex items-center justify-between text-[11px] font-mono bg-[#F9F9F7] px-2.5 py-1.5 rounded-lg border border-[#E5E5E3]">
          <span class="flex items-center gap-1.5 text-[#16A34A] font-bold">
            <span>↓ Read:</span>
            <span class="text-[#0A0A0A]">${rSpeed} MB/s</span>
          </span>
          <span class="text-[#D0D0CE]">|</span>
          <span class="flex items-center gap-1.5 text-[#2563EB] font-bold">
            <span>↑ Write:</span>
            <span class="text-[#0A0A0A]">${wSpeed} MB/s</span>
          </span>
        </div>

        <div class="space-y-2">
          ${partitionsHtml}
        </div>
      </div>
    `;
  }).join('');
}

// Render Windows OS Event Logs
function renderEventsTable() {
  const tbody = document.getElementById('events-table-body');
  if (!tbody) return;

  const logs = hardwareState.osEventLogs || [];

  // Update counts
  const countAll = document.getElementById('count-ev-all');
  const countSec = document.getElementById('count-ev-sec');
  const countSys = document.getElementById('count-ev-system');
  const countApp = document.getElementById('count-ev-app');
  const countWarn = document.getElementById('count-ev-warn');
  const badgeEventsCount = document.getElementById('badge-events-count');

  if (countAll) countAll.innerText = logs.length;
  if (countSec) countSec.innerText = logs.filter(e => e.logName === 'Security').length;
  if (countSys) countSys.innerText = logs.filter(e => e.logName === 'System').length;
  if (countApp) countApp.innerText = logs.filter(e => e.logName === 'Application').length;
  if (countWarn) countWarn.innerText = logs.filter(e => e.level === 'Warning' || e.level === 'Error' || e.level === 'Critical').length;
  if (badgeEventsCount) badgeEventsCount.innerText = logs.length;

  let filtered = logs;
  if (activeEventFilter === 'Security') filtered = logs.filter(e => e.logName === 'Security');
  else if (activeEventFilter === 'System') filtered = logs.filter(e => e.logName === 'System');
  else if (activeEventFilter === 'Application') filtered = logs.filter(e => e.logName === 'Application');
  else if (activeEventFilter === 'WARNING_ERROR') filtered = logs.filter(e => e.level === 'Warning' || e.level === 'Error' || e.level === 'Critical');

  if (logSearchQuery.trim()) {
    const q = logSearchQuery.toLowerCase();
    filtered = filtered.filter(e => 
      String(e.eventId).includes(q) ||
      (e.source || '').toLowerCase().includes(q) ||
      (e.message || '').toLowerCase().includes(q) ||
      (e.logName || '').toLowerCase().includes(q)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-[#888886] font-sans">
          Tidak ada event yang sesuai dengan filter atau kata kunci pencarian "${escapeHtml(logSearchQuery)}".
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let lvlBadge = 'badge badge-neutral';
    if (item.level === 'Warning') lvlBadge = 'badge badge-warning';
    if (item.level === 'Error' || item.level === 'Critical') lvlBadge = 'badge badge-danger';

    let logBadge = 'badge badge-neutral';
    if (item.logName === 'Security') logBadge = 'badge badge-success';

    const copyPayload = `[${item.time}] [${item.level || 'Info'}] [${item.logName}] [Event ID: ${item.eventId || '—'}] ${item.source}: ${item.message}`;

    return `
      <tr class="transition border-b border-[#E5E5E3]">
        <td class="py-2.5 px-3 text-[#888886] whitespace-nowrap text-[11px]">${item.time}</td>
        <td class="py-2.5 px-3">
          <span class="${lvlBadge}">
            ${item.level || 'Info'}
          </span>
        </td>
        <td class="py-2.5 px-3">
          <span class="${logBadge}">
            ${item.logName || 'System'}
          </span>
        </td>
        <td class="py-2.5 px-3 font-bold text-[#0A0A0A]">${item.eventId || '—'}</td>
        <td class="py-2.5 px-3 text-[#0A0A0A] truncate max-w-xs font-semibold">${escapeHtml(item.source)}</td>
        <td class="py-2.5 px-3 text-[#4A4A48] text-[11px] max-w-md truncate" title="${escapeHtml(item.message)}">
          ${escapeHtml(item.message)}
        </td>
        <td class="py-2.5 px-3 text-right table-sticky-action whitespace-nowrap w-24 min-w-[85px]">
          <button onclick="copyToClipboard('${escapeHtml(copyPayload).replace(/'/g, "\\'")}', this, '✓')" class="btn btn-ghost btn-sm px-2.5 py-0.5 text-[11px] font-semibold border border-[#E5E5E3]">
            Copy
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Render Network Sockets Table
function renderSocketsTable() {
  const tbody = document.getElementById('sockets-table-body');
  const countBadge = document.getElementById('badge-sockets-count');
  if (!tbody) return;

  const sockets = hardwareState.activeSockets || [];
  if (countBadge) countBadge.innerText = sockets.length;

  if (sockets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-8 text-center text-[#888886] font-sans">
          Tidak ada socket jaringan yang sedang terbuka.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = sockets.map(s => {
    const isListen = (s.State || '').toLowerCase() === 'listen';
    const stateBadge = isListen ? 'badge badge-warning' : 'badge badge-success';
    const typeBadge = isListen 
      ? '<span class="badge badge-neutral">Inbound Port</span>'
      : '<span class="badge badge-neutral">Active TCP</span>';

    return `
      <tr class="hover:bg-[#F8F8F6] transition border-b border-[#E5E5E3]">
        <td class="py-2.5 px-3 font-bold text-[#0A0A0A]">${escapeHtml(s.LocalAddress || '0.0.0.0')}</td>
        <td class="py-2.5 px-3 font-bold text-[#0A0A0A]">${s.LocalPort || '—'}</td>
        <td class="py-2.5 px-3 text-[#4A4A48]">${escapeHtml(s.RemoteAddress || '0.0.0.0')}</td>
        <td class="py-2.5 px-3 text-[#888886]">${s.RemotePort || '—'}</td>
        <td class="py-2.5 px-3">
          <span class="${stateBadge}">
            ${escapeHtml(s.State || 'ESTABLISHED')}
          </span>
        </td>
        <td class="py-2.5 px-3 text-[#0A0A0A] font-bold">${s.PID || '—'}</td>
        <td class="py-2.5 px-3 text-right">${typeBadge}</td>
      </tr>
    `;
  }).join('');
}

// ============================================================================
// REAL-TIME TREND WAVEFORMS (CHART.JS - DSS-V1 PALETTE)
function getChartGridColor() {
  const isDark = (document.documentElement.getAttribute('data-theme') === 'dark') ||
                 (document.body && document.body.getAttribute('data-theme') === 'dark');
  return isDark ? 'rgba(255, 255, 255, 0.07)' : '#F0F0EE';
}

// REAL-TIME TREND WAVEFORMS (CHART.JS - DSS-V1 PALETTE)
// ============================================================================
function initTrendCharts() {
  const commonOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    elements: {
      point: { radius: 0, hoverRadius: 4 },
      line: { tension: 0.35, borderWidth: 1.8 }
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: '#FFFFFF',
        titleColor: '#888886',
        bodyColor: '#0A0A0A',
        borderColor: '#E5E5E3',
        borderWidth: 1,
        padding: 8,
        displayColors: false
      }
    },
    scales: {
      x: {
        display: false,
        grid: { display: false }
      },
      y: {
        grid: { color: getChartGridColor() },
        ticks: { color: '#888886', font: { size: 9, family: 'DM Sans' } }
      }
    }
  };

  // 1. CPU Saturation Waveform
  const ctxCpu = document.getElementById('chart-cpu-trend')?.getContext('2d');
  if (ctxCpu && !chartCpu) {
    chartCpu = new Chart(ctxCpu, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#F97316',
          backgroundColor: 'rgba(249, 115, 22, 0.12)',
          fill: true
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { ...commonOptions.scales.y, min: 0, max: 100 }
        }
      }
    });
  }

  // 2. Memory Utilization Waveform
  const ctxRam = document.getElementById('chart-ram-trend')?.getContext('2d');
  if (ctxRam && !chartRam) {
    chartRam = new Chart(ctxRam, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#16A34A',
          backgroundColor: 'rgba(22, 163, 74, 0.05)',
          fill: true
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { ...commonOptions.scales.y, min: 0, max: 100 }
        }
      }
    });
  }

  // 3. Disk Activity Waveform
  const ctxDisk = document.getElementById('chart-disk-trend')?.getContext('2d');
  if (ctxDisk && !chartDisk) {
    chartDisk = new Chart(ctxDisk, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          data: [],
          borderColor: '#7C3AED',
          backgroundColor: 'rgba(124, 58, 237, 0.05)',
          fill: true
        }]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { ...commonOptions.scales.y, min: 0, max: 100 }
        }
      }
    });
  }

  // 4. Dual Network Stream Waveform
  const ctxNet = document.getElementById('chart-net-trend')?.getContext('2d');
  if (ctxNet && !chartNet) {
    chartNet = new Chart(ctxNet, {
      type: 'line',
      data: {
        labels: [],
        datasets: [
          {
            label: 'Inbound',
            data: [],
            borderColor: '#0D9488',
            backgroundColor: 'transparent',
            fill: false
          },
          {
            label: 'Outbound',
            data: [],
            borderColor: '#4F46E5',
            backgroundColor: 'transparent',
            fill: false
          }
        ]
      },
      options: {
        ...commonOptions,
        scales: {
          ...commonOptions.scales,
          y: { ...commonOptions.scales.y, min: 0 }
        }
      }
    });
  }
}

function updateTrendCharts(ts) {
  if (!ts) return;
  const labels = ts.timestamps || [];
  const cpuData = ts.cpu || [];
  const ramData = ts.ram || [];
  const diskData = ts.disk || [];
  const rxData = ts.net_rx || [];
  const txData = ts.net_tx || [];

  const bufferCountElem = document.getElementById('trend-buffer-count');
  if (bufferCountElem) bufferCountElem.innerText = `${labels.length} Pts`;

  // Update CPU Waveform
  if (chartCpu) {
    chartCpu.data.labels = labels;
    chartCpu.data.datasets[0].data = cpuData;
    chartCpu.update('none');
    const lastCpu = cpuData.length > 0 ? cpuData[cpuData.length - 1] : 0;
    const cpuBadge = document.getElementById('chart-cpu-badge');
    if (cpuBadge) cpuBadge.innerText = `${Number(lastCpu).toFixed(1)}%`;
  }

  // Update RAM Waveform
  if (chartRam) {
    chartRam.data.labels = labels;
    chartRam.data.datasets[0].data = ramData;
    chartRam.update('none');
    const lastRam = ramData.length > 0 ? ramData[ramData.length - 1] : 0;
    const ramBadge = document.getElementById('chart-ram-badge');
    if (ramBadge) ramBadge.innerText = `${Number(lastRam).toFixed(1)}%`;

    const ramGbText = document.getElementById('chart-ram-gb-text');
    if (ramGbText && hardwareState.ramSummary) {
      ramGbText.innerText = `${hardwareState.ramSummary.usedGb || 0} / ${hardwareState.ramSummary.totalGb || 0} GB`;
    }
  }

  // Update Disk Waveform
  if (chartDisk) {
    chartDisk.data.labels = labels;
    chartDisk.data.datasets[0].data = diskData;
    chartDisk.update('none');
    const lastDisk = diskData.length > 0 ? diskData[diskData.length - 1] : 0;
    const diskBadge = document.getElementById('chart-disk-badge');
    if (diskBadge) diskBadge.innerText = `${Number(lastDisk).toFixed(1)}%`;

    const diskSpeedText = document.getElementById('chart-disk-speed-text');
    if (diskSpeedText && hardwareState.storageSummary) {
      const spd = hardwareState.storageSummary.speedMbps || hardwareState.storageSummary.activityMbps || 0;
      diskSpeedText.innerText = `${Number(spd).toFixed(1)} MB/s`;
    }
  }

  // Update Network Dual Stream
  if (chartNet) {
    chartNet.data.labels = labels;
    chartNet.data.datasets[0].data = rxData;
    chartNet.data.datasets[1].data = txData;
    chartNet.update('none');
    const lastRx = rxData.length > 0 ? rxData[rxData.length - 1] : 0;
    const lastTx = txData.length > 0 ? txData[txData.length - 1] : 0;
    const rxBadge = document.getElementById('chart-net-rx-val');
    const txBadge = document.getElementById('chart-net-tx-val');
    if (rxBadge) rxBadge.innerText = `${Number(lastRx).toFixed(1)} KB/s`;
    if (txBadge) txBadge.innerText = `${Number(lastTx).toFixed(1)} KB/s`;
  }
}

// ============================================================================
// PROCESS THREAT SENTINEL & AUTO-SORTING LOGIC
// ============================================================================

// Filter Process Category
function filterProcessType(type) {
  activeProcFilter = type;
  const btnAll = document.getElementById('proc-filter-all');
  const btnGui = document.getElementById('proc-filter-gui');
  const btnHeavy = document.getElementById('proc-filter-heavy');

  if (btnAll) btnAll.className = type === 'ALL' ? 'filter-pill active' : 'filter-pill';
  if (btnGui) btnGui.className = type === 'GUI_ONLY' ? 'filter-pill active' : 'filter-pill';
  if (btnHeavy) btnHeavy.className = type === 'HEAVY' ? 'filter-pill active' : 'filter-pill';

  renderProcessesTable();
}

// Click-to-Sort by Hardware Resource Column
function sortProcessBy(col) {
  if (processSort.column === col) {
    processSort.direction = processSort.direction === 'desc' ? 'asc' : 'desc';
  } else {
    processSort.column = col;
    processSort.direction = 'desc';
  }
  updateSortIndicators();
  renderProcessesTable();
}

function updateSortIndicators() {
  const cols = ['name', 'cpu', 'ram', 'disk', 'net'];
  cols.forEach(c => {
    const el = document.getElementById(`sort-ind-${c}`);
    const th = document.getElementById(`th-sort-${c}`);
    if (el) {
      if (processSort.column === c) {
        el.innerText = processSort.direction === 'desc' ? '▼' : '▲';
        el.className = 'font-bold text-[#0A0A0A]';
      } else {
        el.innerText = '';
        el.className = 'text-[10px]';
      }
    }
    if (th) {
      if (processSort.column === c) {
        th.classList.add('bg-[#F4F4F2]');
      } else {
        th.classList.remove('bg-[#F4F4F2]');
      }
    }
  });

  const badge = document.getElementById('current-sort-badge');
  if (badge) {
    const dirIcon = processSort.direction === 'desc' ? '▼' : '▲';
    badge.innerText = `${processSort.column.toUpperCase()} ${dirIcon}`;
  }
}

// Render Spotlight Cards: Currently Open Windows (Streamlined Horizontal Tiles)
function renderOpenWindowsCards(procs) {
  const container = document.getElementById('open-windows-grid');
  const countBadge = document.getElementById('active-windows-count-badge');
  if (!container) return;

  const openWindows = procs.filter(p => p.HasWindow || (p.WindowTitle && String(p.WindowTitle).trim() !== ''));
  if (countBadge) countBadge.innerText = `${openWindows.length} Jendela`;

  if (openWindows.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-3.5 rounded-xl bg-white border border-[#E5E5E3] text-center text-xs font-mono text-[#888886]">
        Tidak ada jendela aplikasi desktop yang sedang dibuka.
      </div>
    `;
    return;
  }

  // Record first-seen timestamp and sort by newest first
  const now = Date.now();
  openWindows.forEach(w => {
    const key = `${w.PID || w.Id}_${w.Name || ''}`;
    if (!windowFirstSeenMap.has(key)) {
      windowFirstSeenMap.set(key, w.StartTicks ? Number(w.StartTicks) : now);
    }
  });

  openWindows.sort((a, b) => {
    const keyA = `${a.PID || a.Id}_${a.Name || ''}`;
    const keyB = `${b.PID || b.Id}_${b.Name || ''}`;
    const timeA = a.StartTicks ? Number(a.StartTicks) : (windowFirstSeenMap.get(keyA) || 0);
    const timeB = b.StartTicks ? Number(b.StartTicks) : (windowFirstSeenMap.get(keyB) || 0);
    if (timeA !== timeB) return timeB - timeA;
    return (b.PID || b.Id || 0) - (a.PID || a.Id || 0);
  });

  container.innerHTML = openWindows.map((w, idx) => {
    const isNewest = idx === 0;
    const timeHtml = w.StartTime 
      ? `<span class="hidden sm:inline-flex items-center gap-1 text-[10px] font-mono text-[#888886]"><svg class="w-3 h-3 text-[#888886]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>${w.StartTime}</span></span>` 
      : '';

    return `
      <div class="p-2.5 rounded-lg bg-white border ${isNewest ? 'border-emerald-500/60 bg-emerald-500/[0.03] ring-1 ring-emerald-500/20' : 'border-[#E5E5E3]'} hover:border-[#D0D0CE] transition flex items-center justify-between gap-3 shadow-xs">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-7 h-7 rounded-md ${isNewest ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-[#F4F4F2] text-[#0A0A0A] border border-[#E5E5E3]'} flex items-center justify-center shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm0 4h16M8 4v5"></path></svg>
          </div>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-bold text-[#0A0A0A] truncate">${escapeHtml(w.AppName || w.Name)}</span>
              ${isNewest ? `<span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#DCFCE7] text-[#16A34A] border border-[#BBF7D0] shrink-0"><span class="w-1.5 h-1.5 rounded-full bg-[#16A34A] animate-ping"></span>Terbaru</span>` : ''}
            </div>
            <div class="text-[11px] text-[#888886] font-mono truncate" title="${escapeHtml(w.WindowTitle)}">${escapeHtml(w.WindowTitle)}</div>
          </div>
        </div>
        <div class="flex items-center gap-2 shrink-0 text-[10px] font-mono text-[#888886]">
          ${timeHtml}
          <span class="badge badge-neutral text-[10px]">PID ${w.PID || w.Id}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Render Processes Table
function renderProcessesTable() {
  const tbody = document.getElementById('processes-table-body');
  const countBadge = document.getElementById('badge-proc-count');
  const countAll = document.getElementById('count-proc-all');
  const countGui = document.getElementById('count-proc-gui');
  const countHeavy = document.getElementById('count-proc-heavy');
  if (!tbody) return;

  const procs = hardwareState.topProcesses || [];

  if (countBadge) countBadge.innerText = procs.length;
  if (countAll) countAll.innerText = procs.length;
  if (countGui) countGui.innerText = procs.filter(p => p.HasWindow || (p.WindowTitle && String(p.WindowTitle).trim() !== '')).length;
  if (countHeavy) countHeavy.innerText = procs.filter(p => (p.CPU != null && Number(p.CPU) > 10) || (p.RAM_MB != null && Number(p.RAM_MB) > 200)).length;

  renderOpenWindowsCards(procs);

  let filtered = [...procs];
  if (activeProcFilter === 'GUI_ONLY') {
    filtered = filtered.filter(p => p.HasWindow || (p.WindowTitle && String(p.WindowTitle).trim() !== ''));
  } else if (activeProcFilter === 'HEAVY') {
    filtered = filtered.filter(p => (p.CPU != null && Number(p.CPU) > 10) || (p.RAM_MB != null && Number(p.RAM_MB) > 200));
  }

  // Filter by Process Search Query
  if (procSearchQuery) {
    filtered = filtered.filter(p => {
      const app = (p.AppName || '').toLowerCase();
      const name = (p.Name || p.ProcessName || '').toLowerCase();
      const pid = String(p.PID || p.Id || '');
      const win = (p.WindowTitle || '').toLowerCase();
      const usr = (p.User || '').toLowerCase();
      return app.includes(procSearchQuery) || name.includes(procSearchQuery) || pid.includes(procSearchQuery) || win.includes(procSearchQuery) || usr.includes(procSearchQuery);
    });
  }

  // Sorting
  filtered.sort((a, b) => {
    let valA = 0, valB = 0;
    if (processSort.column === 'name') {
      const strA = (a.AppName || a.Name || '').toLowerCase();
      const strB = (b.AppName || b.Name || '').toLowerCase();
      return processSort.direction === 'desc' ? strB.localeCompare(strA) : strA.localeCompare(strB);
    } else if (processSort.column === 'cpu') {
      valA = a.CPU != null ? Number(a.CPU) : (a.CPU_Pct != null ? Number(a.CPU_Pct) : 0);
      valB = b.CPU != null ? Number(b.CPU) : (b.CPU_Pct != null ? Number(b.CPU_Pct) : 0);
    } else if (processSort.column === 'ram') {
      valA = a.RAM_MB != null ? Number(a.RAM_MB) : (a.MemMB != null ? Number(a.MemMB) : 0);
      valB = b.RAM_MB != null ? Number(b.RAM_MB) : (b.MemMB != null ? Number(b.MemMB) : 0);
    } else if (processSort.column === 'disk') {
      valA = a.Disk_MB != null ? Number(a.Disk_MB) : 0;
      valB = b.Disk_MB != null ? Number(b.Disk_MB) : 0;
    } else if (processSort.column === 'net') {
      valA = a.NetConns != null ? Number(a.NetConns) : 0;
      valB = b.NetConns != null ? Number(b.NetConns) : 0;
    }
    return processSort.direction === 'desc' ? valB - valA : valA - valB;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="py-8 text-center text-[#888886] font-sans">
          Tidak ada proses yang sesuai dengan filter ini.
        </td>
      </tr>
    `;
    return;
  }

  // GROUPED VIEW: AGGREGATE PROCESSES WITH THE SAME APPLICATION NAME (HIERARCHICAL TREE VIEW)
  if (processViewMode === 'GROUPED') {
    const groupsMap = new Map();
    filtered.forEach(p => {
      const binerName = (p.Name || p.ProcessName || 'Process').replace(/\.exe$/i, '');
      const appName = p.AppName || binerName;
      const groupKey = (p.AppName || binerName).toLowerCase();
      
      const cpuVal = p.CPU != null ? Number(p.CPU) : (p.CPU_Pct != null ? Number(p.CPU_Pct) : 0);
      const ramNum = p.RAM_MB != null ? Number(p.RAM_MB) : (p.MemMB != null ? Number(p.MemMB) : 0);
      const diskNum = p.Disk_MB != null ? Number(p.Disk_MB) : 0;
      const netNum = p.NetConns != null ? Number(p.NetConns) : 0;
      const user = p.User ? p.User.split('\\').pop() : '';
      const winTitle = p.WindowTitle ? String(p.WindowTitle).trim() : '';

      if (!groupsMap.has(groupKey)) {
        groupsMap.set(groupKey, {
          groupKey,
          appName,
          binerName,
          count: 0,
          pids: [],
          processes: [],
          sumCpu: 0,
          sumRam: 0,
          sumDisk: 0,
          sumNet: 0,
          windows: [],
          users: new Set()
        });
      }

      const g = groupsMap.get(groupKey);
      g.count += 1;
      if (p.PID || p.Id) g.pids.push(p.PID || p.Id);
      g.processes.push(p);
      g.sumCpu += cpuVal;
      g.sumRam += ramNum;
      g.sumDisk += diskNum;
      g.sumNet += netNum;
      if (user) g.users.add(user);
      if (winTitle && !g.windows.includes(winTitle)) g.windows.push(winTitle);
    });

    let groupedList = Array.from(groupsMap.values());

    // Sort children within each group by CPU or RAM
    groupedList.forEach(g => {
      g.processes.sort((a, b) => {
        const valA = a.CPU != null ? Number(a.CPU) : (a.CPU_Pct != null ? Number(a.CPU_Pct) : 0);
        const valB = b.CPU != null ? Number(b.CPU) : (b.CPU_Pct != null ? Number(b.CPU_Pct) : 0);
        if (valB !== valA) return valB - valA;
        const ramA = a.RAM_MB != null ? Number(a.RAM_MB) : 0;
        const ramB = b.RAM_MB != null ? Number(b.RAM_MB) : 0;
        return ramB - ramA;
      });
    });

    // Sorting grouped list
    groupedList.sort((a, b) => {
      let valA = 0, valB = 0;
      if (processSort.column === 'name') {
        return processSort.direction === 'desc' 
          ? b.appName.localeCompare(a.appName) 
          : a.appName.localeCompare(b.appName);
      } else if (processSort.column === 'cpu') {
        valA = a.sumCpu;
        valB = b.sumCpu;
      } else if (processSort.column === 'ram') {
        valA = a.sumRam;
        valB = b.sumRam;
      } else if (processSort.column === 'disk') {
        valA = a.sumDisk;
        valB = b.sumDisk;
      } else if (processSort.column === 'net') {
        valA = a.sumNet;
        valB = b.sumNet;
      }
      return processSort.direction === 'desc' ? valB - valA : valA - valB;
    });

    let html = '';
    groupedList.forEach(g => {
      const isExpanded = expandedProcGroups.has(g.groupKey);
      const pidStr = g.pids.slice(0, 3).join(', ') + (g.pids.length > 3 ? ` (+${g.pids.length - 3})` : '');
      const userStr = g.users.size > 0 ? Array.from(g.users).join(', ') : '—';
      
      let winBadge = `<span class="text-[#888886] text-[11px]">Background (${g.count})</span>`;
      if (g.windows.length > 0) {
        winBadge = `
          <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F4F4F2] text-[#0A0A0A] border border-[#E5E5E3] max-w-xs truncate" title="${escapeHtml(g.windows.join(' | '))} (PIDs: ${g.pids.join(', ')})">
            <svg class="w-3.5 h-3.5 text-[#0A0A0A] dark:text-white inline-block shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm0 4h16M9 4v6"></path></svg>
            <span class="truncate font-mono">${escapeHtml(g.windows[0])}${g.windows.length > 1 ? ` (+${g.windows.length - 1})` : ''}</span>
          </span>
        `;
      }

      let netBadge = `<span class="text-[#888886] font-mono text-[11px] inline-block min-w-[72px] text-right">—</span>`;
      if (g.sumNet > 0) {
        netBadge = `
          <span class="badge badge-neutral whitespace-nowrap inline-flex items-center justify-center min-w-[72px] text-[10px]" title="Total active socket connections">
            ${g.sumNet} Conns
          </span>
        `;
      }

      const copyPayload = `[GROUP] App: ${escapeHtml(g.appName)} | Instans: ${g.count} | PIDs: ${g.pids.join(', ')} | CPU: ${g.sumCpu.toFixed(1)}% | RAM: ${g.sumRam.toFixed(1)}MB | Disk: ${g.sumDisk.toFixed(1)}MB`;

      // Chevron icon SVG
      const chevronSvg = isExpanded
        ? `<svg class="w-3.5 h-3.5 text-[#0A0A0A] dark:text-white transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M19 9l-7 7-7-7"/></svg>`
        : `<svg class="w-3.5 h-3.5 text-[#888886] group-hover:text-[#0A0A0A] transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.2" d="M9 5l7 7-7 7"/></svg>`;

      html += `
        <tr class="transition border-b border-[#E5E5E3] hover:bg-[#F9F9F8] cursor-pointer group select-none ${isExpanded ? 'bg-[#F9F9F8]' : ''}" onclick="toggleProcGroup('${escapeHtml(g.groupKey)}')">
          <td class="py-2.5 px-3">
            <div class="flex items-center gap-1.5">
              <span class="w-5 h-5 flex items-center justify-center rounded hover:bg-[#EAEAEA] transition shrink-0" title="${isExpanded ? 'Tutup cabang pohon' : 'Buka hierarki sub-proses'}">
                ${chevronSvg}
              </span>
              <span class="badge badge-neutral text-[10px] font-bold">${g.count} Instans</span>
            </div>
            <div class="text-[10px] text-[#888886] font-mono mt-0.5 truncate max-w-[90px] pl-6" title="PIDs: ${g.pids.join(', ')}">${pidStr}</div>
          </td>
          <td class="py-2.5 px-4">
            <div class="font-bold text-[#0A0A0A] text-xs flex items-center gap-1.5">
              <span>${escapeHtml(g.appName)}</span>
              <span class="px-1.5 py-0.2 rounded text-[10px] font-mono font-bold bg-[#F4F4F2] text-[#0A0A0A] border border-[#E5E5E3]">${g.count}x</span>
            </div>
            <div class="text-[10px] text-[#888886] font-mono">${escapeHtml(g.binerName)}.exe</div>
          </td>
          <td class="py-2.5 px-4 max-w-xs truncate">
            ${winBadge}
          </td>
          <td class="py-2.5 px-3 text-right">
            <span class="font-bold text-[#0A0A0A]">
              ${g.sumCpu.toFixed(1)}%
            </span>
          </td>
          <td class="py-2.5 px-4 text-right">
            ${formatBtopMem(g.sumRam)}
          </td>
          <td class="py-2.5 px-3 text-right">
            <span class="font-bold text-[#0A0A0A]">${g.sumDisk.toFixed(1)} MB</span>
          </td>
          <td class="py-2.5 px-3 text-right whitespace-nowrap">
            ${netBadge}
          </td>
          <td class="py-2.5 px-3 text-[#888886] text-[11px] truncate max-w-[100px]" title="${escapeHtml(userStr)}">
            ${escapeHtml(userStr)}
          </td>
          <td class="py-2.5 px-3 text-right" onclick="event.stopPropagation()">
            <button onclick="copyToClipboard('${copyPayload}', this, '✓')" class="btn btn-ghost btn-sm p-1 text-[11px]" title="Salin ringkasan grup aplikasi ini">
              Audit
            </button>
          </td>
        </tr>
      `;

      // Render Nested Child Sub-Processes if Expanded
      if (isExpanded) {
        g.processes.forEach((child, idx) => {
          const isLast = (idx === g.processes.length - 1);
          const branchChar = isLast ? '└─' : '├─';
          const childPid = child.PID || child.Id || '—';
          const childCpu = child.CPU != null ? Number(child.CPU).toFixed(1) : (child.CPU_Pct != null ? Number(child.CPU_Pct).toFixed(1) : '0.0');
          const childRam = child.RAM_MB != null ? Number(child.RAM_MB).toFixed(1) : (child.MemMB != null ? Number(child.MemMB).toFixed(1) : '0.0');
          const childDisk = child.Disk_MB != null ? Number(child.Disk_MB).toFixed(1) : '0.0';
          const childUser = child.User ? child.User.split('\\').pop() : '—';
          const childWin = (child.WindowTitle || '').trim();
          const childPorts = child.NetPorts ? ` (${child.NetPorts})` : '';
          const childPayload = `PID: ${childPid} | App: ${escapeHtml(child.Name || g.binerName)} | CPU: ${childCpu}% | RAM: ${childRam}MB | Disk: ${childDisk}MB | User: ${escapeHtml(childUser)}`;

          html += `
            <tr class="bg-[#FBFBFA] border-b border-[#ECECE9] hover:bg-[#F2F2EF] transition text-xs">
              <td class="py-1.5 px-3 pl-6 font-mono text-[11px]">
                <div class="flex items-center gap-1.5">
                  <span class="text-[#A5A5A3] font-bold select-none">${branchChar}</span>
                  <span class="font-bold text-[#0A0A0A]">PID ${childPid}</span>
                </div>
              </td>
              <td class="py-1.5 px-4">
                <div class="font-mono text-[11px] text-[#555553] flex items-center gap-1">
                  <span>${escapeHtml(child.Name || g.binerName + '.exe')}</span>
                </div>
              </td>
              <td class="py-1.5 px-4 max-w-xs truncate">
                ${childWin ? `
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-mono bg-[#EFEFEA] text-[#0A0A0A] border border-[#E0E0DB] truncate max-w-xs" title="${escapeHtml(childWin)}">
                    <svg class="w-3 h-3 text-[#0A0A0A] inline-block shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm0 4h16M9 4v6"></path></svg>
                    <span class="truncate">${escapeHtml(childWin)}</span>
                  </span>
                ` : `<span class="text-[10px] text-[#A5A5A3] font-mono italic">Sub-worker</span>`}
              </td>
              <td class="py-1.5 px-3 text-right font-mono text-[11px] text-[#0A0A0A]">
                ${childCpu}%
              </td>
              <td class="py-1.5 px-4 text-right font-mono text-[11px] text-[#0A0A0A]">
                ${formatBtopMem(childRam)}
              </td>
              <td class="py-1.5 px-3 text-right font-mono text-[11px] text-[#888886]">
                ${childDisk} MB
              </td>
              <td class="py-1.5 px-3 text-right font-mono text-[10px] whitespace-nowrap">
                ${(child.NetConns && child.NetConns > 0) ? `
                  <span class="badge badge-neutral text-[10px]" title="Ports: ${child.NetPorts || 'Active'}">
                    ${child.NetConns} c${childPorts}
                  </span>
                ` : `<span class="text-[#A5A5A3]">—</span>`}
              </td>
              <td class="py-1.5 px-3 text-[#888886] text-[10px] font-mono truncate max-w-[100px]" title="${escapeHtml(child.User || '')}">
                ${escapeHtml(childUser)}
              </td>
              <td class="py-1.5 px-3 text-right">
                <button onclick="copyProcAudit('${childPid}', this)" class="btn btn-ghost btn-sm p-0.5 text-[10px]" title="Salin PID ${childPid}">
                  Salin
                </button>
              </td>
            </tr>
          `;
        });
      }
    });

    tbody.innerHTML = html;
    return;
  }

  // FLAT VIEW: DETAILED PER-PID ROW
  tbody.innerHTML = filtered.map(p => {
    const pid = p.PID || p.Id || '—';
    const binerName = p.Name || p.ProcessName || 'Process';
    const appName = p.AppName || binerName;
    const winTitle = p.WindowTitle || '';
    const hasWin = p.HasWindow || (winTitle.trim() !== '');

    const cpuVal = p.CPU != null ? Number(p.CPU).toFixed(1) : (p.CPU_Pct != null ? Number(p.CPU_Pct).toFixed(1) : '0.0');
    const ramNum = p.RAM_MB != null ? Number(p.RAM_MB) : (p.MemMB != null ? Number(p.MemMB) : 0);
    const diskMb = p.Disk_MB != null ? Number(p.Disk_MB).toFixed(1) : '0.0';
    const netConns = p.NetConns != null ? p.NetConns : 0;
    const user = p.User || '—';

    let winBadge = `<span class="text-[#888886] text-[11px]">Background</span>`;
    if (hasWin) {
      winBadge = `
        <span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-[#F4F4F2] text-[#0A0A0A] border border-[#E5E5E3] max-w-xs truncate" title="${escapeHtml(winTitle)}">
          <svg class="w-3.5 h-3.5 text-[#0A0A0A] dark:text-white inline-block shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H4a2 2 0 01-2-2V6zm0 4h16M9 4v6"></path></svg>
          <span class="truncate font-mono">${escapeHtml(winTitle)}</span>
        </span>
      `;
    }

    let netBadge = `<span class="text-[#888886] font-mono text-[11px] inline-block min-w-[72px] text-right">—</span>`;
    if (netConns > 0) {
      netBadge = `
        <span class="badge badge-neutral whitespace-nowrap inline-flex items-center justify-center min-w-[72px] text-[10px]" title="Ports: ${escapeHtml(p.NetPorts || '')}">
          ${netConns} Conns
        </span>
      `;
    }

    return `
      <tr class="transition border-b border-[#E5E5E3]">
        <td class="py-2 px-3 text-[#888886] font-bold">${pid}</td>
        <td class="py-2 px-4">
          <div class="font-bold text-[#0A0A0A] text-xs">${escapeHtml(appName)}</div>
          <div class="text-[10px] text-[#888886] font-mono">${escapeHtml(binerName)}.exe</div>
        </td>
        <td class="py-2 px-4 max-w-xs truncate">
          ${winBadge}
        </td>
        <td class="py-2 px-3 text-right">
          <span class="font-bold text-[#0A0A0A]">
            ${cpuVal}%
          </span>
        </td>
        <td class="py-2 px-4 text-right">
          ${formatBtopMem(ramNum)}
        </td>
        <td class="py-2 px-3 text-right">
          <span class="font-bold text-[#0A0A0A]">${diskMb} MB</span>
        </td>
        <td class="py-2 px-3 text-right whitespace-nowrap">
          ${netBadge}
        </td>
        <td class="py-2 px-3 text-[#888886] text-[11px] truncate max-w-[100px]" title="${escapeHtml(user)}">
          ${escapeHtml(user.split('\\').pop() || user)}
        </td>
        <td class="py-2 px-3 text-right">
          <button onclick="copyProcAudit('${pid}', this)" class="btn btn-ghost btn-sm p-1 text-[11px]" title="Audit PID ${pid}">
            Audit
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Switch SOC Tabs
function switchSocTab(viewName) {
  activeSocView = viewName;

  const btnEvents = document.getElementById('soc-tab-events');
  const btnSockets = document.getElementById('soc-tab-sockets');
  const btnProcesses = document.getElementById('soc-tab-processes');
  const btnGpu = document.getElementById('soc-tab-gpu');

  const viewEvents = document.getElementById('view-events-container');
  const viewSockets = document.getElementById('view-sockets-container');
  const viewProcesses = document.getElementById('view-processes-container');
  const viewGpu = document.getElementById('view-gpu-container');

  if (btnEvents) btnEvents.className = viewName === 'EVENTS' ? 'filter-pill active' : 'filter-pill';
  if (btnSockets) btnSockets.className = viewName === 'SOCKETS' ? 'filter-pill active' : 'filter-pill';
  if (btnProcesses) btnProcesses.className = viewName === 'PROCESSES' ? 'filter-pill active' : 'filter-pill';
  if (btnGpu) btnGpu.className = viewName === 'GPU' ? 'filter-pill active' : 'filter-pill';

  if (viewEvents) viewEvents.classList.toggle('hidden', viewName !== 'EVENTS');
  if (viewSockets) viewSockets.classList.toggle('hidden', viewName !== 'SOCKETS');
  if (viewProcesses) viewProcesses.classList.toggle('hidden', viewName !== 'PROCESSES');
  if (viewGpu) viewGpu.classList.toggle('hidden', viewName !== 'GPU');
}

// Profile Modal Controller
function openProfileModal(nodeId = null) {
  const modal = document.getElementById('device-profile-modal');
  const title = document.getElementById('modal-profile-title');
  const deleteBtn = document.getElementById('delete-profile-btn');
  const feedback = document.getElementById('modal-profile-feedback');
  const pwdStatus = document.getElementById('modal-pwd-status');

  if (feedback) {
    feedback.classList.add('hidden');
    feedback.innerText = '';
  }

  if (nodeId) {
    const node = registeredNodes.find(n => n.id === nodeId);
    if (node) {
      if (title) title.innerText = `Edit Profil Endpoint: ${node.name}`;
      document.getElementById('modal-node-id').value = node.id;
      document.getElementById('modal-node-name').value = node.name;
      document.getElementById('modal-node-host').value = node.host;
      document.getElementById('modal-node-port').value = node.port || 22;
      document.getElementById('modal-node-user').value = node.user;
      document.getElementById('modal-node-interval').value = node.poll_interval_seconds || 2.0;
      document.getElementById('modal-node-enabled').checked = node.enabled !== false;
      
      const pwdInput = document.getElementById('modal-node-password');
      pwdInput.value = '';
      pwdInput.placeholder = node.hasPassword ? '•••••••• (Tersimpan di Vault - isi jika ingin ganti)' : 'Masukkan password SSH baru';
      if (pwdStatus) {
        pwdStatus.innerText = node.hasPassword ? 'Tersimpan di Vault' : 'Belum Ada Password';
        pwdStatus.className = node.hasPassword ? 'badge badge-success text-[10px]' : 'badge badge-neutral text-[10px]';
      }

      if (deleteBtn) {
        deleteBtn.classList.remove('hidden');
        if (registeredNodes.length <= 1) {
          deleteBtn.classList.add('opacity-40', 'cursor-not-allowed');
          deleteBtn.title = 'Minimal harus ada 1 profil tersisa di dashboard';
        } else {
          deleteBtn.classList.remove('opacity-40', 'cursor-not-allowed');
          deleteBtn.title = 'Hapus profil endpoint ini';
        }
      }
    }
  } else {
    if (title) title.innerText = 'Tambah Profil Endpoint Baru';
    document.getElementById('modal-node-id').value = '';
    document.getElementById('modal-node-name').value = '';
    document.getElementById('modal-node-host').value = '';
    document.getElementById('modal-node-port').value = '22';
    document.getElementById('modal-node-user').value = '';
    document.getElementById('modal-node-interval').value = '2.0';
    document.getElementById('modal-node-enabled').checked = true;

    const pwdInput = document.getElementById('modal-node-password');
    pwdInput.value = '';
    pwdInput.placeholder = 'Masukkan password SSH perangkat';
    if (pwdStatus) {
      pwdStatus.innerText = 'Password Baru';
      pwdStatus.className = 'badge badge-neutral text-[10px]';
    }

    if (deleteBtn) deleteBtn.classList.add('hidden');
  }

  if (modal) modal.classList.remove('hidden');
}

function closeProfileModal() {
  const modal = document.getElementById('device-profile-modal');
  if (modal) modal.classList.add('hidden');
}

// ── DSS-V1 SIGNATURE INTERACTIVE DOT CANVAS (OUTERMOST BACKGROUND) ──
let requestDotRedraw = null;

function initBackgroundDotCanvas() {
  const canvas = document.getElementById('bg-dot-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const GAP = 28;
  const R = 1.5;
  const R_HOVER = 2.8;
  const INFLUENCE = 140;

  let mX = -9999;
  let mY = -9999;
  let isDirty = true;
  let idleCount = 0;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    isDirty = true;
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function getThemeColors() {
    const isDark = (document.documentElement.getAttribute('data-theme') === 'dark') ||
                   (document.body && document.body.getAttribute('data-theme') === 'dark');
    if (isDark) {
      return {
        base: [40, 40, 40],      // #282828
        hover: [160, 160, 160]   // #A0A0A0
      };
    } else {
      return {
        base: [204, 204, 202],   // #CCCCCA
        hover: [80, 80, 80]      // #505050
      };
    }
  }

  function draw() {
    if (isDirty || mX > -9000 || idleCount < 15) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const { base: COL_BASE, hover: COL_HOVER } = getThemeColors();

      const cols = Math.ceil(canvas.width / GAP) + 1;
      const rows = Math.ceil(canvas.height / GAP) + 1;

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = c * GAP;
          const y = r * GAP;
          const dist = Math.hypot(x - mX, y - mY);
          const t = Math.max(0, 1 - dist / INFLUENCE);

          const radius = lerp(R, R_HOVER, t);
          const red = Math.round(lerp(COL_BASE[0], COL_HOVER[0], t));
          const green = Math.round(lerp(COL_BASE[1], COL_HOVER[1], t));
          const blue = Math.round(lerp(COL_BASE[2], COL_HOVER[2], t));

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${red},${green},${blue})`;
          ctx.fill();
        }
      }

      if (mX <= -9000) {
        idleCount++;
      } else {
        idleCount = 0;
      }
      isDirty = false;
    }
    requestAnimationFrame(draw);
  }

  window.addEventListener('mousemove', (e) => {
    mX = e.clientX;
    mY = e.clientY;
    isDirty = true;
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    mX = -9999;
    mY = -9999;
    isDirty = true;
  });

  window.addEventListener('resize', resize, { passive: true });

  requestDotRedraw = () => {
    isDirty = true;
    idleCount = 0;
  };

  resize();
  draw();
}

// Theme Toggle Controller (DSS-V1 Dark Mode)
function initTheme() {
  const savedTheme = localStorage.getItem('dashboard_theme') || 'light';
  applyTheme(savedTheme);
  const toggleBtn = document.getElementById('theme-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  if (document.body) document.body.setAttribute('data-theme', theme);
  localStorage.setItem('dashboard_theme', theme);
  const icon = document.getElementById('theme-icon');
  const text = document.getElementById('theme-text');
  if (icon) {
    icon.innerHTML = theme === 'dark' 
      ? `<svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>`
      : `<svg class="w-3.5 h-3.5 text-[#0A0A0A]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"></path></svg>`;
  }
  if (text) text.innerText = theme === 'dark' ? 'Light' : 'Dark';
  if (typeof requestDotRedraw === 'function') requestDotRedraw();

  // Dynamic Chart Grid Lines on Theme Change
  const gridCol = getChartGridColor();
  [chartCpu, chartRam, chartDisk, chartNet].forEach(chart => {
    if (chart && chart.options && chart.options.scales && chart.options.scales.y) {
      chart.options.scales.y.grid.color = gridCol;
      chart.update('none');
    }
  });
}

// Sidebar Navigation ScrollSpy
function initSidebarScrollSpy() {
  const navItems = document.querySelectorAll('.side-navbar .side-nav-item');
  if (!navItems || navItems.length === 0) return;

  const sections = ['section-sentinel', 'section-trends', 'section-storage', 'section-soc']
    .map(id => document.getElementById(id))
    .filter(Boolean);

  if ('IntersectionObserver' in window && sections.length > 0) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navItems.forEach(item => {
            if (item.getAttribute('data-section') === id) {
              item.classList.add('active');
            } else {
              item.classList.remove('active');
            }
          });
        }
      });
    }, {
      rootMargin: '-15% 0px -60% 0px',
      threshold: 0
    });

    sections.forEach(sec => observer.observe(sec));
  }

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetId = item.getAttribute('data-section');
      const targetEl = document.getElementById(targetId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        navItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');
      }
    });
  });
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initBackgroundDotCanvas();
  initTrendCharts();
  initSidebarScrollSpy();
  loadNodes();
  updateMetrics();
  streamInterval = setInterval(updateMetrics, 2000);
  setInterval(loadNodes, 4000);

  // SOC Tab Switching
  document.getElementById('soc-tab-events')?.addEventListener('click', () => switchSocTab('EVENTS'));
  document.getElementById('soc-tab-sockets')?.addEventListener('click', () => switchSocTab('SOCKETS'));
  document.getElementById('soc-tab-processes')?.addEventListener('click', () => switchSocTab('PROCESSES'));
  document.getElementById('soc-tab-gpu')?.addEventListener('click', () => switchSocTab('GPU'));
  switchSocTab('PROCESSES');

  // Event Log Channel Filters
  document.querySelectorAll('.siem-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.siem-filter-btn').forEach(b => {
        b.className = 'siem-filter-btn filter-pill';
      });
      btn.className = 'siem-filter-btn filter-pill active';
      activeEventFilter = btn.getAttribute('data-evfilter') || 'ALL';
      renderEventsTable();
    });
  });

  // Search input: Event Stream
  const searchInput = document.getElementById('siem-log-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      logSearchQuery = e.target.value;
      renderEventsTable();
    });
  }

  // Search input: Process Table
  const procSearchInput = document.getElementById('proc-search-input');
  const procClearBtn = document.getElementById('proc-search-clear-btn');
  if (procSearchInput) {
    procSearchInput.addEventListener('input', (e) => {
      procSearchQuery = e.target.value.toLowerCase().trim();
      if (procClearBtn) {
        if (procSearchQuery) procClearBtn.classList.remove('hidden');
        else procClearBtn.classList.add('hidden');
      }
      renderProcessesTable();
    });
  }
  if (procClearBtn) {
    procClearBtn.addEventListener('click', () => {
      if (procSearchInput) {
        procSearchInput.value = '';
        procSearchQuery = '';
        procClearBtn.classList.add('hidden');
        procSearchInput.focus();
        renderProcessesTable();
      }
    });
  }

  // Copy all events button
  document.getElementById('copy-all-events-btn')?.addEventListener('click', (e) => {
    const logs = hardwareState.osEventLogs || [];
    const formatted = logs.map(l => `[${l.time}] [${l.level}] [${l.logName}] ID:${l.eventId} ${l.source}: ${l.message}`).join('\n');
    copyToClipboard(formatted, e.currentTarget, '✓ Semua Log Tersalin!');
  });

  // Stream Toggle
  const toggleBtn = document.getElementById('toggle-stream-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      streamActive = !streamActive;
      if (streamActive) {
        toggleBtn.className = 'btn btn-black btn-sm flex items-center gap-1.5';
        toggleBtn.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span>Stream Active</span>
        `;
        updateMetrics();
      } else {
        toggleBtn.className = 'btn btn-ghost btn-sm flex items-center gap-1.5';
        toggleBtn.innerHTML = `
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
          <span>Stream Paused</span>
        `;
      }
    });
  }

  // Profile Modal Event Listeners
  const addBtn = document.getElementById('btn-add-device-profile');
  if (addBtn) addBtn.addEventListener('click', () => openProfileModal(null));

  const manageBtn = document.getElementById('btn-manage-profiles');
  if (manageBtn) manageBtn.addEventListener('click', () => openProfileModal(activeNodeId));

  const closeBtn = document.getElementById('close-profile-modal-btn');
  const cancelBtn = document.getElementById('cancel-profile-modal-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeProfileModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeProfileModal);

  const profileForm = document.getElementById('device-profile-form');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const feedback = document.getElementById('modal-profile-feedback');
      const nodeId = document.getElementById('modal-node-id').value;
      const name = document.getElementById('modal-node-name').value.trim();
      const host = document.getElementById('modal-node-host').value.trim();
      const port = parseInt(document.getElementById('modal-node-port').value) || 22;
      const user = document.getElementById('modal-node-user').value.trim();
      const password = document.getElementById('modal-node-password').value;
      const interval = parseFloat(document.getElementById('modal-node-interval').value) || 2.0;
      const enabled = document.getElementById('modal-node-enabled').checked;

      if (feedback) {
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded badge-neutral block';
        feedback.innerText = 'Menyimpan profil endpoint...';
        feedback.classList.remove('hidden');
      }

      const payload = {
        id: nodeId || undefined,
        name,
        host,
        port,
        user,
        poll_interval_seconds: interval,
        enabled,
        type: host === '127.0.0.1' ? 'LOCAL_HOST' : 'SSH_REMOTE'
      };

      if (password !== '') {
        payload.password = password;
      }

      try {
        const res = await fetch('/api/nodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          const resData = await res.json();
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded badge-success block';
          feedback.innerText = '✓ Profil Endpoint Berhasil Disimpan!';
          setTimeout(async () => {
            closeProfileModal();
            await loadNodes();
            if (resData.nodeId) switchActiveNode(resData.nodeId);
          }, 600);
        } else {
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded badge-danger block';
          feedback.innerText = 'Gagal menyimpan profil.';
        }
      } catch (err) {
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded badge-danger block';
        feedback.innerText = 'Terjadi kesalahan jaringan.';
      }
    });
  }

  const deleteProfileBtn = document.getElementById('delete-profile-btn');
  if (deleteProfileBtn) {
    deleteProfileBtn.addEventListener('click', async () => {
      const nodeId = document.getElementById('modal-node-id').value;
      if (!nodeId) return;
      if (registeredNodes.length <= 1) return;
      if (!confirm('Hapus profil endpoint ini?')) return;

      try {
        const res = await fetch(`/api/nodes?id=${encodeURIComponent(nodeId)}`, { method: 'DELETE' });
        if (res.ok) {
          closeProfileModal();
          await loadNodes();
        }
      } catch (err) {
        console.error('Gagal menghapus profil:', err);
      }
    });
  }
});

// ============================================================================
// DENSITY TOGGLE (Clean SOC vs btop SysAdmin Compact)
// ============================================================================
window.toggleDensityMode = function() {
  const isCompact = document.body.classList.toggle('density-compact');
  localStorage.setItem('siem_density_compact', isCompact ? '1' : '0');
  const dText = document.getElementById('density-text');
  if (dText) dText.innerText = isCompact ? 'Normal' : 'Kompak';
};

// Initialize density from storage
(function initDensity() {
  try {
    const saved = localStorage.getItem('siem_density_compact');
    if (saved === '1') {
      document.body.classList.add('density-compact');
      const dText = document.getElementById('density-text');
      if (dText) dText.innerText = 'Normal';
    }
  } catch (e) {}
})();

// ============================================================================
// COLLAPSIBLE 40-CORE GRID (Expand / Collapse)
// ============================================================================
let isCoresExpanded = false;
window.toggleCoresGrid = function() {
  const grid = document.getElementById('cpu-cores-grid');
  const btn = document.getElementById('btn-toggle-cores');
  if (!grid) return;
  isCoresExpanded = !isCoresExpanded;
  if (isCoresExpanded) {
    grid.classList.remove('max-h-[84px]');
    grid.classList.add('max-h-[260px]');
    if (btn) btn.innerText = 'Collapse';
  } else {
    grid.classList.remove('max-h-[260px]');
    grid.classList.add('max-h-[84px]');
    if (btn) btn.innerText = 'Expand';
  }
};

