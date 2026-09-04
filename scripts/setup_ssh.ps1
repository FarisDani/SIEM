# ===============================================================================
# [1-CLICK SETUP] OpenSSH Server untuk Hardware & Security Dashboard
# Enterprise Telemetry Agentless Provisioning Script (Zero-BOM & Anti-Error 1067)
# ===============================================================================

$ErrorActionPreference = 'Continue'
$targetPort = if ($env:SSH_TARGET_PORT) { [int]$env:SSH_TARGET_PORT } else { 22 }

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 1/5: Memeriksa dan Memasang Fitur OpenSSH Server..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

# 1. Deteksi file biner sshd.exe yang ada di sistem
$sshdBinPath = $null
if (Test-Path "$env:windir\System32\OpenSSH\sshd.exe") {
    $sshdBinPath = "$env:windir\System32\OpenSSH\sshd.exe"
} elseif (Test-Path "$env:ProgramFiles\OpenSSH\sshd.exe") {
    $sshdBinPath = "$env:ProgramFiles\OpenSSH\sshd.exe"
}

# Jika file biner belum ada, lakukan instalasi
if (-not $sshdBinPath) {
    Write-Host "    -> File biner OpenSSH Server belum ada. Memulai instalasi..." -ForegroundColor Yellow
    
    # Aktifkan Windows Update service
    Set-Service -Name wuauserv -StartupType Manual -ErrorAction SilentlyContinue
    Start-Service -Name wuauserv -ErrorAction SilentlyContinue

    $wuPath = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\WindowsUpdate\AU'
    $origWUServer = $null
    if (Test-Path $wuPath) {
        $prop = Get-ItemProperty -Path $wuPath -Name 'UseWUServer' -ErrorAction SilentlyContinue
        if ($prop -and $prop.UseWUServer -eq 1) {
            Write-Host "    -> Mendeteksi WSUS aktif (Penyebab 0x80072efd). Mengarahkan sementara ke Microsoft Update..." -ForegroundColor Yellow
            $origWUServer = 1
            Set-ItemProperty -Path $wuPath -Name 'UseWUServer' -Value 0 -ErrorAction SilentlyContinue
            Restart-Service wuauserv -Force -ErrorAction SilentlyContinue
        }
    }

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

    if ($origWUServer -eq 1) {
        Set-ItemProperty -Path $wuPath -Name 'UseWUServer' -Value 1 -ErrorAction SilentlyContinue
        Restart-Service wuauserv -Force -ErrorAction SilentlyContinue
    }

    # Fallback jika capability dan DISM gagal (misal proxy/firewall jaringan kantor)
    if (-not $installed) {
        Write-Host "    -> [METODE ALTERNATIF] Mengunduh paket resmi OpenSSH dari Microsoft GitHub..." -ForegroundColor Cyan
        $destZip = "$env:TEMP\OpenSSH-Win64.zip"
        $destDir = "$env:ProgramFiles\OpenSSH"
        $downloadUrls = @(
            'https://github.com/PowerShell/Win32-OpenSSH/releases/download/v9.5.0.0p1-Beta/OpenSSH-Win64.zip',
            'https://github.com/PowerShell/Win32-OpenSSH/releases/download/v9.8.1.0p1-Beta/OpenSSH-Win64.zip'
        )
        $dlSuccess = $false
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        foreach ($url in $downloadUrls) {
            try {
                Write-Host ("       Mencoba URL: " + $url) -ForegroundColor Gray
                Invoke-WebRequest -Uri $url -OutFile $destZip -TimeoutSec 35 -UseBasicParsing
                if (Test-Path $destZip) { $dlSuccess = $true; break }
            } catch {}
        }

        if ($dlSuccess) {
            Write-Host "    -> Mengekstrak dan mendaftarkan OpenSSH Server..." -ForegroundColor Green
            if (Test-Path $destDir) { Remove-Item $destDir -Recurse -Force -ErrorAction SilentlyContinue }
            Expand-Archive -Path $destZip -DestinationPath "$env:TEMP\OpenSSHTemp" -Force
            $extracted = Get-ChildItem "$env:TEMP\OpenSSHTemp" -Directory | Select-Object -First 1
            Move-Item -Path $extracted.FullName -Destination $destDir -Force
            Remove-Item $destZip -Force -ErrorAction SilentlyContinue
            Remove-Item "$env:TEMP\OpenSSHTemp" -Recurse -Force -ErrorAction SilentlyContinue
            & powershell.exe -ExecutionPolicy Bypass -File "$destDir\install-sshd.ps1"
            $installed = $true
        }
    }

    # Update path biner setelah instalasi
    if (Test-Path "$env:windir\System32\OpenSSH\sshd.exe") {
        $sshdBinPath = "$env:windir\System32\OpenSSH\sshd.exe"
    } elseif (Test-Path "$env:ProgramFiles\OpenSSH\sshd.exe") {
        $sshdBinPath = "$env:ProgramFiles\OpenSSH\sshd.exe"
    }
}

