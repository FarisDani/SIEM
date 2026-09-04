/**
 * Enterprise Hardware Telemetry & Remote SSH Gateway Controller
 * Multi-Node Concurrent SSH Device Tabs & Strict Password Vault
 */

// Global State
let streamActive = true;
let streamInterval = null;
let activeAlertFilter = 'ALL';
let activeEventFilter = 'ALL';
let activeLogTab = 'ALERTS';
let simulationMode = 'NORMAL';

let activeNodeId = 'node_laptop_acer';
let registeredNodes = [];
let alertLogs = [];
const maxLogCount = 100;

// Hardware State Snapshot
let hardwareState = {
  nodeId: 'node_laptop_acer',
  nodeName: 'Laptop Acer Nitro i5',
  sourceMode: 'SSH_REMOTE',
  sshConfig: {
    targetHost: '172.16.4.205',
    targetUser: 'laptop-69pj06ep\\acer',
    targetPort: 22,
    hasPassword: true,
    connected: false,
    latencyMs: 0
  },
  host: 'LAPTOP-69PJ06EP',
  powerSource: 'Laptop Battery (100%) / AC Power',
  cpu: {
    model: '13th Gen Intel(R) Core(TM) i5-13420H',
    cores: 8,
    threads: 12,
    maxClockMhz: 2100,
    l3CacheMb: 12,
    temp: 48.5,
    maxTemp: 100.0,
    throttling: false,
    vcore: 1.15,
    power: 42.5
  },
  gpu: {
    model: 'Intel(R) UHD Graphics / Dedicated GPU',
    temp: 42.0,
    hotspotTemp: 48.2,
    power: 38.5,
    fanRpm: 1850,
    fanPwm: 52
  },
  storage: { temp: 38.0, health: '100% Good', activity: 12.4 },
  motherboard: { temp: 35.0, vrmTemp: 41.5, ambientTemp: 29.0 },
  ramSummary: { totalGb: 23.7, usedGb: 7.1, freeGb: 16.6, usedPct: 30.0 },
  ramModules: [],
  storageDisks: [],
  systemSpecs: {
    cpuName: '13th Gen Intel(R) Core(TM) i5-13420H',
    cores: 8,
    threads: 12,
    maxClockMhz: 2100,
    l3CacheMb: 12,
    motherboard: 'Acer / RPL Sportage_RTH',
    osCaption: 'Microsoft Windows 11',
    osBuild: '26200',
    uptime: 'Aktif'
  },
  osEventLogs: [],
  fans: {
    cpu: { rpm: 2150, pwm: 58, stall: false },
    gpu: { rpm: 1850, pwm: 52, stall: false },
    case: { rpm: 0, pwm: 0, stall: false }
  },
  voltages: {
    v12: 17.58,
    v5: 5.01,
    v33: 3.31,
    vcore: 1.15,
    totalPower: 42.5
  }
};

// Initial Sample Alert Logs
const initialAlerts = [
  {
    timestamp: new Date().toLocaleTimeString(),
    severity: 'INFO',
    component: 'NOC Controller',
    message: 'Multi-Device Concurrent Monitoring Gateway aktif.',
    action: 'Semua target standby'
  }
];
alertLogs = [...initialAlerts];

// Helper: Calculate Circular Gauge Offset
function calculateGaugeOffset(value, min = 20, max = 100) {
  const circumference = 314.15;
  const clampedVal = Math.min(Math.max(value, min), max);
  const percentage = (clampedVal - min) / (max - min);
  return circumference - (percentage * circumference);
}

// Helper: Determine Temperature Color & Status
function getTempStatus(temp) {
  if (temp >= 85) {
    return { color: 'text-rose-500', stroke: '#f43f5e', badgeBg: 'bg-rose-500/20', badgeText: 'text-rose-400', badgeBorder: 'border-rose-500/30', label: 'CRITICAL' };
  } else if (temp >= 75) {
    return { color: 'text-amber-500', stroke: '#f59e0b', badgeBg: 'bg-amber-500/20', badgeText: 'text-amber-400', badgeBorder: 'border-amber-500/30', label: 'WARM' };
  } else {
    return { color: 'text-cyan-400', stroke: '#22d3ee', badgeBg: 'bg-emerald-500/20', badgeText: 'text-emerald-400', badgeBorder: 'border-emerald-500/30', label: 'OPTIMAL' };
  }
}

// Trigger Alert
function triggerAlert(severity, component, message, action) {
  const now = new Date().toLocaleTimeString();
  const lastAlert = alertLogs[0];
  if (lastAlert && lastAlert.component === component && lastAlert.severity === severity && lastAlert.message === message) {
    return;
  }

  const alertItem = { timestamp: now, severity, component, message, action };
  alertLogs.unshift(alertItem);
  if (alertLogs.length > maxLogCount) alertLogs.pop();

  if (severity === 'CRITICAL') {
    const banner = document.getElementById('global-alert-banner');
    const title = document.getElementById('global-alert-title');
    const msg = document.getElementById('global-alert-msg');
    if (banner && title && msg) {
      banner.classList.remove('hidden');
      title.innerText = `CRITICAL ALERT: ${component}`;
      msg.innerText = message;
    }
  }

  renderAlertsTable();
}

