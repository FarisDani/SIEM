/**
 * Enterprise Hardware Telemetry & Remote SSH Gateway Controller
 * Multi-Node Concurrent SSH Device Tabs & Strict Password Vault
 */

// Global State
let streamActive = true;
let streamInterval = null;
let activeAlertFilter = 'ALL';
let activeEventFilter = 'ALL';
let activeLogTab = 'EVENTS';
let simulationMode = 'NORMAL';

let activeNodeId = 'node_f93896f4';
let registeredNodes = [];
let alertLogs = [];
const maxLogCount = 100;

// SSH Failure & Troubleshooting Diagnostics State
let consecutiveDisconnectCycles = 0;
let lastAutoOpenedNodeId = null;

// Generic Clipboard Copy Helper with Visual Feedback
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
      btnElement.classList.add('bg-emerald-500/30', 'text-emerald-300', 'border-emerald-400');
      setTimeout(() => {
        btnElement.innerHTML = origHtml;
        btnElement.classList.remove('bg-emerald-500/30', 'text-emerald-300', 'border-emerald-400');
      }, 1600);
    }
    return true;
  } catch (err) {
    console.error('Gagal menyalin teks ke clipboard:', err);
    return false;
  }
}

// SSH Connection Error & Troubleshooting Modal Controller
function openSshTroubleshootModal(nodeId = null) {
  const modal = document.getElementById('ssh-troubleshoot-modal');
  if (!modal) return;

  const targetNode = registeredNodes.find(n => n.id === (nodeId || activeNodeId)) || {
    name: hardwareState.nodeName || 'Target Device',
    host: hardwareState.sshConfig ? hardwareState.sshConfig.targetHost : '192.168.27.203',
    port: hardwareState.sshConfig ? hardwareState.sshConfig.targetPort : 22,
    user: hardwareState.sshConfig ? hardwareState.sshConfig.targetUser : 'admin'
  };

  const badge = document.getElementById('troubleshoot-node-badge');
  const info = document.getElementById('troubleshoot-node-info');
  const timeElem = document.getElementById('troubleshoot-timestamp');
  const msgElem = document.getElementById('troubleshoot-error-message');
  const pshCodeElem = document.getElementById('powershell-fix-code');

  const sshCfg = hardwareState.sshConfig || {};
  const errType = sshCfg.errorType && sshCfg.errorType !== 'NONE' ? sshCfg.errorType : (targetNode.errorType && targetNode.errorType !== 'NONE' ? targetNode.errorType : 'TIMEOUT');
  const errMsg = sshCfg.lastError || targetNode.lastError || `Koneksi SSH Timeout: Komputer target ${targetNode.host}:${targetNode.port} tidak merespons (Port ${targetNode.port || 22} mungkin belum terbuka atau komputer target offline).`;
  const errTime = sshCfg.errorTimestamp || new Date().toLocaleTimeString();

  if (badge) badge.innerText = errType;
  if (info) info.innerText = `Target: ${targetNode.name} (${targetNode.host}:${targetNode.port || 22}) • User: ${targetNode.user || 'system'}`;
  if (timeElem) timeElem.innerText = errTime;
  if (msgElem) msgElem.innerText = errMsg;

  if (pshCodeElem) {
    pshCodeElem.innerText = `$p="$env:windir\\System32\\OpenSSH\\sshd.exe"; if (-not (Test-Path $p)) { $p="$env:ProgramFiles\\OpenSSH\\sshd.exe" }; if (-not (Get-Service sshd -ErrorAction SilentlyContinue)) { & sc.exe create sshd binPath= "\`"$p\`"" start= auto DisplayName= "OpenSSH SSH Server" }; & "$env:windir\\System32\\OpenSSH\\ssh-keygen.exe" -A; Set-Service sshd -StartupType Automatic; Start-Service sshd; netsh advfirewall firewall add rule name="OpenSSH-Server-In-TCP-${targetNode.port || 22}" dir=in action=allow protocol=TCP localport=${targetNode.port || 22} profile=any; Write-Host "SSH PORT ${targetNode.port || 22} AKTIF!" -ForegroundColor Green`;
  }

  modal.classList.remove('hidden');
}

function closeSshTroubleshootModal() {
  const modal = document.getElementById('ssh-troubleshoot-modal');
  if (modal) modal.classList.add('hidden');
}

// Hardware State Snapshot
let hardwareState = {
  nodeId: 'node_laptop_acer',
  nodeName: 'Target Device',
  sourceMode: 'SSH_REMOTE',
  sshConfig: {
    targetHost: '',
    targetUser: '',
    targetPort: 22,
    hasPassword: false,
    connected: false,
    latencyMs: 0
  },
  host: '—',
  powerSource: '—',
  cpu: null,
  gpu: null,
  storage: null,
  motherboard: null,
  ramSummary: null,
  ramModules: [],
  storageDisks: [],
  systemSpecs: {
    cpuName: null,
    cores: null,
    threads: null,
    maxClockMhz: null,
    l3CacheMb: null,
    motherboard: null,
    osCaption: null,
    osBuild: null,
    uptime: null
  },
  osEventLogs: [],
  fans: null,
  voltages: null
};

// Initial Sample Alert Logs
const initialAlerts = [];
alertLogs = [...initialAlerts];

