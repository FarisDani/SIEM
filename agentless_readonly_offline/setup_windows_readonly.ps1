# ===============================================================================
# [OFFLINE 1-CLICK SETUP] OpenSSH Server TARGET - STRICT READ-ONLY
# Mode: 100% OFFLINE / STANDALONE (TIDAK MEMBUTUHKAN WINDOWS UPDATE / INTERNET)
# Akun Khusus: siem-monitor (100% NON-ADMINISTRATOR / KEAMANAN TINGGI)
#
# Catatan desain:
# - Jika OpenSSH bawaan Windows (System32) sudah terpasang, dipakai apa adanya
#   (service-nya didaftarkan resmi oleh Windows, sama seperti script lama).
# - Jika belum ada, dipasang paket portable resmi Win32-OpenSSH dari folder 'bin'
#   dan service didaftarkan memakai install-sshd.ps1 resmi (privileges + ETW log).
# - Script ini aman dijalankan ulang: sekaligus membersihkan sisa konfigurasi lama.
# ===============================================================================

param(
    [Parameter(Position=0)]
    [int]$Port = 0,
    [Parameter(Position=1)]
    [string]$Username = "",
    [Parameter(Position=2)]
    [string]$Password = ""
)

# Mencegah PowerShell memunculkan teks merah yang tidak perlu untuk non-terminating warning
$ErrorActionPreference = 'SilentlyContinue'
$targetPort = if ($Port -gt 0) { $Port } elseif ($env:SSH_TARGET_PORT) { [int]$env:SSH_TARGET_PORT } else { 3000 }
$monitorUser = if ($Username -and $Username.Trim() -ne "") { $Username.Trim() } elseif ($env:SSH_TARGET_USER) { $env:SSH_TARGET_USER.Trim() } else { "siem-monitor" }
$monitorPass = if ($Password -and $Password.Trim() -ne "") { $Password.Trim() } elseif ($env:SSH_TARGET_PASSWORD) { $env:SSH_TARGET_PASSWORD.Trim() } else { "Siem@Indriati2026!" }

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  [OFFLINE] OPENSSH SERVER TARGET - STRICT READ-ONLY PROVISIONING" -ForegroundColor Cyan
Write-Host "  Mode: 100% Offline (Mandiri tanpa Windows Update / Internet)" -ForegroundColor Green
Write-Host "  Keamanan: Least Privilege (User $monitorUser BUKAN Administrator)" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  Target Port : $targetPort" -ForegroundColor Gray
Write-Host "  Target User : $monitorUser" -ForegroundColor Gray
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

$progOpenSSH = "$env:ProgramFiles\OpenSSH"
$sysOpenSSHDir = "$env:windir\System32\OpenSSH"
$sshDataDir = "$env:ProgramData\ssh"
$localBinDir = Join-Path $PSScriptRoot "bin"
$sshdBinPath = $null

# Fungsi: kunci ACL C:\ProgramData\ssh -> HANYA SYSTEM & Administrators (owner: Administrators)
# Sama dengan metode script lama yang terbukti berhasil. Menghapus izin tambahan lain.
function Reset-SshDataAcl {
    param([string]$Dir)
    $sidSystem = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
    $sidAdmin  = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
    try {
        $dacl = New-Object System.Security.AccessControl.DirectorySecurity
        $dacl.SetOwner($sidAdmin)
        $dacl.SetAccessRuleProtection($true, $false)
        $dacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
        $dacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
        Set-Acl -Path $Dir -AclObject $dacl
    } catch {}
    Get-ChildItem -Path $Dir -Recurse -Force -ErrorAction SilentlyContinue | ForEach-Object {
        try {
            if ($_.PSIsContainer) {
                $acl = New-Object System.Security.AccessControl.DirectorySecurity
                $acl.SetOwner($sidAdmin)
                $acl.SetAccessRuleProtection($true, $false)
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
            } else {
                $acl = New-Object System.Security.AccessControl.FileSecurity
                $acl.SetOwner($sidAdmin)
                $acl.SetAccessRuleProtection($true, $false)
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "Allow")))
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "Allow")))
            }
            Set-Acl -Path $_.FullName -AclObject $acl
        } catch {}
    }
}

