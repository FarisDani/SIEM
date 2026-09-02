# ==============================================================================
# Setup Enterprise System Metrics Monitoring on Windows Agent
# RS Indriati Boyolali - IT Infrastructure & Security
# ==============================================================================

# Ensure Running as Administrator
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Harap jalankan script ini sebagai Administrator (Run as Administrator)!"
    Exit 1
}

$agentDir = "C:\Program Files (x86)\ossec-agent"
$scriptsDir = "$agentDir\scripts"
$agentConfigDir = "$agentDir\config"
$configFile = "$agentDir\ossec.conf"

$sourceScript = Join-Path $PSScriptRoot "metrics\collect_metrics.ps1"
$sourceServicesConfig = Join-Path $PSScriptRoot "..\config\monitored_services.json"

Write-Host "[1/5] Menyiapkan direktori scripts & config di agent..." -ForegroundColor Cyan
if (-not (Test-Path $scriptsDir)) { New-Item -ItemType Directory -Path $scriptsDir -Force | Out-Null }
if (-not (Test-Path $agentConfigDir)) { New-Item -ItemType Directory -Path $agentConfigDir -Force | Out-Null }

Write-Host "[2/5] Menyalin script telemetri enterprise collect_metrics.ps1..." -ForegroundColor Cyan
Copy-Item -Path $sourceScript -Destination "$scriptsDir\collect_metrics.ps1" -Force

Write-Host "[3/5] Menyalin file konfigurasi monitored_services.json..." -ForegroundColor Cyan
if (Test-Path $sourceServicesConfig) {
    Copy-Item -Path $sourceServicesConfig -Destination "$agentConfigDir\monitored_services.json" -Force
}

Write-Host "[4/5] Menambahkan/memperbarui modul wodle command di ossec.conf..." -ForegroundColor Cyan
$confContent = Get-Content $configFile -Raw

# Hapus block system-performance lama jika ada
if ($confContent -match "(?s)<!-- Real-Time System Metrics Monitoring -->.*?<\/wodle>") {
    $confContent = $confContent -replace "(?s)<!-- Real-Time System Metrics Monitoring -->.*?<\/wodle>", ""
}

$wodleBlock = @"

  <!-- Real-Time System Metrics Monitoring -->
  <wodle name="command">
    <disabled>no</disabled>
    <tag>system-performance</tag>
    <command>C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "C:\Program Files (x86)\ossec-agent\scripts\collect_metrics.ps1"</command>
    <interval>30s</interval>
    <run_on_start>yes</run_on_start>
    <timeout>10</timeout>
  </wodle>
</ossec_config>
"@
$confContent = $confContent -replace "</ossec_config>", $wodleBlock
Set-Content -Path $configFile -Value $confContent -Encoding UTF8
Write-Host "[OK] Modul system-performance berhasil diperbarui di ossec.conf." -ForegroundColor Green

Write-Host "[5/5] Merestart Wazuh Agent Service..." -ForegroundColor Cyan
Restart-Service -Name "WazuhSvc" -Force
Write-Host "==========================================================================" -ForegroundColor Green
Write-Host "[SUCCESS] Agent Windows 11 Enterprise Proactive Monitoring Berhasil Aktif!" -ForegroundColor Green
Write-Host "==========================================================================" -ForegroundColor Green