// Helper: Escape HTML string safely
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Cyber NOC Floating Tooltip Engine
// ============================================================================
function initTooltipEngine() {
  const tooltipEl = document.getElementById('cyber-floating-tooltip');
  if (!tooltipEl) return;

  let currentTarget = null;

  function getTooltipData(target) {
    const el = target.closest('[data-tooltip], [data-tooltip-title], .truncate, .truncate-hoverable');
    if (!el) return null;

    let content = el.getAttribute('data-tooltip');
    let title = el.getAttribute('data-tooltip-title') || '';
    let category = el.getAttribute('data-tooltip-category') || 'SPEC INFO';

    // Auto-detect truncated text if no explicit data-tooltip is provided
    if (!content && (el.classList.contains('truncate') || el.classList.contains('truncate-hoverable'))) {
      if (el.scrollWidth > el.clientWidth + 2) {
        content = el.textContent.trim();
        if (!title) title = 'Full Specification';
      }
    }

    if (!content) return null;
    return { el, content, title, category };
  }

  function updateTooltipPosition(e) {
    if (!tooltipEl || tooltipEl.classList.contains('tooltip-hidden')) return;

    const offset = 14;
    let left = e.clientX + offset;
    let top = e.clientY + offset;

    const tooltipWidth = tooltipEl.offsetWidth || 300;
    const tooltipHeight = tooltipEl.offsetHeight || 90;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    // Viewport Right Clamp
    if (left + tooltipWidth > winWidth - 16) {
      left = e.clientX - tooltipWidth - offset;
    }
    // Viewport Bottom Clamp
    if (top + tooltipHeight > winHeight - 16) {
      top = e.clientY - tooltipHeight - offset;
    }

    if (left < 16) left = 16;
    if (top < 16) top = 16;

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
  }

  document.addEventListener('mouseover', (e) => {
    const data = getTooltipData(e.target);
    if (!data) return;

    currentTarget = data.el;
    
    let headerHtml = '';
    if (data.title) {
      headerHtml = `
        <div class="tooltip-header">
          <div class="tooltip-title">
            <span>🔹</span>
            <span>${escapeHtml(data.title)}</span>
          </div>
          <span class="tooltip-badge">${escapeHtml(data.category)}</span>
        </div>
      `;
    }

    tooltipEl.innerHTML = `
      ${headerHtml}
      <div class="tooltip-body">${escapeHtml(data.content)}</div>
      <div class="tooltip-meta">
        <span>Cyber NOC Telemetry</span>
        <span>Hover Inspector</span>
      </div>
    `;

    tooltipEl.classList.remove('tooltip-hidden');
    tooltipEl.classList.add('tooltip-visible');
    updateTooltipPosition(e);
  });

  document.addEventListener('mousemove', (e) => {
    if (!currentTarget) return;
    updateTooltipPosition(e);
  });

  document.addEventListener('mouseout', (e) => {
    if (!currentTarget) return;
    const related = e.relatedTarget;
    if (related && currentTarget.contains(related)) return;

    currentTarget = null;
    tooltipEl.classList.remove('tooltip-visible');
    tooltipEl.classList.add('tooltip-hidden');
  });
}

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
        <td colspan="6" class="py-8 text-center text-slate-500 font-sans">
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

    const copyPayload = `[${item.timestamp}] [${item.severity}] [${item.component}] ${item.message} | Rekomendasi: ${item.action}`;

    return `
      <tr class="hover:bg-slate-800/40 transition">
        <td class="py-2.5 px-4 text-slate-400 whitespace-nowrap">${item.timestamp}</td>
        <td class="py-2.5 px-3">
          <span class="px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}">
            ${item.severity}
          </span>
        </td>
        <td class="py-2.5 px-3 font-semibold text-slate-200">${item.component}</td>
        <td class="py-2.5 px-4 text-slate-300 font-sans max-w-md truncate truncate-hoverable"
            data-tooltip-title="Hardware Anomaly Alert"
            data-tooltip-category="${item.severity}"
            data-tooltip="${escapeHtml(item.message)}">${item.message}</td>
        <td class="py-2.5 px-3 text-slate-400 font-sans max-w-xs truncate truncate-hoverable"
            data-tooltip-title="Rekomendasi Tindakan NOC"
            data-tooltip-category="MITIGATION"
            data-tooltip="${escapeHtml(item.action)}">${item.action}</td>
        <td class="py-2.5 px-3 text-right">
          <button class="copy-alert-row-btn px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700/50 hover:border-cyan-500/30 transition flex items-center gap-1 ml-auto"
                  data-log="${escapeHtml(copyPayload)}" title="Salin rincian alarm ini">
            <span>📋 Salin</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach Row Copy Listeners
  tbody.querySelectorAll('.copy-alert-row-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-log') || '';
      copyToClipboard(text, btn, '✓ Tersalin!');
    });
  });
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
        <td colspan="7" class="py-8 text-center text-slate-500 font-sans">
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

    const copyPayload = `[${item.time}] [${item.level || 'Info'}] [${item.logName}] [Event ID: ${item.eventId || '—'}] ${item.source}: ${item.message}`;

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
        <td class="py-2.5 px-4 font-semibold text-slate-200 text-xs max-w-[160px] truncate truncate-hoverable"
            data-tooltip-title="Provider Event Source"
            data-tooltip-category="${item.logName || 'WINDOWS'}"
            data-tooltip="${escapeHtml(item.source)}">${item.source}</td>
        <td class="py-2.5 px-4 text-slate-300 font-sans text-xs max-w-md truncate truncate-hoverable"
            data-tooltip-title="Windows Event ID #${item.eventId || '—'}"
            data-tooltip-category="${item.logName || 'WINDOWS'} (${item.level || 'Info'})"
            data-tooltip="${escapeHtml(item.message)}">${item.message}</td>
        <td class="py-2.5 px-3 text-right">
          <button class="copy-event-row-btn px-2 py-1 rounded-lg text-[10px] font-bold bg-slate-800/80 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700/50 hover:border-cyan-500/30 transition flex items-center gap-1 ml-auto"
                  data-log="${escapeHtml(copyPayload)}" title="Salin rincian event Windows ini">
            <span>📋 Salin</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  // Attach Row Copy Listeners
  tbody.querySelectorAll('.copy-event-row-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const text = btn.getAttribute('data-log') || '';
      copyToClipboard(text, btn, '✓ Tersalin!');
    });
  });
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
        <button class="node-tab-btn flex items-center space-x-2 px-3 py-1.5 text-xs font-mono font-bold truncate-hoverable"
                data-node-id="${node.id}"
                data-tooltip-title="Profil Target Monitoring"
                data-tooltip-category="${node.type}"
                data-tooltip="${escapeHtml(node.name)} (${node.host}:${node.port}) • User: ${node.user || 'system'} • Suhu: ${tempVal} • Latensi: ${pingVal || '0ms'}">
          ${pingDot}
          <span class="truncate max-w-[140px]">${node.name}</span>
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

// Generic 60 FPS HTML5 Canvas Sparkline/Area Chart Renderer
function drawCyberSparkline(canvasId, dataPoints, strokeColor, fillColor, minVal = 0, maxVal = 100, unit = '%') {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();

  if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
  }
  ctx.save();
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;

  ctx.clearRect(0, 0, w, h);

  if (!dataPoints || dataPoints.length === 0) {
    ctx.restore();
    return;
  }

  // Grid lines
  ctx.strokeStyle = 'rgba(51, 65, 85, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 4]);

  ctx.beginPath();
  ctx.moveTo(0, h * 0.5);
  ctx.lineTo(w, h * 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // Calculate coordinates
  const points = [];
  const range = maxVal - minVal || 1;
  const step = w / Math.max(1, dataPoints.length - 1);

  dataPoints.forEach((val, i) => {
    const clamped = Math.max(minVal, Math.min(maxVal, val));
    const norm = (clamped - minVal) / range;
    const x = i * step;
    const y = h - (norm * (h - 14)) - 7;
    points.push({ x, y, val });
  });

  // Area Fill
  if (fillColor && points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, h);
    points.forEach((p, i) => {
      if (i === 0) ctx.lineTo(p.x, p.y);
      else {
        const prev = points[i - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.lineTo(points[points.length - 1].x, h);
    ctx.closePath();

    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, fillColor);
    gradient.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  // Stroke Line
  if (points.length > 1) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.forEach((p, i) => {
      if (i > 0) {
        const prev = points[i - 1];
        const cx = (prev.x + p.x) / 2;
        ctx.bezierCurveTo(cx, prev.y, cx, p.y, p.x, p.y);
      }
    });
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 6;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  // Glowing dot on latest point
  if (points.length > 0) {
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.shadowColor = strokeColor;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

// Render Real-Time Timeseries Performance Graphs
function renderTimeseriesCharts(timeseries, hardwareState) {
  if (!timeseries) return;

  const cpuData = timeseries.cpu && timeseries.cpu.length > 0 ? timeseries.cpu : [14];
  const ramData = timeseries.ram && timeseries.ram.length > 0 ? timeseries.ram : [38.7];
  const diskData = timeseries.disk && timeseries.disk.length > 0 ? timeseries.disk : [12.4];
  const netRxData = timeseries.net_rx && timeseries.net_rx.length > 0 ? timeseries.net_rx : [145];
  const netTxData = timeseries.net_tx && timeseries.net_tx.length > 0 ? timeseries.net_tx : [42];

  // 1. CPU Load
  const latestCpu = cpuData[cpuData.length - 1] || 0;
  const cpuMin = Math.min(...cpuData);
  const cpuAvg = Math.round(cpuData.reduce((a, b) => a + b, 0) / cpuData.length);
  const cpuMax = Math.max(...cpuData);

  const cpuBadge = document.getElementById('trend-cpu-badge');
  const statCpuMin = document.getElementById('stat-cpu-min');
  const statCpuAvg = document.getElementById('stat-cpu-avg');
  const statCpuMax = document.getElementById('stat-cpu-max');

  if (cpuBadge) cpuBadge.innerText = `${latestCpu.toFixed(1)}%`;
  if (statCpuMin) statCpuMin.innerText = `${cpuMin.toFixed(0)}%`;
  if (statCpuAvg) statCpuAvg.innerText = `${cpuAvg.toFixed(0)}%`;
  if (statCpuMax) statCpuMax.innerText = `${cpuMax.toFixed(0)}%`;

  drawCyberSparkline('chart-cpu', cpuData, '#22d3ee', 'rgba(34, 211, 238, 0.3)', 0, 100, '%');

  // 2. RAM Usage
  const latestRam = ramData[ramData.length - 1] || 0;
  const ramSummary = hardwareState.ramSummary;
  const ramBadge = document.getElementById('trend-ram-badge');
  const statRamUsed = document.getElementById('stat-ram-used');
  const statRamTotal = document.getElementById('stat-ram-total');

  if (ramBadge) ramBadge.innerText = `${latestRam.toFixed(1)}%`;
  if (statRamUsed) statRamUsed.innerText = (ramSummary && ramSummary.usedGb != null) ? `${ramSummary.usedGb.toFixed(1)} GB` : '—';
  if (statRamTotal) statRamTotal.innerText = (ramSummary && ramSummary.totalGb != null) ? `${ramSummary.totalGb.toFixed(1)} GB` : '—';

  drawCyberSparkline('chart-ram', ramData, '#10b981', 'rgba(16, 185, 129, 0.3)', 0, 100, '%');

  // 3. Disk Activity
  const latestDisk = diskData[diskData.length - 1] || 0;
  const diskMax = Math.max(25, Math.ceil(Math.max(...diskData) * 1.2));
  const diskBadge = document.getElementById('trend-disk-badge');
  const statDiskRate = document.getElementById('stat-disk-rate');

  if (diskBadge) diskBadge.innerText = `${latestDisk.toFixed(1)} MB/s`;
  if (statDiskRate) statDiskRate.innerText = `${latestDisk.toFixed(1)} MB/s`;

  drawCyberSparkline('chart-disk', diskData, '#c084fc', 'rgba(192, 132, 252, 0.3)', 0, diskMax, 'MB/s');

  // 4. Network Bandwidth
  const latestRx = netRxData[netRxData.length - 1] || 0;
  const latestTx = netTxData[netTxData.length - 1] || 0;
  const netMax = Math.max(100, Math.ceil(Math.max(...netRxData, ...netTxData) * 1.2));
  const netBadge = document.getElementById('trend-net-badge');
  const statNetRx = document.getElementById('stat-net-rx');
  const statNetTx = document.getElementById('stat-net-tx');

  if (netBadge) netBadge.innerText = `↓ ${latestRx.toFixed(0)} KB/s`;
  if (statNetRx) statNetRx.innerText = `${latestRx.toFixed(0)} KB/s`;
  if (statNetTx) statNetTx.innerText = `${latestTx.toFixed(0)} KB/s`;

  drawCyberSparkline('chart-network', netRxData, '#06b6d4', 'rgba(6, 182, 212, 0.25)', 0, netMax, 'KB/s');

  // Synchronize Top Executive Quick Pulse Bar
  const pulseCpu = document.getElementById('pulse-cpu-val');
  const pulseRam = document.getElementById('pulse-ram-val');
  const pulseDisk = document.getElementById('pulse-disk-val');
  const pulseNet = document.getElementById('pulse-net-val');

  if (pulseCpu) pulseCpu.innerText = `${latestCpu.toFixed(1)}%`;
  if (pulseRam) pulseRam.innerText = `${latestRam.toFixed(1)}%`;
  if (pulseDisk) pulseDisk.innerText = `${latestDisk.toFixed(1)} MB/s`;
  if (pulseNet) pulseNet.innerText = `↓ ${latestRx.toFixed(0)} KB/s`;
}

// Render Dynamic RAM Modules Cards
function renderDynamicRam(ramModules, ramSummary) {
  const container = document.getElementById('dynamic-ram-container');
  const ramTotalBadge = document.getElementById('ram-total-badge');
  const ramUsedBadge = document.getElementById('ram-used-badge');
  const ramBarText = document.getElementById('ram-bar-text');
  const ramUsageBar = document.getElementById('ram-usage-bar');

  if (ramSummary && ramSummary.totalGb > 0) {
    const totalGb = ramSummary.totalGb;
    const usedGb = ramSummary.usedGb;
    const freeGb = ramSummary.freeGb;
    const usedPct = ramSummary.usedPct;

    if (ramTotalBadge) ramTotalBadge.innerText = `${totalGb.toFixed(1)} GB`;
    if (ramUsedBadge) ramUsedBadge.innerText = `${usedGb.toFixed(1)} GB (${usedPct.toFixed(0)}%)`;
    if (ramBarText) ramBarText.innerText = `${usedGb.toFixed(1)} GB / ${totalGb.toFixed(1)} GB Used (${freeGb.toFixed(1)} GB Free)`;
    if (ramUsageBar) ramUsageBar.style.width = `${Math.min(100, Math.max(5, usedPct))}%`;
  } else {
    if (ramTotalBadge) ramTotalBadge.innerHTML = `<span class="text-rose-400">⚠️ —</span>`;
    if (ramUsedBadge) ramUsedBadge.innerHTML = `<span class="text-rose-400">⚠️ Tidak Terdeteksi</span>`;
    if (ramBarText) ramBarText.innerHTML = `<span class="text-rose-400">⚠️ Data RAM Tidak Terbaca</span>`;
  }

  if (!container) return;

  if (!ramModules || ramModules.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-center text-xs font-mono font-bold">
        ⚠️ Data Modul RAM Fisik Tidak Terdeteksi via SSH
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
            ${mod.type || 'RAM'}
          </span>
        </div>

        <div class="py-1">
          <div class="text-2xl font-mono font-black text-cyan-300">
            ${(mod.capacityGb != null ? mod.capacityGb : 0).toFixed(1)} <span class="text-xs text-slate-400 font-sans">GB</span>
          </div>
          <div class="text-[11px] font-mono text-emerald-400 font-semibold">
            ⚡ ${mod.speedMhz || '—'} MT/s (MHz)
          </div>
        </div>

        <div class="pt-2 border-t border-slate-800/80 text-[11px] space-y-1 font-mono text-slate-400">
          <div class="flex justify-between items-center">
            <span>Manufaktur:</span>
            <span class="text-slate-200 font-semibold truncate max-w-[120px] truncate-hoverable"
                  data-tooltip-title="RAM Manufacturer"
                  data-tooltip-category="MEMORY DIMM"
                  data-tooltip="${escapeHtml(mod.manufacturer || 'OEM Standard')}">${mod.manufacturer || 'OEM'}</span>
          </div>
          <div class="flex justify-between items-center">
            <span>Part Number:</span>
            <span class="text-slate-300 truncate max-w-[130px] truncate-hoverable"
                  data-tooltip-title="RAM Part Number / Serial"
                  data-tooltip-category="MEMORY DIMM"
                  data-tooltip="${escapeHtml(mod.partNumber || 'Module Part')}">${mod.partNumber || 'Module Part'}</span>
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
      <div class="col-span-full p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-center text-xs font-mono font-bold">
        ⚠️ Unit Penyimpanan Fisik & Partisi Tidak Terdeteksi via SSH
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
              <div class="text-xs font-bold text-slate-200 truncate max-w-[220px] truncate-hoverable"
                   data-tooltip-title="Physical Storage Drive"
                   data-tooltip-category="${disk.interface || 'NVMe'}"
                   data-tooltip="Disk ${disk.index}: ${escapeHtml(disk.model)} | Kapasitas: ${(disk.sizeGb || 0).toFixed(1)} GB | Status: ${disk.status || 'OK'}">Disk ${disk.index}: ${disk.model}</div>
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
  const { cpu, gpu, storage, motherboard, fans, voltages, host, sourceMode, sshConfig, ramSummary, ramModules, storageDisks, systemSpecs, timeseries } = hardwareState;

  // Render Real-Time Timeseries Performance Graphs
  renderTimeseriesCharts(timeseries, hardwareState);

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

  if (hostNameElem) {
    hostNameElem.innerText = host || 'TARGET-DEVICE';
    hostNameElem.setAttribute('data-tooltip', `Target Host: ${host || 'Target'} | Mode: ${sourceMode} | Link: ${sshConfig ? (sshConfig.connected ? 'SSH Connected (' + (sshConfig.latencyMs || 0) + 'ms)' : 'Reconnecting') : 'Local Host'}`);
  }
  if (cpuModelElem) {
    const fullCpu = (cpu && cpu.model) || (systemSpecs && systemSpecs.cpuName);
    if (fullCpu) {
      cpuModelElem.innerHTML = escapeHtml(fullCpu);
      cpuModelElem.setAttribute('data-tooltip', `${fullCpu} | ${(cpu && cpu.cores) || '—'} Cores, ${(cpu && cpu.threads) || '—'} Threads, ${(cpu && cpu.maxClockMhz) || '—'} MHz`);
    } else {
      cpuModelElem.innerHTML = `<span class="text-rose-400 font-mono font-bold text-[11px]">⚠️ CPU Tidak Terdeteksi</span>`;
    }
  }
  if (cpuTopologyElem) {
    if (cpu && cpu.cores && cpu.threads) {
      cpuTopologyElem.innerHTML = `${cpu.cores} Cores &bull; ${cpu.threads} Threads &bull; ${cpu.l3CacheMb ? cpu.l3CacheMb + 'MB L3' : 'L3 Cache'}`;
      cpuTopologyElem.setAttribute('data-tooltip', `Arsitektur: ${cpu.cores} Cores fisik &bull; ${cpu.threads} Threads logikal`);
    } else {
      cpuTopologyElem.innerHTML = `<span class="text-slate-400 font-mono text-[10px]">Arsitektur Prosesor</span>`;
    }
  }
  if (mbModelText) {
    const mb = systemSpecs && systemSpecs.motherboard;
    if (mb) {
      mbModelText.innerHTML = escapeHtml(mb);
      mbModelText.setAttribute('data-tooltip', `Motherboard: ${mb} | UEFI Firmware Architecture`);
    } else {
      mbModelText.innerHTML = `<span class="text-rose-400 font-mono font-bold text-[11px]">⚠️ Motherboard Tidak Terdeteksi</span>`;
    }
  }
  if (gpuModelElem) {
    const gpuName = gpu && gpu.model;
    if (gpuName) {
      gpuModelElem.innerHTML = escapeHtml(gpuName);
      const vramStr = gpu.vramGb ? ` | VRAM: ${gpu.vramGb} GB Dedicated` : '';
      gpuModelElem.setAttribute('data-tooltip', `Graphics Adapter: ${gpuName} | Suhu: ${(gpu.temp || 40).toFixed(1)}°C | Power: ${(gpu.power || 35).toFixed(1)}W${vramStr}`);
    } else {
      gpuModelElem.innerHTML = `<span class="text-rose-400 font-mono font-bold text-[11px]">⚠️ GPU Tidak Terdeteksi</span>`;
    }

    const gpuAdapterType = document.getElementById('gpu-adapter-type');
    const gpuVramText = document.getElementById('gpu-vram-text');
    if (gpuAdapterType) {
      if (gpu && gpu.isDiscrete) {
        gpuAdapterType.innerText = 'Dedicated PCIe Graphics';
      } else if (gpu && gpu.is_igpu) {
        gpuAdapterType.innerText = 'Integrated Graphics (iGPU)';
      } else if (gpuName) {
        gpuAdapterType.innerText = 'PCIe / Direct Adapter';
      }
    }
    if (gpuVramText) {
      if (gpu && gpu.vramGb > 0) {
        gpuVramText.innerText = `${gpu.vramGb} GB Dedicated`;
      } else {
        gpuVramText.innerText = 'Shared System Memory';
      }
    }
  }
  if (osCaptionText) {
    const osCap = systemSpecs && systemSpecs.osCaption;
    if (osCap) {
      osCaptionText.innerHTML = escapeHtml(osCap);
      osCaptionText.setAttribute('data-tooltip', `Sistem Operasi: ${osCap} (64-bit Architecture)`);
    } else {
      osCaptionText.innerHTML = `<span class="text-rose-400 font-mono font-bold text-[11px]">⚠️ OS Tidak Terdeteksi</span>`;
    }
  }
  if (sysUptimeText) {
    const up = systemSpecs && systemSpecs.uptime;
    if (up) {
      sysUptimeText.innerHTML = `⏱️ Uptime: ${escapeHtml(up)}`;
      sysUptimeText.setAttribute('data-tooltip', `Durasi Sistem Aktif: ${up} tanpa restart`);
    } else {
      sysUptimeText.innerHTML = `<span class="text-rose-400 font-mono font-bold text-[10px]">⚠️ Uptime Tidak Terbaca</span>`;
    }
  }
  if (powerSourceText) {
    powerSourceText.innerText = hardwareState.powerSource || 'AC Connected';
    powerSourceText.setAttribute('data-tooltip', `Sumber Daya: ${hardwareState.powerSource || 'AC Connected'}`);
  }

  // Quick Executive Pulse Metrics Bar (Top Section 0)
  const pulseCpuVal = document.getElementById('pulse-cpu-val');
  const pulseRamVal = document.getElementById('pulse-ram-val');
  const pulseDiskVal = document.getElementById('pulse-disk-val');
  const pulseNetVal = document.getElementById('pulse-net-val');
  const globalHealthBadge = document.getElementById('global-health-badge');

  if (pulseCpuVal) {
    const cpuLoad = (cpu && cpu.loadPct != null) ? cpu.loadPct : 0;
    pulseCpuVal.innerText = `${cpuLoad.toFixed(1)}%`;
  }
  if (pulseRamVal) {
    const ramPct = (ramSummary && ramSummary.usedPct != null) ? ramSummary.usedPct : 0;
    pulseRamVal.innerText = `${ramPct.toFixed(1)}%`;
  }
  if (pulseDiskVal) {
    const stAct = (storage && storage.activity != null) ? storage.activity : 12.4;
    pulseDiskVal.innerText = `${stAct.toFixed(1)} MB/s`;
  }
  if (pulseNetVal) {
    const rx = (hardwareState.network && hardwareState.network.rxKbps != null) ? hardwareState.network.rxKbps : 0;
    pulseNetVal.innerText = `↓ ${rx.toFixed(0)} KB/s`;
  }
  if (globalHealthBadge) {
    if (cpu && cpu.temp >= 85) {
      globalHealthBadge.className = 'px-2.5 py-1 rounded-xl text-xs font-bold font-mono border bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse';
      globalHealthBadge.innerText = 'CRITICAL THERMAL';
    } else if (cpu && cpu.temp >= 75) {
      globalHealthBadge.className = 'px-2.5 py-1 rounded-xl text-xs font-bold font-mono border bg-amber-500/20 text-amber-400 border-amber-500/30';
      globalHealthBadge.innerText = 'HIGH LOAD';
    } else if (sourceMode === 'SSH_REMOTE' && sshConfig && !sshConfig.connected) {
      globalHealthBadge.className = 'px-2.5 py-1 rounded-xl text-xs font-bold font-mono border bg-rose-500/20 text-rose-400 border-rose-500/30 animate-pulse';
      globalHealthBadge.innerText = 'LINK DISCONNECTED';
    } else {
      globalHealthBadge.className = 'px-2.5 py-1 rounded-xl text-xs font-bold font-mono border bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      globalHealthBadge.innerText = 'SYSTEM OPTIMAL';
    }
  }

  if (connBadge && connText && sshConfig) {
    if (sourceMode === 'SSH_REMOTE') {
      if (sshConfig.connected) {
        consecutiveDisconnectCycles = 0;
        lastAutoOpenedNodeId = null;
        connBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-2 shadow';
        connText.innerText = `SSH CONNECTED (${sshConfig.latencyMs || 0} ms)`;
        connBadge.setAttribute('data-tooltip', `Status SSH: Terhubung ke ${sshConfig.targetHost}:${sshConfig.targetPort} (${sshConfig.latencyMs || 0} ms)`);
      } else {
        consecutiveDisconnectCycles++;
        connBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 flex items-center gap-2 animate-pulse shadow cursor-pointer transition';
        const errDetail = sshConfig.lastError ? ` - ${sshConfig.lastError}` : '';
        connText.innerText = `🔴 TIMEOUT / RECONNECTING (${sshConfig.targetHost})`;
        connBadge.setAttribute('data-tooltip', `Klik di sini untuk Diagnostik Error & Panduan Perbaikan SSH (${sshConfig.targetHost}:${sshConfig.targetPort}${errDetail})`);

        // Auto trigger troubleshooting modal on 3rd failure if not opened yet for this node
        if (consecutiveDisconnectCycles >= 3 && lastAutoOpenedNodeId !== activeNodeId) {
          lastAutoOpenedNodeId = activeNodeId;
          openSshTroubleshootModal(activeNodeId);
        }
      }
    } else {
      consecutiveDisconnectCycles = 0;
      lastAutoOpenedNodeId = null;
      connBadge.className = 'px-3 py-1 rounded-full text-xs font-semibold bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 flex items-center gap-2 shadow';
      connText.innerText = 'LOCAL HOST ACTIVE';
      connBadge.setAttribute('data-tooltip', 'Status: Monitoring Local Host (WMI Direct)');
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
    const gpuFanIcon = document.getElementById('gpu-fan-icon');
    const gpuFanSubtext = document.getElementById('gpu-fan-subtext');
    const caseFanRpm = document.getElementById('case-fan-rpm');
    const caseFanPwm = document.getElementById('case-fan-pwm');
    const caseFanBar = document.getElementById('case-fan-bar');

    if (cpuFanRpm) cpuFanRpm.innerText = fans.cpu ? fans.cpu.rpm : '—';
    if (cpuFanPwm) cpuFanPwm.innerText = `${fans.cpu ? fans.cpu.pwm : 0}%`;
    if (cpuFanBar) cpuFanBar.style.width = `${fans.cpu ? fans.cpu.pwm : 0}%`;

    if (gpuFanRpm) {
      if (fans.gpu && (fans.gpu.is_igpu || fans.gpu.has_fan === false)) {
        gpuFanRpm.innerHTML = `<span class="text-slate-400 font-bold text-xs">N/A</span> <span class="text-[10px] text-slate-500 font-mono font-normal">(iGPU / Fanless)</span>`;
        if (gpuFanPwm) gpuFanPwm.innerText = `N/A`;
        if (gpuFanBar) gpuFanBar.style.width = `0%`;
        if (gpuFanIcon) gpuFanIcon.classList.remove('fan-icon-spin');
        if (gpuFanSubtext) gpuFanSubtext.innerText = 'Integrated GPU (Fanless)';
      } else if (fans.gpu && fans.gpu.rpm === 0) {
        gpuFanRpm.innerHTML = `<span class="text-emerald-400 font-bold">0</span> <span class="text-[10px] text-emerald-400/80 font-mono font-normal">(0-dB Mode)</span>`;
        if (gpuFanPwm) gpuFanPwm.innerText = `${fans.gpu.pwm || 0}%`;
        if (gpuFanBar) gpuFanBar.style.width = `${fans.gpu.pwm || 0}%`;
        if (gpuFanIcon) gpuFanIcon.classList.remove('fan-icon-spin');
        if (gpuFanSubtext) gpuFanSubtext.innerText = 'Dedicated GPU Cooler';
      } else {
        gpuFanRpm.innerHTML = `<span class="text-emerald-300 font-bold">${fans.gpu ? fans.gpu.rpm : '—'}</span> <span class="text-xs text-slate-400 font-sans">RPM</span>`;
        if (gpuFanPwm) gpuFanPwm.innerText = `${fans.gpu ? fans.gpu.pwm : 0}%`;
        if (gpuFanBar) gpuFanBar.style.width = `${fans.gpu ? fans.gpu.pwm : 0}%`;
        if (gpuFanIcon) gpuFanIcon.classList.add('fan-icon-spin');
        if (gpuFanSubtext) gpuFanSubtext.innerText = 'Dedicated GPU Cooler';
      }
    }

    if (caseFanRpm) {
      if (fans.case && (fans.case.has_fan === false || fans.case.rpm === 0)) {
        caseFanRpm.innerHTML = `<span class="text-slate-400 font-bold text-xs">N/A</span> <span class="text-[10px] text-slate-500 font-mono font-normal">(Tidak Terpasang)</span>`;
        if (caseFanPwm) caseFanPwm.innerText = `N/A`;
        if (caseFanBar) caseFanBar.style.width = `0%`;
      } else {
        caseFanRpm.innerHTML = `<span class="text-indigo-300 font-bold">${fans.case ? fans.case.rpm : '—'}</span> <span class="text-xs text-slate-400 font-sans">RPM</span>`;
        if (caseFanPwm) caseFanPwm.innerText = `${fans.case ? fans.case.pwm : 0}%`;
        if (caseFanBar) caseFanBar.style.width = `${fans.case ? fans.case.pwm : 0}%`;
      }
    }
  }

  // Voltages & Power Delivery
  if (voltages) {
    const v12Val = document.getElementById('v12-val');
    const v12Badge = document.getElementById('v12-badge');
    const v5Val = document.getElementById('v5-val');
    const v33Val = document.getElementById('v33-val');
    const vcoreVal = document.getElementById('vcore-val');
    const totalPowerVal = document.getElementById('total-power-val');

    if (v12Val) v12Val.innerText = voltages.v12 != null ? voltages.v12.toFixed(2) : '—';
    if (v5Val) v5Val.innerText = voltages.v5 != null ? voltages.v5.toFixed(2) : '—';
    if (v33Val) v33Val.innerText = voltages.v33 != null ? voltages.v33.toFixed(2) : '—';
    if (vcoreVal) vcoreVal.innerText = voltages.vcore != null ? voltages.vcore.toFixed(2) : '—';
    if (totalPowerVal) totalPowerVal.innerText = voltages.totalPower != null ? `${voltages.totalPower.toFixed(1)} W` : '—';

    if (v12Badge && voltages.v12 != null) {
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

  if (feedback) {
    feedback.classList.add('hidden');
    feedback.innerText = '';
  }

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

      if (deleteBtn) {
        deleteBtn.classList.remove('hidden');
        if (registeredNodes.length <= 1) {
          deleteBtn.classList.add('opacity-40', 'cursor-not-allowed');
          deleteBtn.title = 'Minimal harus ada 1 profil tersisa di dashboard';
        } else {
          deleteBtn.classList.remove('opacity-40', 'cursor-not-allowed');
          deleteBtn.title = 'Hapus profil perangkat ini dari vault';
        }
      }
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
  initTooltipEngine();
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
          setTimeout(async () => {
            closeProfileModal();
            await fetchNodes();
            if (resData.nodeId) await selectNode(resData.nodeId);
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
      const feedback = document.getElementById('modal-profile-feedback');
      if (!nodeId) return;

      const targetNode = registeredNodes.find(n => n.id === nodeId);
      const nodeName = targetNode ? targetNode.name : nodeId;

      if (registeredNodes.length <= 1) {
        if (feedback) {
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-amber-500/20 text-amber-300';
          feedback.innerText = '⚠️ Minimal harus ada 1 profil perangkat dalam sistem.';
          feedback.classList.remove('hidden');
        }
        return;
      }

      if (!confirm(`Apakah Anda yakin ingin menghapus profil perangkat "${nodeName}" dari vault?`)) {
        return;
      }

      if (feedback) {
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-cyan-500/20 text-cyan-300';
        feedback.innerText = 'Menghapus profil perangkat...';
        feedback.classList.remove('hidden');
      }

      try {
        const res = await fetch(`/api/nodes?id=${encodeURIComponent(nodeId)}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          triggerAlert('INFO', 'Device Vault', `Profil "${nodeName}" berhasil dihapus dari vault.`, 'Node vault diupdate');
          closeProfileModal();
          await fetchNodes();
          if (data.activeNodeId) {
            await selectNode(data.activeNodeId);
          } else if (registeredNodes.length > 0) {
            await selectNode(registeredNodes[0].id);
          }
        } else {
          if (feedback) {
            feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-rose-500/20 text-rose-300';
            feedback.innerText = `❌ ${data.message || 'Gagal menghapus profil.'}`;
            feedback.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (feedback) {
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-rose-500/20 text-rose-300';
          feedback.innerText = '❌ Terjadi kesalahan jaringan saat menghapus profil.';
          feedback.classList.remove('hidden');
        }
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

  // Copy All Alerts Log Button
  const copyAllAlertsBtn = document.getElementById('copy-all-alerts-btn');
  if (copyAllAlertsBtn) {
    copyAllAlertsBtn.addEventListener('click', () => {
      if (alertLogs.length === 0) {
        copyToClipboard('Tidak ada log anomali hardware.', copyAllAlertsBtn, 'Log Kosong');
        return;
      }
      const dump = alertLogs.map(a => `[${a.timestamp}] [${a.severity}] [${a.component}] ${a.message} | Rekomendasi: ${a.action}`).join('\n');
      copyToClipboard(`=== HARDWARE ANOMALY ALERTS LOG (${new Date().toLocaleString()}) ===\n` + dump, copyAllAlertsBtn, '✓ Semua Tersalin!');
    });
  }

  // Copy All Windows Events Log Button
  const copyAllEventsBtn = document.getElementById('copy-all-events-btn');
  if (copyAllEventsBtn) {
    copyAllEventsBtn.addEventListener('click', () => {
      const logs = hardwareState.osEventLogs || [];
      if (logs.length === 0) {
        copyToClipboard('Tidak ada event Windows yang tercatat.', copyAllEventsBtn, 'Log Kosong');
        return;
      }
      const dump = logs.map(e => `[${e.time}] [${e.level || 'Info'}] [${e.logName}] [Event ID: ${e.eventId || '—'}] ${e.source}: ${e.message}`).join('\n');
      copyToClipboard(`=== WINDOWS OS EVENT & AUDIT LOGS (${new Date().toLocaleString()}) ===\n` + dump, copyAllEventsBtn, '✓ Semua Tersalin!');
    });
  }

  // Connection Badge Click -> Open Troubleshooting Modal if Disconnected
  const connBadgeEl = document.getElementById('connection-badge');
  if (connBadgeEl) {
    connBadgeEl.addEventListener('click', () => {
      const isSsh = hardwareState.sourceMode === 'SSH_REMOTE';
      const isConn = hardwareState.sshConfig && hardwareState.sshConfig.connected;
      if (isSsh && !isConn) {
        openSshTroubleshootModal(activeNodeId);
      }
    });
  }

  // SSH Troubleshoot Modal Controls
  const closeTroubleshootBtn = document.getElementById('close-troubleshoot-modal-btn');
  const dismissTroubleshootBtn = document.getElementById('troubleshoot-dismiss-btn');
  const retryTroubleshootBtn = document.getElementById('troubleshoot-retry-btn');
  const editVaultTroubleshootBtn = document.getElementById('troubleshoot-edit-vault-btn');
  const copyTroubleshootLogBtn = document.getElementById('copy-troubleshoot-log-btn');
  const copyPshFixBtn = document.getElementById('copy-powershell-fix-btn');

  if (closeTroubleshootBtn) closeTroubleshootBtn.addEventListener('click', closeSshTroubleshootModal);
  if (dismissTroubleshootBtn) dismissTroubleshootBtn.addEventListener('click', closeSshTroubleshootModal);

  if (retryTroubleshootBtn) {
    retryTroubleshootBtn.addEventListener('click', async () => {
      const origText = retryTroubleshootBtn.innerHTML;
      retryTroubleshootBtn.innerHTML = '<span>⏳ Menghubungkan...</span>';
      await updateMetrics();
      await fetchNodes();
      setTimeout(() => {
        retryTroubleshootBtn.innerHTML = origText;
        if (hardwareState.sshConfig && hardwareState.sshConfig.connected) {
          closeSshTroubleshootModal();
        } else {
          openSshTroubleshootModal(activeNodeId);
        }
      }, 1000);
    });
  }

  if (editVaultTroubleshootBtn) {
    editVaultTroubleshootBtn.addEventListener('click', () => {
      closeSshTroubleshootModal();
      openProfileModal(activeNodeId);
    });
  }

  if (copyTroubleshootLogBtn) {
    copyTroubleshootLogBtn.addEventListener('click', () => {
      const targetNode = registeredNodes.find(n => n.id === activeNodeId) || {};
      const sshCfg = hardwareState.sshConfig || {};
      const errTime = sshCfg.errorTimestamp || new Date().toLocaleTimeString();
      const errType = sshCfg.errorType || 'TIMEOUT';
      const errMsg = sshCfg.lastError || `Koneksi SSH Timeout: ${targetNode.host}:${targetNode.port || 22}`;
      const rawMsg = sshCfg.errorRaw ? `\nDetail Exception: ${sshCfg.errorRaw}` : '';

      const fullLog = `[DIAGNOSTIK KONEKSI SSH]\nWaktu: ${errTime}\nTarget Node: ${targetNode.name || 'Target'} (${targetNode.host || sshCfg.targetHost}:${targetNode.port || sshCfg.targetPort || 22})\nUsername: ${targetNode.user || sshCfg.targetUser || 'system'}\nTipe Error: ${errType}\nPesan Error: ${errMsg}${rawMsg}`;
      copyToClipboard(fullLog, copyTroubleshootLogBtn, '✓ Log Error Tersalin!');
    });
  }

  if (copyPshFixBtn) {
    copyPshFixBtn.addEventListener('click', () => {
      const pshCodeElem = document.getElementById('powershell-fix-code');
      const code = pshCodeElem ? pshCodeElem.innerText : '';
      copyToClipboard(code, copyPshFixBtn, '✓ Script Tersalin!');
    });
  }

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
