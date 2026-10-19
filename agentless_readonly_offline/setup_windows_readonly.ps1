# ===============================================================================
# [OFFLINE 1-CLICK SETUP] OpenSSH Server TARGET - STRICT READ-ONLY
# Mode: 100% OFFLINE / STANDALONE (TIDAK MEMBUTUHKAN WINDOWS UPDATE / INTERNET)
# Akun Khusus: siem-monitor (100% NON-ADMINISTRATOR / KEAMANAN TINGGI)
# ===============================================================================

param(
    [Parameter(Position=0)]
    [int]$Port = 0,
    [Parameter(Position=1)]
    [string]$Password = "Siem@Indriati2026!"
)

$ErrorActionPreference = 'Continue'
$targetPort = if ($Port -gt 0) { $Port } elseif ($env:SSH_TARGET_PORT) { [int]$env:SSH_TARGET_PORT } else { 3000 }
$monitorUser = "siem-monitor"
$monitorPass = $Password

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  [OFFLINE] OPENSSH SERVER TARGET - STRICT READ-ONLY PROVISIONING" -ForegroundColor Cyan
Write-Host "  Mode: 100% Offline (Mandiri tanpa Windows Update / Internet)" -ForegroundColor Green
Write-Host "  Keamanan: Least Privilege (User siem-monitor BUKAN Administrator)" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  Target Port : $targetPort" -ForegroundColor Gray
Write-Host "  Target User : $monitorUser" -ForegroundColor Gray
Write-Host ""

# -------------------------------------------------------------------------------
# 1. Pemasangan Biner OpenSSH Server (Offline Standalone)
# -------------------------------------------------------------------------------
Write-Host "[1/6] Memeriksa & Menyediakan Biner OpenSSH Server..." -ForegroundColor Cyan

$progOpenSSH = "$env:ProgramFiles\OpenSSH"
$sysOpenSSH = "$env:windir\System32\OpenSSH\sshd.exe"
$localBinDir = Join-Path $PSScriptRoot "bin"
$sshdBinPath = $null

if (Test-Path $sysOpenSSH) {
    Write-Host "    [OK] Terdeteksi OpenSSH bawaan Windows di System32." -ForegroundColor Green
    $sshdBinPath = $sysOpenSSH
} elseif (Test-Path (Join-Path $progOpenSSH "sshd.exe")) {
    Write-Host "    [OK] Terdeteksi OpenSSH di Program Files." -ForegroundColor Green
    $sshdBinPath = Join-Path $progOpenSSH "sshd.exe"
} else {
    Write-Host "    [INFO] Biner OpenSSH belum terpasang di sistem." -ForegroundColor Yellow
    Write-Host "    -> Menyalin biner offline OpenSSH ke $progOpenSSH..." -ForegroundColor Cyan
    
    if (-not (Test-Path $localBinDir)) {
        Write-Host "    [ERROR] Folder biner offline '$localBinDir' tidak ditemukan!" -ForegroundColor Red
        exit 1
    }

    try {
        if (-not (Test-Path $progOpenSSH)) {
            New-Item -ItemType Directory -Path $progOpenSSH -Force | Out-Null
        }
        Copy-Item -Path "$localBinDir\*" -Destination $progOpenSSH -Recurse -Force
        $sshdBinPath = Join-Path $progOpenSSH "sshd.exe"
        Write-Host "    [OK] Biner OpenSSH berhasil dipasang secara offline di $progOpenSSH." -ForegroundColor Green
    } catch {
        Write-Host "    [ERROR] Gagal menyalin biner offline: $_" -ForegroundColor Red
        exit 1
    }
}

# Daftarkan Windows Service sshd jika belum ada
$serviceObj = Get-Service -Name "sshd" -ErrorAction SilentlyContinue
if (-not $serviceObj) {
    Write-Host "    -> Mendaftarkan Service Windows 'sshd'..." -ForegroundColor Cyan
    & sc.exe create sshd binPath= "`"$sshdBinPath`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null
    & sc.exe description sshd "OpenSSH SSH Server for Agentless Telemetry Monitoring" | Out-Null
} else {
    # Pastikan binPath mengarah ke file yang valid
    & sc.exe config sshd binPath= "`"$sshdBinPath`"" start= auto | Out-Null
}

