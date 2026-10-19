#!/bin/bash
# ===============================================================================
# [1-CLICK UNINSTALL] OpenSSH Server TARGET (LINUX)
# ===============================================================================

set -e

if [ "$EUID" -ne 0 ]; then
    echo "==============================================================================="
    echo "  [PERINGATAN] Script uninstalasi membutuhkan hak akses root."
    echo "  Mencoba menjalankan ulang menggunakan 'sudo'..."
    echo "==============================================================================="
    exec sudo bash "$0" "$@"
fi

TARGET_PORT="${1:-${SSH_TARGET_PORT:-22}}"
MONITOR_USER="siem-monitor"

echo "==============================================================================="
echo "  [OFFLINE READY] UNINSTALL OPENSSH READ-ONLY MONITORING (LINUX)"
echo "==============================================================================="

# 1. Hapus User siem-monitor
echo "[1/4] Menghapus user '$MONITOR_USER'..."
if id "$MONITOR_USER" >/dev/null 2>&1; then
    pkill -u "$MONITOR_USER" >/dev/null 2>&1 || true
    if command -v userdel >/dev/null 2>&1; then
        userdel -r "$MONITOR_USER" 2>/dev/null || userdel "$MONITOR_USER" 2>/dev/null || true
    elif command -v deluser >/dev/null 2>&1; then
        deluser --remove-home "$MONITOR_USER" 2>/dev/null || deluser "$MONITOR_USER" 2>/dev/null || true
    fi
    echo "    [OK] User '$MONITOR_USER' berhasil dihapus."
fi

# 2. Hapus Konfigurasi SSH
echo "[2/4] Membersihkan konfigurasi drop-in OpenSSH..."
CONFIG_FILE="/etc/ssh/sshd_config.d/99-siem-readonly.conf"
if [ -f "$CONFIG_FILE" ]; then
    rm -f "$CONFIG_FILE"
    echo "    [OK] File konfigurasi $CONFIG_FILE dihapus."
fi

# 3. Hapus Firewall Rule
echo "[3/4] Menghapus aturan firewall..."
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
    ufw delete allow "$TARGET_PORT/tcp" >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1 && systemctl is-active --quiet firewalld; then
    firewall-cmd --remove-port="$TARGET_PORT/tcp" --permanent >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

# 4. Restart SSH Daemon
echo "[4/4] Memuat ulang daemon OpenSSH..."
if command -v systemctl >/dev/null 2>&1; then
    systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
elif command -v service >/dev/null 2>&1; then
    service ssh restart 2>/dev/null || service sshd restart 2>/dev/null || true
fi

echo ""
echo "==============================================================================="
echo "  [SUKSES] UNINSTALL SELESAI"
echo "==============================================================================="
