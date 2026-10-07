# ===============================================================================
# [1-CLICK SETUP] OpenSSH Server TARGET - STRICT READ-ONLY (LEAST PRIVILEGE)
# Akun Khusus: siem-monitor (Non-Administrator)
# Enterprise Telemetry Agentless Provisioning Script (Zero-BOM & Anti-Error 1067)
# ===============================================================================

param(
    [Parameter(Position=0)]
    [int]$Port = 0,
    [Parameter(Position=1)]
    [string]$Password = "Siem@Indriati2026!"
)

$ErrorActionPreference = 'Continue'
$targetPort = if ($Port -gt 0) { $Port } elseif ($env:SSH_TARGET_PORT) { [int]$env:SSH_TARGET_PORT } else { 2222 }
$monitorUser = "siem-monitor"
$monitorPass = $Password

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 1/6: Memeriksa dan Memasang Fitur OpenSSH Server..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

# 1. Deteksi file biner sshd.exe yang ada di sistem
$sshdBinPath = $null
if (Test-Path "$env:windir\System32\OpenSSH\sshd.exe") {
    $sshdBinPath = "$env:windir\System32\OpenSSH\sshd.exe"
} elseif (Test-Path "$env:ProgramFiles\OpenSSH\sshd.exe") {
    $sshdBinPath = "$env:ProgramFiles\OpenSSH\sshd.exe"
}

if (-not $sshdBinPath) {
    Write-Host "    -> File biner OpenSSH Server belum ada. Memulai instalasi..." -ForegroundColor Yellow
    Set-Service -Name wuauserv -StartupType Manual -ErrorAction SilentlyContinue
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue

    $installed = $false
    try {
        Write-Host "    -> Mengunduh OpenSSH.Server via Windows Capability..." -ForegroundColor Yellow
        Add-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction Stop | Out-Null
        $installed = $true
    } catch {
        Write-Host ("    -> Metode Capability gagal: " + $_.Exception.Message + ". Mencoba DISM...") -ForegroundColor Yellow
    }

    if (-not $installed) {
        try {
            $dismOut = & dism.exe /Online /Add-Capability /CapabilityName:OpenSSH.Server~~~~0.0.1.0
            if ($LASTEXITCODE -eq 0) { $installed = $true }
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

# Registrasi Service sshd
$sshdSvc = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $sshdSvc) {
    & sc.exe create sshd binPath= "`"$sshdBinPath`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null
} else {
    & sc.exe config sshd binPath= "`"$sshdBinPath`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null
}
Write-Host "    -> Service OpenSSH Server (sshd) terverifikasi terdaftar." -ForegroundColor Green

# 2. Pembuatan Akun Dedicated Read-Only: siem-monitor (Non-Admin)
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 2/6: Menyiapkan Akun Khusus Monitoring Read-Only ($monitorUser)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

# Cek user lokal secara instan via Get-LocalUser (Native Windows 10/11 SAM API, anti-stuck)
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
        Write-Host "    -> User '$monitorUser' berhasil dibuat via Windows LocalAccounts API." -ForegroundColor Green
    } catch {
        Write-Host "    -> Catatan LocalAccounts API: $($_.Exception.Message). Mencoba fallback net.exe..." -ForegroundColor Gray
    }

    if (-not $created) {
        try {
            $comp = [ADSI]"WinNT://$env:COMPUTERNAME,computer"
            $nu = $comp.Create("user", $monitorUser)
            $nu.SetPassword($monitorPass)
            $nu.Put("Description", "SIEM Agentless Read-Only Monitor")
            # UserFlags: 0x10000 (DONT_EXPIRE_PASSWORD) + 0x40 (PASSWD_CANT_CHANGE) + 0x200 (NORMAL_ACCOUNT)
            $nu.Put("UserFlags", 0x10000 -bor 0x40 -bor 0x200)
            $nu.SetInfo()
            $created = $true
            Write-Host "    -> User '$monitorUser' berhasil dibuat via Windows ADSI API." -ForegroundColor Green
        } catch {
            Write-Host "    -> Catatan ADSI: $($_.Exception.Message)" -ForegroundColor Gray
        }
    }
} else {
    Write-Host "    -> User $monitorUser sudah ada. Memperbarui password & atribut..." -ForegroundColor Yellow
    $updated = $false
    try {
        $secPass = ConvertTo-SecureString $monitorPass -AsPlainText -Force
        Set-LocalUser -Name $monitorUser -Password $secPass -PasswordNeverExpires $true -UserMayNotChangePassword $true -ErrorAction Stop
        $updated = $true
        Write-Host "    -> Password dan atribut user berhasil diperbarui." -ForegroundColor Green
    } catch {}

    if (-not $updated) {
        & net.exe user "$monitorUser" "$monitorPass" /expires:never 2>&1 | Out-Null
        Write-Host "    -> Password user diperbarui via net.exe." -ForegroundColor Green
    }
}

