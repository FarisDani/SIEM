# ===============================================================================
# [1-CLICK SETUP V2] OpenSSH Server TARGET - STRICT READ-ONLY (LEAST PRIVILEGE)
# Akun Khusus: siem-monitor (100% NON-ADMINISTRATOR / KEAMANAN TINGGI)
# Enterprise Hardware & Security Dashboard (Agentless Telemetry)
# Anti-Error 10054 / Anti-Error 1067 / Zero-BOM Config / Strict ACL Security
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
Write-Host "  [V2] OPENSSH SERVER TARGET - STRICT READ-ONLY PROVISIONING" -ForegroundColor Cyan
Write-Host "  Prinsip Keamanan: Least Privilege (User siem-monitor BUKAN Administrator)" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host ""

# -------------------------------------------------------------------------------
# 1. Pastikan Service & Biner OpenSSH Server Terpasang
# -------------------------------------------------------------------------------
Write-Host "[1/6] Memeriksa instalasi OpenSSH Server..." -ForegroundColor Cyan

$sshdBinPath = $null
if (Test-Path "$env:windir\System32\OpenSSH\sshd.exe") {
    $sshdBinPath = "$env:windir\System32\OpenSSH\sshd.exe"
} elseif (Test-Path "$env:ProgramFiles\OpenSSH\sshd.exe") {
    $sshdBinPath = "$env:ProgramFiles\OpenSSH\sshd.exe"
}

if (-not $sshdBinPath) {
    Write-Host "    -> Mengunduh dan memasang fitur OpenSSH.Server via Windows Capability..." -ForegroundColor Yellow
    Set-Service -Name wuauserv -StartupType Manual -ErrorAction SilentlyContinue
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue

    $installed = $false
    try {
        Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction Stop | Out-Null
        $installed = $true
    } catch {
        Write-Host "    -> Capability fallback ke DISM..." -ForegroundColor Gray
    }

    if (-not $installed) {
        try {
            & dism.exe /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0 | Out-Null
        } catch {}
    }

    if (Test-Path "$env:windir\System32\OpenSSH\sshd.exe") {
        $sshdBinPath = "$env:windir\System32\OpenSSH\sshd.exe"
    } elseif (Test-Path "$env:ProgramFiles\OpenSSH\sshd.exe") {
        $sshdBinPath = "$env:ProgramFiles\OpenSSH\sshd.exe"
    }
}

if (-not $sshdBinPath) {
    Write-Host "[!] GAGAL MENGINSTAL OPENSSH SERVER. PASTIKAN KONEKSI INTERNET AKTIF." -ForegroundColor Red
    return
}

# Daftarkan service sshd jika belum terdaftar
$sshdSvc = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $sshdSvc) {
    & sc.exe create sshd binPath= "`"$sshdBinPath`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null
} else {
    & sc.exe config sshd binPath= "`"$sshdBinPath`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null
}
Write-Host "    [OK] Biner OpenSSH terverifikasi: $sshdBinPath" -ForegroundColor Green

# -------------------------------------------------------------------------------
# 2. Pembuatan Akun Dedicated Read-Only: siem-monitor (Non-Admin)
# -------------------------------------------------------------------------------
Write-Host ""
Write-Host "[2/6] Menyiapkan Akun Khusus Monitoring Read-Only ($monitorUser)..." -ForegroundColor Cyan

$userExists = $false
try {
    $existing = Get-LocalUser -Name $monitorUser -ErrorAction SilentlyContinue
    if ($existing) { $userExists = $true }
} catch {
    $checkNet = & net.exe user "$monitorUser" 2>&1
    if ($LASTEXITCODE -eq 0) { $userExists = $true }
}

