@echo off
title Cek Status ^& Diagnostik OpenSSH Server Target
color 0B

net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Memerlukan hak Administrator untuk membaca status dan service...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

cd /d "%~dp0"

echo ===============================================================================
echo   PENGECEKAN KONEKSI ^& DIAGNOSTIK STATUS OPENSSH TARGET
echo ===============================================================================
echo.

echo [1] Status Layanan Windows (sshd):
powershell -NoProfile -Command "$s = Get-Service sshd -ErrorAction SilentlyContinue; if ($s) { Write-Host '    Status :' $s.Status -ForegroundColor (if ($s.Status -eq 'Running') {'Green'} else {'Red'}); Write-Host '    Path   :' (Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Services\sshd' -ErrorAction SilentlyContinue).ImagePath } else { Write-Host '    Layanan sshd BELUM TERPASANG!' -ForegroundColor Red }"
echo.

echo [2] Uji Biner ^& File Konfigurasi sshd:
powershell -NoProfile -Command "$bin = if (Test-Path 'C:\Program Files\OpenSSH\sshd.exe') {'C:\Program Files\OpenSSH\sshd.exe'} elseif (Test-Path 'C:\Windows\System32\OpenSSH\sshd.exe') {'C:\Windows\System32\OpenSSH\sshd.exe'} else {$null}; if ($bin) { Write-Host '    Biner terdeteksi:' $bin; $t = & $bin -t 2>&1; if ($LASTEXITCODE -eq 0) { Write-Host '    [OK] Konfigurasi sshd_config & Host Keys VALID' -ForegroundColor Green } else { Write-Host '    [ERROR] Pesan uji sshd -t:' -ForegroundColor Yellow; Write-Host $t } } else { Write-Host '    [ERROR] Biner sshd.exe tidak ditemukan!' -ForegroundColor Red }"
echo.

echo [3] Memeriksa Port 3000 (Listening):
powershell -NoProfile -Command "$c = Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue; if ($c) { Write-Host '    [OK] Port 3000 AKTIF mendengarkan koneksi pada IP:' $c.LocalAddress -ForegroundColor Green } else { Write-Host '    [X] Port 3000 TIDAK AKTIF / BELUM LISTENING' -ForegroundColor Red }"
echo.

echo [4] Memeriksa Windows Defender Firewall (Port 3000):
powershell -NoProfile -Command "$fw = Get-NetFirewallRule -Name 'OpenSSH-Server-In-Dashboard-ReadOnly-3000' -ErrorAction SilentlyContinue; if ($fw -and $fw.Enabled -eq 'True') { Write-Host '    [OK] Firewall Rule Port 3000 AKTIF' -ForegroundColor Green } else { Write-Host '    [WARNING] Firewall Rule Port 3000 belum aktif' -ForegroundColor Yellow }"
echo.

echo [5] Profil Jaringan Komputer Ini:
powershell -NoProfile -Command "Get-NetConnectionProfile | Select-Object Name, NetworkCategory | Format-Table -AutoSize"
echo.

echo [6] IP Address Wi-Fi Komputer Ini:
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias '*Wi-Fi*' -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notmatch '^(169\.254|127\.)' } | Select-Object InterfaceAlias, IPAddress | Format-Table -AutoSize"
echo.

echo [7] Log Error Terakhir (OpenSSH/Operational):
powershell -NoProfile -Command "try { Get-WinEvent -LogName 'OpenSSH/Operational' -MaxEvents 3 -ErrorAction Stop | Select-Object TimeCreated, Message | Format-List } catch { Write-Host '    (Tidak ada log error OpenSSH tercatat)' -ForegroundColor Gray }"
echo.

echo ===============================================================================
echo   PENGECEKAN SELESAI.
echo ===============================================================================
pause
