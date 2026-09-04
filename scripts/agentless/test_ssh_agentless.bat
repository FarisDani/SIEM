@echo off
title Uji Konektivitas SSH ke Target Agentless
color 0e

echo ======================================================================
echo       UJI KONEKSI SSH KE TARGET WAZUH AGENTLESS MONITORING
echo ======================================================================
echo.

set /p TARGET_IP="Masukkan Alamat IP Laptop/Target (contoh: 192.168.27.50): "
if "%TARGET_IP%"=="" (
    echo [!] Alamat IP tidak boleh kosong.
    pause
    exit /b
)

set /p TARGET_USER="Masukkan Username SSH (default: wazuh_ssh): "
if "%TARGET_USER%"=="" set TARGET_USER=wazuh_ssh

echo.
echo [*] Memeriksa apakah Port 22 (SSH) di %TARGET_IP% terbuka...
powershell -NoProfile -Command "$t = Test-NetConnection -ComputerName '%TARGET_IP%' -Port 22; if ($t.TcpTestSucceeded) { Write-Host '✅ Port 22 SSH TERBUKA & DAPAT DIAKSES!' -ForegroundColor Green } else { Write-Host '❌ Port 22 GAGAL DIAKSES. Pastikan SSHD aktif & Firewall mengizinkan.' -ForegroundColor Red }"

echo.
echo [*] Menguji koneksi SSH dari Host ke %TARGET_USER%@%TARGET_IP%...
ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no %TARGET_USER%@%TARGET_IP% "echo ✅ Otentikasi SSH Berhasil! Hostname Target: $(hostname)"

echo.
echo ======================================================================
echo Selesai pengujian.
echo ======================================================================
pause