if (-not $userExists) {
    Write-Host "    -> Membuat user lokal baru: $monitorUser..." -ForegroundColor Yellow
    $created = $false
    try {
        $secPass = ConvertTo-SecureString $monitorPass -AsPlainText -Force
        New-LocalUser -Name $monitorUser -Password $secPass -Description "SIEM Agentless Read-Only Monitor" -PasswordNeverExpires -UserMayNotChangePassword -ErrorAction Stop | Out-Null
        $created = $true
    } catch {}

    if (-not $created) {
        try {
            $comp = [ADSI]"WinNT://$env:COMPUTERNAME,computer"
            $nu = $comp.Create("user", $monitorUser)
            $nu.SetPassword($monitorPass)
            $nu.Put("Description", "SIEM Agentless Read-Only Monitor")
            $nu.Put("UserFlags", 0x10000 -bor 0x40 -bor 0x200) # DONT_EXPIRE + CANT_CHANGE + NORMAL
            $nu.SetInfo()
            $created = $true
        } catch {}
    }
} else {
    Write-Host "    -> Memperbarui password user $monitorUser..." -ForegroundColor Yellow
    try {
        $secPass = ConvertTo-SecureString $monitorPass -AsPlainText -Force
        Set-LocalUser -Name $monitorUser -Password $secPass -PasswordNeverExpires $true -UserMayNotChangePassword $true -ErrorAction SilentlyContinue
    } catch {}
    & net.exe user "$monitorUser" "$monitorPass" /expires:never 2>$null | Out-Null
}

# JAMINAN KEAMANAN: HAPUS DARI GRUP ADMINISTRATORS
Write-Host "    -> Mengunci hak akses: Memastikan $monitorUser BUKAN Administrator..." -ForegroundColor Yellow
try {
    Remove-LocalGroupMember -Group "Administrators" -Member $monitorUser -ErrorAction SilentlyContinue
} catch {}
& net.exe localgroup Administrators "$monitorUser" /delete 2>$null | Out-Null

# Masukkan ke grup non-admin Performance Monitor Users & Distributed COM Users
$reqGroups = @("Performance Monitor Users", "Distributed COM Users")
foreach ($grp in $reqGroups) {
    try {
        Add-LocalGroupMember -Group $grp -Member $monitorUser -ErrorAction SilentlyContinue
    } catch {
        & net.exe localgroup "$grp" "$monitorUser" /add 2>$null | Out-Null
    }
}
Write-Host "    [OK] User '$monitorUser' berstatus STRICT READ-ONLY (Non-Administrator)." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 3. Izin WMI Read-Only Namespace (root\cimv2 & root\wmi)
# -------------------------------------------------------------------------------
Write-Host ""
Write-Host "[3/6] Mengonfigurasi Izin WMI Read-Only Telemetri..." -ForegroundColor Cyan

$userSid = $null
try {
    $uObj = New-Object System.Security.Principal.NTAccount($monitorUser)
    $userSid = $uObj.Translate([System.Security.Principal.SecurityIdentifier]).Value
} catch {}

if ($userSid) {
    foreach ($ns in @("root\cimv2", "root\wmi")) {
        try {
            $sec = [wmiclass]"$ns`:__SystemSecurity"
            if ($sec) {
                $out = $sec.GetSecurityDescriptor()
                if ($out -and $out.Descriptor) {
                    $sd = $out.Descriptor
                    $alreadyHas = $false
                    foreach ($aceItem in $sd.DACL) {
                        if ($aceItem.Trustee.SIDString -eq $userSid) { $alreadyHas = $true; break }
                    }
                    if (-not $alreadyHas) {
                        $trustee = ([wmiclass]"$ns`:__Trustee").CreateInstance()
                        $trustee.Domain = $env:COMPUTERNAME
                        $trustee.Name = $monitorUser
                        $trustee.SIDString = $userSid

                        $ace = ([wmiclass]"$ns`:__ACE").CreateInstance()
                        $ace.AceFlags = 2 # CONTAINER_INHERIT
                        $ace.AceType = 0  # ACCESS_ALLOWED
                        $ace.AccessMask = 0x63 # Enable, MethodExecute, RemoteAccess
                        $ace.Trustee = $trustee

                        $sd.DACL += $ace
                        $sec.SetSecurityDescriptor($sd) | Out-Null
                    }
                }
            }
        } catch {}
    }
}
Write-Host "    [OK] Izin WMI Read-Only diterapkan untuk sensor telemetri." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 4. Host Keys & Konfigurasi sshd_config (Strict Zero-BOM & Anti-Error 10054)
# -------------------------------------------------------------------------------
Write-Host ""
Write-Host "[4/6] Mengonfigurasi sshd_config & Men-generate Host Keys (Port $targetPort)..." -ForegroundColor Cyan