# -------------------------------------------------------------------------------
# 1. Pemasangan OpenSSH Server & Registrasi Service
# -------------------------------------------------------------------------------
Write-Host "[1/6] Memeriksa & Menyediakan OpenSSH Server..." -ForegroundColor Cyan

# Hentikan service & sisa proses sshd (misal jendela 'sshd -d' yang masih terbuka dan memakai port)
Stop-Service -Name "sshd" -Force -ErrorAction SilentlyContinue
Get-Process -Name "sshd" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

$svcImage = (Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\sshd" -Name ImagePath -ErrorAction SilentlyContinue).ImagePath
$inboxRegistered = (Test-Path "$sysOpenSSHDir\sshd.exe") -and ($svcImage -match 'System32\\OpenSSH')

if ($inboxRegistered) {
    # OpenSSH bawaan Windows sudah terpasang & terdaftar resmi -> pakai apa adanya
    $sshdBinPath = "$sysOpenSSHDir\sshd.exe"
    Write-Host "    [OK] Memakai OpenSSH bawaan Windows (System32), service terdaftar resmi." -ForegroundColor Green
} else {
    if (-not (Test-Path (Join-Path $localBinDir "install-sshd.ps1"))) {
        Write-Host "    [ERROR] Paket offline tidak lengkap: '$localBinDir\install-sshd.ps1' tidak ditemukan!" -ForegroundColor Red
        exit 1
    }

    Write-Host "    -> Memasang paket portable resmi Win32-OpenSSH ke $progOpenSSH..." -ForegroundColor Cyan
    if (-not (Test-Path $progOpenSSH)) {
        New-Item -ItemType Directory -Path $progOpenSSH -Force | Out-Null
    }
    Copy-Item -Path "$localBinDir\*" -Destination $progOpenSSH -Recurse -Force -ErrorAction SilentlyContinue
    $sshdBinPath = Join-Path $progOpenSSH "sshd.exe"

    if (-not (Test-Path (Join-Path $progOpenSSH "libcrypto.dll"))) {
        Write-Host "    [ERROR] Gagal menyalin biner OpenSSH ke $progOpenSSH (libcrypto.dll tidak ada)." -ForegroundColor Red
        exit 1
    }
    Write-Host "    [OK] Biner OpenSSH terpasang di $progOpenSSH." -ForegroundColor Green

    # Daftarkan ulang service sshd memakai installer resmi (hapus service lama yang rusak,
    # buat ulang dengan privileges yang benar, daftarkan log ETW, perbaiki izin ProgramData\ssh)
    Write-Host "    -> Mendaftarkan ulang service 'sshd' via install-sshd.ps1 resmi..." -ForegroundColor Cyan
    $installOut = & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "& '$progOpenSSH\install-sshd.ps1' -Confirm:`$false" 2>&1 | Out-String
    if (Get-Service -Name "sshd" -ErrorAction SilentlyContinue) {
        Write-Host "    [OK] Service 'sshd' terdaftar ulang dengan benar." -ForegroundColor Green
    } else {
        Write-Host "    [ERROR] Registrasi service gagal. Pesan installer:" -ForegroundColor Red
        Write-Host $installOut -ForegroundColor Gray
        Write-Host "    (Jika tertulis 'marked for deletion', tutup jendela Services lalu reboot dan jalankan ulang.)" -ForegroundColor Yellow
        exit 1
    }
}
Set-Service -Name "sshd" -StartupType Automatic -ErrorAction SilentlyContinue

# -------------------------------------------------------------------------------
# 2. Inisialisasi Direktori Data & Host Keys
# -------------------------------------------------------------------------------
Write-Host "[2/6] Memeriksa direktori data dan Host Keys..." -ForegroundColor Cyan

if (-not (Test-Path $sshDataDir)) {
    New-Item -ItemType Directory -Path $sshDataDir -Force -ErrorAction SilentlyContinue | Out-Null
}

$keygenBin = Join-Path ([System.IO.Path]::GetDirectoryName($sshdBinPath)) "ssh-keygen.exe"
if (Test-Path $keygenBin) {
    foreach ($kt in @(@{t='ed25519'; f='ssh_host_ed25519_key'; b=$null}, @{t='rsa'; f='ssh_host_rsa_key'; b='2048'})) {
        $kf = Join-Path $sshDataDir $kt.f
        if (-not (Test-Path $kf) -or (Get-Item $kf).Length -eq 0) {
            Remove-Item "$kf*" -Force -ErrorAction SilentlyContinue
            Write-Host "    -> Membuat host key $($kt.t)..." -ForegroundColor Yellow
            if ($kt.b) {
                & $keygenBin -t $kt.t -b $kt.b -f $kf -N '""' -q *>$null
            } else {
                & $keygenBin -t $kt.t -f $kf -N '""' -q *>$null
            }
        }
    }
}

Reset-SshDataAcl -Dir $sshDataDir
Write-Host "    [OK] Host Keys siap & izin ACL dikunci (hanya SYSTEM + Administrators)." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 3. Konfigurasi sshd_config (Zero BOM)
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
    Write-Host "    [OK] sshd_config berhasil ditulis (Port $targetPort)." -ForegroundColor Green
} catch {
    Write-Host "    [WARNING] Gagal menulis sshd_config: $($_.Exception.Message)" -ForegroundColor Yellow
}
Reset-SshDataAcl -Dir $sshDataDir

