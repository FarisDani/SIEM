#!/usr/bin/env bash
# ==============================================================================
# [1-CLICK SETUP] OpenSSH Server TARGET - STRICT READ-ONLY (LINUX)
# Enterprise Hardware and Security Dashboard (Agentless Telemetry)
# Dedicated Account: siem-monitor (100% Non-Root / Least Privilege)
# ==============================================================================

set -e

# Terminal Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# 1. Pastikan script berjalan sebagai root (Auto-Elevate via sudo)
if [ "$EUID" -ne 0 ]; then
    echo -e "${YELLOW}[i] Meminta hak akses root (sudo)...${NC}"
    exec sudo bash "$0" "$@"
fi

clear
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  [1-CLICK SETUP] OPENSSH TARGET STRICT READ-ONLY (LINUX/UBUNTU/DEBIAN)        ${NC}"
echo -e "${CYAN}  Akun Khusus: siem-monitor (Non-Root / Non-Sudo / Least Privilege)             ${NC}"
echo -e "${CYAN}===============================================================================${NC}"
echo ""

# Konfigurasi Default
TARGET_USER="siem-monitor"
DEFAULT_PASS="Siem@Indriati2026!"
DEFAULT_PORT=22

# Input Port
read -p "Masukkan Port SSH [Tekan ENTER untuk Port 22 default]: " INPUT_PORT
SSH_PORT=${INPUT_PORT:-$DEFAULT_PORT}

# Input Password
echo -e "Password standar monitoring: ${YELLOW}${DEFAULT_PASS}${NC}"
read -p "Gunakan password standar atau masukkan password baru [ENTER untuk standar]: " INPUT_PASS
SSH_PASS=${INPUT_PASS:-$DEFAULT_PASS}

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 1/5: Memeriksa dan Memasang OpenSSH Server...                         ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

if ! command -v sshd &>/dev/null; then
    echo -e "${YELLOW}    -> Mengunduh dan memasang paket OpenSSH Server...${NC}"
    if command -v apt-get &>/dev/null; then
        apt-get update -y && apt-get install -y openssh-server
    elif command -v dnf &>/dev/null; then
        dnf install -y openssh-server
    elif command -v yum &>/dev/null; then
        yum install -y openssh-server
    elif command -v pacman &>/dev/null; then
        pacman -Sy --noconfirm openssh
    else
        echo -e "${RED}[!] Paket manager tidak didukung otomatis. Silakan pasang openssh-server manual.${NC}"
        exit 1
    fi
    echo -e "${GREEN}    -> OpenSSH Server berhasil dipasang.${NC}"
else
    echo -e "${GREEN}    -> OpenSSH Server (sshd) sudah terpasang.${NC}"
fi

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 2/5: Menyiapkan Akun Khusus '${TARGET_USER}' (Strict Read-Only)...     ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

if id "$TARGET_USER" &>/dev/null; then
    echo -e "${YELLOW}    -> User '${TARGET_USER}' sudah ada. Memperbarui kredensial...${NC}"
    echo "${TARGET_USER}:${SSH_PASS}" | chpasswd
else
    echo -e "${YELLOW}    -> Membuat akun user baru '${TARGET_USER}' (Shell: /bin/bash)...${NC}"
    useradd -m -s /bin/bash "$TARGET_USER"
    echo "${TARGET_USER}:${SSH_PASS}" | chpasswd
fi

# Pastikan user TIDAK memiliki akses sudo/root (Least Privilege)
echo -e "${YELLOW}    -> Memastikan user '${TARGET_USER}' BUKAN anggota grup sudo/wheel...${NC}"
gpasswd -d "$TARGET_USER" sudo 2>/dev/null || true
gpasswd -d "$TARGET_USER" wheel 2>/dev/null || true
gpasswd -d "$TARGET_USER" root 2>/dev/null || true

# Tambahkan ke grup telemetry sistem jika ada (adm, systemd-journal untuk pembacaan log aman non-root)
for grp in adm systemd-journal; do
    if getent group "$grp" &>/dev/null; then
        usermod -aG "$grp" "$TARGET_USER" 2>/dev/null || true
    fi
done
echo -e "${GREEN}    -> Akun '${TARGET_USER}' berhasil disetup dengan hak akses Strict Read-Only.${NC}"

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 3/5: Menyiapkan Folder SSH & Authorized Keys...                       ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

