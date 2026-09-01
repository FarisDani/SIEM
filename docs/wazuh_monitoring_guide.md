# Panduan Lengkap Automasi Monitoring OS dengan Wazuh SIEM
**RS Indriati Boyolali — IT Infrastructure & Security**

Dokumen ini berisi panduan langkah demi langkah (Step-by-Step) instalasi, konfigurasi, dan pengoperasian **Wazuh SIEM** untuk monitoring sistem operasi (OS Monitoring) target **Ubuntu 22 VM** dari host **Windows 11**.

---

## 1. Arsitektur & Topologi

```
┌─────────────────────────────────────────────────────────────┐
│ HOST: Windows 11 (IP: 192.168.27.42)                        │
│                                                             │
│  ┌─── Docker Engine ─────────────────────────────────────┐  │
│  │  • Wazuh Indexer   (:9200) - OpenSearch Storage       │  │
│  │  • Wazuh Manager   (:1514 Event, :1515 Auth, :55000) │  │
│  │  • Wazuh Dashboard (:443 HTTPS) - Web UI              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              ▲
                              │ Port 1514 (TCP/UDP) & 1515 (TCP)
                              │
┌─────────────────────────────┴───────────────────────────────┐
│ TARGET: Ubuntu 22 LTS (VirtualBox VM)                       │
│                                                             │
│  ┌─── Wazuh Agent Service ───────────────────────────────┐  │
│  │  • Log Collection (syslog, auth.log)                  │  │
│  │  • File Integrity Monitoring / FIM (/etc, /bin, dll)  │  │
│  │  • System Inventory (Hardware, Software, Ports)       │  │
│  │  • Security Configuration Assessment (CIS Benchmark) │  │
│  │  • Vulnerability Scanner                              │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Langkah 1: Menjalankan Wazuh Server di Host (Windows 11)

### A. Buka Docker Desktop
1. Buka aplikasi **Docker Desktop** dari Start Menu atau Desktop.
2. Pastikan indikator di pojok kiri bawah berwarna **Hijau** (*Engine running*).

### B. Generate SSL Certificates (Hanya 1x di awal - *Sudah Selesai*)
Sertifikat komunikasi internal sudah di-generate di folder `wazuh-docker/single-node/config/wazuh_indexer_ssl_certs/`.

Jika di kemudian hari perlu generate ulang:
```powershell
cd D:\Faris\Github\SEIM\wazuh-docker\single-node
docker compose -f generate-indexer-certs.yml run --rm generator
```

### C. Menjalankan Container Wazuh
Buka PowerShell / Terminal di direktori project:
```powershell
cd D:\Faris\Github\SEIM\wazuh-docker\single-node
docker compose up -d
```

Verifikasi container sudah berjalan:
```powershell
docker compose ps
```
Pastikan 3 service berikut berstatus `Up`:
- `single-node-wazuh.indexer-1`
- `single-node-wazuh.manager-1`
- `single-node-wazuh.dashboard-1`

### D. Mengakses Web Dashboard Wazuh
1. Buka browser (Chrome / Edge / Firefox).
2. Akses URL: **`https://localhost`** atau **`https://192.168.27.42`**
3. Jika muncul peringatan SSL (*Your connection is not private*), klik **Advanced** → **Proceed to localhost (unsafe)**.
4. Login menggunakan kredensial default:
   - **Username**: `admin`
   - **Password**: `SecretPassword`

---

## 3. Langkah 2: Konfigurasi Jaringan VM Ubuntu 22 (VirtualBox)

Agar VM Ubuntu dapat mengirim log ke Wazuh Manager di host Windows (`192.168.27.42`), jaringan VirtualBox harus dikonfigurasi:

### Opsi Rekomendasi: Bridged Adapter
1. Buka **VirtualBox Manager**.
2. Klik VM **Ubuntu 22** → klik **Settings** (Pengaturan).
3. Pilih menu **Network** (Jaringan) → **Adapter 1**:
   - **Attached to**: `Bridged Adapter`
   - **Name**: Pilih adapter Wi-Fi atau Ethernet PC Anda yang aktif.
   - **Promiscuous Mode**: `Allow All`
4. Klik **OK** dan nyalakan/restart VM Ubuntu.

### Verifikasi Konektivitas dari Ubuntu VM ke Host:
Masuk ke terminal Ubuntu VM dan jalankan:
```bash
# Test ping ke IP Windows Host
ping -c 4 192.168.27.42

# Test akses port Wazuh Manager (1514 & 1515)
nc -zvw3 192.168.27.42 1514
nc -zvw3 192.168.27.42 1515
```
> **Catatan Windows Firewall**: Jika port 1514/1515 terblokir, buka port tersebut di Windows Firewall dengan menjalankan perintah ini di PowerShell (Run as Administrator):
> ```powershell
> New-NetFirewallRule -DisplayName "Wazuh Agent Ports" -Direction Inbound -LocalPort 1514,1515 -Protocol TCP -Action Allow
> New-NetFirewallRule -DisplayName "Wazuh Agent UDP" -Direction Inbound -LocalPort 1514 -Protocol UDP -Action Allow
> ```

---

## 4. Langkah 3: Install & Daftarkan Wazuh Agent di Ubuntu 22

Jalankan perintah-perintah berikut langsung di terminal **Ubuntu 22 VM**:

