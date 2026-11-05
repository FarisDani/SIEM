@echo off
title Cek Status & Diagnostik OpenSSH Server Target
color 0B
echo ===============================================================================
echo   PENGECEKAN KONEKSI & DIAGNOSTIK STATUS OPENSSH TARGET
echo ===============================================================================
echo.

:: 1. Cek Status Layanan SSHD
echo [1] Memeriksa Status Layanan Windows (sshd)...
powershell -NoProfile -Command "$s = Get-Service sshd -ErrorAction SilentlyContinue; if ($s) { Write-Host '    Status Layanan SSHD :' $s.Status -ForegroundColor (if ($s.Status -eq 'Running') {'Green'} else {'Red'}); if ($s.Status -ne 'Running') { Write-Host '    -> Mencoba memulai layanan sshd...' -ForegroundColor Yellow; net start sshd } } else { Write-Host '    Layanan sshd BELUM TERPASANG!' -ForegroundColor Red }"
echo.

:: 2. Uji Konfigurasi & Host Keys SSHD
echo [2] Menguji Validitas Host Keys & sshd_config...
powershell -NoProfile -Command "$bin = if (Test-Path 'C:\Program Files\OpenSSH\sshd.exe') {'C:\Program Files\OpenSSH\sshd.exe'} elseif (Test-Path 'C:\Windows\System32\OpenSSH\sshd.exe') {'C:\Windows\System32\OpenSSH\sshd.exe'} else {$null}; if ($bin) { $t = & $bin -t 2>&1; if ($LASTEXITCODE -eq 0) { Write-Host '    [OK] File konfigurasi dan Host Keys VALID.' -ForegroundColor Green } else { Write-Host '    [PERHATIAN] Pesan dari sshd test:' -ForegroundColor Yellow; Write-Host $t } } else { Write-Host '    Biner sshd.exe tidak ditemukan.' -ForegroundColor Red }"
echo.

:: 3. Cek Port 3000 Listening
echo [3] Memeriksa Port 3000 yang Sedang Mendengarkan (Listening)...
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($c) { Write-Host '    [OK] Port 3000 AKTIF mendengarkan koneksi pada IP:' $c.LocalAddress -ForegroundColor Green } else { Write-Host '    [X] Port 3000 BELUM AKTIF / TIDAK MENDENGARKAN!' -ForegroundColor Red; Write-Host '        (Jika layanan SSHD stopped, jalankan setup_windows_readonly.bat dengan Run as Administrator)' -ForegroundColor Gray }"
echo.

:: 4. Cek Firewall Rule Port 3000
echo [4] Memeriksa Windows Defender Firewall Rule (Port 3000)...
powershell -NoProfile -Command "$fw = Get-NetFirewallRule -Name 'OpenSSH-Server-In-Dashboard-ReadOnly-3000' -ErrorAction SilentlyContinue; if ($fw -and $fw.Enabled -eq 'True') { Write-Host '    [OK] Firewall Rule Port 3000 AKTIF dan MENGIZINKAN koneksi.' -ForegroundColor Green } else { Write-Host '    [WARNING] Firewall Rule Port 3000 belum aktif atau terblokir.' -ForegroundColor Yellow }"
echo.

:: 5. Cek Profil Jaringan
echo [5] Memeriksa Profil Jaringan (Private vs Public)...
powershell -NoProfile -Command "Get-NetConnectionProfile | ForEach-Object { Write-Host '    Jaringan      :' $_.Name; Write-Host '    Tipe Kategori :' $_.NetworkCategory -ForegroundColor (if ($_.NetworkCategory -eq 'Private') {'Green'} else {'Yellow'}) }"
echo.

:: 6. Tampilkan IP Wi-Fi yang Harus Dipakai
echo [6] IP Address Wi-Fi Komputer Ini (Gunakan IP ini di Dashboard):
powershell -NoProfile -Command "$wifi = Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias '*Wi-Fi*' -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(169\.254|127\.)' }; if ($wifi) { foreach ($w in $wifi) { Write-Host '    [IP WI-FI AKTIF] ->' $w.IPAddress -ForegroundColor Green } } else { Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -notmatch 'Loopback|vEthernet' } | ForEach-Object { Write-Host '    Interface :' $_.InterfaceAlias '| IP :' $_.IPAddress } }"
echo.

echo ===============================================================================
echo   Jika Status Layanan SSHD 'Stopped', silakan klik kanan
echo   'setup_windows_readonly.bat' -> 'Run as administrator' sekali lagi.
echo ===============================================================================
pause