USER_HOME=$(eval echo "~$TARGET_USER")
SSH_DIR="${USER_HOME}/.ssh"
mkdir -p "$SSH_DIR"
touch "${SSH_DIR}/authorized_keys"
chown -R "${TARGET_USER}:${TARGET_USER}" "$SSH_DIR"
chmod 700 "$SSH_DIR"
chmod 600 "${SSH_DIR}/authorized_keys"
echo -e "${GREEN}    -> Direktori ~/.ssh/ dan authorized_keys berhasil diamankan (chmod 700/600).${NC}"

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 4/5: Mengonfigurasi & Mengaktifkan Service SSHD...                     ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

# Buat drop-in config jika sshd mendukung sshd_config.d
if [ -d "/etc/ssh/sshd_config.d" ]; then
    cat <<EOF > /etc/ssh/sshd_config.d/siem_monitor.conf
# SIEM Agentless Read-Only Monitor Configuration
Match User ${TARGET_USER}
    PasswordAuthentication yes
    PubkeyAuthentication yes
    AllowTcpForwarding no
    X11Forwarding no
EOF
    echo -e "${GREEN}    -> Konfigurasi drop-in /etc/ssh/sshd_config.d/siem_monitor.conf dibuat.${NC}"
fi

# Enable & restart SSHD service
if systemctl list-unit-files | grep -q "^ssh\.service"; then
    systemctl enable ssh >/dev/null 2>&1 || true
    systemctl restart ssh
elif systemctl list-unit-files | grep -q "^sshd\.service"; then
    systemctl enable sshd >/dev/null 2>&1 || true
    systemctl restart sshd
else
    service ssh restart 2>/dev/null || service sshd restart 2>/dev/null || true
fi
echo -e "${GREEN}    -> Service SSHD berhasil di-restart dan aktif.${NC}"

echo ""
echo -e "${CYAN}===============================================================================${NC}"
echo -e "${CYAN}  LANGKAH 5/5: Menyesuaikan Firewall (UFW / Firewalld)...                       ${NC}"
echo -e "${CYAN}===============================================================================${NC}"

if command -v ufw &>/dev/null; then
    UFW_STATUS=$(ufw status | head -n 1 || true)
    if [[ "$UFW_STATUS" =~ "active" ]]; then
        ufw allow "${SSH_PORT}/tcp" comment "SIEM Monitoring SSH" >/dev/null 2>&1 || true
        echo -e "${GREEN}    -> Port ${SSH_PORT}/tcp berhasil diizinkan di UFW.${NC}"
    fi
elif command -v firewall-cmd &>/dev/null; then
    firewall-cmd --add-port="${SSH_PORT}/tcp" --permanent >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
    echo -e "${GREEN}    -> Port ${SSH_PORT}/tcp berhasil diizinkan di Firewalld.${NC}"
fi

# Dapatkan IP Target
IP_LIST=$(hostname -I 2>/dev/null || ip addr show | awk '/inet / {print $2}' | cut -d/ -f1 | grep -v '127.0.0.1' || true)
PRIMARY_IP=$(echo "$IP_LIST" | awk '{print $1}')

echo ""
echo -e "${GREEN}===============================================================================${NC}"
echo -e "${GREEN}  SUKSES! TARGET LINUX SIAP DIMONITOR SECARA READ-ONLY                        ${NC}"
echo -e "${GREEN}===============================================================================${NC}"
echo ""
echo -e "Kredensial untuk dimasukkan ke Dashboard SIEM:"
echo -e "  * IP Address Target : ${CYAN}${PRIMARY_IP}${NC}"
echo -e "  * Port SSH          : ${CYAN}${SSH_PORT}${NC}"
echo -e "  * Username          : ${CYAN}${TARGET_USER}${NC}"
echo -e "  * Password          : ${CYAN}${SSH_PASS}${NC}"
echo -e "  * Privilese         : ${GREEN}Strict Read-Only (Non-Root, Non-Sudo)${NC}"
echo ""
echo -e "${YELLOW}Catatan:${NC} Untuk menghapus konfigurasi ini kapan saja, cukup jalankan:"
echo -e "         ${CYAN}sudo bash uninstall_target_ssh_linux_1click.sh${NC}"
echo "==============================================================================="