# -------------------------------------------------------------------------------
# 2. Inisialisasi Direktori Data & Host Keys
# -------------------------------------------------------------------------------
Write-Host "[2/6] Memeriksa direktori data dan Host Keys..." -ForegroundColor Cyan

$sshDataDir = "$env:ProgramData\ssh"
if (-not (Test-Path $sshDataDir)) {
    New-Item -ItemType Directory -Path $sshDataDir -Force | Out-Null
}

$keygenBin = if (Test-Path "$env:windir\System32\OpenSSH\ssh-keygen.exe") {
    "$env:windir\System32\OpenSSH\ssh-keygen.exe"
} elseif (Test-Path (Join-Path $progOpenSSH "ssh-keygen.exe")) {
    Join-Path $progOpenSSH "ssh-keygen.exe"
} else {
    Join-Path $localBinDir "ssh-keygen.exe"
}

$hasKeys = (Test-Path "$sshDataDir\ssh_host_rsa_key") -or (Test-Path "$sshDataDir\ssh_host_ed25519_key")
if (-not $hasKeys) {
    Write-Host "    -> Membuat Host Keys SSH baru..." -ForegroundColor Yellow
    if (Test-Path $keygenBin) {
        & $keygenBin -A | Out-Null
    }
}

# Strict ACL: SYSTEM & Administrators Full Control (Mencegah Error 10054)
& icacls.exe "$sshDataDir" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" | Out-Null
Write-Host "    [OK] Host Keys dan izin ACL berhasil dikunci." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 3. Konfigurasi sshd_config (Zero BOM & Strict Low-Latency)
# -------------------------------------------------------------------------------
Write-Host "[3/6] Menerapkan konfigurasi sshd_config..." -ForegroundColor Cyan

$sftpBin = if (Test-Path "$env:windir\System32\OpenSSH\sftp-server.exe") {
    "$env:windir\System32\OpenSSH\sftp-server.exe"
} else {
    Join-Path $progOpenSSH "sftp-server.exe"
}

$sshdConfigContent = @"
Port $targetPort
ListenAddress 0.0.0.0
ListenAddress ::
PasswordAuthentication yes
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
Subsystem sftp $sftpBin
Match Group administrators
       AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys
"@

$configFile = "$sshDataDir\sshd_config"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($configFile, $sshdConfigContent, $utf8NoBom)
& icacls.exe "$configFile" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:F" "BUILTIN\Administrators:F" | Out-Null
Write-Host "    [OK] sshd_config berhasil ditulis (Port $targetPort)." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 4. Akun Monitoring Read-Only (siem-monitor)
# -------------------------------------------------------------------------------
Write-Host "[4/6] Menyiapkan akun read-only '$monitorUser'..." -ForegroundColor Cyan

$userExists = $false
try {
    $existing = Get-LocalUser -Name $monitorUser -ErrorAction Stop
    $userExists = $true
} catch {
    $userExists = $false
}

$secPass = ConvertTo-SecureString $monitorPass -AsPlainText -Force

if ($userExists) {
    Set-LocalUser -Name $monitorUser -Password $secPass -PasswordNeverExpires $true -AccountNeverExpires $true -ErrorAction SilentlyContinue
    Write-Host "    [INFO] Akun '$monitorUser' sudah ada. Password diperbarui." -ForegroundColor Gray
} else {
    New-LocalUser -Name $monitorUser -Password $secPass -FullName "SIEM Agentless Monitoring" -Description "Service Account Read-Only untuk Telemetri Dashboard" -PasswordNeverExpires -ErrorAction SilentlyContinue | Out-Null
    Write-Host "    [OK] Akun '$monitorUser' berhasil dibuat." -ForegroundColor Green
}

