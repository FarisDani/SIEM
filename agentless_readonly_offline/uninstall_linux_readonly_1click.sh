#!/bin/bash
# ===============================================================================
# [1-CLICK UNINSTALL] OpenSSH Server TARGET (LINUX)
# Memutuskan koneksi dashboard seketika & menghapus user secara bersih
# ===============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
    echo "==============================================================================="
    echo "  [PERINGATAN] Script uninstalasi membutuhkan hak akses root."
    echo "  Mencoba menjalankan ulang menggunakan 'sudo'..."
    echo "==============================================================================="
    exec sudo bash "$0" "$@"
fi

ARG_PORT="$1"
ARG_USER="$2"

echo "==============================================================================="
echo "  [OFFLINE READY] UNINSTALL OPENSSH READ-ONLY MONITORING (LINUX)"
echo "==============================================================================="
echo ""

if [ -n "$ARG_USER" ]; then
    MONITOR_USER="$ARG_USER"
elif [ -t 0 ]; then
    read -r -p "Masukkan Username Monitoring yang ingin dihapus [Tekan ENTER untuk default siem-monitor]: " INPUT_USER
    MONITOR_USER="${INPUT_USER:-${SSH_TARGET_USER:-siem-monitor}}"
else
    MONITOR_USER="${SSH_TARGET_USER:-siem-monitor}"
fi

if [ -n "$ARG_PORT" ]; then
    TARGET_PORT="$ARG_PORT"
elif [ -t 0 ]; then
    read -r -p "Masukkan Port SSH yang ingin dibersihkan [Tekan ENTER untuk default 3000]: " INPUT_PORT
    TARGET_PORT="${INPUT_PORT:-${SSH_TARGET_PORT:-3000}}"
else
    TARGET_PORT="${SSH_TARGET_PORT:-3000}"
fi

echo ""
echo "==============================================================================="
echo "  Target Uninstalasi:"
echo "    - Username : $MONITOR_USER"
echo "    - Port SSH : $TARGET_PORT"
echo "==============================================================================="
echo ""

# 1. Hapus User & Putus Sesi Seketika
echo "[1/4] Memutuskan sesi aktif dan menghapus akun '$MONITOR_USER'..."
if id "$MONITOR_USER" >/dev/null 2>&1; then
    # Kunci akun agar tidak bisa autentikasi lagi detik ini juga
    passwd -l "$MONITOR_USER" >/dev/null 2>&1 || usermod -L "$MONITOR_USER" >/dev/null 2>&1 || true

    # Hapus file kredensial SSH
    rm -rf "/home/$MONITOR_USER/.ssh" >/dev/null 2>&1 || true

    # Bunuh paksa seluruh proses dan koneksi SSH aktif detik ini
    pkill -9 -u "$MONITOR_USER" >/dev/null 2>&1 || true
    sleep 1

    # Hapus user secara paksa (-f / force dan -r / remove home)
    if command -v userdel >/dev/null 2>&1; then
        userdel -r -f "$MONITOR_USER" >/dev/null 2>&1 || userdel -f "$MONITOR_USER" >/dev/null 2>&1 || true
    elif command -v deluser >/dev/null 2>&1; then
        deluser --remove-home "$MONITOR_USER" >/dev/null 2>&1 || deluser "$MONITOR_USER" >/dev/null 2>&1 || true
    fi

    # Bersihkan sisa home directory jika masih tertinggal
    rm -rf "/home/$MONITOR_USER" >/dev/null 2>&1 || true

    # Verifikasi apakah benar-benar terhapus
    if id "$MONITOR_USER" >/dev/null 2>&1; then
        pkill -9 -u "$MONITOR_USER" >/dev/null 2>&1 || true
        userdel -f "$MONITOR_USER" >/dev/null 2>&1 || true
    fi

    if id "$MONITOR_USER" >/dev/null 2>&1; then
        echo "    [GAGAL] User '$MONITOR_USER' masih belum terhapus dari sistem."
        exit 1
    else
        echo "    [OK] User '$MONITOR_USER' dan koneksi dashboard telah diputus & dihapus."
    fi
else
    echo "    [INFO] User '$MONITOR_USER' sudah tidak ada di sistem."
fi

# 2. Hapus Drop-in Config SSH
echo "[2/4] Membersihkan file konfigurasi OpenSSH..."
rm -f /etc/ssh/sshd_config.d/*siem*.conf >/dev/null 2>&1 || true
rm -f /etc/ssh/sshd_config.d/99-siem-readonly.conf >/dev/null 2>&1 || true
rm -f /etc/ssh/sshd_config.d/siem_monitor.conf >/dev/null 2>&1 || true
echo "    [OK] Konfigurasi monitoring OpenSSH dibersihkan."

# 3. Hapus Firewall Rule
echo "[3/4] Menghapus aturan firewall port $TARGET_PORT..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw delete allow "$TARGET_PORT/tcp" >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    firewall-cmd --remove-port="$TARGET_PORT/tcp" --permanent >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

# 4. Restart SSH Daemon agar semua sesi gantung & konfigurasi lama terlepas
echo "[4/4] Merestart service OpenSSH..."
if command -v systemctl >/dev/null 2>&1; then
    systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
elif command -v service >/dev/null 2>&1; then
    service ssh restart 2>/dev/null || service sshd restart 2>/dev/null || true
fi

echo ""
echo "==============================================================================="
echo "  [SUKSES] UNINSTALL SELESAI"
echo "  Koneksi SSH monitoring telah terputus seketika (status dashboard: DISCONNECTED)."
echo "==============================================================================="