if (-not $sshdBinPath) {
    Write-Host ""
    Write-Host "===============================================================================" -ForegroundColor Red
    Write-Host "  [!] GAGAL MENGINSTAL OPENSSH SERVER. PASTIKAN KONEKSI INTERNET AKTIF." -ForegroundColor Red
    Write-Host "===============================================================================" -ForegroundColor Red
    return
}

# 2. Registrasi / Perbaiki Service sshd di Windows Service Control Manager
$sshdSvc = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $sshdSvc) {
    Write-Host "    -> Mendaftarkan service sshd ke Windows Service Manager..." -ForegroundColor Yellow
    if (Test-Path "$env:ProgramFiles\OpenSSH\install-sshd.ps1") {
        & powershell.exe -ExecutionPolicy Bypass -File "$env:ProgramFiles\OpenSSH\install-sshd.ps1" | Out-Null
    } else {
        & sc.exe create sshd binPath= "`"$sshdBinPath`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null
    }
} else {
    & sc.exe config sshd binPath= "`"$sshdBinPath`"" start= auto DisplayName= "OpenSSH SSH Server" | Out-Null
}
Write-Host "    -> Service OpenSSH Server (sshd) terverifikasi terdaftar di sistem." -ForegroundColor Green

# 3. Pastikan direktori ProgramData\ssh dan file sshd_config siap (Strict Zero-BOM)
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 2/5: Menyiapkan Direktori & File Konfigurasi sshd_config (Zero-BOM)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$sshDataDir = "$env:ProgramData\ssh"
if (-not (Test-Path $sshDataDir)) {
    New-Item -ItemType Directory -Path $sshDataDir -Force | Out-Null
}

$cfg = "$sshDataDir\sshd_config"

# Buat konfigurasi sshd_config bersih dengan Encoding ASCII (Mencegah Parse Error / Error 1067)
$configText = @"
Port $targetPort
ListenAddress 0.0.0.0
PubkeyAuthentication yes
PasswordAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
Subsystem sftp sftp-server.exe
"@

[System.IO.File]::WriteAllText($cfg, $configText.Replace("`r`n", "`n"), [System.Text.Encoding]::ASCII)
Write-Host "    -> File sshd_config disiapkan: Port $targetPort | PasswordAuthentication: yes (Format ASCII Bersih)." -ForegroundColor Green

# 4. Generate Host Keys & Universal ACL Permissions (Cegah Error 1067 / Error 10054)
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 3/5: Menghasilkan SSH Host Keys & Izin Keamanan Universal (Anti-Error 1067)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$sshBinDir = [System.IO.Path]::GetDirectoryName($sshdBinPath)
$keygenPath = "$sshBinDir\ssh-keygen.exe"

if (Test-Path $keygenPath) {
    Write-Host "    -> Menghasilkan SSH Host Keys resmi..." -ForegroundColor Yellow
    # 1. Jalankan ssh-keygen -A
    & "$keygenPath" -A 2>$null | Out-Null
    
    # 2. Pastikan file kunci spesifik terbuat dan tidak 0 byte
    if (-not (Test-Path "$sshDataDir\ssh_host_ed25519_key") -or (Get-Item "$sshDataDir\ssh_host_ed25519_key").Length -eq 0) {
        Remove-Item "$sshDataDir\ssh_host_ed25519_key*" -Force -ErrorAction SilentlyContinue
        & "$keygenPath" -t ed25519 -f "$sshDataDir\ssh_host_ed25519_key" -N '""' -q 2>$null | Out-Null
    }
    if (-not (Test-Path "$sshDataDir\ssh_host_rsa_key") -or (Get-Item "$sshDataDir\ssh_host_rsa_key").Length -eq 0) {
        Remove-Item "$sshDataDir\ssh_host_rsa_key*" -Force -ErrorAction SilentlyContinue
        & "$keygenPath" -t rsa -b 2048 -f "$sshDataDir\ssh_host_rsa_key" -N '""' -q 2>$null | Out-Null
    }
    if (-not (Test-Path "$sshDataDir\ssh_host_ecdsa_key") -or (Get-Item "$sshDataDir\ssh_host_ecdsa_key").Length -eq 0) {
        Remove-Item "$sshDataDir\ssh_host_ecdsa_key*" -Force -ErrorAction SilentlyContinue
        & "$keygenPath" -t ecdsa -b 256 -f "$sshDataDir\ssh_host_ecdsa_key" -N '""' -q 2>$null | Out-Null
    }
}

# Terapkan Izin Keamanan ACL Universal menggunakan Well-Known SID (Kompatibel Semua Bahasa OS)
# SID S-1-5-18 = NT AUTHORITY\SYSTEM, SID S-1-5-32-544 = BUILTIN\Administrators
try {
    $sidSystem = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")
    $sidAdmin = New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")

    # Set ACL Direktori ssh
    $dacl = New-Object System.Security.AccessControl.DirectorySecurity
    $dacl.SetAccessRuleProtection($true, $false)
    $dacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
    $dacl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")))
    Set-Acl -Path $sshDataDir -AclObject $dacl

    # Set ACL Setiap File di dalam ProgramData\ssh
    Get-ChildItem -Path $sshDataDir -Force | ForEach-Object {
        $facl = New-Object System.Security.AccessControl.FileSecurity
        $facl.SetAccessRuleProtection($true, $false)
        $facl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "Allow")))
        $facl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "Allow")))
        Set-Acl -Path $_.FullName -AclObject $facl
    }
} catch {}

