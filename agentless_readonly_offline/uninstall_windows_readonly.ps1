# ===============================================================================
# [OFFLINE 1-CLICK UNINSTALL] OpenSSH Server TARGET - REMOVE READ-ONLY MONITORING
# Membersihkan akun monitoring, firewall rule, dan biner jika diinstal offline.
# ===============================================================================

param(
    [Parameter(Position=0)]
    [string]$Username = "",
    [Parameter(Position=1)]
    [int]$Port = 0
)

$ErrorActionPreference = 'Continue'
$targetUser = if ($Username -and $Username.Trim() -ne "") { $Username.Trim() } elseif ($env:SSH_TARGET_USER) { $env:SSH_TARGET_USER.Trim() } else { "siem-monitor" }
$targetPort = if ($Port -gt 0) { $Port } elseif ($env:SSH_TARGET_PORT) { [int]$env:SSH_TARGET_PORT } else { 3000 }

Write-Host "===============================================================================" -ForegroundColor Yellow
Write-Host "  [OFFLINE] UNINSTALL OPENSSH READ-ONLY MONITORING (WINDOWS)" -ForegroundColor Yellow
Write-Host "  Membersihkan akun '$targetUser' dan konfigurasi Firewall/SSH" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Yellow
Write-Host "  Target User : $targetUser" -ForegroundColor Gray
Write-Host "  Target Port : $targetPort" -ForegroundColor Gray
Write-Host ""

# 1. Hapus User Monitoring
Write-Host "[1/4] Menghapus akun lokal '$targetUser'..." -ForegroundColor Cyan
$existingUser = Get-LocalUser -Name $targetUser -ErrorAction SilentlyContinue
if ($existingUser) {
    try {
        Remove-LocalUser -Name $targetUser -ErrorAction Stop
        Write-Host "    [OK] Akun '$targetUser' berhasil dihapus dari sistem." -ForegroundColor Green
    } catch {
        & net user "$targetUser" /delete *>$null
        Write-Host "    [OK] Akun '$targetUser' telah dihapus." -ForegroundColor Green
    }
} else {
    Write-Host "    [INFO] Akun '$targetUser' tidak ditemukan." -ForegroundColor Gray
}

# 2. Hapus Windows Firewall Rules
Write-Host "[2/4] Membersihkan aturan Windows Defender Firewall..." -ForegroundColor Cyan
$rules = Get-NetFirewallRule -Name "OpenSSH-Server-In-Dashboard-ReadOnly*" -ErrorAction SilentlyContinue
if ($rules) {
    $rules | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Write-Host "    [OK] Firewall rules dashboard berhasil dihapus." -ForegroundColor Green
} else {
    Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*OpenSSH*Dashboard*" -or $_.DisplayName -like "*$targetUser*" } | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Write-Host "    [OK] Tidak ada rule firewall dashboard yang tersisa." -ForegroundColor Gray
}

# 3. Opsi Status OpenSSH Server (sshd)
Write-Host "[3/4] Mengatur status layanan sshd..." -ForegroundColor Cyan
$sshdService = Get-Service -Name "sshd" -ErrorAction SilentlyContinue
if ($sshdService) {
    Write-Host "    Layanan 'sshd' saat ini: $($sshdService.Status)" -ForegroundColor Gray
    $prompt = Read-Host "    Hentikan dan Hapus Service sshd sepenuhnya? (y/N) [Default: N]"
    if ($prompt -match '^[Yy]') {
        Stop-Service -Name "sshd" -Force -ErrorAction SilentlyContinue
        & sc.exe delete sshd | Out-Null
        Write-Host "    [OK] Layanan sshd berhasil dihentikan dan dihapus dari Service Manager." -ForegroundColor Green
    } else {
        Write-Host "    [INFO] Layanan sshd dipertahankan." -ForegroundColor Green
    }
}

# 4. Hapus Direktori Profil akun jika ada
Write-Host "[4/4] Membersihkan sisa file profil akun..." -ForegroundColor Cyan
$profileDir = "C:\Users\$targetUser"
if (Test-Path $profileDir) {
    try {
        Remove-Item -Path $profileDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "    [OK] Direktori profil user $profileDir dibersihkan." -ForegroundColor Green
    } catch {
        Write-Host "    [INFO] Direktori profil akan dibersihkan oleh sistem pada reboot." -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  PEMBERSIHAN SELESAI (UNINSTALL BERHASIL)" -ForegroundColor Green
Write-Host "  Semua konfigurasi monitoring telah dihapus dari PC ini." -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