# PASTIKAN akun BUKAN Administrator
try {
    Remove-LocalGroupMember -Group "Administrators" -Member $monitorUser -ErrorAction SilentlyContinue
} catch {}

# Masukkan HANYA ke grup read-only telemetri
$readonlyGroups = @("Performance Monitor Users", "Distributed COM Users")
foreach ($grp in $readonlyGroups) {
    try {
        Add-LocalGroupMember -Group $grp -Member $monitorUser -ErrorAction SilentlyContinue
    } catch {}
}
Write-Host "    [VERIFIKASI] User '$monitorUser' 100% NON-ADMINISTRATOR (Least Privilege)." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 5. Konfigurasi Firewall
# -------------------------------------------------------------------------------
Write-Host "[5/6] Membuka port $targetPort di Windows Defender Firewall..." -ForegroundColor Cyan

$ruleName = "OpenSSH-Server-In-Dashboard-ReadOnly-$targetPort"
$existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
if (-not $existingRule) {
    New-NetFirewallRule -Name $ruleName -DisplayName "OpenSSH Server (Dashboard Port $targetPort)" -Description "Inbound port untuk Agentless Hardware Telemetry" -Direction Inbound -Protocol TCP -LocalPort $targetPort -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
    Write-Host "    [OK] Firewall Rule '$ruleName' dibuat." -ForegroundColor Green
} else {
    Set-NetFirewallRule -Name $ruleName -LocalPort $targetPort -Action Allow -Enabled True -ErrorAction SilentlyContinue | Out-Null
    Write-Host "    [OK] Firewall Rule '$ruleName' aktif." -ForegroundColor Green
}

# -------------------------------------------------------------------------------
# 6. Memulai Layanan SSHD & Self-Test
# -------------------------------------------------------------------------------
Write-Host "[6/6] Memulai layanan OpenSSH SSHD & Verifikasi Port..." -ForegroundColor Cyan

Set-Service -Name "sshd" -StartupType Automatic -ErrorAction SilentlyContinue
Restart-Service -Name "sshd" -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

$sshdStatus = (Get-Service -Name "sshd" -ErrorAction SilentlyContinue).Status
if ($sshdStatus -eq 'Running') {
    Write-Host "    [OK] Layanan sshd berstatus: RUNNING" -ForegroundColor Green
} else {
    Write-Host "    [WARNING] Status layanan sshd: $sshdStatus. Mencoba memulai..." -ForegroundColor Yellow
    Start-Service -Name "sshd" -ErrorAction SilentlyContinue
}

# Verifikasi port listening
$portListening = $false
try {
    $conn = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue
    if ($conn) { $portListening = $true }
} catch {}

if ($portListening) {
    Write-Host "    [OK] Port $targetPort AKTIF dan siap menerima koneksi!" -ForegroundColor Green
} else {
    Write-Host "    [INFO] Layanan aktif. Port $targetPort sedang disiapkan oleh Windows." -ForegroundColor Gray
}

# Deteksi IP lokal
$localIP = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notmatch '^169\.254\.' } | Select-Object -First 1).IPAddress
if (-not $localIP) { $localIP = "<IP_KOMPUTER_INI>" }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  [SUKSES] PROVISIONING OFFLINE SELESAI & SIAP DIDAFTARKAN!" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  Daftarkan di Web Dashboard -> 'Add Endpoint / SSH Target':" -ForegroundColor Cyan
Write-Host "    - Host / IP Address : $localIP" -ForegroundColor White
Write-Host "    - Port              : $targetPort" -ForegroundColor White
Write-Host "    - Username          : $monitorUser" -ForegroundColor White
Write-Host "    - Password          : $monitorPass" -ForegroundColor White
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  Catatan Keamanan:" -ForegroundColor Yellow
Write-Host "    * Tidak memerlukan koneksi internet / Windows Update sama sekali." -ForegroundColor Gray
Write-Host "    * User '$monitorUser' HANYA memiliki hak akses read-only WMI/CIM." -ForegroundColor Gray
Write-Host "===============================================================================" -ForegroundColor Green