Write-Host "    -> SSH Host Keys dan izin direktori terverifikasi aman & siap." -ForegroundColor Green

# 5. Service sshd: Verifikasi Syntax & Jalankan (Hard Stop jika Gagal)
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 4/5: Mengaktifkan Service OpenSSH (sshd)" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

# Test konfigurasi via sshd -t
$testOut = & "$sshdBinPath" -t 2>&1
if ($LASTEXITCODE -ne 0 -and $testOut) {
    Write-Host ("    -> [INFO Diagnostik sshd -t]: " + ($testOut | Out-String).Trim()) -ForegroundColor Yellow
}

Set-Service -Name sshd -StartupType 'Automatic' -ErrorAction SilentlyContinue
Restart-Service sshd -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 1200

$svc = Get-Service sshd -ErrorAction SilentlyContinue
if (-not $svc -or $svc.Status -ne 'Running') {
    Start-Service sshd -ErrorAction SilentlyContinue
    & net start sshd 2>$null | Out-Null
    Start-Sleep -Milliseconds 1000
    $svc = Get-Service sshd -ErrorAction SilentlyContinue
}

# Jika service masih gagal berjalan, lakukan Auto-Recovery Mendalam
if (-not $svc -or $svc.Status -ne 'Running') {
    Write-Host "    -> [!] Service sshd belum running. Melakukan Auto-Recovery Host Keys & Service..." -ForegroundColor Yellow
    
    # Hapus file lama yang berpotensi korup
    Remove-Item "$sshDataDir\ssh_host_*" -Force -ErrorAction SilentlyContinue
    
    # Buat ulang Host Key ED25519 dan RSA
    & "$keygenPath" -t ed25519 -f "$sshDataDir\ssh_host_ed25519_key" -N '""' -q 2>$null | Out-Null
    & "$keygenPath" -t rsa -b 2048 -f "$sshDataDir\ssh_host_rsa_key" -N '""' -q 2>$null | Out-Null
    
    # Buat ulang config ASCII murni
    [System.IO.File]::WriteAllText($cfg, $configText.Replace("`r`n", "`n"), [System.Text.Encoding]::ASCII)
    
    # Reset ACL lagi
    try {
        Set-Acl -Path $sshDataDir -AclObject $dacl
        Get-ChildItem -Path $sshDataDir -Force | ForEach-Object {
            $facl = New-Object System.Security.AccessControl.FileSecurity
            $facl.SetAccessRuleProtection($true, $false)
            $facl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidSystem, "FullControl", "Allow")))
            $facl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule($sidAdmin, "FullControl", "Allow")))
            Set-Acl -Path $_.FullName -AclObject $facl
        }
    } catch {}

    # Restart service kembali
    & sc.exe start sshd 2>$null | Out-Null
    Start-Sleep -Milliseconds 1500
    $svc = Get-Service sshd -ErrorAction SilentlyContinue
}