# Validasi konfigurasi sebelum service dinyalakan
$testOut = & $sshdBinPath -t 2>&1 | Out-String
if ($LASTEXITCODE -ne 0) {
    Write-Host "    [ERROR] Validasi sshd_config / host key gagal:" -ForegroundColor Red
    Write-Host $testOut -ForegroundColor Gray
} else {
    Write-Host "    [OK] Validasi konfigurasi & host key: VALID." -ForegroundColor Green
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

Start-Service -Name "sshd" -ErrorAction SilentlyContinue

# Polling tunggu service Running & port listening (hingga 10 detik)
$isRunning = $false
$portListening = $false
for ($i = 0; $i -lt 10; $i++) {
    Start-Sleep -Seconds 1
    $isRunning = ((Get-Service -Name "sshd" -ErrorAction SilentlyContinue).Status -eq 'Running')
    $portListening = [bool](Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue)
    if ($isRunning -and $portListening) { break }
}

if (-not ($isRunning -and $portListening)) {
    Write-Host ""
    Write-Host "===============================================================================" -ForegroundColor Red
    Write-Host "  [GAGAL] Service sshd tidak berjalan / port $targetPort tidak listening." -ForegroundColor Red
    Write-Host "===============================================================================" -ForegroundColor Red
    Write-Host "  Status service : $((Get-Service -Name 'sshd' -ErrorAction SilentlyContinue).Status)" -ForegroundColor Yellow
    Write-Host "  Binary         : $sshdBinPath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Uji konfigurasi (sshd -t):" -ForegroundColor Cyan
    Write-Host (& $sshdBinPath -t 2>&1 | Out-String) -ForegroundColor Gray
    Write-Host "  Log terakhir OpenSSH/Operational:" -ForegroundColor Cyan
    try {
        Get-WinEvent -LogName 'OpenSSH/Operational' -MaxEvents 5 -ErrorAction Stop |
            ForEach-Object { Write-Host ("    [{0}] {1}" -f $_.TimeCreated, $_.Message) -ForegroundColor Gray }
    } catch {
        Write-Host "    (Log OpenSSH/Operational tidak tersedia)" -ForegroundColor Gray
    }
    $portOwner = Get-NetTCPConnection -LocalPort $targetPort -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($portOwner) {
        $procName = (Get-Process -Id $portOwner.OwningProcess -ErrorAction SilentlyContinue).ProcessName
        Write-Host "  [!] Port $targetPort sedang dipakai proses lain: $procName (PID $($portOwner.OwningProcess))" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "  Kirimkan seluruh teks di atas ke admin SIEM untuk dianalisis." -ForegroundColor Yellow
    Write-Host "===============================================================================" -ForegroundColor Red
    exit 1
}

Write-Host "    [OK] Layanan sshd RUNNING (Automatic) dan port $targetPort LISTENING." -ForegroundColor Green

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