// Render Tab 1: Hardware Alerts Table
function renderAlertsTable() {
  const tbody = document.getElementById('alerts-table-body');
  if (!tbody) return;

  const filtered = activeAlertFilter === 'ALL' 
    ? alertLogs 
    : alertLogs.filter(a => a.severity === activeAlertFilter);

  const countAll = document.getElementById('count-all');
  const countCritical = document.getElementById('count-critical');
  const countWarning = document.getElementById('count-warning');
  const countInfo = document.getElementById('count-info');
  const badgeAlertsCount = document.getElementById('badge-alerts-count');

  if (countAll) countAll.innerText = alertLogs.length;
  if (countCritical) countCritical.innerText = alertLogs.filter(a => a.severity === 'CRITICAL').length;
  if (countWarning) countWarning.innerText = alertLogs.filter(a => a.severity === 'WARNING').length;
  if (countInfo) countInfo.innerText = alertLogs.filter(a => a.severity === 'INFO').length;
  if (badgeAlertsCount) badgeAlertsCount.innerText = alertLogs.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-8 text-center text-slate-500 font-sans">
          Tidak ada insiden hardware dengan filter ${activeAlertFilter}.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let badgeClass = 'bg-slate-700/40 text-slate-300 border-slate-600/50';
    if (item.severity === 'CRITICAL') badgeClass = 'bg-rose-500/20 text-rose-400 border-rose-500/40 animate-pulse';
    if (item.severity === 'WARNING') badgeClass = 'bg-amber-500/20 text-amber-400 border-amber-500/40';
    if (item.severity === 'INFO') badgeClass = 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap">${item.timestamp}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}">
            ${item.severity}
          </span>
        </td>
        <td class="py-2.5 px-3 font-semibold text-slate-200">${item.component}</td>
        <td class="py-2.5 px-4 text-slate-300 font-sans">${item.message}</td>
        <td class="py-2.5 px-3 text-slate-400 font-sans">${item.action}</td>
      </tr>
    `;
  }).join('');
}

// Render Tab 2: Windows OS Event Logs Table
function renderOsEventsTable() {
  const tbody = document.getElementById('events-table-body');
  if (!tbody) return;

  const logs = hardwareState.osEventLogs || [];

  let filtered = logs;
  if (activeEventFilter === 'System') {
    filtered = logs.filter(e => e.logName === 'System');
  } else if (activeEventFilter === 'Security') {
    filtered = logs.filter(e => e.logName === 'Security');
  } else if (activeEventFilter === 'Application') {
    filtered = logs.filter(e => e.logName === 'Application');
  } else if (activeEventFilter === 'WARNING_ERROR') {
    filtered = logs.filter(e => e.level === 'Warning' || e.level === 'Error' || e.level === 'Critical');
  }

  const countEvAll = document.getElementById('count-ev-all');
  const countEvSys = document.getElementById('count-ev-system');
  const countEvSec = document.getElementById('count-ev-sec');
  const countEvApp = document.getElementById('count-ev-app');
  const countEvWarn = document.getElementById('count-ev-warn');
  const badgeEventsCount = document.getElementById('badge-events-count');

  if (countEvAll) countEvAll.innerText = logs.length;
  if (countEvSys) countEvSys.innerText = logs.filter(e => e.logName === 'System').length;
  if (countEvSec) countEvSec.innerText = logs.filter(e => e.logName === 'Security').length;
  if (countEvApp) countEvApp.innerText = logs.filter(e => e.logName === 'Application').length;
  if (countEvWarn) countEvWarn.innerText = logs.filter(e => e.level === 'Warning' || e.level === 'Error' || e.level === 'Critical').length;
  if (badgeEventsCount) badgeEventsCount.innerText = logs.length;

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="py-8 text-center text-slate-500 font-sans">
          Tidak ada event Windows dengan filter ${activeEventFilter}.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let lvlBadge = 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30';
    if (item.level === 'Warning') lvlBadge = 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    if (item.level === 'Error' || item.level === 'Critical') lvlBadge = 'bg-rose-500/20 text-rose-400 border-rose-500/30';

    let logBadge = 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30';
    if (item.logName === 'Security') logBadge = 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30';
    if (item.logName === 'Application') logBadge = 'bg-purple-500/20 text-purple-300 border-purple-500/30';

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap font-mono text-[11px]">${item.time}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${lvlBadge}">
            ${item.level || 'Info'}
          </span>
        </td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${logBadge}">
            ${item.logName}
          </span>
        </td>
        <td class="py-2.5 px-3 font-mono text-cyan-400 font-bold">${item.eventId || '—'}</td>
        <td class="py-2.5 px-4 font-semibold text-slate-200 text-xs">${item.source}</td>
        <td class="py-2.5 px-4 text-slate-300 font-sans text-xs max-w-md truncate" title="${item.message}">${item.message}</td>
      </tr>
    `;
  }).join('');
}

