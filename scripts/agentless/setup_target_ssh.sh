#!/usr/bin/env bash
# ==============================================================================
# Script Setup OpenSSH Target untuk Wazuh Agentless Monitoring (Linux/Ubuntu)
# ==============================================================================

set -e

echo "=== [1/4] Memeriksa instalasi OpenSSH Server ==="
if ! command -v sshd &> /dev/null; then
    echo "Menginstall openssh-server..."
    sudo apt-get update && sudo apt-get install -y openssh-server
fi

echo "=== [2/4] Membuat user 'wazuh_ssh' untuk monitoring ==="
if id "wazuh_ssh" &>/dev/null; then
    echo "User wazuh_ssh sudah ada."
else
    sudo useradd -m -s /bin/bash wazuh_ssh
    echo "User wazuh_ssh berhasil dibuat."
fi

echo "=== [3/4] Menyiapkan direktori SSH dan permission ==="
sudo mkdir -p /home/wazuh_ssh/.ssh
sudo touch /home/wazuh_ssh/.ssh/authorized_keys
sudo chown -R wazuh_ssh:wazuh_ssh /home/wazuh_ssh/.ssh
sudo chmod 700 /home/wazuh_ssh/.ssh
sudo chmod 600 /home/wazuh_ssh/.ssh/authorized_keys

echo "=== [4/4] Memastikan service sshd aktif ==="
sudo systemctl enable ssh
sudo systemctl restart ssh

IP_ADDR=$(hostname -I | awk '{print $1}')
echo "=============================================================================="
echo "✅ Target Linux Siap untuk Wazuh Agentless!"
echo "👉 Alamat IP Target: $IP_ADDR"
echo "👉 User SSH:        wazuh_ssh"
echo "👉 Tempelkan Public Key dari Wazuh ke file: /home/wazuh_ssh/.ssh/authorized_keys"
echo "=============================================================================="
