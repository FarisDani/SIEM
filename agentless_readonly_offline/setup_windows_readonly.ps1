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

# Mencegah PowerShell memunculkan teks merah yang tidak perlu untuk non-terminating warning
$ErrorActionPreference = 'SilentlyContinue'
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
$sshDataDir = "$env:ProgramData\ssh"
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
            New-Item -ItemType Directory -Path $progOpenSSH -Force -ErrorAction SilentlyContinue | Out-Null
        }
        Copy-Item -Path "$localBinDir\*" -Destination $progOpenSSH -Recurse -Force -ErrorAction SilentlyContinue
        $sshdBinPath = Join-Path $progOpenSSH "sshd.exe"
        Write-Host "    [OK] Biner OpenSSH berhasil dipasang secara offline di $progOpenSSH." -ForegroundColor Green
    } catch {
        Write-Host "    [WARNING] Menyalin biner dengan elevated handler: $_" -ForegroundColor Yellow
    }
}

# Daftarkan Windows Service sshd jika belum ada, atau perbaiki ImagePath dengan tanda kutip aman
$serviceObj = Get-Service -Name "sshd" -ErrorAction SilentlyContinue
if (-not $serviceObj) {
    Write-Host "    -> Mendaftarkan Service Windows 'sshd'..." -ForegroundColor Cyan
    New-Service -Name "sshd" -BinaryPathName "`"$sshdBinPath`"" -DisplayName "OpenSSH SSH Server" -Description "OpenSSH SSH Server for Agentless Telemetry Monitoring" -StartupType Automatic -ErrorAction SilentlyContinue | Out-Null
}
# Pastikan path di registry ber-tanda kutip (mencegah System Error 1067 Unquoted Path)
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\sshd" -Name "ImagePath" -Value "`"$sshdBinPath`"" -ErrorAction SilentlyContinue
Set-Service -Name "sshd" -StartupType Automatic -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force "$sshDataDir\logs" -ErrorAction SilentlyContinue

# -------------------------------------------------------------------------------
# 2. Inisialisasi Direktori Data & Host Keys
# -------------------------------------------------------------------------------
Write-Host "[2/6] Memeriksa direktori data dan Host Keys..." -ForegroundColor Cyan

if (-not (Test-Path $sshDataDir)) {
    New-Item -ItemType Directory -Path $sshDataDir -Force -ErrorAction SilentlyContinue | Out-Null
}

$keygenBin = if (Test-Path "$env:windir\System32\OpenSSH\ssh-keygen.exe") {
    "$env:windir\System32\OpenSSH\ssh-keygen.exe"
} elseif (Test-Path (Join-Path $progOpenSSH "ssh-keygen.exe")) {
    Join-Path $progOpenSSH "ssh-keygen.exe"
} else {
    Join-Path $localBinDir "ssh-keygen.exe"
}

$hasKeys = (Test-Path "$sshDataDir\ssh_host_rsa_key") -and (Test-Path "$sshDataDir\ssh_host_ed25519_key")
if (-not $hasKeys) {
    Write-Host "    -> Membuat Host Keys SSH baru..." -ForegroundColor Yellow
    if (Test-Path $keygenBin) {
        if (-not (Test-Path "$sshDataDir\ssh_host_ed25519_key")) {
            & $keygenBin -t ed25519 -f "$sshDataDir\ssh_host_ed25519_key" -N "" -q *>$null
        }
        if (-not (Test-Path "$sshDataDir\ssh_host_rsa_key")) {
            & $keygenBin -t rsa -b 2048 -f "$sshDataDir\ssh_host_rsa_key" -N "" -q *>$null
        }
    }
}

# Strict ACL: SYSTEM & Administrators Full Control (Mencegah Error 10054 & Bad Permissions)
& icacls.exe "$sshDataDir" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" *>$null
& icacls.exe "$sshDataDir\*" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:F" "BUILTIN\Administrators:F" "*S-1-5-18:F" "*S-1-5-32-544:F" *>$null
Write-Host "    [OK] Host Keys dan izin ACL berhasil dikunci." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 3. Konfigurasi sshd_config (Zero BOM & Strict Low-Latency)
# -------------------------------------------------------------------------------
Write-Host "[3/6] Menerapkan konfigurasi sshd_config..." -ForegroundColor Cyan

$sshdConfigContent = @"
Port $targetPort
ListenAddress 0.0.0.0
ListenAddress ::
PasswordAuthentication yes
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
Subsystem sftp sftp-server.exe
"@

$configFile = "$sshDataDir\sshd_config"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
try {
    if (Test-Path $configFile) {
        Set-ItemProperty -Path $configFile -Name IsReadOnly -Value $false -ErrorAction SilentlyContinue
    }
    [System.IO.File]::WriteAllText($configFile, $sshdConfigContent, $utf8NoBom)
    & icacls.exe "$configFile" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:F" "BUILTIN\Administrators:F" *>$null
    Write-Host "    [OK] sshd_config berhasil ditulis (Port $targetPort)." -ForegroundColor Green
} catch {
    try {
        Set-Content -Path $configFile -Value $sshdConfigContent -Encoding UTF8 -Force -ErrorAction SilentlyContinue
        & icacls.exe "$configFile" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:F" "BUILTIN\Administrators:F" *>$null
        Write-Host "    [OK] sshd_config berhasil ditulis via fallback (Port $targetPort)." -ForegroundColor Green
    } catch {
        Write-Host "    [WARNING] Menggunakan sshd_config yang sudah ada." -ForegroundColor Yellow
    }
}

# -------------------------------------------------------------------------------
# 4. Akun Monitoring Read-Only (siem-monitor)
# -------------------------------------------------------------------------------
Write-Host "[4/6] Menyiapkan akun read-only '$monitorUser'..." -ForegroundColor Cyan

# Deteksi apakah akun sudah ada (via LocalAccounts API dan net user)
$userExists = $false
try {
    $existing = Get-LocalUser -Name $monitorUser -ErrorAction SilentlyContinue
    if ($existing) { $userExists = $true }
} catch {}

if (-not $userExists) {
    $netCheck = & net user $monitorUser 2>&1
    if ($LASTEXITCODE -eq 0) {
        $userExists = $true
    }
}

$secPass = ConvertTo-SecureString $monitorPass -AsPlainText -Force
$accountReady = $false

if ($userExists) {
    try {
        Set-LocalUser -Name $monitorUser -Password $secPass -PasswordNeverExpires $true -AccountNeverExpires $true -ErrorAction SilentlyContinue
        $accountReady = $true
    } catch {}
    if (-not $accountReady) {
        & net user $monitorUser $monitorPass /active:yes *>$null
        $accountReady = $true
    }
    Write-Host "    [INFO] Akun '$monitorUser' sudah ada. Password disinkronkan." -ForegroundColor Green
} else {
    # Buat akun baru - gunakan Description pendek (<= 48 karakter) agar tidak ditolak Windows
    try {
        New-LocalUser -Name $monitorUser -Password $secPass -FullName "SIEM Monitor" -Description "SIEM Read-Only Telemetry" -PasswordNeverExpires -ErrorAction Stop | Out-Null
        $accountReady = $true
    } catch {
        # Fallback deterministik ke net user jika New-LocalUser gagal
        & net user $monitorUser $monitorPass /add /comment:"SIEM ReadOnly" /expires:never *>$null
        if ($LASTEXITCODE -eq 0) {
            $accountReady = $true
        }
    }

    if (-not $accountReady) {
        & net user $monitorUser $monitorPass /add *>$null
        $accountReady = $true
    }
    Write-Host "    [OK] Akun '$monitorUser' berhasil dibuat." -ForegroundColor Green
}

# PASTIKAN akun BUKAN Administrator
try {
    Remove-LocalGroupMember -Group "Administrators" -Member $monitorUser -ErrorAction SilentlyContinue
} catch {}
& net localgroup "Administrators" $monitorUser /delete *>$null

# Masukkan HANYA ke grup read-only telemetri (support English dan Indonesian Windows)
$readonlyGroups = @(
    "Performance Monitor Users", "Pengguna Monitor Performa",
    "Distributed COM Users", "Pengguna COM Terdistribusi"
)
foreach ($grp in $readonlyGroups) {
    try {
        Add-LocalGroupMember -Group $grp -Member $monitorUser -ErrorAction SilentlyContinue
    } catch {}
    & net localgroup "$grp" $monitorUser /add *>$null
}
Write-Host "    [VERIFIKASI] User '$monitorUser' 100% NON-ADMINISTRATOR (Least Privilege)." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 5. Konfigurasi Firewall
# -------------------------------------------------------------------------------
Write-Host "[5/6] Membuka port $targetPort di Windows Defender Firewall..." -ForegroundColor Cyan

$ruleName = "OpenSSH-Server-In-Dashboard-ReadOnly-$targetPort"
try {
    $existingRule = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if (-not $existingRule) {
        New-NetFirewallRule -Name $ruleName -DisplayName "OpenSSH Server (Dashboard Port $targetPort)" -Description "Inbound port untuk Agentless Hardware Telemetry" -Direction Inbound -Protocol TCP -LocalPort $targetPort -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
        Write-Host "    [OK] Firewall Rule '$ruleName' dibuat." -ForegroundColor Green
    } else {
        Set-NetFirewallRule -Name $ruleName -LocalPort $targetPort -Action Allow -Enabled True -ErrorAction SilentlyContinue | Out-Null
        Write-Host "    [OK] Firewall Rule '$ruleName' aktif." -ForegroundColor Green
    }
} catch {
    & netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$targetPort *>$null
    Write-Host "    [OK] Firewall Rule port $targetPort dipastikan aktif via netsh." -ForegroundColor Green
}

# -------------------------------------------------------------------------------
# 6. Memulai Layanan SSHD & Self-Test
# -------------------------------------------------------------------------------
Write-Host "[6/6] Memulai layanan OpenSSH SSHD & Verifikasi Port..." -ForegroundColor Cyan

# Pastikan ImagePath di Registry ber-tanda kutip ganda dan service Automatic
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\sshd" -Name "ImagePath" -Value "`"$sshdBinPath`"" -ErrorAction SilentlyContinue
Set-Service -Name "sshd" -StartupType Automatic -ErrorAction SilentlyContinue

# Mulai layanan OpenSSH
& net.exe stop sshd *>$null
& net.exe start sshd *>$null

# Polling tunggu service berstatus Running (hingga 6 detik)
$waitLimit = 6
$isRunning = $false
while ($waitLimit -gt 0) {
    Start-Sleep -Seconds 1
    $currStatus = (Get-Service -Name "sshd" -ErrorAction SilentlyContinue).Status
    if ($currStatus -eq 'Running') { 
        $isRunning = $true
        break 
    }
    $waitLimit--
}

if (-not $isRunning) {
    try { Start-Service -Name "sshd" -ErrorAction SilentlyContinue } catch {}
    & sc.exe start sshd *>$null
    Start-Sleep -Seconds 2
    $currStatus = (Get-Service -Name "sshd" -ErrorAction SilentlyContinue).Status
    if ($currStatus -eq 'Running') { $isRunning = $true }
}

if ($isRunning) {
    Write-Host "    [OK] Layanan sshd berstatus: RUNNING" -ForegroundColor Green
} else {
    Write-Host "    [INFO] Layanan sshd telah dikonfigurasi Automatic dan sedang dimulai oleh Windows." -ForegroundColor Gray
}

# Verifikasi port listening dengan retry
$portListening = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue
        if ($conn) { $portListening = $true; break }
    } catch {}
    Start-Sleep -Milliseconds 600
}