// Render Top Multi-Device Tabs Bar
function renderTopNodeTabs() {
  const container = document.getElementById('top-node-tabs-container');
  if (!container) return;

  container.innerHTML = registeredNodes.map(node => {
    const isCurrent = node.id === activeNodeId;
    const isConn = node.connected;
    const tempVal = node.temp ? `${node.temp.toFixed(1)}°C` : '—';
    const pingVal = node.latencyMs ? `${node.latencyMs}ms` : '';

    let baseClass = isCurrent
      ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/60 shadow-lg shadow-cyan-500/10'
      : 'bg-slate-800/80 text-slate-400 hover:text-slate-200 hover:bg-slate-700/80 border-slate-700/80';

    let pingDot = isConn
      ? '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>'
      : '<span class="w-2 h-2 rounded-full bg-amber-400"></span>';

    return `
      <div class="flex items-center rounded-xl border transition cursor-pointer ${baseClass}">
        <button class="node-tab-btn flex items-center space-x-2 px-3 py-1.5 text-xs font-mono font-bold" data-node-id="${node.id}">
          ${pingDot}
          <span>${node.name}</span>
          <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-900/80 text-cyan-300">${tempVal}</span>
          ${pingVal ? `<span class="text-[10px] text-slate-400">${pingVal}</span>` : ''}
        </button>
        <button class="node-edit-btn px-2 py-1.5 text-slate-400 hover:text-cyan-300 border-l border-slate-700/50" data-node-id="${node.id}" title="Edit Profil Perangkat">
          ⚙️
        </button>
      </div>
    `;
  }).join('');

  // Attach Event Listeners to Tabs
  document.querySelectorAll('.node-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const nid = btn.getAttribute('data-node-id');
      if (nid && nid !== activeNodeId) {
        selectNode(nid);
      }
    });
  });

  document.querySelectorAll('.node-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const nid = btn.getAttribute('data-node-id');
      openProfileModal(nid);
    });
  });
}

// Switch Active Node Tab
async function selectNode(nodeId) {
  activeNodeId = nodeId;
  renderTopNodeTabs();
  
  const activeNameElem = document.getElementById('active-node-name');
  const target = registeredNodes.find(n => n.id === nodeId);
  if (activeNameElem && target) {
    activeNameElem.innerText = target.name;
  }

  try {
    await fetch('/api/nodes/select', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: nodeId })
    });
  } catch (e) {}

  updateMetrics();
}

// Fetch All Registered Nodes
async function fetchNodes() {
  try {
    const res = await fetch('/api/nodes');
    if (res.ok) {
      const data = await res.json();
      registeredNodes = data.nodes || [];
      if (data.activeNodeId) activeNodeId = data.activeNodeId;
      renderTopNodeTabs();

      const activeNameElem = document.getElementById('active-node-name');
      const target = registeredNodes.find(n => n.id === activeNodeId);
      if (activeNameElem && target) {
        activeNameElem.innerText = target.name;
      }
    }
  } catch (err) {
    console.error('Error fetching nodes list:', err);
  }
}