### A. Tambahkan Repository Resmi Wazuh
```bash
# 1. Install dependensi & GPG Key
sudo apt-get install -y curl apt-transport-https lsb-release gnupg2
curl -s https://packages.wazuh.com/key/GPG-KEY-WAZUH | sudo gpg --no-default-keyring --keyring gnupg-ring:/usr/share/keyrings/wazuh.gpg --import && sudo chmod 644 /usr/share/keyrings/wazuh.gpg

# 2. Tambahkan repo
echo "deb [signed-by=/usr/share/keyrings/wazuh.gpg] https://packages.wazuh.com/4.x/apt/ stable main" | sudo tee -a /etc/apt/sources.list.d/wazuh.list

# 3. Update daftar paket
sudo apt-get update
```

### B. Install & Daftarkan Agent ke IP Host
```bash
sudo WAZUH_MANAGER="192.168.27.42" WAZUH_AGENT_NAME="ubuntu22-target" apt-get install -y wazuh-agent
```

### C. Start & Enable Service Agent
```bash
sudo systemctl daemon-reload
sudo systemctl enable wazuh-agent
sudo systemctl start wazuh-agent
```

### D. Verifikasi Status Koneksi Agent
```bash
sudo systemctl status wazuh-agent
```
Periksa log koneksi agent:
```bash
sudo tail -f /var/ossec/logs/ossec.log | grep -E "Connected|registered|status"
```
Jika berhasil, akan muncul output:
`Connected to the server (192.168.27.42:1514)`

---

## 5. Langkah 4: Verifikasi di Wazuh Dashboard

1. Buka kembali browser di **`https://localhost`** atau **`https://192.168.27.42`**.
2. Masuk ke menu navigasi (garis 3 di kiri atas) → **Wazuh** → **Endpoints Summary** (atau **Agents**).
3. Anda akan melihat:
   - **Total Agents**: `1` (atau bertambah sesuai node yang didaftarkan)
   - **Active Agents**: `1` (Node `ubuntu22-target` dengan status **Active** berwarna hijau).
4. Klik pada nama agent `ubuntu22-target` untuk melihat dashboard monitoring spesifik:
   - **OS**: Ubuntu 22.04 LTS
   - **IP Address**: IP VM Ubuntu
   - **System Inventory**: Daftar package/software terinstall, port yang terbuka, process aktif, dan resource CPU/RAM.

---

## 6. Langkah 5: Automasi Monitoring & Security Detection

Wazuh langsung mengaktifkan fitur-fitur monitoring berikut secara otomatis:

| Fitur Monitoring | Apa yang Dipantau | Manfaat Operasional |
|---|---|---|
| **Log Data Analysis** | `/var/log/auth.log`, `/var/log/syslog`, systemd logs | Deteksi percobaan login gagal/brute-force SSH, sudo abuse. |
| **File Integrity (FIM)** | Perubahan pada `/etc`, `/usr/bin`, `/sbin` | Mengetahui jika ada konfigurasi sistem atau binary diubah/disusupi. |
| **System Inventory** | Hardware, Network interfaces, Packages, Services | Audit inventaris perangkat keras dan lunak secara real-time. |
| **SCA (Security Assessment)** | Benchmark CIS (Center for Internet Security) | Skor kepatuhan & rekomendasi hardening keamanan OS. |
| **Vulnerability Detection** | CVE database matching terhadap installed packages | Notifikasi otomatis jika ada software di Ubuntu yang memiliki celah keamanan. |

---

## 7. Pengujian & Simulasi Alert (Uji Coba)

Untuk memastikan alarm/alert SIEM bekerja, lakukan tes berikut di Ubuntu VM:

### Test 1: Simulasi Percobaan Login Gagal (Authentication Failure)
Di terminal komputer lain atau VM lain, lakukan SSH gagal ke Ubuntu:
```bash
ssh userpalsu@<IP_UBUNTU_VM>
# Masukkan password salah 3x
```
Buka Dashboard Wazuh → **Security Events** → Anda akan melihat event level alarm: **"sshd: Authentication failed"** atau **"sshd: Multiple failed login attempts"**.

### Test 2: Simulasi Perubahan File Konfigurasi (File Integrity Monitoring)
Di Ubuntu VM, ubah sedikit file di `/etc`:
```bash
sudo touch /etc/test_siem_file.conf
```
Dalam waktu singkat, buka Dashboard Wazuh → modul **Integrity Monitoring** → akan muncul event **"New file created in /etc"**.

---

## 8. Ringkasan Perintah Penting (Cheat Sheet)

| Kebutuhan | Perintah | Dijalankan di |
|---|---|---|
| Start Wazuh Server | `docker compose up -d` | Windows (folder single-node) |
| Stop Wazuh Server | `docker compose down` | Windows (folder single-node) |
| Cek Status Container | `docker compose ps` | Windows (folder single-node) |
| Cek Log Manager | `docker compose logs -f wazuh.manager` | Windows (folder single-node) |
| Restart Agent Ubuntu | `sudo systemctl restart wazuh-agent` | Ubuntu VM |
| Cek Log Agent Ubuntu | `sudo tail -n 50 /var/ossec/logs/ossec.log` | Ubuntu VM |

---
*Dokumen ini dibuat otomatis sebagai panduan operasional SIEM RS Indriati Boyolali.*
