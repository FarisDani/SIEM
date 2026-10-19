# ===============================================================================
# [1-CLICK UNINSTALL V2] OpenSSH Server TARGET - REMOVE READ-ONLY MONITORING
# Membersihkan akun siem-monitor, firewall rule, dan konfigurasi terkait.
# ===============================================================================

$ErrorActionPreference = 'Continue'

Write-Host "===============================================================================" -ForegroundColor Yellow
Write-Host "  [V2] UNINSTALL OPENSSH READ-ONLY MONITORING (WINDOWS)" -ForegroundColor Yellow
Write-Host "  Membersihkan akun 'siem-monitor' dan konfigurasi Firewall/SSH" -ForegroundColor Yellow
Write-Host "===============================================================================" -ForegroundColor Yellow
Write-Host ""

# 1. Hapus User siem-monitor
Write-Host "[1/4] Menghapus akun lokal 'siem-monitor'..." -ForegroundColor Cyan
$existingUser = Get-LocalUser -Name "siem-monitor" -ErrorAction SilentlyContinue
if ($existingUser) {
    try {
        Remove-LocalUser -Name "siem-monitor" -ErrorAction Stop
        Write-Host "    [OK] Akun 'siem-monitor' berhasil dihapus dari sistem." -ForegroundColor Green
    } catch {
        Write-Host "    [Fallback] Mencoba via net user..." -ForegroundColor Yellow
        & net user "siem-monitor" /delete *>$null
        Write-Host "    [OK] Akun 'siem-monitor' telah dihapus." -ForegroundColor Green
    }
} else {
    Write-Host "    [INFO] Akun 'siem-monitor' tidak ditemukan (sudah bersih)." -ForegroundColor Gray
}

# 2. Hapus Windows Firewall Rules
Write-Host "[2/4] Membersihkan aturan Windows Defender Firewall..." -ForegroundColor Cyan
$rules = Get-NetFirewallRule -Name "OpenSSH-Server-In-Dashboard-ReadOnly*" -ErrorAction SilentlyContinue
if ($rules) {
    $rules | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Write-Host "    [OK] Firewall rules dashboard berhasil dihapus." -ForegroundColor Green
} else {
    # Periksa via display name jika ada
    Get-NetFirewallRule | Where-Object { $_.DisplayName -like "*OpenSSH*Dashboard*" -or $_.DisplayName -like "*siem-monitor*" } | Remove-NetFirewallRule -ErrorAction SilentlyContinue
    Write-Host "    [OK] Tidak ada rule firewall dashboard yang tersisa." -ForegroundColor Gray
}

# 3. Opsi Status OpenSSH Server (sshd)
Write-Host "[3/4] Mengatur status layanan sshd..." -ForegroundColor Cyan
$sshdService = Get-Service -Name "sshd" -ErrorAction SilentlyContinue
if ($sshdService) {
    Write-Host "    Layanan 'sshd' saat ini: $($sshdService.Status)" -ForegroundColor Gray
    Write-Host "    Apakah Anda ingin menghentikan dan menonaktifkan layanan OpenSSH SSHD seluruhnya?" -ForegroundColor Yellow
    $prompt = Read-Host "    Hentikan dan Disable SSHD? (y/N) [Default: N - biarkan aktif untuk koneksi lain]"
    if ($prompt -match '^[Yy]') {
        Stop-Service -Name "sshd" -Force -ErrorAction SilentlyContinue
        Set-Service -Name "sshd" -StartupType Disabled -ErrorAction SilentlyContinue
        Write-Host "    [OK] Layanan sshd berhasil dihentikan dan dinonaktifkan." -ForegroundColor Green
    } else {
        Write-Host "    [INFO] Layanan sshd tetap berjalan untuk keperluan administrasi lainnya." -ForegroundColor Green
    }
}

# 4. Hapus Authorized Keys siem-monitor jika ada
Write-Host "[4/4] Membersihkan sisa file konfigurasi akun..." -ForegroundColor Cyan
$profileDir = "C:\Users\siem-monitor"
if (Test-Path $profileDir) {
    try {
        Remove-Item -Path $profileDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "    [OK] Direktori profil user C:\Users\siem-monitor dibersihkan." -ForegroundColor Green
    } catch {
        Write-Host "    [INFO] Direktori profil akan dibersihkan otomatis oleh Windows pada reboot." -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  PEMBERSIHAN SELESAI (UNINSTALL BERHASIL)" -ForegroundColor Green
Write-Host "  Semua jejak akun monitoring read-only telah dihapus dari PC ini." -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