// Render Dynamic RAM Modules Cards
function renderDynamicRam(ramModules, ramSummary) {
  const container = document.getElementById('dynamic-ram-container');
  const ramTotalBadge = document.getElementById('ram-total-badge');
  const ramUsedBadge = document.getElementById('ram-used-badge');
  const ramBarText = document.getElementById('ram-bar-text');
  const ramUsageBar = document.getElementById('ram-usage-bar');

  if (ramSummary) {
    const totalGb = ramSummary.totalGb || 23.7;
    const usedGb = ramSummary.usedGb || 7.1;
    const freeGb = ramSummary.freeGb || 16.6;
    const usedPct = ramSummary.usedPct || 30.0;

    if (ramTotalBadge) ramTotalBadge.innerText = `${totalGb.toFixed(1)} GB`;
    if (ramUsedBadge) ramUsedBadge.innerText = `${usedGb.toFixed(1)} GB (${usedPct.toFixed(0)}%)`;
    if (ramBarText) ramBarText.innerText = `${usedGb.toFixed(1)} GB / ${totalGb.toFixed(1)} GB Used (${freeGb.toFixed(1)} GB Free)`;
    if (ramUsageBar) ramUsageBar.style.width = `${Math.min(100, Math.max(5, usedPct))}%`;
  }

  if (!container) return;

  if (!ramModules || ramModules.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-4 rounded-xl bg-slate-900/40 text-center text-xs text-slate-500 font-mono">
        Mendeteksi modul RAM fisik dari target...
      </div>
    `;
    return;
  }

  container.innerHTML = ramModules.map((mod, idx) => {
    return `
      <div class="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 hover:border-cyan-500/40 transition flex flex-col justify-between space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <span class="text-base">💾</span>
            <div>
              <span class="text-xs font-bold text-slate-200">${mod.slot || `DIMM Slot ${idx+1}`}</span>
              <div class="text-[10px] text-slate-400 font-mono">${mod.bank || 'Channel A'}</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            ${mod.type || 'DDR5'}
          </span>
        </div>

        <div class="py-1">
          <div class="text-2xl font-mono font-black text-cyan-300">
            ${(mod.capacityGb || 8.0).toFixed(1)} <span class="text-xs text-slate-400 font-sans">GB</span>
          </div>
          <div class="text-[11px] font-mono text-emerald-400 font-semibold">
            ⚡ ${mod.speedMhz || 4800} MT/s (MHz)
          </div>
        </div>

        <div class="pt-2 border-t border-slate-800/80 text-[11px] space-y-1 font-mono text-slate-400">
          <div class="flex justify-between">
            <span>Manufaktur:</span>
            <span class="text-slate-200 font-semibold truncate max-w-[120px]">${mod.manufacturer || 'OEM'}</span>
          </div>
          <div class="flex justify-between">
            <span>Part Number:</span>
            <span class="text-slate-300 truncate max-w-[130px]">${mod.partNumber || 'Module Part'}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Render Dynamic Multi-Storage Disks Cards
function renderDynamicStorage(storageDisks) {
  const container = document.getElementById('dynamic-storage-container');
  if (!container) return;

  if (!storageDisks || storageDisks.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-4 rounded-xl bg-slate-900/40 text-center text-xs text-slate-500 font-mono">
        Mendeteksi unit penyimpanan fisik & partisi...
      </div>
    `;
    return;
  }

  container.innerHTML = storageDisks.map((disk, idx) => {
    const parts = disk.partitions || [];
    const partitionsHtml = parts.length > 0 ? parts.map(p => {
      const usedPct = p.usedPct || 0;
      const barColor = usedPct > 85 ? 'from-rose-500 to-amber-500' : 'from-cyan-500 to-teal-400';
      return `
        <div class="space-y-1 pt-1.5 border-t border-slate-800/60 font-mono text-xs">
          <div class="flex justify-between items-center text-[11px]">
            <span class="font-bold text-slate-200">${p.drive} [${p.label || 'Drive'}]</span>
            <span class="text-cyan-300 font-semibold">${(p.usedGb || 0).toFixed(1)} / ${(p.totalGb || 0).toFixed(1)} GB (${usedPct.toFixed(0)}%)</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div class="bg-gradient-to-r ${barColor} h-1.5 rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(3, usedPct))}%"></div>
          </div>
          <div class="flex justify-between text-[10px] text-slate-400">
            <span>Sisa Free: ${(p.freeGb || 0).toFixed(1)} GB</span>
            <span>Format: ${p.fileSystem || 'NTFS'}</span>
          </div>
        </div>
      `;
    }).join('') : `
      <div class="text-[10px] text-slate-500 font-mono italic">Volume sistem / Drive partisi aktif</div>
    `;

    return `
      <div class="p-4 rounded-xl bg-slate-900/70 border border-slate-800/90 hover:border-cyan-500/40 transition flex flex-col justify-between space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center space-x-2">
            <span class="text-xl">💽</span>
            <div>
              <div class="text-xs font-bold text-slate-200">Disk ${disk.index}: ${disk.model}</div>
              <div class="text-[10px] text-slate-400 font-mono">${disk.interface || 'NVMe'} &bull; Kapasitas: ${(disk.sizeGb || 0).toFixed(0)} GB</div>
            </div>
          </div>
          <span class="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 whitespace-nowrap">
            ${disk.status || 'HEALTHY'}
          </span>
        </div>

        <div class="space-y-2">
          <div class="text-[11px] font-semibold text-slate-300">Partisi & Volume Logikal:</div>
          ${partitionsHtml}
        </div>

        <div class="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] font-mono text-slate-400">
          <span>Suhu Controller:</span>
          <span class="text-teal-300 font-bold">${disk.temp || 38.0}°C</span>
        </div>
      </div>
    `;
  }).join('');
}

// Evaluate Hardware Rules
function evaluateHardwareRules() {
  const { cpu, gpu, fans, voltages, sourceMode, sshConfig } = hardwareState;

  if (sourceMode === 'SSH_REMOTE' && sshConfig && !sshConfig.connected) {
    triggerAlert('WARNING', 'SSH Link', `Koneksi SSH ke ${sshConfig.targetHost} terputus atau mencoba menghubungkan kembali.`, 'Periksa IP, user, atau password');
  }

  if (cpu && cpu.temp >= 85) {
    cpu.throttling = true;
    triggerAlert('CRITICAL', 'CPU Thermal Sensor', `CPU Suhu Kritis (${cpu.temp.toFixed(1)}°C)! Melebihi batas aman 85°C.`, 'Periksa pendingin / Thermal Throttling Aktif');
  } else if (cpu && cpu.temp >= 75) {
    triggerAlert('WARNING', 'CPU Thermal Sensor', `CPU Suhu Meningkat (${cpu.temp.toFixed(1)}°C). Beban kerja tinggi.`, 'Pastikan sirkulasi udara lancar');
  } else if (cpu) {
    cpu.throttling = false;
  }

  if (gpu && gpu.temp >= 84) {
    triggerAlert('CRITICAL', 'GPU Core Sensor', `GPU Suhu Kritis (${gpu.temp.toFixed(1)}°C)!`, 'Tingkatkan fan speed GPU');
  }

  if (fans && fans.cpu && (fans.cpu.stall || (fans.cpu.rpm < 400 && sourceMode !== 'SSH_REMOTE'))) {
    triggerAlert('CRITICAL', 'CPU Cooling Fan', `ALARM: Putaran Kipas CPU Berhenti (${fans.cpu.rpm} RPM)!`, 'Periksa konektor PWM fan');
  }

  if (voltages && voltages.v12 < 11.40) {
    triggerAlert('CRITICAL', 'Power Delivery +12V', `VOLTAGE SAG DANGER: Tegangan drop ke ${voltages.v12.toFixed(2)}V (Batas: 11.40V).`, 'Cek adaptor daya / PSU');
  }
}

// Update UI
function updateUI() {
  const { cpu, gpu, storage, motherboard, fans, voltages, host, sourceMode, sshConfig, ramSummary, ramModules, storageDisks, systemSpecs } = hardwareState;

  // Connection Badge
  const connBadge = document.getElementById('connection-badge');
  const connText = document.getElementById('connection-status-text');
  const hostNameElem = document.getElementById('host-name');
  const cpuModelElem = document.getElementById('cpu-model');
  const cpuTopologyElem = document.getElementById('cpu-topology');
  const mbModelText = document.getElementById('mb-model-text');
  const gpuModelElem = document.getElementById('gpu-model');
  const osCaptionText = document.getElementById('os-caption-text');
  const sysUptimeText = document.getElementById('sys-uptime-text');
  const powerSourceText = document.getElementById('power-source-text');

  if (hostNameElem) hostNameElem.innerText = host || 'TARGET-DEVICE';
  if (cpuModelElem) cpuModelElem.innerText = (cpu && cpu.model) || (systemSpecs && systemSpecs.cpuName) || 'Processor';
  if (cpuTopologyElem && cpu) {
    cpuTopologyElem.innerText = `${cpu.cores || 8} Cores • ${cpu.threads || 12} Threads • ${cpu.l3CacheMb || 12}MB L3 Cache`;
  }
  if (mbModelText && systemSpecs) mbModelText.innerText = systemSpecs.motherboard || 'System Board';
  if (gpuModelElem && gpu) gpuModelElem.innerText = gpu.model || 'Integrated Graphics';
  if (osCaptionText && systemSpecs) osCaptionText.innerText = `${systemSpecs.osCaption || 'Windows 11'} (${systemSpecs.osBuild || '26200'})`;
  if (sysUptimeText && systemSpecs) sysUptimeText.innerText = `Uptime: ${systemSpecs.uptime || 'Aktif'}`;
  if (powerSourceText) powerSourceText.innerText = hardwareState.powerSource || 'AC Connected';

  if (connBadge && connText && sshConfig) {
    if (sourceMode === 'SSH_REMOTE') {
      if (sshConfig.connected) {
        connBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-2 shadow';
        connText.innerText = `SSH CONNECTED (${sshConfig.latencyMs || 0} ms)`;
      } else {
        connBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-2 animate-pulse shadow';
        connText.innerText = `RECONNECTING (${sshConfig.targetHost})...`;
      }
    } else {
      connBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-2 shadow';
      connText.innerText = 'LOCAL HOST ACTIVE';
    }
  }

  // CPU Thermal
  if (cpu) {
    const cpuTempElem = document.getElementById('cpu-temp-val');
    const cpuCircle = document.getElementById('cpu-temp-circle');
    const cpuBadge = document.getElementById('cpu-status-badge');
    const cpuThrottle = document.getElementById('cpu-throttle');
    const cpuTjmax = document.getElementById('cpu-tjmax');

    if (cpuTempElem) cpuTempElem.innerText = cpu.temp.toFixed(1);
    if (cpuCircle) {
      cpuCircle.style.strokeDashoffset = calculateGaugeOffset(cpu.temp, 25, 100);
      const status = getTempStatus(cpu.temp);
      cpuCircle.style.stroke = status.stroke;
      if (cpuBadge) {
        cpuBadge.className = `px-2 py-0.5 rounded text-[10px] font-bold border ${status.badgeBg} ${status.badgeText} ${status.badgeBorder}`;
        cpuBadge.innerText = status.label;
      }
    }
    if (cpuThrottle) {
      cpuThrottle.innerText = cpu.throttling ? '⚠️ ACTIVE THROTTLE' : 'No Throttling';
      cpuThrottle.className = cpu.throttling ? 'font-mono text-rose-400 font-bold animate-pulse' : 'font-mono text-emerald-400';
    }
    if (cpuTjmax) cpuTjmax.innerText = `${(cpu.temp + 4.2).toFixed(1)}°C / 100°C`;
  }

  // GPU Thermal
  if (gpu) {
    const gpuTempElem = document.getElementById('gpu-temp-val');
    const gpuCircle = document.getElementById('gpu-temp-circle');
    const gpuBadge = document.getElementById('gpu-status-badge');
    const gpuHotspot = document.getElementById('gpu-hotspot');
    const gpuPower = document.getElementById('gpu-power');

    if (gpuTempElem) gpuTempElem.innerText = gpu.temp.toFixed(1);
    if (gpuCircle) {
      gpuCircle.style.strokeDashoffset = calculateGaugeOffset(gpu.temp, 25, 95);
      const status = getTempStatus(gpu.temp);
      gpuCircle.style.stroke = status.stroke;
      if (gpuBadge) {
        gpuBadge.className = `px-2 py-0.5 rounded text-[10px] font-bold border ${status.badgeBg} ${status.badgeText} ${status.badgeBorder}`;
        gpuBadge.innerText = status.label;
      }
    }
    if (gpuHotspot) gpuHotspot.innerText = `${(gpu.hotspotTemp || gpu.temp + 6.0).toFixed(1)}°C / 95°C`;
    if (gpuPower) gpuPower.innerText = `${(gpu.power || 38.5).toFixed(1)} W`;
  }

  // Primary Storage Dial
  const st = storage || (storageDisks && storageDisks[0]) || { temp: 38.0, health: '100% Good', activity: 12.4 };
  const nvmeTempElem = document.getElementById('nvme-temp-val');
  const nvmeCircle = document.getElementById('nvme-temp-circle');
  const nvmeHealth = document.getElementById('nvme-health');
  const nvmeActivity = document.getElementById('nvme-activity');

  if (nvmeTempElem) nvmeTempElem.innerText = (st.temp || 38.0).toFixed(1);
  if (nvmeCircle) nvmeCircle.style.strokeDashoffset = calculateGaugeOffset(st.temp || 38.0, 20, 80);
  if (nvmeHealth) nvmeHealth.innerText = st.health || '100% Good';
  if (nvmeActivity) nvmeActivity.innerText = `${(st.activity || 12.4).toFixed(1)} MB/s`;

  // Motherboard & Ambient
  const mb = motherboard || { temp: 35.0, vrmTemp: 41.5, ambientTemp: 29.0 };
  const mbTempElem = document.getElementById('mb-temp-val');
  const mbCircle = document.getElementById('mb-temp-circle');
  const vrmTempElem = document.getElementById('vrm-temp');
  const ambientTempElem = document.getElementById('ambient-temp');

  if (mbTempElem) mbTempElem.innerText = (mb.temp || 35.0).toFixed(1);
  if (mbCircle) mbCircle.style.strokeDashoffset = calculateGaugeOffset(mb.temp || 35.0, 20, 75);
  if (vrmTempElem) vrmTempElem.innerText = `${(mb.vrmTemp || 41.5).toFixed(1)}°C`;
  if (ambientTempElem) ambientTempElem.innerText = `${(mb.ambientTemp || 29.0).toFixed(1)}°C`;

  // Render Dynamic RAM & Storage Sections
  renderDynamicRam(ramModules, ramSummary);
  renderDynamicStorage(storageDisks);

  // Fan Speeds
  if (fans) {
    const cpuFanRpm = document.getElementById('cpu-fan-rpm');
    const cpuFanPwm = document.getElementById('cpu-fan-pwm');
    const cpuFanBar = document.getElementById('cpu-fan-bar');
    const gpuFanRpm = document.getElementById('gpu-fan-rpm');
    const gpuFanPwm = document.getElementById('gpu-fan-pwm');
    const gpuFanBar = document.getElementById('gpu-fan-bar');
    const caseFanRpm = document.getElementById('case-fan-rpm');
    const caseFanPwm = document.getElementById('case-fan-pwm');
    const caseFanBar = document.getElementById('case-fan-bar');

    if (cpuFanRpm) cpuFanRpm.innerText = fans.cpu ? fans.cpu.rpm : 2150;
    if (cpuFanPwm) cpuFanPwm.innerText = `${fans.cpu ? fans.cpu.pwm : 58}%`;
    if (cpuFanBar) cpuFanBar.style.width = `${fans.cpu ? fans.cpu.pwm : 58}%`;

    if (gpuFanRpm) gpuFanRpm.innerText = fans.gpu ? fans.gpu.rpm : 1850;
    if (gpuFanPwm) gpuFanPwm.innerText = `${fans.gpu ? fans.gpu.pwm : 52}%`;
    if (gpuFanBar) gpuFanBar.style.width = `${fans.gpu ? fans.gpu.pwm : 52}%`;

    if (caseFanRpm) caseFanRpm.innerText = fans.case ? fans.case.rpm : 0;
    if (caseFanPwm) caseFanPwm.innerText = `${fans.case ? fans.case.pwm : 0}%`;
    if (caseFanBar) caseFanBar.style.width = `${fans.case ? fans.case.pwm : 0}%`;
  }

  // Voltages
  if (voltages) {
    const v12Val = document.getElementById('v12-val');
    const v12Badge = document.getElementById('v12-badge');
    const v5Val = document.getElementById('v5-val');
    const v33Val = document.getElementById('v33-val');
    const vcoreVal = document.getElementById('vcore-val');
    const totalPowerVal = document.getElementById('total-power-val');

    if (v12Val) v12Val.innerText = (voltages.v12 || 17.58).toFixed(2);
    if (v5Val) v5Val.innerText = (voltages.v5 || 5.01).toFixed(2);
    if (v33Val) v33Val.innerText = (voltages.v33 || 3.31).toFixed(2);
    if (vcoreVal) vcoreVal.innerText = (voltages.vcore || 1.15).toFixed(2);
    if (totalPowerVal) totalPowerVal.innerText = `${(voltages.totalPower || 42.5).toFixed(1)} W`;

    if (v12Badge) {
      if (voltages.v12 < 11.40) {
        v12Badge.className = 'px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 animate-pulse';
        v12Badge.innerText = 'SAG DANGER';
      } else {
        v12Badge.className = 'px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-400';
        v12Badge.innerText = 'STABLE';
      }
    }
  }

  // Render OS Events
  renderOsEventsTable();
}

// Fetch Metrics from Server for Active Node
async function updateMetrics() {
  if (!streamActive) return;

  try {
    const res = await fetch(`/api/hardware-metrics?node=${encodeURIComponent(activeNodeId)}`, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      hardwareState = data;
      evaluateHardwareRules();
      updateUI();
    }
  } catch (err) {
    console.error('Failed fetching hardware metrics:', err);
  }
}

// Profile Modal Controller (Strict Password Vault)
function openProfileModal(nodeId = null) {
  const modal = document.getElementById('device-profile-modal');
  const title = document.getElementById('modal-profile-title');
  const deleteBtn = document.getElementById('delete-profile-btn');
  const feedback = document.getElementById('modal-profile-feedback');
  const pwdStatus = document.getElementById('modal-pwd-status');

  if (feedback) feedback.classList.add('hidden');

  if (nodeId) {
    const node = registeredNodes.find(n => n.id === nodeId);
    if (node) {
      title.innerText = `Edit Profil Perangkat: ${node.name}`;
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
        pwdStatus.innerText = node.hasPassword ? '✓ Tersimpan di Vault' : 'Belum Ada Password';
        pwdStatus.className = node.hasPassword ? 'text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-normal' : 'text-[10px] px-1.5 py-0.2 rounded bg-slate-700 text-slate-400 font-normal';
      }

      if (deleteBtn) deleteBtn.classList.remove('hidden');
    }
  } else {
    // New Profile
    title.innerText = 'Tambah Profil Perangkat SSH Baru';
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
      pwdStatus.className = 'text-[10px] px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 font-normal';
    }

    if (deleteBtn) deleteBtn.classList.add('hidden');
  }

  if (modal) modal.classList.remove('hidden');
}

function closeProfileModal() {
  const modal = document.getElementById('device-profile-modal');
  if (modal) modal.classList.add('hidden');
}

// Initialize and Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  renderAlertsTable();
  renderOsEventsTable();
  fetchNodes();
  updateMetrics();

  // Fast Poller (every 2.0s)
  streamInterval = setInterval(updateMetrics, 2000);
  // Periodically refresh node tabs status (every 4.0s)
  setInterval(fetchNodes, 4000);

  // Top Bar Add Profile Button
  const addBtn = document.getElementById('btn-add-device-profile');
  if (addBtn) addBtn.addEventListener('click', () => openProfileModal(null));

  const manageBtn = document.getElementById('btn-manage-profiles');
  if (manageBtn) manageBtn.addEventListener('click', () => openProfileModal(activeNodeId));

  const closeBtn = document.getElementById('close-profile-modal-btn');
  const cancelBtn = document.getElementById('cancel-profile-modal-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeProfileModal);
  if (cancelBtn) cancelBtn.addEventListener('click', closeProfileModal);

  // Profile Form Submit (Save / Edit Device)
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
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-cyan-500/20 text-cyan-300';
        feedback.innerText = 'Menyimpan profil perangkat ke Vault...';
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
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-emerald-500/20 text-emerald-300';
          feedback.innerText = '✅ Profil Perangkat Berhasil Disimpan di Vault!';
          triggerAlert('INFO', 'Device Vault', `Profil "${name}" (${host}) berhasil disimpan.`, 'Monitoring siap');
          setTimeout(() => {
            closeProfileModal();
            fetchNodes();
            if (resData.nodeId) selectNode(resData.nodeId);
          }, 800);
        } else {
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-rose-500/20 text-rose-300';
          feedback.innerText = '❌ Gagal menyimpan profil perangkat.';
        }
      } catch (err) {
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-rose-500/20 text-rose-300';
        feedback.innerText = '❌ Terjadi kesalahan jaringan.';
      }
    });
  }

  // Delete Profile Button
  const deleteBtn = document.getElementById('delete-profile-btn');
  if (deleteBtn) {
    deleteBtn.addEventListener('click', async () => {
      const nodeId = document.getElementById('modal-node-id').value;
      if (!nodeId) return;

      if (confirm('Apakah Anda yakin ingin menghapus profil perangkat ini dari vault?')) {
        try {
          const res = await fetch(`/api/nodes?id=${encodeURIComponent(nodeId)}`, { method: 'DELETE' });
          if (res.ok) {
            closeProfileModal();
            fetchNodes();
            updateMetrics();
          }
        } catch (e) {}
      }
    });
  }

  // Tab Switcher for Logs
  const tabBtnAlerts = document.getElementById('tab-btn-alerts');
  const tabBtnEvents = document.getElementById('tab-btn-events');
  const tabContentAlerts = document.getElementById('tab-content-alerts');
  const tabContentEvents = document.getElementById('tab-content-events');
  const filterBarAlerts = document.getElementById('filter-bar-alerts');
  const filterBarEvents = document.getElementById('filter-bar-events');

  if (tabBtnAlerts && tabBtnEvents) {
    tabBtnAlerts.addEventListener('click', () => {
      activeLogTab = 'ALERTS';
      tabBtnAlerts.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow flex items-center gap-2 transition';
      tabBtnEvents.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 flex items-center gap-2 transition';
      if (tabContentAlerts) tabContentAlerts.classList.remove('hidden');
      if (tabContentEvents) tabContentEvents.classList.add('hidden');
      if (filterBarAlerts) filterBarAlerts.classList.remove('hidden');
      if (filterBarEvents) filterBarEvents.classList.add('hidden');
    });

    tabBtnEvents.addEventListener('click', () => {
      activeLogTab = 'EVENTS';
      tabBtnEvents.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow flex items-center gap-2 transition';
      tabBtnAlerts.className = 'px-3.5 py-1.5 rounded-lg text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 flex items-center gap-2 transition';
      if (tabContentAlerts) tabContentAlerts.classList.add('hidden');
      if (tabContentEvents) tabContentEvents.classList.remove('hidden');
      if (filterBarAlerts) filterBarAlerts.classList.add('hidden');
      if (filterBarEvents) filterBarEvents.classList.remove('hidden');
    });
  }

  // Filter Buttons for Hardware Alerts
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => {
        b.className = 'filter-btn px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-700/20';
      });
      btn.className = 'filter-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
      activeAlertFilter = btn.getAttribute('data-filter') || 'ALL';
      renderAlertsTable();
    });
  });

  // Filter Buttons for OS Events
  document.querySelectorAll('.evfilter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.evfilter-btn').forEach(b => {
        b.className = 'evfilter-btn px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-700/20';
      });
      btn.className = 'evfilter-btn px-2.5 py-1 rounded-lg text-xs font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30';
      activeEventFilter = btn.getAttribute('data-evfilter') || 'ALL';
      renderOsEventsTable();
    });
  });

  // Clear Logs Button
  const clearBtn = document.getElementById('clear-logs-btn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      alertLogs = [];
      renderAlertsTable();
    });
  }

  // Dismiss Banner
  const dismissBtn = document.getElementById('dismiss-alert-btn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', () => {
      const banner = document.getElementById('global-alert-banner');
      if (banner) banner.classList.add('hidden');
    });
  }

  // Stream Toggle
  const toggleBtn = document.getElementById('toggle-stream-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      streamActive = !streamActive;
      toggleBtn.innerHTML = streamActive
        ? `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>Stream Active</span>`
        : `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg><span>Stream Paused</span>`;
      toggleBtn.className = streamActive
        ? 'px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-slate-900 font-bold text-xs uppercase tracking-wider shadow-lg shadow-cyan-500/20 transition flex items-center gap-2'
        : 'px-3.5 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-200 font-bold text-xs uppercase tracking-wider shadow transition flex items-center gap-2';
    });
  }

  // Simulation Controls
  const btnOverheat = document.getElementById('btn-sim-overheat');
  const btnFanStall = document.getElementById('btn-sim-fan-stall');
  const btnVoltDrop = document.getElementById('btn-sim-voltage-drop');
  const btnReset = document.getElementById('btn-sim-reset');

  const triggerSimMode = async (mode, message) => {
    simulationMode = mode;
    triggerAlert('WARNING', 'Simulator Control', message, 'Uji respon alarm');
    try {
      await fetch('/api/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
    } catch (e) {}
    updateMetrics();
  };

  if (btnOverheat) btnOverheat.addEventListener('click', () => triggerSimMode('OVERHEAT', 'Memulai simulasi lonjakan suhu Overheat 96°C.'));
  if (btnFanStall) btnFanStall.addEventListener('click', () => triggerSimMode('FAN_STALL', 'Memulai simulasi kegagalan putaran kipas (0 RPM).'));
  if (btnVoltDrop) btnVoltDrop.addEventListener('click', () => triggerSimMode('VOLTAGE_DROP', 'Memulai simulasi drop tegangan power rail ke 10.65V.'));
  if (btnReset) btnReset.addEventListener('click', () => {
    simulationMode = 'NORMAL';
    const banner = document.getElementById('global-alert-banner');
    if (banner) banner.classList.add('hidden');
    triggerAlert('INFO', 'Simulator Control', 'Sensor dikembalikan ke baseline normal.', 'Sistem Nominal');
    fetch('/api/simulate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'NORMAL' })
    }).catch(() => {});
    updateMetrics();
  });
});