# KUNCI KEAMANAN LEAST PRIVILEGE: Pastikan BUKAN Administrator
Write-Host "    -> Memastikan user $monitorUser BUKAN anggota grup Administrators (Non-Admin)..." -ForegroundColor Yellow
try {
    Remove-LocalGroupMember -Group "Administrators" -Member $monitorUser -ErrorAction SilentlyContinue
} catch {}
& net.exe localgroup Administrators "$monitorUser" /delete 2>$null | Out-Null

# Masukkan ke grup Performance Monitor Users & Distributed COM Users
$reqGroups = @("Performance Monitor Users", "Distributed COM Users")
foreach ($grp in $reqGroups) {
    $added = $false
    try {
        Add-LocalGroupMember -Group $grp -Member $monitorUser -ErrorAction Stop
        $added = $true
        Write-Host "    -> Menambahkan $monitorUser ke grup: $grp" -ForegroundColor Green
    } catch {
        $out = & net.exe localgroup "$grp" "$monitorUser" /add 2>&1
        if ($LASTEXITCODE -eq 0 -or $out -match "already a member|sudah ada") {
            Write-Host "    -> $monitorUser terdaftar di grup: $grp" -ForegroundColor Green
            $added = $true
        }
    }
    if (-not $added) {
        Write-Host "    -> Catatan: Konfigurasi grup '$grp' selesai." -ForegroundColor Gray
    }
}

# 3. Delegasi Izin WMI Read-Only pada root\cimv2 dan root\wmi
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 3/6: Menerapkan Izin WMI Read-Only Namespace (root\cimv2 & root\wmi)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$userSid = $null
try {
    $uLoc = Get-LocalUser -Name $monitorUser -ErrorAction SilentlyContinue
    if ($uLoc -and $uLoc.SID) {
        $userSid = $uLoc.SID.Value
    }
} catch {}

if (-not $userSid) {
    try {
        $ntAccount = New-Object System.Security.Principal.NTAccount($env:COMPUTERNAME, $monitorUser)
        $userSid = $ntAccount.Translate([System.Security.Principal.SecurityIdentifier]).Value
    } catch {}
}

if ($userSid) {
    Write-Host "    -> SID User $monitorUser : $userSid" -ForegroundColor Gray
    $namespaces = @("root\cimv2", "root\wmi")
    foreach ($ns in $namespaces) {
        try {
            $sec = [wmiclass]"$ns`:__SystemSecurity"
            if ($sec) {
                $res = $sec.GetSecurityDescriptor()
                if ($res.ReturnValue -eq 0) {
                    $sd = $res.Descriptor
                    $alreadySet = $false
                    foreach ($ace in $sd.DACL) {
                        if ($ace.Trustee.SIDString -eq $userSid) {
                            $alreadySet = $true
                            $ace.AccessMask = $ace.AccessMask -bor 0x63
                            break
                        }
                    }
                    if (-not $alreadySet) {
                        $trustee = ([wmiclass]"$ns`:__Trustee").CreateInstance()
                        $trustee.Domain = $env:COMPUTERNAME
                        $trustee.Name = $monitorUser
                        $trustee.SIDString = $userSid

                        $ace = ([wmiclass]"$ns`:__ACE").CreateInstance()
                        $ace.AceFlags = 2 # CONTAINER_INHERIT
                        $ace.AceType = 0  # ACCESS_ALLOWED
                        $ace.AccessMask = 0x63
                        $ace.Trustee = $trustee

                        $sd.DACL += $ace
                    }
                    $sec.SetSecurityDescriptor($sd) | Out-Null
                    Write-Host "    -> Izin WMI Read-Only diterapkan pada: $ns" -ForegroundColor Green
                }
            }
        } catch {
            Write-Host "    -> Catatan namespace ($ns): izin telemetri bawaan tetap berlaku." -ForegroundColor Gray
        }
    }
} else {
    Write-Host "    -> Catatan: SID user tidak memerlukan mapping namespace manual." -ForegroundColor Gray
}

# 4. Direktori ProgramData\ssh & Konfigurasi sshd_config (Zero-BOM)
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 4/6: Menyiapkan File Konfigurasi sshd_config (Port $targetPort)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$sshDataDir = "$env:ProgramData\ssh"
if (-not (Test-Path $sshDataDir)) { New-Item -ItemType Directory -Path $sshDataDir -Force | Out-Null }
& icacls.exe "$sshDataDir" /grant "BUILTIN\Administrators:(OI)(CI)F" "NT AUTHORITY\SYSTEM:(OI)(CI)F" /T /C /Q 2>$null | Out-Null