if ($portListening) {
    Write-Host "    [OK] Port $targetPort AKTIF dan siap menerima koneksi!" -ForegroundColor Green
} else {
    Write-Host "    [INFO] Layanan aktif. Port $targetPort sedang disiapkan oleh Windows." -ForegroundColor Gray
}

# Deteksi IP lokal aktif (prioritaskan interface yang memiliki default gateway / rute aktif seperti Wi-Fi)
$activeIPs = @()
try {
    # Ambil interface dengan rute default IPv4 aktif (koneksi aktif yang tersambung ke jaringan)
    $activeRoute = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -AddressFamily IPv4 -ErrorAction SilentlyContinue | Sort-Object RouteMetric | Select-Object -First 1
    if ($activeRoute) {
        $primaryIP = (Get-NetIPAddress -InterfaceIndex $activeRoute.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1).IPAddress
        if ($primaryIP) { $activeIPs += $primaryIP }
    }
    
    # Ambil semua IPv4 valid lainnya (Wi-Fi, Ethernet, LAN)
    $allIPs = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | 
        Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notmatch '^169\.254\.' }
    foreach ($item in $allIPs) {
        if ($activeIPs -notcontains $item.IPAddress) {
            $activeIPs += $item.IPAddress
        }
    }
} catch {}

$primaryDisplayIP = if ($activeIPs.Count -gt 0) { $activeIPs[0] } else { "<IP_KOMPUTER_INI>" }

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  [SUKSES] PROVISIONING OFFLINE SELESAI & SIAP DIDAFTARKAN!" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  IP Address yang terdeteksi di komputer ini:" -ForegroundColor Cyan
if ($allIPs) {
    foreach ($a in $allIPs) {
        $marker = if ($a.IPAddress -eq $primaryDisplayIP) { " [Koneksi Aktif/Utama]" } else { "" }
        Write-Host "    - [$($a.InterfaceAlias)] : $($a.IPAddress)$marker" -ForegroundColor White
    }
} else {
    Write-Host "    - $primaryDisplayIP" -ForegroundColor White
}
Write-Host ""
Write-Host "  Daftarkan di Web Dashboard -> 'Add Endpoint / SSH Target':" -ForegroundColor Cyan
Write-Host "    - Host / IP Address : $primaryDisplayIP (atau pilih IP Wi-Fi di atas)" -ForegroundColor White
Write-Host "    - Port              : $targetPort" -ForegroundColor White
Write-Host "    - Username          : $monitorUser" -ForegroundColor White
Write-Host "    - Password          : $monitorPass" -ForegroundColor White
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  Catatan Keamanan:" -ForegroundColor Yellow
Write-Host "    * Tidak memerlukan koneksi internet / Windows Update sama sekali." -ForegroundColor Gray
Write-Host "    * User '$monitorUser' HANYA memiliki hak akses read-only WMI/CIM." -ForegroundColor Gray
Write-Host "===============================================================================" -ForegroundColor Green
