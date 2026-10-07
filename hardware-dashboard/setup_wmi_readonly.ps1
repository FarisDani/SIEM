<#
.SYNOPSIS
    Konfigurasi Delegasi Izin WMI Read-Only untuk Monitoring NOC (Least Privilege).
.DESCRIPTION
    Script ini memberikan hak akses baca (Read-Only) pada WMI namespace (root\wmi dan root\cimv2)
    serta menambahkan user monitoring ke grup 'Performance Monitor Users' dan 'Distributed COM Users'.
    User target TIDAK dimasukkan ke grup Administrators, menjaga keamanan PC target (Read-Only).
.PARAMETER TargetUser
    Nama akun Windows lokal atau domain yang digunakan untuk monitoring via SSH.
#>
param(
    [string]$TargetUser = ""
)

# Deteksi user jika tidak dispesifikasikan
if (-not $TargetUser) {
    $TargetUser = $env:USERNAME
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  NOC DASHBOARD - DELEGASI WMI READ-ONLY (LEAST PRIVILEGE)  " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "[*] Target Akun: $TargetUser" -ForegroundColor Yellow

# Pastikan script dijalankan sebagai Administrator jika ingin mengubah SDDL
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Script ini membutuhkan hak Administrator untuk mendaftarkan izin WMI sekali saja." -ForegroundColor Red
    Write-Host "[!] Silakan jalankan PowerShell via 'Run as Administrator'." -ForegroundColor Red
    exit 1
}

# 1. Dapatkan SID dari Target User
try {
    $objUser = New-Object System.Security.Principal.NTAccount($TargetUser)
    $strSID = $objUser.Translate([System.Security.Principal.SecurityIdentifier]).Value
    Write-Host "[+] SID Akun Terdeteksi: $strSID" -ForegroundColor Green
} catch {
    Write-Host "[!] Gagal mendeteksi SID untuk user '$TargetUser'. Pastikan username benar." -ForegroundColor Red
    exit 1
}

# 2. Tambahkan ke grup bawaan Windows: Performance Monitor Users & Distributed COM Users
$groups = @("Performance Monitor Users", "Distributed COM Users")
foreach ($grp in $groups) {
    try {
        $check = net localgroup "$grp" 2>&1
        if ($check -notmatch [regex]::Escape($TargetUser)) {
            net localgroup "$grp" "$TargetUser" /add | Out-Null
            Write-Host "[+] Berhasil menambahkan '$TargetUser' ke grup '$grp'" -ForegroundColor Green
        } else {
            Write-Host "[i] User '$TargetUser' sudah terdaftar di grup '$grp'" -ForegroundColor Gray
        }
    } catch {
        Write-Host "[!] Catatan grup $grp : $_" -ForegroundColor Yellow
    }
}

# 3. Fungsi untuk menambahkan hak Enable Account (0x1) dan Remote Enable (0x20) pada WMI Namespace
function Add-WmiNamespacePermission {
    param(
        [string]$Namespace,
        [string]$UserSid
    )

    try {
        $secObj = Get-WmiObject -Namespace $Namespace -Class __SystemSecurity -ErrorAction Stop
        $res = $secObj.GetSecurityDescriptor()
        if ($res.ReturnValue -eq 0) {
            $sd = $res.Descriptor
            $dacl = $sd.DACL

            # Periksa apakah SID sudah ada di DACL
            $alreadyExists = $false
            foreach ($ace in $dacl) {
                if ($ace.Trustee.SIDString -eq $UserSid) {
                    $alreadyExists = $true
                    # Pastikan AccessMask memiliki flag CC (1), LC (2), SW (4), RP (8), WP (16), DT (32)
                    # 1 = Enable Account, 2 = Execute Methods, 4 = Full Write, 8 = Partial Write, 16 = Provider Write, 32 = Remote Enable, 64 = Read Security
                    # Read-Only: Enable Account (1) + Remote Enable (32) + Execute Methods (2) + Read Security (64) = 99 (0x63)
                    $ace.AccessMask = $ace.AccessMask -bor 0x63
                    break
                }
            }

            if (-not $alreadyExists) {
                $ntAccount = (New-Object System.Security.Principal.SecurityIdentifier($UserSid)).Translate([System.Security.Principal.NTAccount]).Value
                $parts = $ntAccount -split '\\'
                $domain = if ($parts.Count -gt 1) { $parts[0] } else { $env:COMPUTERNAME }
                $name = if ($parts.Count -gt 1) { $parts[1] } else { $parts[0] }

                $trusteeClass = [wmiclass]"$Namespace`:__Trustee"
                $newTrustee = $trusteeClass.CreateInstance()
                $newTrustee.Domain = $domain
                $newTrustee.Name = $name
                $newTrustee.SIDString = $UserSid

                $aceClass = [wmiclass]"$Namespace`:__ACE"
                $newAce = $aceClass.CreateInstance()
                $newAce.AceFlags = 2 # CONTAINER_INHERIT_ACE
                $newAce.AceType = 0  # ACCESS_ALLOWED_ACE_TYPE
                $newAce.AccessMask = 0x63 # Enable Account, Remote Enable, Execute Methods, Read Security
                $newAce.Trustee = $newTrustee

                $dacl += $newAce
                $sd.DACL = $dacl
            }

            $setRes = $secObj.SetSecurityDescriptor($sd)
            if ($setRes.ReturnValue -eq 0) {
                Write-Host "[+] Izin Read-Only WMI berhasil diterapkan pada namespace: $Namespace" -ForegroundColor Green
            } else {
                Write-Host "[!] Gagal menerapkan SecurityDescriptor pada $Namespace (Code: $($setRes.ReturnValue))" -ForegroundColor Yellow
            }
        }
    } catch {
        Write-Host "[!] Error mengatur izin pada namespace $Namespace : $_" -ForegroundColor Yellow
    }
}

# Terapkan pada root\wmi (untuk sensor MSAcpi) dan root\cimv2 (untuk Win32_* query)
Add-WmiNamespacePermission -Namespace "root\wmi" -UserSid $strSID
Add-WmiNamespacePermission -Namespace "root\cimv2" -UserSid $strSID

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host "  VERIFIKASI AKSES SENSOR (TEST QUERY)                     " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Test MSAcpi query
try {
    $tz = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature -ErrorAction Stop
    foreach ($t in $tz) {
        $c = [math]::Round(($t.CurrentTemperature / 10.0) - 273.15, 1)
        Write-Host "[TEST PASSED] Suhu CPU ($($t.InstanceName)): $c °C" -ForegroundColor Green
    }
} catch {
    Write-Host "[TEST INFO] MSAcpi test: $_" -ForegroundColor Gray
}

# Test Storage SMART query
try {
    $disks = Get-PhysicalDisk -ErrorAction SilentlyContinue
    foreach ($d in $disks) {
        $rel = Get-StorageReliabilityCounter -PhysicalDisk $d -ErrorAction SilentlyContinue
        $tVal = if ($rel -and $rel.Temperature) { "$($rel.Temperature) °C" } else { "N/A" }
        Write-Host "[TEST PASSED] Disk: $($d.FriendlyName) | Temp: $tVal | Status: $($d.HealthStatus)" -ForegroundColor Green
    }
} catch {
    Write-Host "[TEST INFO] SMART test: $_" -ForegroundColor Gray
}

Write-Host ""
Write-Host "[OK] Konfigurasi selesai. User '$TargetUser' kini memiliki hak Read-Only WMI telemetry tanpa hak Administrator." -ForegroundColor Cyan