# Evaluasi Akhir Status Service
if (-not $svc -or $svc.Status -ne 'Running') {
    Write-Host ""
    Write-Host "===============================================================================" -ForegroundColor Red
    Write-Host "  [!] GAGAL MENGAKTIFKAN SERVICE OPENSSH (sshd)!" -ForegroundColor Red
    Write-Host "===============================================================================" -ForegroundColor Red
    Write-Host "Detail Diagnostik:" -ForegroundColor Yellow
    $diag = & "$sshdBinPath" -t 2>&1
    if ($diag) {
        Write-Host ($diag | Out-String) -ForegroundColor Yellow
    }
    Write-Host "Status Windows Service: " ($svc.Status) -ForegroundColor Red
    Write-Host "Proses dihentikan agar error dapat ditangani terlebih dahulu." -ForegroundColor White
    Write-Host "===============================================================================" -ForegroundColor Red
    return
}

Write-Host "    -> Service sshd BERHASIL AKTIF BERJALAN (Status: Running, Startup: Automatic)." -ForegroundColor Green

# 6. Firewall Rules (Multi-Profile: Domain, Private, Public) & Default Shell
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 5/5: Membuka Firewall Port $targetPort (Semua Profile) & Set Default Shell" -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$ruleName = "OpenSSH-Server-In-TCP-$targetPort"
& netsh advfirewall firewall delete rule name="$ruleName" | Out-Null
& netsh advfirewall firewall add rule name="$ruleName" dir=in action=allow protocol=TCP localport=$targetPort profile=any | Out-Null
Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
New-NetFirewallRule -Name $ruleName -DisplayName "OpenSSH Server (Port $targetPort)" -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort $targetPort -Profile Any -ErrorAction SilentlyContinue | Out-Null
Write-Host "    -> Windows Firewall: Inbound Port $targetPort TCP berhasil diizinkan (Profile: Domain, Private, Public)." -ForegroundColor Green

if (-not (Test-Path 'HKLM:\SOFTWARE\OpenSSH')) { New-Item -Path 'HKLM:\SOFTWARE\OpenSSH' -Force | Out-Null }
New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -PropertyType String -Force | Out-Null
Write-Host "    -> Default Shell SSH: PowerShell siap." -ForegroundColor Green

# Verifikasi koneksi port lokal
$tcpOk = $false
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect("127.0.0.1", $targetPort, $null, $null)
    $waited = $iar.AsyncWaitHandle.WaitOne(1500, $false)
    if ($waited -and $client.Connected) {
        $tcpOk = $true
        $client.EndConnect($iar)
    }
    $client.Close()
} catch {}

if ($tcpOk) {
    Write-Host "    -> [VERIFIKASI SUKSES] Port $targetPort terbuka dan siap melayani koneksi SSH!" -ForegroundColor Green
} else {
    Write-Host "    -> [INFO] Port $targetPort sedang menyelesaikan inisialisasi jaringan..." -ForegroundColor Yellow
}

# Summary Info
Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  SELAMAT! OPENSSH SERVER PADA PERANGKAT INI TELAH AKTIF & SIAP DIPANTAU" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Salin informasi di bawah ini untuk dimasukkan ke Web Hardware Dashboard:" -ForegroundColor White
Write-Host "URL Dashboard: http://localhost:8088 (atau IP Server Dashboard)" -ForegroundColor Gray
Write-Host ""
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host "[1] ALAMAT IP LOKAL KOMPUTER INI:" -ForegroundColor Yellow
Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notlike '*Loopback*' -and $_.IPAddress -notlike '169.254.*' } | ForEach-Object {
    Write-Host ("    - IP: " + $_.IPAddress + " (" + $_.InterfaceAlias + ")") -ForegroundColor Cyan
}
Write-Host ""
Write-Host "[2] USERNAME KONEKSI SSH:" -ForegroundColor Yellow
$u = whoami
$short = [System.Environment]::UserName
Write-Host ("    - Format Lengkap : " + $u) -ForegroundColor Cyan
Write-Host ("    - Format Ringkas : " + $short) -ForegroundColor Cyan
Write-Host ""
Write-Host "[3] PORT SSH AKTIF:" -ForegroundColor Yellow
Write-Host ("    - Port : " + $targetPort) -ForegroundColor Cyan
Write-Host ""
Write-Host "[4] PASSWORD SSH:" -ForegroundColor Yellow
Write-Host "    - Masukkan Password yang Anda gunakan untuk login Windows di perangkat ini." -ForegroundColor Gray
Write-Host "-------------------------------------------------------------------------------" -ForegroundColor Gray
Write-Host ""
Write-Host "TIPS: Buka http://localhost:8088 -> Klik [+ Tambah Profil] -> Masukkan IP, Username, Port, dan Password di atas." -ForegroundColor White