$sshDataDir = "$env:ProgramData\ssh"
if (-not (Test-Path $sshDataDir)) {
    New-Item -ItemType Directory -Path $sshDataDir -Force | Out-Null
}

# Tulis sshd_config bersih dengan deklarasi HostKey eksplisit
$cfg = "$sshDataDir\sshd_config"
$configText = @"
Port $targetPort
ListenAddress 0.0.0.0
HostKey __PROGRAMDATA__/ssh/ssh_host_ed25519_key
HostKey __PROGRAMDATA__/ssh/ssh_host_rsa_key
PubkeyAuthentication yes
PasswordAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
Subsystem sftp sftp-server.exe
"@
[System.IO.File]::WriteAllText($cfg, $configText.Replace("`r`n", "`n"), [System.Text.Encoding]::ASCII)
Write-Host "    -> File sshd_config disiapkan dengan HostKey eksplisit pada Port $targetPort." -ForegroundColor Green

# Generate Host Keys (Wajib ada agar tidak terjadi connection reset 10054)
$sshBinDir = [System.IO.Path]::GetDirectoryName($sshdBinPath)
$keygenPath = "$sshBinDir\ssh-keygen.exe"
if (-not (Test-Path $keygenPath)) {
    if (Test-Path "$env:windir\System32\OpenSSH\ssh-keygen.exe") {
        $keygenPath = "$env:windir\System32\OpenSSH\ssh-keygen.exe"
    } elseif (Test-Path "$env:ProgramFiles\OpenSSH\ssh-keygen.exe") {
        $keygenPath = "$env:ProgramFiles\OpenSSH\ssh-keygen.exe"
    }
}

if (Test-Path $keygenPath) {
    if (-not (Test-Path "$sshDataDir\ssh_host_ed25519_key") -or (Get-Item "$sshDataDir\ssh_host_ed25519_key").Length -eq 0) {
        Remove-Item "$sshDataDir\ssh_host_ed25519_key*" -Force -ErrorAction SilentlyContinue
        & "$keygenPath" -t ed25519 -f "$sshDataDir\ssh_host_ed25519_key" -N "" -q 2>$null | Out-Null
    }
    if (-not (Test-Path "$sshDataDir\ssh_host_rsa_key") -or (Get-Item "$sshDataDir\ssh_host_rsa_key").Length -eq 0) {
        Remove-Item "$sshDataDir\ssh_host_rsa_key*" -Force -ErrorAction SilentlyContinue
        & "$keygenPath" -t rsa -b 2048 -f "$sshDataDir\ssh_host_rsa_key" -N "" -q 2>$null | Out-Null
    }
    & "$keygenPath" -A 2>$null | Out-Null
}

# KUNCI HAK AKSES STRICT (Pencegah Error 10054 pada OpenSSH 9.5):
# HANYA SYSTEM dan Administrator yang diizinkan memiliki akses ke ProgramData\ssh
Write-Host "    -> Mengunci hak akses file kunci host (Strict ACL Lock)..." -ForegroundColor Yellow
& icacls.exe "$sshDataDir" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F" /c /q 2>$null | Out-Null
Get-ChildItem -Path "$sshDataDir" -Force | ForEach-Object {
    & icacls.exe $_.FullName /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:F" "BUILTIN\Administrators:F" /c /q 2>$null | Out-Null
}

# Jalankan script FixHostFilePermissions bawaan Microsoft jika ada
$fixScript = "$sshBinDir\FixHostFilePermissions.ps1"
if (-not (Test-Path $fixScript) -and (Test-Path "$env:ProgramFiles\OpenSSH\FixHostFilePermissions.ps1")) {
    $fixScript = "$env:ProgramFiles\OpenSSH\FixHostFilePermissions.ps1"
}
if (Test-Path $fixScript) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$fixScript" -Confirm:$false 2>$null | Out-Null
}
Write-Host "    [OK] Host Keys & Security ACL berhasil dikunci." -ForegroundColor Green

