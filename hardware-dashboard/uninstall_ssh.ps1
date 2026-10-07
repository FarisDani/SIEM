# ===============================================================================
# [1-CLICK UNINSTALL] Hapus & Nonaktifkan OpenSSH Server Target (Windows)
# Enterprise Hardware and Security Dashboard - Cleanup Script
# ===============================================================================

$ErrorActionPreference = 'Continue'

Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 1/6: Menghentikan & Menghapus Service SSH..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

Stop-Service sshd -Force -ErrorAction SilentlyContinue
Stop-Service 'ssh-agent' -Force -ErrorAction SilentlyContinue

if (Test-Path "$env:ProgramFiles\OpenSSH\uninstall-sshd.ps1") {
    & powershell.exe -ExecutionPolicy Bypass -File "$env:ProgramFiles\OpenSSH\uninstall-sshd.ps1" -ErrorAction SilentlyContinue | Out-Null
}

& sc.exe delete sshd | Out-Null
& sc.exe delete 'ssh-agent' | Out-Null
Write-Host "    -> Service SSHD & ssh-agent berhasil dihentikan dan dihapus dari Windows." -ForegroundColor Green

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 2/6: Menghapus Akun Dedicated Monitoring 'siem-monitor'..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$userExists = $false
try {
    $uObj = [ADSI]"WinNT://$env:COMPUTERNAME/siem-monitor"
    if ($uObj.Name) { $userExists = $true }
} catch {}

if ($userExists) {
    & net.exe user "siem-monitor" /delete 2>$null | Out-Null
    Write-Host "    -> Akun lokal 'siem-monitor' berhasil dihapus dari sistem." -ForegroundColor Green
} else {
    Write-Host "    -> Akun 'siem-monitor' tidak ditemukan atau sudah dibersihkan." -ForegroundColor Gray
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 3/6: Menghapus Rule Port SSH di Firewall..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Name -like 'OpenSSH-Server-In-TCP*' -or $_.DisplayName -like '*OpenSSH*Server*' } | Remove-NetFirewallRule -ErrorAction SilentlyContinue
Write-Host "    -> Rule Firewall Port SSH telah dibersihkan (Port ditutup kembali)." -ForegroundColor Green

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 4/6: Menghapus Fitur OpenSSH Server dari Sistem..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

$cap = Get-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' -ErrorAction SilentlyContinue
if ($cap -and $cap.State -eq 'Installed') {
    Write-Host "    -> Menghapus paket Windows Capability OpenSSH.Server..." -ForegroundColor Yellow
    Remove-WindowsCapability -Online -Name 'OpenSSH.Server~~~~0.0.1.0' | Out-Null
    Write-Host "    -> Fitur OpenSSH.Server berhasil dihapus dari Windows Capability." -ForegroundColor Green
}

if (Test-Path "$env:ProgramFiles\OpenSSH") {
    Remove-Item "$env:ProgramFiles\OpenSSH" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    -> Direktori Program Files\OpenSSH dibersihkan." -ForegroundColor Green
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 5/6: Membersihkan Cache Konfigurasi & Host Keys..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

if (Test-Path "$env:ProgramData\ssh") {
    Remove-Item "$env:ProgramData\ssh\*" -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "    -> Cache ProgramData\ssh dibersihkan (Mencegah konflik jika diinstall ulang)." -ForegroundColor Green
}

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Cyan
Write-Host "  LANGKAH 6/6: Membersihkan Registri Default Shell..." -ForegroundColor Cyan
Write-Host "===============================================================================" -ForegroundColor Cyan

Remove-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -ErrorAction SilentlyContinue
Write-Host "    -> Registri DefaultShell telah dibersihkan." -ForegroundColor Green

Write-Host ""
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host "  SUKSES! OPENSSH SERVER & AKUN MONITORING TELAH DIHAPUS BERSIH" -ForegroundColor Green
Write-Host "===============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Ringkasan Tindakan:" -ForegroundColor White
Write-Host "  [OK] Service SSHD & ssh-agent dihapus." -ForegroundColor Gray
Write-Host "  [OK] Akun 'siem-monitor' telah dihapus." -ForegroundColor Gray
Write-Host "  [OK] Port SSH pada Windows Firewall telah ditutup kembali." -ForegroundColor Gray
Write-Host "  [OK] Fitur OpenSSH Server telah dicopot." -ForegroundColor Gray
Write-Host "  [OK] Folder ProgramData\ssh dibersihkan." -ForegroundColor Gray
Write-Host "  [OK] Komputer ini kembali bersih ke kondisi semula." -ForegroundColor Gray
