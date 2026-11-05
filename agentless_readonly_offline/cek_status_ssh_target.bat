@echo off
title Cek Status OpenSSH Server Target
color 0B
echo ===============================================================================
echo   PENGECEKAN KONEKSI ^& STATUS OPENSSH TARGET
echo ===============================================================================
echo.

echo [1] Memeriksa Status Layanan Windows (sshd)...
powershell -NoProfile -Command "$s = Get-Service sshd -ErrorAction SilentlyContinue; if ($s) { Write-Host '    Status Layanan SSHD :' $s.Status -ForegroundColor (if ($s.Status -eq 'Running') {'Green'} else {'Red'}) } else { Write-Host '    Layanan sshd BELUM TERPASANG!' -ForegroundColor Red }"
echo.

echo [2] Memeriksa Port 3000 yang Sedang Mendengarkan (Listening)...
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($c) { Write-Host '    [OK] Port 3000 AKTIF mendengarkan koneksi pada IP:' $c.LocalAddress -ForegroundColor Green } else { Write-Host '    [X] Port 3000 TIDAK AKTIF mendengarkan koneksi!' -ForegroundColor Red }"
echo.

echo [3] Memeriksa Profil Jaringan (Private vs Public)...
powershell -NoProfile -Command "Get-NetConnectionProfile | ForEach-Object { Write-Host '    Network Name :' $_.Name; Write-Host '    Category     :' $_.NetworkCategory -ForegroundColor (if ($_.NetworkCategory -eq 'Private') {'Green'} else {'Yellow'}) }"
echo.

echo [4] Menampilkan IP Address Aktif Komputer Ini...
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' } | ForEach-Object { Write-Host '    Interface :' $_.InterfaceAlias '| IP :' $_.IPAddress }"
echo.

echo ===============================================================================
pause