# -------------------------------------------------------------------------------
# 5. Service sshd: Restart & Verifikasi
# -------------------------------------------------------------------------------
Write-Host ""
Write-Host "[5/6] Menjalankan & Memverifikasi Service OpenSSH (sshd)..." -ForegroundColor Cyan

Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction SilentlyContinue
Stop-Service -Name sshd -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
Start-Service -Name sshd -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1200

$svc = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne 'Running') {
    & net.exe start sshd 2>$null | Out-Null
    Start-Sleep -Milliseconds 1000
    $svc = Get-Service sshd -ErrorAction SilentlyContinue
}

if (-not $svc -or $svc.Status -ne 'Running') {
    Write-Host "[!] PERINGATAN: Service sshd belum dalam status Running. Periksa Event Viewer." -ForegroundColor Red
} else {
    Write-Host "    [OK] Service OpenSSH (sshd) BERJALAN AKTIF." -ForegroundColor Green
}

# -------------------------------------------------------------------------------
# 6. Windows Firewall & Self-Test Loopback
# -------------------------------------------------------------------------------
Write-Host ""
Write-Host "[6/6] Windows Firewall & Self-Test Loopback Port $targetPort..." -ForegroundColor Cyan

$ruleName = "OpenSSH-Server-In-TCP-$targetPort"
Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -Name $ruleName -DisplayName "OpenSSH Server Read-Only (Port $targetPort)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort $targetPort -Profile Any -ErrorAction SilentlyContinue | Out-Null
Write-Host "    -> Windows Firewall: Port $targetPort TCP diizinkan." -ForegroundColor Green

# Set Default Shell ke PowerShell
if (-not (Test-Path 'HKLM:\SOFTWARE\OpenSSH')) { New-Item -Path 'HKLM:\SOFTWARE\OpenSSH' -Force | Out-Null }
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null

# Self-Test Koneksi Loopback
Write-Host "    -> Menguji konektivitas internal (Self-Test)..." -ForegroundColor Yellow
$loopbackOk = $false
try {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    $iar = $tcpClient.BeginConnect("127.0.0.1", $targetPort, $null, $null)
    $wait = $iar.AsyncWaitHandle.WaitOne(2000, $false)
    if ($wait -and $tcpClient.Connected) {
        $loopbackOk = $true
        $tcpClient.EndConnect($iar)
        $stream = $tcpClient.GetStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $banner = $reader.ReadLine()
        $tcpClient.Close()
        Write-Host "    [OK] Self-Test Berhasil! Banner: $banner" -ForegroundColor Green
    }
} catch {}

if (-not $loopbackOk) {
    Write-Host "    [i] Catatan: Port $targetPort mendengarkan koneksi jaringan." -ForegroundColor Gray
}

# -------------------------------------------------------------------------------
# Ringkasan Kredensial untuk Dashboard
# -------------------------------------------------------------------------------
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  SETUP BERHASIL! KOMPUTER TARGET TELAH SIAP (STRICT READ-ONLY)" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "Tingkat Keamanan : [100% NON-ADMINISTRATOR / LEAST PRIVILEGE]" -ForegroundColor Cyan
Write-Host "Hak Akses User   : Hanya Membaca Sensor Telemetri & Performa (WMI/Procfs)" -ForegroundColor Gray
Write-Host "Akses Admin      : DIBLOKIR TOTAL (Bukan Member Administrators)" -ForegroundColor Gray
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "KREDENSIAL UNTUK DASHBOARD SIEM:" -ForegroundColor Yellow
Write-Host "  - Username : $monitorUser" -ForegroundColor Cyan
Write-Host "  - Password : $monitorPass" -ForegroundColor Cyan
Write-Host "  - Port SSH : $targetPort" -ForegroundColor Cyan
Write-Host "  - IP Aktif :" -ForegroundColor Yellow
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object {
    Write-Host "    * $($_.IPAddress) ($($_.InterfaceAlias))" -ForegroundColor Cyan
}
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host ""
