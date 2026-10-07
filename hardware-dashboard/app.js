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

let activeNodeId = localStorage.getItem('hardware_dashboard_active_node') || 'node_cdecef22';
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
function openSshTroubleshootModal(targetInput = null) {
  const modal = document.getElementById('ssh-troubleshoot-modal');
  if (!modal) return;

  let targetNode = null;
  if (targetInput && typeof targetInput === 'object') {
    targetNode = targetInput;
  } else if (typeof targetInput === 'string') {
    targetNode = registeredNodes.find(n => n.id === targetInput);
  } else {
    targetNode = registeredNodes.find(n => n.id === activeNodeId);
  }

  if (!targetNode) {
    targetNode = {
      name: hardwareState.nodeName || 'Target Device',
      host: hardwareState.sshConfig ? hardwareState.sshConfig.targetHost : '192.168.27.203',
      port: hardwareState.sshConfig ? hardwareState.sshConfig.targetPort : 22,
      user: hardwareState.sshConfig ? hardwareState.sshConfig.targetUser : 'admin'
    };
  }

  const badge = document.getElementById('troubleshoot-node-badge');
  const info = document.getElementById('troubleshoot-node-info');
  const timeElem = document.getElementById('troubleshoot-timestamp');
  const msgElem = document.getElementById('troubleshoot-error-message');
  const pshCodeElem = document.getElementById('powershell-fix-code');

  const sshCfg = hardwareState.sshConfig || {};
  const errType = targetNode.errorType && targetNode.errorType !== 'NONE' ? targetNode.errorType : (sshCfg.errorType && sshCfg.errorType !== 'NONE' ? sshCfg.errorType : 'DIAGNOSTIK');
  const targetPort = parseInt(targetNode.port) || 22;
  const errMsg = targetNode.lastError || sshCfg.lastError || `Koneksi SSH Timeout: Komputer target ${targetNode.host}:${targetPort} tidak merespons (Port ${targetPort} mungkin belum dibuka atau komputer target offline).`;
  const errTime = targetNode.errorTimestamp || sshCfg.errorTimestamp || new Date().toLocaleTimeString();

  if (badge) badge.innerText = errType;
  if (info) info.innerText = `Target: ${targetNode.name} (${targetNode.host}:${targetPort}) • User: ${targetNode.user || 'system'}`;
  if (timeElem) timeElem.innerText = errTime;
  if (msgElem) msgElem.innerText = errMsg;

  const portLabel = document.getElementById('troubleshoot-port-label');
  if (portLabel) portLabel.innerText = targetPort;

  if (pshCodeElem) {
    pshCodeElem.innerText = `if (-not (Get-Service sshd -ErrorAction SilentlyContinue) -and -not (Test-Path "$env:windir\\System32\\OpenSSH\\sshd.exe") -and -not (Test-Path "$env:ProgramFiles\\OpenSSH\\sshd.exe")) { try { Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 -ErrorAction SilentlyContinue | Out-Null } catch {} }; $p="$env:windir\\System32\\OpenSSH\\sshd.exe"; if (-not (Test-Path $p)) { $p="$env:ProgramFiles\\OpenSSH\\sshd.exe" }; if (-not (Get-Service sshd -ErrorAction SilentlyContinue) -and (Test-Path $p)) { & sc.exe create sshd binPath= "\`"$p\`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null }; $cfg="C:\\ProgramData\\ssh\\sshd_config"; if (-not (Test-Path 'C:\\ProgramData\\ssh')) { New-Item -ItemType Directory -Path 'C:\\ProgramData\\ssh' -Force | Out-Null }; if (Test-Path $cfg) { $lines = (Get-Content $cfg) | Where-Object { $_ -notmatch '^\\s*#?\\s*Port\\s+' -and $_ -notmatch '^\\s*#?\\s*PasswordAuthentication\\s+' -and $_ -notmatch 'HostKey __PROGRAMDATA__' }; $lines = @("Port ${targetPort}", "PasswordAuthentication yes") + $lines; $lines | Set-Content -Encoding ASCII $cfg } else { @("Port ${targetPort}", "ListenAddress 0.0.0.0", "PubkeyAuthentication yes", "PasswordAuthentication yes", "AuthorizedKeysFile .ssh/authorized_keys", "Subsystem sftp sftp-server.exe") | Set-Content -Encoding ASCII $cfg }; $kg = if (Test-Path "$env:windir\\System32\\OpenSSH\\ssh-keygen.exe") { "$env:windir\\System32\\OpenSSH\\ssh-keygen.exe" } else { "$env:ProgramFiles\\OpenSSH\\ssh-keygen.exe" }; if (Test-Path $kg) { & $kg -A 2>$null }; try { $s1=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-18'); $s2=New-Object System.Security.Principal.SecurityIdentifier('S-1-5-32-544'); Get-ChildItem 'C:\\ProgramData\\ssh\\*key*' | ForEach-Object { $a=New-Object System.Security.AccessControl.FileSecurity; $a.SetAccessRuleProtection($true,$false); $a.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($s1,'FullControl','Allow'))); $a.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($s2,'FullControl','Allow'))); Set-Acl $_.FullName $a } } catch {}; Set-Service sshd -StartupType Automatic -ErrorAction SilentlyContinue; Restart-Service sshd -Force -ErrorAction SilentlyContinue; netsh advfirewall firewall delete rule name="OpenSSH-Server-In-TCP-${targetPort}" >$null 2>&1; netsh advfirewall firewall add rule name="OpenSSH-Server-In-TCP-${targetPort}" dir=in action=allow protocol=TCP localport=${targetPort} profile=any | Out-Null; Write-Host "BERHASIL: OPENSSH SERVER DAN FIREWALL PORT ${targetPort} AKTIF!" -ForegroundColor Green`;
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
            <svg class="w-3 h-3 text-[#0A0A0A] dark:text-white inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="5" stroke-width="2"></circle></svg>
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
    return { color: 'text-[#DC2626]', stroke: '#DC2626', badgeClass: 'badge badge-danger', label: 'CRITICAL' };
  } else if (temp >= 75) {
    return { color: 'text-[#D97706]', stroke: '#D97706', badgeClass: 'badge badge-warning', label: 'WARM' };
  } else {
    return { color: 'text-[#16A34A]', stroke: '#16A34A', badgeClass: 'badge badge-success', label: 'OPTIMAL' };
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
        <td colspan="6" class="py-8 text-center text-[#888886] font-sans">
          Tidak ada insiden hardware dengan filter ${activeAlertFilter}.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(item => {
    let badgeClass = 'badge badge-neutral';
    if (item.severity === 'CRITICAL') badgeClass = 'badge badge-danger';
    if (item.severity === 'WARNING') badgeClass = 'badge badge-warning';
    if (item.severity === 'INFO') badgeClass = 'badge badge-info';

    const copyPayload = `[${item.timestamp}] [${item.severity}] [${item.component}] ${item.message} | Rekomendasi: ${item.action}`;

    return `
      <tr class="hover:bg-[#F9F9F7] transition">
        <td class="py-2.5 px-4 text-[#888886] whitespace-nowrap">${item.timestamp}</td>
        <td class="py-2.5 px-3">
          <span class="${badgeClass}">
            ${item.severity}
          </span>
        </td>
        <td class="py-2.5 px-3 font-semibold text-[#0A0A0A]">${item.component}</td>
        <td class="py-2.5 px-4 text-[#4A4A48] font-sans max-w-md truncate truncate-hoverable"
            data-tooltip-title="Hardware Anomaly Alert"
            data-tooltip-category="${item.severity}"
            data-tooltip="${escapeHtml(item.message)}">${item.message}</td>
        <td class="py-2.5 px-3 text-[#888886] font-sans max-w-xs truncate truncate-hoverable"
            data-tooltip-title="Rekomendasi Tindakan NOC"
            data-tooltip-category="MITIGATION"
            data-tooltip="${escapeHtml(item.action)}">${item.action}</td>
        <td class="py-2.5 px-3 text-right">
          <button class="copy-alert-row-btn btn btn-ghost btn-sm flex items-center gap-1 ml-auto"
                  data-log="${escapeHtml(copyPayload)}" title="Salin rincian alarm ini">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            <span>Salin</span>
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
        <td colspan="7" class="py-8 text-center text-[#888886] font-sans">
          Tidak ada event Windows dengan filter ${activeEventFilter}.
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
    if (item.logName === 'Application') logBadge = 'badge badge-info';

    const copyPayload = `[${item.time}] [${item.level || 'Info'}] [${item.logName}] [Event ID: ${item.eventId || '—'}] ${item.source}: ${item.message}`;

    return `
      <tr class="hover:bg-[#F9F9F7] transition">
        <td class="py-2.5 px-4 text-[#888886] whitespace-nowrap font-mono text-[11px]">${item.time}</td>
        <td class="py-2.5 px-3">
          <span class="${lvlBadge}">
            ${item.level || 'Info'}
          </span>
        </td>
        <td class="py-2.5 px-3">
          <span class="${logBadge}">
            ${item.logName}
          </span>
        </td>
        <td class="py-2.5 px-3 font-mono text-[#0A0A0A] font-bold">${item.eventId || '—'}</td>
        <td class="py-2.5 px-4 font-semibold text-[#0A0A0A] text-xs max-w-[160px] truncate truncate-hoverable"
            data-tooltip-title="Provider Event Source"
            data-tooltip-category="${item.logName || 'WINDOWS'}"
            data-tooltip="${escapeHtml(item.source)}">${item.source}</td>
        <td class="py-2.5 px-4 text-[#4A4A48] font-sans text-xs max-w-md truncate truncate-hoverable"
            data-tooltip-title="Windows Event ID #${item.eventId || '—'}"
            data-tooltip-category="${item.logName || 'WINDOWS'} (${item.level || 'Info'})"
            data-tooltip="${escapeHtml(item.message)}">${item.message}</td>
        <td class="py-2.5 px-3 text-right">
          <button class="copy-event-row-btn btn btn-ghost btn-sm flex items-center gap-1 ml-auto"
                  data-log="${escapeHtml(copyPayload)}" title="Salin rincian event Windows ini">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"></path></svg>
            <span>Salin</span>
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

    const dotClass = isConn ? 'bg-[#16A34A]' : 'bg-[#D97706]';
    const activeClass = isCurrent ? 'filter-pill active' : 'filter-pill';

    return `
      <div class="inline-flex items-center gap-1 ${activeClass}">
        <button class="node-tab-btn flex items-center gap-1.5 cursor-pointer"
                data-node-id="${node.id}"
                title="${escapeHtml(node.name)} (${node.host}:${node.port})">
          <span class="w-1.5 h-1.5 rounded-full ${dotClass}"></span>
          <span class="truncate max-w-[130px] font-bold">${escapeHtml(node.name)}</span>
          <span class="pill-count">${tempVal}</span>
          ${pingVal ? `<span class="pill-count">${pingVal}</span>` : ''}
        </button>
        <button class="node-edit-btn opacity-60 hover:opacity-100 cursor-pointer ml-1 text-xs p-1" data-node-id="${node.id}" title="Edit Profil Perangkat">
          <svg class="w-3.5 h-3.5 text-[#0A0A0A] dark:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><circle cx="12" cy="12" r="3" stroke-width="2"></circle></svg>
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
  try {
    localStorage.setItem('hardware_dashboard_active_node', nodeId);
  } catch (e) {}
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
      
      // Ensure activeNodeId points to a valid registered node
      const currentValid = registeredNodes.some(n => n.id === activeNodeId);
      if (!currentValid) {
        const stored = localStorage.getItem('hardware_dashboard_active_node');
        if (stored && registeredNodes.some(n => n.id === stored)) {
          activeNodeId = stored;
        } else if (data.activeNodeId && registeredNodes.some(n => n.id === data.activeNodeId)) {
          activeNodeId = data.activeNodeId;
        } else if (registeredNodes.length > 0) {
          activeNodeId = registeredNodes[0].id;
        }
      }

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
  ctx.strokeStyle = '#E5E5E3';
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
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
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
    ctx.stroke();
  }

  // Dot on latest point
  if (points.length > 0) {
    const last = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = strokeColor;
    ctx.fill();
  }

  ctx.restore();
}

// Render Real-Time Timeseries Performance Graphs
function renderTimeseriesCharts(timeseries, hardwareState) {
  if (!timeseries) return;

  const cpuData = timeseries.cpu && timeseries.cpu.length > 0 ? timeseries.cpu : [0];
  const ramData = timeseries.ram && timeseries.ram.length > 0 ? timeseries.ram : [0];
  const diskData = timeseries.disk && timeseries.disk.length > 0 ? timeseries.disk : [0];
  const netRxData = timeseries.net_rx && timeseries.net_rx.length > 0 ? timeseries.net_rx : [0];
  const netTxData = timeseries.net_tx && timeseries.net_tx.length > 0 ? timeseries.net_tx : [0];

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

  drawCyberSparkline('chart-cpu', cpuData, '#F97316', 'rgba(249, 115, 22, 0.15)', 0, 100, '%');

  // 2. RAM Usage
  const latestRam = ramData[ramData.length - 1] || 0;
  const ramSummary = hardwareState.ramSummary;
  const ramBadge = document.getElementById('trend-ram-badge');
  const statRamUsed = document.getElementById('stat-ram-used');
  const statRamTotal = document.getElementById('stat-ram-total');

  if (ramBadge) ramBadge.innerText = `${latestRam.toFixed(1)}%`;
  if (statRamUsed) statRamUsed.innerText = (ramSummary && ramSummary.usedGb != null) ? `${ramSummary.usedGb.toFixed(1)} GB` : '—';
  if (statRamTotal) statRamTotal.innerText = (ramSummary && ramSummary.totalGb != null) ? `${ramSummary.totalGb.toFixed(1)} GB` : '—';

  drawCyberSparkline('chart-ram', ramData, '#16A34A', 'rgba(22, 163, 74, 0.12)', 0, 100, '%');

  // 3. Disk Activity
  const latestDisk = diskData[diskData.length - 1] || 0;
  const diskMax = Math.max(25, Math.ceil(Math.max(...diskData) * 1.2));
  const diskBadge = document.getElementById('trend-disk-badge');
  const statDiskRate = document.getElementById('stat-disk-rate');

  if (diskBadge) diskBadge.innerText = `${latestDisk.toFixed(1)} MB/s`;
  if (statDiskRate) statDiskRate.innerText = `${latestDisk.toFixed(1)} MB/s`;

  drawCyberSparkline('chart-disk', diskData, '#7C3AED', 'rgba(124, 58, 237, 0.12)', 0, diskMax, 'MB/s');

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

  drawCyberSparkline('chart-network', netRxData, '#0D9488', 'rgba(13, 148, 136, 0.12)', 0, netMax, 'KB/s');

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

// Render Top 5 Active Processes Consumer (Pure Real-Time Telemetry from SSH)
function renderTopProcessesTable(topProcesses) {
  const tbody = document.getElementById('top-processes-tbody');
  if (!tbody) return;

  if (!topProcesses || topProcesses.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="py-4 text-center text-[#888886] font-sans text-xs">
          Tidak ada data proses atau sedang menunggu pembacaan dari target SSH...
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = topProcesses.map((p, idx) => {
    const pid = p.Id || p.PID || '—';
    const name = escapeHtml(p.Name || p.ProcessName || 'Process');
    const cpuTime = p.CPU != null ? p.CPU.toFixed(1) : '—';
    const memMb = p.MemMB != null ? p.MemMB.toFixed(1) : '—';

    let impactBadge = 'badge badge-neutral';
    let impactText = 'NORMAL';
    if (idx === 0) {
      impactBadge = 'badge badge-danger';
      impactText = 'TOP 1';
    } else if (idx === 1) {
      impactBadge = 'badge badge-warning';
      impactText = 'HIGH';
    }

    return `
      <tr class="hover:bg-[#F9F9F7] transition">
        <td class="py-2 px-3 font-mono font-bold text-[#0A0A0A]">${pid}</td>
        <td class="py-2 px-3 font-medium text-[#0A0A0A] truncate max-w-[200px]" title="${name}">
          ${name}
        </td>
        <td class="py-2 px-3 text-right font-mono font-semibold text-[#16A34A]">${cpuTime}s</td>
        <td class="py-2 px-3 text-right font-mono font-semibold text-[#7C3AED]">${memMb} MB</td>
        <td class="py-2 px-3 text-center">
          <span class="${impactBadge}">
            ${impactText}
          </span>
        </td>
      </tr>
    `;
  }).join('');
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
    if (ramTotalBadge) ramTotalBadge.innerHTML = `<span class="text-[#DC2626]">⚠️ —</span>`;
    if (ramUsedBadge) ramUsedBadge.innerHTML = `<span class="text-[#DC2626]">⚠️ Tidak Terdeteksi</span>`;
    if (ramBarText) ramBarText.innerHTML = `<span class="text-[#DC2626]">⚠️ Data RAM Tidak Terbaca</span>`;
  }

  if (!container) return;

  if (!ramModules || ramModules.length === 0) {
    container.innerHTML = `
      <div class="col-span-full p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-center text-xs font-mono font-bold">
        ⚠️ Data Modul RAM Fisik Tidak Terdeteksi via SSH
      </div>
    `;
    return;
  }

  container.innerHTML = ramModules.map((mod, idx) => {
    return `
      <div class="p-4 rounded-xl bg-white border border-[#E5E5E3] hover:border-[#D0D0CE] transition flex flex-col justify-between space-y-3">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2">
            <svg class="w-4 h-4 text-[#0A0A0A] dark:text-white inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"></path></svg>
            <div>
              <span class="text-xs font-bold text-[#0A0A0A]">${mod.slot || `DIMM Slot ${idx+1}`}</span>
              <div class="text-[10px] text-[#888886] font-mono">${mod.bank || 'Channel A'}</div>
            </div>
          </div>
          <span class="badge badge-neutral">
            ${mod.type || 'RAM'}
          </span>
        </div>

        <div class="py-1">
          <div class="text-2xl font-mono font-black text-[#0A0A0A]">
            ${(mod.capacityGb != null ? mod.capacityGb : 0).toFixed(1)} <span class="text-xs text-[#888886] font-sans">GB</span>
          </div>
          <div class="text-[11px] font-mono text-[#16A34A] font-semibold flex items-center gap-1">
            <svg class="w-3 h-3 text-[#16A34A] inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
            <span>${mod.speedMhz || '—'} MT/s (MHz)</span>
          </div>
        </div>

        <div class="pt-2 border-t border-[#E5E5E3] text-[11px] space-y-1 font-mono text-[#4A4A48]">
          <div class="flex justify-between items-center">
            <span class="text-[#888886]">Manufaktur:</span>
            <span class="text-[#0A0A0A] font-semibold truncate max-w-[120px] truncate-hoverable"
                  data-tooltip-title="RAM Manufacturer"
                  data-tooltip-category="MEMORY DIMM"
                  data-tooltip="${escapeHtml(mod.manufacturer || 'OEM Standard')}">${mod.manufacturer || 'OEM'}</span>
          </div>
          <div class="flex justify-between items-center">
            <span class="text-[#888886]">Part Number:</span>
            <span class="text-[#4A4A48] truncate max-w-[130px] truncate-hoverable"
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
      <div class="col-span-full p-4 rounded-xl bg-[#FEF2F2] border border-[#FECACA] text-[#DC2626] text-center text-xs font-mono font-bold">
        ⚠️ Unit Penyimpanan Fisik & Partisi Tidak Terdeteksi via SSH
      </div>
    `;
    return;
  }

  container.innerHTML = storageDisks.map((disk, idx) => {
    const parts = disk.partitions || [];
    const partitionsHtml = parts.length > 0 ? parts.map(p => {
      const usedPct = p.usedPct || 0;
      const barColor = usedPct >= 80 ? 'bg-[#DC2626]' : 'bg-[#16A34A]';
      return `
        <div class="space-y-1 pt-1.5 border-t border-[#E5E5E3] font-mono text-xs">
          <div class="flex justify-between items-center text-[11px]">
            <span class="font-bold text-[#0A0A0A]">${p.drive} [${p.label || 'Drive'}]</span>
            <span class="text-[#0A0A0A] font-semibold">${(p.usedGb || 0).toFixed(1)} / ${(p.totalGb || 0).toFixed(1)} GB (${usedPct.toFixed(0)}%)</span>
          </div>
          <div class="w-full bg-[#E5E5E3] rounded-full h-1.5 overflow-hidden">
            <div class="${barColor} h-1.5 rounded-full transition-all duration-500" style="width: ${Math.min(100, Math.max(3, usedPct))}%"></div>
          </div>
          <div class="flex justify-between text-[10px] text-[#888886]">
            <span>Sisa Free: ${(p.freeGb || 0).toFixed(1)} GB</span>
            <span>Format: ${p.fileSystem || 'NTFS'}</span>
          </div>
        </div>
      `;
    }).join('') : `
      <div class="text-[10px] text-[#888886] font-mono italic">Volume sistem / Drive partisi aktif</div>
    `;

    return `
      <div class="p-4 rounded-xl bg-white border border-[#E5E5E3] hover:border-[#D0D0CE] transition flex flex-col justify-between space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center space-x-2">
            <svg class="w-4 h-4 text-[#0A0A0A] dark:text-white inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"></path></svg>
            <div>
              <div class="text-xs font-bold text-[#0A0A0A] truncate max-w-[220px] truncate-hoverable"
                   data-tooltip-title="Physical Storage Drive"
                   data-tooltip-category="${disk.interface || 'NVMe'}"
                   data-tooltip="Disk ${disk.index}: ${escapeHtml(disk.model)} | Kapasitas: ${(disk.sizeGb || 0).toFixed(1)} GB | Status: ${disk.status || 'OK'}">Disk ${disk.index}: ${disk.model}</div>
              <div class="text-[10px] text-[#888886] font-mono">${disk.interface || 'NVMe'} &bull; Kapasitas: ${(disk.sizeGb || 0).toFixed(0)} GB</div>
            </div>
          </div>
          <span class="badge badge-success whitespace-nowrap">
            ${disk.status || 'HEALTHY'}
          </span>
        </div>

        <div class="space-y-2">
          <div class="text-[11px] font-semibold text-[#4A4A48]">Partisi & Volume Logikal:</div>
          ${partitionsHtml}
        </div>

        <div class="pt-2 border-t border-[#E5E5E3] flex items-center justify-between text-[11px] font-mono text-[#888886]">
          <span>Suhu Controller:</span>
          <span class="text-[#0A0A0A] font-bold">${disk.temp != null ? disk.temp + '°C' : '<span class="text-[#888886] font-normal">N/A</span>'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Evaluate Hardware Rules
function evaluateHardwareRules() {
  const { cpu, gpu, fans, voltages, sourceMode, sshConfig } = hardwareState;

  if (sourceMode === 'SSH_REMOTE' && sshConfig && !sshConfig.connected) {
    const targetHost = sshConfig.targetHost || 'Target Node';
    const targetPort = sshConfig.targetPort || 22;
    const errMsg = sshConfig.lastError || `Koneksi SSH ke ${targetHost}:${targetPort} Timeout / Tidak Merespons.`;
    triggerAlert('CRITICAL', 'SSH Link Disconnected', errMsg, 'Buka modal Troubleshooting untuk diagnosa & script OpenSSH');

    const banner = document.getElementById('global-alert-banner');
    const title = document.getElementById('global-alert-title');
    const msg = document.getElementById('global-alert-msg');
    const bannerBtn = document.getElementById('banner-troubleshoot-btn');
    if (banner && title && msg) {
      banner.classList.remove('hidden');
      title.innerText = `SSH LINK DISCONNECTED: ${targetHost}`;
      msg.innerText = errMsg;
      if (bannerBtn) bannerBtn.classList.remove('hidden');
    }
  } else if (sourceMode === 'SSH_REMOTE' && sshConfig && sshConfig.connected) {
    const banner = document.getElementById('global-alert-banner');
    const bannerBtn = document.getElementById('banner-troubleshoot-btn');
    if (banner && banner.innerText.includes('SSH LINK DISCONNECTED')) {
      banner.classList.add('hidden');
      if (bannerBtn) bannerBtn.classList.add('hidden');
    }
  }

  if (cpu && cpu.temp != null && cpu.temp >= 85) {
    cpu.throttling = true;
    triggerAlert('CRITICAL', 'CPU Thermal Sensor', `CPU Suhu Kritis (${cpu.temp.toFixed(1)}°C)! Melebihi batas aman 85°C.`, 'Periksa pendingin / Thermal Throttling Aktif');
  } else if (cpu && cpu.temp != null && cpu.temp >= 75) {
    triggerAlert('WARNING', 'CPU Thermal Sensor', `CPU Suhu Meningkat (${cpu.temp.toFixed(1)}°C). Beban kerja tinggi.`, 'Pastikan sirkulasi udara lancar');
  } else if (cpu) {
    cpu.throttling = false;
  }

  if (gpu && gpu.temp != null && gpu.temp >= 84) {
    triggerAlert('CRITICAL', 'GPU Core Sensor', `GPU Suhu Kritis (${gpu.temp.toFixed(1)}°C)!`, 'Tingkatkan fan speed GPU');
  }

  if (fans && fans.cpu && fans.cpu.rpm != null && (fans.cpu.stall || (fans.cpu.rpm < 400 && sourceMode !== 'SSH_REMOTE'))) {
    triggerAlert('CRITICAL', 'CPU Cooling Fan', `ALARM: Putaran Kipas CPU Berhenti (${fans.cpu.rpm} RPM)!`, 'Periksa konektor PWM fan');
  }

  if (voltages && voltages.v12 != null && voltages.v12 < 11.40) {
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
    const stAct = (storage && storage.activity != null) ? storage.activity : 0;
    pulseDiskVal.innerText = stAct > 0 ? `${stAct.toFixed(1)} MB/s` : '—';
  }
  if (pulseNetVal) {
    const rx = (hardwareState.network && hardwareState.network.rxKbps != null) ? hardwareState.network.rxKbps : 0;
    pulseNetVal.innerText = `↓ ${rx.toFixed(0)} KB/s`;
  }
  if (globalHealthBadge) {
    if (cpu && cpu.temp >= 85) {
      globalHealthBadge.className = 'badge badge-danger font-mono font-bold';
      globalHealthBadge.innerText = 'CRITICAL THERMAL';
    } else if (cpu && cpu.temp >= 75) {
      globalHealthBadge.className = 'badge badge-warning font-mono font-bold';
      globalHealthBadge.innerText = 'HIGH LOAD';
    } else if (sourceMode === 'SSH_REMOTE' && sshConfig && !sshConfig.connected) {
      globalHealthBadge.className = 'badge badge-danger font-mono font-bold';
      globalHealthBadge.innerText = 'LINK DISCONNECTED';
    } else {
      globalHealthBadge.className = 'badge badge-success font-mono font-bold';
      globalHealthBadge.innerText = 'SYSTEM OPTIMAL';
    }
  }

  const connDot = document.getElementById('connection-status-dot');
  if (connBadge && connText) {
    const cpuLoadVal = (cpu && (cpu.loadPct != null ? cpu.loadPct : cpu.load)) != null ? Number(cpu.loadPct != null ? cpu.loadPct : cpu.load) : 0;
    const ramPctVal = (ramSummary && ramSummary.usedPct != null) ? Number(ramSummary.usedPct) : 0;
    const diskActVal = (storage && (storage.activityPct != null ? storage.activityPct : storage.activity)) != null ? Number(storage.activityPct != null ? storage.activityPct : storage.activity) : 0;
    const maxVal = Math.max(cpuLoadVal, ramPctVal);

    if (sourceMode === 'SSH_REMOTE' && sshConfig) {
      if (sshConfig.connected) {
        consecutiveDisconnectCycles = 0;
        lastAutoOpenedNodeId = null;
        if (maxVal >= 85.0 || diskActVal >= 85.0) {
          connBadge.className = 'badge badge-danger flex items-center gap-1.5 py-1 px-3';
          if (connDot) {
            connDot.className = 'status-dot pulse-fast';
            connDot.style.backgroundColor = '#DC2626';
            connDot.style.color = '#DC2626';
          }
          connText.innerText = `CRITICAL LOAD (${maxVal.toFixed(0)}%)`;
        } else if (maxVal >= 70.0 || diskActVal >= 75.0) {
          connBadge.className = 'badge badge-warning flex items-center gap-1.5 py-1 px-3';
          if (connDot) {
            connDot.className = 'status-dot pulse-medium';
            connDot.style.backgroundColor = '#EAB308';
            connDot.style.color = '#EAB308';
          }
          connText.innerText = `HIGH LOAD (${maxVal.toFixed(0)}%)`;
        } else {
          connBadge.className = 'badge badge-success flex items-center gap-1.5 py-1 px-3';
          if (connDot) {
            connDot.className = 'status-dot pulse-slow';
            connDot.style.backgroundColor = '#16A34A';
            connDot.style.color = '#16A34A';
          }
          connText.innerText = `SSH CONNECTED (${sshConfig.latencyMs || 0} ms)`;
        }
        connBadge.setAttribute('data-tooltip', `Status SSH: Terhubung ke ${sshConfig.targetHost}:${sshConfig.targetPort} (${sshConfig.latencyMs || 0} ms)`);
      } else {
        consecutiveDisconnectCycles++;
        connBadge.className = 'badge badge-danger flex items-center gap-1.5 py-1 px-3 cursor-pointer';
        if (connDot) {
          connDot.className = 'status-dot pulse-fast';
          connDot.style.backgroundColor = '#DC2626';
          connDot.style.color = '#DC2626';
        }
        const errDetail = sshConfig.lastError ? ` - ${sshConfig.lastError}` : '';
        connText.innerText = `TIMEOUT / RECONNECTING (${sshConfig.targetHost})`;
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
      if (maxVal >= 85.0 || diskActVal >= 85.0) {
        connBadge.className = 'badge badge-danger flex items-center gap-1.5 py-1 px-3';
        if (connDot) {
          connDot.className = 'status-dot pulse-fast';
          connDot.style.backgroundColor = '#DC2626';
          connDot.style.color = '#DC2626';
        }
        connText.innerText = `LOCAL CRITICAL (${maxVal.toFixed(0)}%)`;
      } else if (maxVal >= 70.0 || diskActVal >= 75.0) {
        connBadge.className = 'badge badge-warning flex items-center gap-1.5 py-1 px-3';
        if (connDot) {
          connDot.className = 'status-dot pulse-medium';
          connDot.style.backgroundColor = '#EAB308';
          connDot.style.color = '#EAB308';
        }
        connText.innerText = `LOCAL HIGH LOAD (${maxVal.toFixed(0)}%)`;
      } else {
        connBadge.className = 'badge badge-success flex items-center gap-1.5 py-1 px-3';
        if (connDot) {
          connDot.className = 'status-dot pulse-slow';
          connDot.style.backgroundColor = '#16A34A';
          connDot.style.color = '#16A34A';
        }
        connText.innerText = 'LOCAL HOST ACTIVE';
      }
      connBadge.setAttribute('data-tooltip', 'Status: Monitoring Local Host (WMI Direct)');
    }
  }

  // Top 5 Processes Consumer Table
  renderTopProcessesTable(hardwareState.topProcesses);

  // CPU Thermal & Core Voltage
  if (cpu) {
    const cpuTempElem = document.getElementById('cpu-temp-val');
    const cpuCircle = document.getElementById('cpu-temp-circle');
    const cpuBadge = document.getElementById('cpu-status-badge');
    const cpuThrottle = document.getElementById('cpu-throttle');
    const cpuTjmax = document.getElementById('cpu-tjmax');
    const vcoreVal = document.getElementById('vcore-val');
    const statCpuAvg = document.getElementById('stat-cpu-avg');

    if (cpuTempElem) {
      cpuTempElem.innerText = cpu.temp != null ? cpu.temp.toFixed(1) : '—';
    }
    if (cpuCircle) {
      if (cpu.temp != null) {
        cpuCircle.style.strokeDashoffset = calculateGaugeOffset(cpu.temp, 25, 100);
        const status = getTempStatus(cpu.temp);
        cpuCircle.style.stroke = status.stroke;
        if (cpuBadge) {
          cpuBadge.className = status.badgeClass;
          cpuBadge.innerText = status.label;
        }
      } else {
        cpuCircle.style.strokeDashoffset = calculateGaugeOffset(40, 25, 100);
        if (cpuBadge) {
          cpuBadge.className = 'badge badge-neutral';
          cpuBadge.innerText = 'OPTIMAL';
        }
      }
    }
    if (cpuThrottle) {
      if (cpu.temp != null) {
        cpuThrottle.innerText = cpu.throttling ? '⚠️ ACTIVE THROTTLE' : 'No Throttling';
        cpuThrottle.className = cpu.throttling ? 'font-mono text-[#DC2626] font-bold' : 'font-mono text-[#16A34A]';
      } else {
        cpuThrottle.innerText = 'Optimal';
        cpuThrottle.className = 'font-mono text-[#16A34A]';
      }
    }
    if (cpuTjmax) {
      cpuTjmax.innerText = cpu.temp != null ? `${cpu.temp.toFixed(1)}°C / 100°C` : '100°C Max';
    }
    if (vcoreVal) {
      vcoreVal.innerHTML = cpu.vcore != null ? `${cpu.vcore.toFixed(3)} V` : `<span class="text-[#888886] font-normal">N/A</span>`;
    }
    const cpuPackagePowerVal = document.getElementById('cpu-package-power-val');
    if (cpuPackagePowerVal) {
      const pwr = cpu.power != null ? cpu.power : (voltages && voltages.totalPower != null ? voltages.totalPower : null);
      cpuPackagePowerVal.innerHTML = pwr != null ? `${pwr.toFixed(1)} W` : `<span class="text-[#888886] font-normal">N/A</span>`;
    }
    if (statCpuAvg) {
      statCpuAvg.innerText = cpu.loadPct != null ? `${cpu.loadPct.toFixed(1)}%` : '—';
    }
  }

  // GPU Thermal & Telemetry
  if (gpu) {
    const gpuTempElem = document.getElementById('gpu-temp-val');
    const gpuCircle = document.getElementById('gpu-temp-circle');
    const gpuBadge = document.getElementById('gpu-status-badge');
    const gpuHotspot = document.getElementById('gpu-hotspot');
    const gpuPower = document.getElementById('gpu-power');
    const gpu3dLoadHeader = document.getElementById('gpu-3d-load-header');
    const gpu3dLoadText = document.getElementById('gpu-3d-load-text');
    const gpuVramUsageText = document.getElementById('gpu-vram-usage-text');
    const gpuVramBar = document.getElementById('gpu-vram-bar');

    if (gpuTempElem) gpuTempElem.innerText = gpu.temp != null ? gpu.temp.toFixed(1) : '—';
    if (gpuCircle) {
      if (gpu.temp != null) {
        gpuCircle.style.strokeDashoffset = calculateGaugeOffset(gpu.temp, 25, 95);
        const status = getTempStatus(gpu.temp);
        gpuCircle.style.stroke = status.stroke;
        if (gpuBadge) {
          gpuBadge.className = status.badgeClass;
          gpuBadge.innerText = status.label;
        }
      } else {
        gpuCircle.style.strokeDashoffset = calculateGaugeOffset(38, 25, 95);
        if (gpuBadge) {
          gpuBadge.className = 'badge badge-neutral';
          gpuBadge.innerText = 'OPTIMAL';
        }
      }
    }
    if (gpuHotspot) gpuHotspot.innerText = gpu.hotspotTemp != null ? `${gpu.hotspotTemp.toFixed(1)}°C / 95°C` : 'N/A';
    if (gpuPower) gpuPower.innerText = gpu.power != null ? `${gpu.power.toFixed(1)} W` : 'N/A';

    // 3D Engine Load (Header badge & Hardware Profile text)
    if (gpu3dLoadHeader) {
      if (gpu.loadPct != null) {
        gpu3dLoadHeader.innerText = `3D LOAD: ${gpu.loadPct.toFixed(1)}%`;
        if (gpu.loadPct > 80) {
          gpu3dLoadHeader.className = 'badge badge-danger font-mono font-bold';
        } else if (gpu.loadPct > 35) {
          gpu3dLoadHeader.className = 'badge badge-warning font-mono font-bold';
        } else {
          gpu3dLoadHeader.className = 'badge badge-neutral font-mono font-bold';
        }
      } else {
        gpu3dLoadHeader.innerText = '3D LOAD: —%';
        gpu3dLoadHeader.className = 'badge badge-neutral font-mono font-bold';
      }
    }
    if (gpu3dLoadText) {
      gpu3dLoadText.innerText = gpu.loadPct != null ? `${gpu.loadPct.toFixed(1)}%` : '—%';
    }

    // Dedicated VRAM Terpakai
    if (gpuVramUsageText) {
      if (gpu.vramUsedGb != null && gpu.vramGb > 0) {
        const pct = Math.min(100, Math.max(0, (gpu.vramUsedGb / gpu.vramGb) * 100));
        gpuVramUsageText.innerText = `${gpu.vramUsedGb.toFixed(2)} GB / ${gpu.vramGb.toFixed(1)} GB (${pct.toFixed(0)}%)`;
        if (gpuVramBar) gpuVramBar.style.width = `${pct}%`;
      } else if (gpu.vramUsedGb != null) {
        gpuVramUsageText.innerText = `${gpu.vramUsedGb.toFixed(2)} GB`;
        if (gpuVramBar) gpuVramBar.style.width = '10%';
      } else {
        gpuVramUsageText.innerHTML = `<span class="text-slate-500 font-normal">N/A</span>`;
        if (gpuVramBar) gpuVramBar.style.width = '0%';
      }
    }
  }

  // Primary Storage Dial
  const st = storage || (storageDisks && storageDisks[0]) || { temp: null, health: 'OK', activity: 0.0 };
  const nvmeTempElem = document.getElementById('nvme-temp-val');
  const nvmeCircle = document.getElementById('nvme-temp-circle');
  const nvmeHealth = document.getElementById('nvme-health');
  const nvmeActivity = document.getElementById('nvme-activity');

  if (nvmeTempElem) nvmeTempElem.innerText = (st.temp != null) ? st.temp.toFixed(1) : '—';
  if (nvmeCircle) nvmeCircle.style.strokeDashoffset = calculateGaugeOffset(st.temp != null ? st.temp : 0, 20, 80);
  if (nvmeHealth) nvmeHealth.innerText = st.health || 'OK';
  if (nvmeActivity) nvmeActivity.innerText = `${(st.activity || 0.0).toFixed(1)} MB/s`;

  // Motherboard & Ambient
  const mb = motherboard || {};
  const mbTempElem = document.getElementById('mb-temp-val');
  const mbCircle = document.getElementById('mb-temp-circle');
  const vrmTempElem = document.getElementById('vrm-temp');
  const ambientTempElem = document.getElementById('ambient-temp');

  if (mbTempElem) mbTempElem.innerHTML = (mb.temp != null) ? `${mb.temp.toFixed(1)}°C` : `<span class="text-slate-500 font-normal text-xs">N/A <span class="text-[10px] text-slate-600">(Sensor N/A)</span></span>`;
  if (mbCircle) mbCircle.style.strokeDashoffset = calculateGaugeOffset(mb.temp || 35.0, 20, 75);
  if (vrmTempElem) vrmTempElem.innerHTML = (mb.vrmTemp != null) ? `${mb.vrmTemp.toFixed(1)}°C` : `<span class="text-slate-500 font-normal text-xs">N/A <span class="text-[10px] text-slate-600">(Chip Super I/O)</span></span>`;
  if (ambientTempElem) ambientTempElem.innerHTML = (mb.ambientTemp != null) ? `${mb.ambientTemp.toFixed(1)}°C` : `<span class="text-slate-500 font-normal text-xs">N/A <span class="text-[10px] text-slate-600">(Chip Super I/O)</span></span>`;

  // Render Dynamic RAM & Storage Sections
  renderDynamicRam(ramModules, ramSummary);
  renderDynamicStorage(storageDisks);

  // Fan Speeds
  if (fans) {
    const cpuFanRpm = document.getElementById('cpu-fan-rpm');
    const cpuFanPwm = document.getElementById('cpu-fan-pwm');
    const cpuFanBar = document.getElementById('cpu-fan-bar');
    const cpuFanStatusBadge = document.getElementById('cpu-fan-status-badge');
    const gpuFanRpm = document.getElementById('gpu-fan-rpm');
    const gpuFanPwm = document.getElementById('gpu-fan-pwm');
    const gpuFanBar = document.getElementById('gpu-fan-bar');
    const gpuFanIcon = document.getElementById('gpu-fan-icon');
    const gpuFanSubtext = document.getElementById('gpu-fan-subtext');
    const caseFanRpm = document.getElementById('case-fan-rpm');
    const caseFanPwm = document.getElementById('case-fan-pwm');
    const caseFanBar = document.getElementById('case-fan-bar');

    if (cpuFanRpm) {
      if (fans.cpu && fans.cpu.rpm != null) {
        cpuFanRpm.innerHTML = `<span class="text-[#0A0A0A] font-bold">${fans.cpu.rpm}</span> <span class="text-xs text-[#888886] font-sans">RPM</span>`;
        if (cpuFanPwm) cpuFanPwm.innerText = `${fans.cpu.pwm || 0}%`;
        if (cpuFanBar) cpuFanBar.style.width = `${fans.cpu.pwm || 0}%`;
        if (cpuFanStatusBadge) cpuFanStatusBadge.innerText = 'Active Cooler';
      } else {
        cpuFanRpm.innerHTML = `<span class="text-[#888886] font-bold text-xs">N/A</span> <span class="text-[10px] text-[#888886] font-mono font-normal">(Chip Super I/O N/A)</span>`;
        if (cpuFanPwm) cpuFanPwm.innerText = `N/A`;
        if (cpuFanBar) cpuFanBar.style.width = `0%`;
        if (cpuFanStatusBadge) {
          cpuFanStatusBadge.innerText = 'Super I/O N/A';
          cpuFanStatusBadge.setAttribute('data-tooltip', 'Tachometer kipas terhubung ke chip Super I/O motherboard yang memerlukan driver ring-0. Tidak diekspos oleh Windows OS agentless.');
        }
      }
    }

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
        if (gpuFanPwm) gpuFanPwm.innerText = `${fans.gpu.pwm || 0}%`;
        if (gpuFanBar) gpuFanBar.style.width = `${fans.gpu.pwm || 0}%`;
        if (gpuFanIcon) gpuFanIcon.classList.add('fan-icon-spin');
        if (gpuFanSubtext) gpuFanSubtext.innerText = 'Dedicated GPU Cooler';
      }
    }

    if (caseFanRpm) {
      if (fans.case && (fans.case.has_fan === false || fans.case.rpm === 0 || fans.case.rpm == null)) {
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

  // Voltages & Power Delivery (Strict reality: N/A if sensor is not exposed)
  if (voltages) {
    const v12Val = document.getElementById('v12-val');
    const v12Badge = document.getElementById('v12-badge');
    const v5Val = document.getElementById('v5-val');
    const v33Val = document.getElementById('v33-val');
    const totalPowerVal = document.getElementById('total-power-val');

    if (v12Val) v12Val.innerHTML = voltages.v12 != null ? `${voltages.v12.toFixed(2)} V` : `<span class="text-[#888886] font-normal">N/A <span class="text-[10px] text-[#888886]">(Chip Super I/O)</span></span>`;
    if (v5Val) v5Val.innerHTML = voltages.v5 != null ? `${voltages.v5.toFixed(2)} V` : `<span class="text-[#888886] font-normal">N/A <span class="text-[10px] text-[#888886]">(Chip Super I/O)</span></span>`;
    if (v33Val) v33Val.innerHTML = voltages.v33 != null ? `${voltages.v33.toFixed(2)} V` : `<span class="text-[#888886] font-normal">N/A <span class="text-[10px] text-[#888886]">(Chip Super I/O)</span></span>`;
    if (totalPowerVal) {
      const pwr = voltages.totalPower != null ? voltages.totalPower : (cpu && cpu.power != null ? cpu.power : null);
      totalPowerVal.innerHTML = pwr != null ? `${pwr.toFixed(1)} W` : `<span class="text-[#888886] font-normal">N/A</span>`;
    }

    if (v12Badge) {
      if (voltages.v12 != null) {
        if (voltages.v12 < 11.40) {
          v12Badge.className = 'badge badge-danger text-[10px]';
          v12Badge.innerText = 'SAG DANGER';
        } else {
          v12Badge.className = 'badge badge-success text-[10px]';
          v12Badge.innerText = 'STABLE';
        }
      } else {
        v12Badge.className = 'badge badge-neutral text-[10px]';
        v12Badge.innerText = 'AGENTLESS N/A';
        v12Badge.setAttribute('data-tooltip', 'Sensor voltase ATX PSU terhubung ke chip Super I/O motherboard yang memerlukan driver Ring-0 kernel (WinRing0.sys). Tidak dapat dibaca via SSH agentless standar.');
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
        pwdStatus.className = node.hasPassword ? 'badge badge-success text-[10px]' : 'badge badge-neutral text-[10px]';
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
}

// Sidebar Navigation ScrollSpy (Index Dashboard)
function initSidebarScrollSpy() {
  const navItems = document.querySelectorAll('.side-navbar .side-nav-item');
  if (!navItems || navItems.length === 0) return;

  const sections = ['section-system', 'section-cpu', 'section-ram', 'section-gpu', 'section-storage', 'section-power']
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

// Initialize and Setup Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initBackgroundDotCanvas();
  initTooltipEngine();
  initSidebarScrollSpy();
  renderAlertsTable();
  renderOsEventsTable();
  await fetchNodes();
  await updateMetrics();

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

  const viewSetupBtn = document.getElementById('btn-profile-view-setup');
  if (viewSetupBtn) {
    viewSetupBtn.addEventListener('click', () => {
      const name = document.getElementById('modal-node-name').value.trim() || 'Perangkat Target';
      const host = document.getElementById('modal-node-host').value.trim() || '192.168.27.x';
      const port = parseInt(document.getElementById('modal-node-port').value) || 22;
      const user = document.getElementById('modal-node-user').value.trim() || 'windows';
      openSshTroubleshootModal({
        name,
        host,
        port,
        user,
        errorType: 'PANDUAN SETUP',
        lastError: `Perintah PowerShell Administrator di bawah akan membuka Port ${port} di Windows Firewall dan mengonfigurasi OpenSSH Server pada ${host}.`
      });
    });
  }

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
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#F4F4F2] text-[#0A0A0A]';
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
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#F0FDF4] text-[#16A34A]';
          feedback.innerText = '✅ Profil Perangkat Berhasil Disimpan di Vault!';
          triggerAlert('INFO', 'Device Vault', `Profil "${name}" (${host}) berhasil disimpan.`, 'Monitoring siap');
          setTimeout(async () => {
            closeProfileModal();
            await fetchNodes();
            if (resData.nodeId) await selectNode(resData.nodeId);
          }, 800);
        } else {
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#FEF2F2] text-[#DC2626]';
          feedback.innerText = '❌ Gagal menyimpan profil perangkat.';
        }
      } catch (err) {
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#FEF2F2] text-[#DC2626]';
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
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#FFFBEB] text-[#D97706]';
          feedback.innerText = '⚠️ Minimal harus ada 1 profil perangkat dalam sistem.';
          feedback.classList.remove('hidden');
        }
        return;
      }

      if (!confirm(`Apakah Anda yakin ingin menghapus profil perangkat "${nodeName}" dari vault?`)) {
        return;
      }

      if (feedback) {
        feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#F4F4F2] text-[#0A0A0A]';
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
            feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#FEF2F2] text-[#DC2626]';
            feedback.innerText = `❌ ${data.message || 'Gagal menghapus profil.'}`;
            feedback.classList.remove('hidden');
          }
        }
      } catch (err) {
        if (feedback) {
          feedback.className = 'text-center text-xs font-semibold py-1.5 rounded bg-[#FEF2F2] text-[#DC2626]';
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
      tabBtnAlerts.className = 'filter-pill active';
      tabBtnEvents.className = 'filter-pill';
      if (tabContentAlerts) tabContentAlerts.classList.remove('hidden');
      if (tabContentEvents) tabContentEvents.classList.add('hidden');
      if (filterBarAlerts) filterBarAlerts.classList.remove('hidden');
      if (filterBarEvents) filterBarEvents.classList.add('hidden');
    });

    tabBtnEvents.addEventListener('click', () => {
      activeLogTab = 'EVENTS';
      tabBtnEvents.className = 'filter-pill active';
      tabBtnAlerts.className = 'filter-pill';
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
        b.classList.remove('active');
      });
      btn.classList.add('active');
      activeAlertFilter = btn.getAttribute('data-filter') || 'ALL';
      renderAlertsTable();
    });
  });

  // Filter Buttons for OS Events
  document.querySelectorAll('.evfilter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.evfilter-btn').forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');
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

  // Banner Troubleshoot Button
  const bannerTroubleshootBtn = document.getElementById('banner-troubleshoot-btn');
  if (bannerTroubleshootBtn) {
    bannerTroubleshootBtn.addEventListener('click', () => {
      openSshTroubleshootModal(activeNodeId);
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
        ? 'btn btn-black btn-sm'
        : 'btn btn-ghost btn-sm';
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
