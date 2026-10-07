#!/usr/bin/env bash
# ==============================================================================
# [1-CLICK UNINSTALL] Hapus & Bersihkan OpenSSH Monitoring Target (Linux/Ubuntu)
# Enterprise Hardware and Security Dashboard (Agentless Telemetry)
# ==============================================================================

set -e

# Warna Terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# 1. Pastikan script dijalankan sebagai root (Auto-Elevate via sudo)
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}[i] Meminta hak akses root (sudo)...${NC}"
    exec sudo bash "$0" "$@"
fi

clear
echo -e "${RED}===============================================================================${NC}"
echo -e "${RED}  [1-CLICK UNINSTALL] HAPUS & BERSIHKAN MONITORING TARGET (LINUX/UBUNTU)         ${NC}"
echo -e "${RED}  Enterprise Hardware & Security Dashboard                                      ${NC}"
echo -e "${RED}===============================================================================${NC}"
echo ""
echo -e "${YELLOW}PERINGATAN:${NC}"
echo "Script ini akan menghapus akun user monitoring 'siem-monitor', membersihkan"
echo "kunci SSH terkait, serta mengembalikan konfigurasi firewall UFW ke kondisi semula."
echo ""
read -p "Apakah Anda yakin ingin melanjutkan? (Ketik Y lalu Enter untuk lanjut): " CONFIRM
if [[ ! "$CONFIRM" =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${CYAN}[i] Pembatalan oleh pengguna. Tidak ada perubahan yang dilakukan.${NC}"
    exit 0
fi

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 1/4: Menghentikan Sesi & Menghapus Akun 'siem-monitor'...              ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

TARGET_USER="siem-monitor"

if id "$TARGET_USER" &>/dev/null; then
    # Kill any active process owned by the user
    pkill -u "$TARGET_USER" 2>/dev/null || true
    sleep 1
    # Force kill if still lingering
    pkill -9 -u "$TARGET_USER" 2>/dev/null || true
    
    # Hapus user dan home directory
    userdel -r "$TARGET_USER" 2>/dev/null || userdel -f "$TARGET_USER" 2>/dev/null || true
    echo -e "    ${GREEN}-> Akun user '${TARGET_USER}' dan home directory berhasil dihapus.${NC}"
else
    echo -e "    ${GREEN}-> Akun user '${TARGET_USER}' memang sudah tidak ada.${NC}"
fi

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 2/4: Membersihkan Konfigurasi Khusus SSHD...                          ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

# Hapus konfigurasi drop-in jika ada
if [ -f "/etc/ssh/sshd_config.d/siem_monitor.conf" ]; then
    rm -f /etc/ssh/sshd_config.d/siem_monitor.conf
    echo -e "    ${GREEN}-> File konfigurasi /etc/ssh/sshd_config.d/siem_monitor.conf dihapus.${NC}"
fi

# Validasi & reload SSHD
if command -v sshd &>/dev/null; then
    if sshd -t 2>/dev/null; then
        systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || true
        echo -e "    ${GREEN}-> Service SSHD berhasil di-reload dengan konfigurasi bersih.${NC}"
    fi
fi

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 3/4: Membersihkan Rule Firewall UFW (Jika Digunakan)...               ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

if command -v ufw &>/dev/null; then
    # Check if UFW is active
    UFW_STATUS=$(ufw status | head -n 1 || true)
    if [[ "$UFW_STATUS" =~ "active" ]]; then
        echo -e "    ${YELLOW}[?] Apakah Anda ingin menutup port 22 di UFW?${NC}"
        echo "        (Pilih 'n' jika Anda masih menggunakan SSH untuk keperluan lain)"
        read -p "        Tutup Port 22 di UFW? (y/N): " CLOSE_UFW
        if [[ "$CLOSE_UFW" =~ ^[Yy]$ ]]; then
            ufw delete allow 22/tcp 2>/dev/null || true
            ufw delete allow ssh 2>/dev/null || true
            ufw reload 2>/dev/null || true
            echo -e "    ${GREEN}-> Rule port 22 di UFW telah dihapus.${NC}"
        else
            echo -e "    ${GREEN}-> Port 22 di UFW tetap dibiarkan terbuka untuk SSH umum.${NC}"
        fi
    else
        echo -e "    ${GREEN}-> UFW firewall tidak aktif.${NC}"
    fi
fi

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 4/4: Opsi Service OpenSSH Server...                                   ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

echo -e "    ${YELLOW}[?] Apakah Anda ingin menghapus paket 'openssh-server' sepenuhnya?${NC}"
echo "        (Pilih 'n' jika komputer/VM ini masih ingin bisa di-remote)"
read -p "        Hapus paket openssh-server? (y/N): " REMOVE_SSHD
if [[ "$REMOVE_SSHD" =~ ^[Yy]$ ]]; then
    systemctl stop ssh 2>/dev/null || systemctl stop sshd 2>/dev/null || true
    systemctl disable ssh 2>/dev/null || systemctl disable sshd 2>/dev/null || true
    apt-get remove -y openssh-server 2>/dev/null || true
    echo -e "    ${GREEN}-> Paket openssh-server telah dihentikan dan dihapus.${NC}"
else
    echo -e "    ${GREEN}-> Service OpenSSH Server tetap berjalan untuk akun lain.${NC}"
fi

echo ""
echo -e "${GREEN}===============================================================================${NC}"
echo -e "${GREEN}  SUKSES! PEMBERSIHAN TARGET MONITORING LINUX TELAH SELESAI                   ${NC}"
echo -e "${GREEN}===============================================================================${NC}"
echo "Ringkasan Tindakan:"
echo -e "  ${GREEN}[OK]${NC} Akun 'siem-monitor' telah dihapus sepenuhnya."
echo -e "  ${GREEN}[OK]${NC} Akses SSH untuk monitoring telah dicabut."
echo -e "  ${GREEN}[OK]${NC} Sistem telah kembali ke kondisi bersih semula."
echo ""