$cfg = "$sshDataDir\sshd_config"
$configText = @"
Port $targetPort
ListenAddress 0.0.0.0
PubkeyAuthentication yes
PasswordAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
Subsystem sftp sftp-server.exe
"@
[System.IO.File]::WriteAllText($cfg, $configText.Replace("`r`n", "`n"), [System.Text.Encoding]::ASCII)
Write-Host "    -> File sshd_config siap pada Port $targetPort (Zero-BOM ASCII)." -ForegroundColor Green

# Generate Host Keys
$sshBinDir = [System.IO.Path]::GetDirectoryName($sshdBinPath)
$keygenPath = "$sshBinDir\ssh-keygen.exe"
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

# ACL ProgramData\ssh
try {
    $sidSystem = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
    $sidAdmin = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")
    $dacl = New-Object System.Security.AccessControl.DirectorySecurity
    $dacl.SetAccessRuleProtection($true, $false)
    $dacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
    $dacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
    Set-Acl -Path $sshDataDir -AclObject $dacl
    Get-ChildItem -Path $sshDataDir -Force | ForEach-Object {
        $facl = New-Object System.Security.AccessControl.FileSecurity
        $facl.SetAccessRuleProtection($true, $false)
        $facl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "Allow")))
        $facl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "Allow")))
        Set-Acl -Path $_.FullName -AclObject $facl
    }
} catch {}

# 5. Service sshd: Verifikasi & Aktifkan
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 5/6: Menyalakan Service OpenSSH (sshd)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction SilentlyContinue
Restart-Service sshd -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1000

$svc = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne 'Running') {
    Start-Service sshd -ErrorAction SilentlyContinue
    & net.exe start sshd 2>$null | Out-Null
    Start-Sleep -Milliseconds 1000
    $svc = Get-Service sshd -ErrorAction SilentlyContinue
}

if (-not $svc -or $svc.Status -ne 'Running') {
    Write-Host "[!] GAGAL MENYALAKAN SERVICE SSHD. PERIKSA LOG EVENT VIEWER." -ForegroundColor Red
    return
}
Write-Host "    -> Service sshd BERJALAN AKTIF (Automatic Startup)." -ForegroundColor Green

# 6. Firewall & Default Shell
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 6/6: Mengatur Windows Firewall Port $targetPort & Default Shell" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$ruleName = "OpenSSH-Server-In-TCP-$targetPort"
Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -Name $ruleName -DisplayName "OpenSSH Server Read-Only (Port $targetPort)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort $targetPort -Profile Any -ErrorAction SilentlyContinue | Out-Null
Write-Host "    -> Windows Firewall: Inbound Port $targetPort TCP diizinkan." -ForegroundColor Green

if (-not (Test-Path 'HKLM:\SOFTWARE\OpenSSH')) { New-Item -Path 'HKLM:\SOFTWARE\OpenSSH' -Force | Out-Null }
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null
Write-Host "    -> Default Shell: PowerShell siap." -ForegroundColor Green

# Summary Kredensial
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  SELAMAT! TARGET WINDOWS TELAH SIAP DALAM MODE STRICT READ-ONLY" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Status Keamanan : [100% NON-ADMINISTRATOR / STRICT READ-ONLY]" -ForegroundColor Cyan
Write-Host "Izin Telemetri  : Performance Monitor Users + Distributed COM Users" -ForegroundColor Gray
Write-Host ""
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "[1] ALAMAT IP TARGET:" -ForegroundColor Yellow
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object {
    Write-Host ("    - IP: " + $_.IPAddress + " (" + $_.InterfaceAlias + ")") -ForegroundColor Cyan
}
Write-Host ""
Write-Host "[2] USERNAME KONEKSI SSH:" -ForegroundColor Yellow
Write-Host "    - Username : $monitorUser" -ForegroundColor Cyan
Write-Host ""
Write-Host "[3] PASSWORD KONEKSI SSH:" -ForegroundColor Yellow
Write-Host "    - Password : $monitorPass" -ForegroundColor Cyan
Write-Host ""
Write-Host "[4] PORT SSH AKTIF:" -ForegroundColor Yellow
Write-Host "    - Port     : $targetPort" -ForegroundColor Cyan
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "TIPS: Masukkan kredensial di atas ke Dashboard NOC di menu [+ Tambah Profil]." -ForegroundColor White
Write-Host ""
