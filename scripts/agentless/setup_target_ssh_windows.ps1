# ==============================================================================
# Script Setup OpenSSH Server Target untuk Wazuh Agentless Monitoring (Windows 10/11)
# Jalankan dengan: "Run as Administrator"
# ==============================================================================

Write-Host "=== [1/4] Memeriksa Instalasi OpenSSH.Server di Windows ===" -ForegroundColor Cyan
$sshCapability = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'

if ($sshCapability.State -ne "Installed") {
    Write-Host "Menginstall OpenSSH Server bawaan Windows..." -ForegroundColor Yellow
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
} else {
    Write-Host "OpenSSH Server sudah terinstall." -ForegroundColor Green
}

Write-Host "=== [2/4] Menyalakan & Mengatur Service SSHD Otomatis ===" -ForegroundColor Cyan
Start-Service sshd
Set-Service -Name sshd -StartupType 'Automatic'

Write-Host "=== [3/4] Mengizinkan Port 22 di Windows Firewall ===" -ForegroundColor Cyan
$fwRule = Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue
if (-not $fwRule) {
    New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22
    Write-Host "Firewall rule port 22 berhasil ditambahkan." -ForegroundColor Green
} else {
    Write-Host "Firewall rule port 22 sudah aktif." -ForegroundColor Green
}

Write-Host "=== [4/4] Menyiapkan Authorized Keys Directory ===" -ForegroundColor Cyan
$sshDir = "$env:ProgramData\ssh"
if (-not (Test-Path $sshDir)) {
    New-Item -ItemType Directory -Path $sshDir -Force | Out-Null
}

$authKeysPath = "$sshDir\administrators_authorized_keys"
if (-not (Test-Path $authKeysPath)) {
    New-Item -ItemType File -Path $authKeysPath -Force | Out-Null
}

# Set strict ACL permissions required by Windows OpenSSH
icacls $authKeysPath /inheritance:r /grant "Administrators:F" /grant "SYSTEM:F" | Out-Null

$localIp = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike "*Loopback*" -and $_.IPAddress -notlike "169.254*" } | Select-Object -First 1).IPAddress

Write-Host "==============================================================================" -ForegroundColor Green
Write-Host "✅ Target Windows Siap untuk Wazuh Agentless!" -ForegroundColor Green
Write-Host "👉 Alamat IP Laptop: $localIp" -ForegroundColor Yellow
Write-Host "👉 Port:             22 (SSH)" -ForegroundColor Yellow
Write-Host "👉 Salin Public Key Wazuh ke file: $authKeysPath" -ForegroundColor Yellow
Write-Host "==============================================================================" -ForegroundColor Green
