# Panduan Lengkap Enterprise Server Health & Incident Prevention di Wazuh SIEM
**RS Indriati Boyolali — IT Infrastructure & Security**

Panduan ini mendokumentasikan sistem monitoring kesehatan server dan pencegahan insiden (*Proactive Incident Prevention*) tingkat enterprise yang mengintegrasikan monitoring **Multi-Drive (seluruh partisi C:, D:, E:, /var), RAM & Swap/Pagefile, Ketersediaan Core Services (Running/Down), TCP Sockets, dan CPU Load** ke dalam satu Dashboard Terpadu.

---

## 1. Arsitektur Monitoring Berbasis Pencegahan

```
┌─────────────────────────────────────────────────────────────┐
│ TARGET AGENTS (Windows 11 Host, Ubuntu VM, Servers)         │
│                                                             │
│ • Multi-Drive Auto-Discovery: Hitung kapasitas C:, D:, E:   │
│ • Memory Pressure: Pantau Physical RAM & Pagefile/Swap      │
│ • Service Availability: Cek status Docker, Wazuh, DB, Web   │
│ • TCP Connections: Pantau total sesi koneksi aktif          │
│ • Config Fleksibel: config/monitored_services.json          │
└──────────────────────────────┬──────────────────────────────┘
                               │ JSON Telemetry Stream (:1514)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ WAZUH SIEM MANAGER & INDEXER                                │
│                                                             │
│ • Custom Decoders: Ingest telemetri multi-disk & service    │
│ • Prevention Rules:                                         │
│   - Rule 100105 (Level 12): CRITICAL Core Service STOPPED   │
│   - Rule 100103 (Level 10): CRITICAL Any Drive > 90% Full  │
│   - Rule 100106 (Level 9) : WARNING Swap/Pagefile > 85%     │
│   - Rule 100101 (Level 7) : WARNING High CPU Load > 85%     │
│   - Rule 100100 (Level 3) : Ingest Normal Telemetry         │
│                                                             │
│ • OpenSearch Indexer: Time-Series Storage                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ ENTERPRISE NOC DASHBOARD (Web UI: https://localhost)        │
│                                                             │
│ • Panel 1: CPU Load Trend Line Chart                        │
│ • Panel 2: RAM vs Pagefile/Swap Saturation Multi-Line Chart │
│ • Panel 3: Multi-Drive Storage Criticality Bar Chart        │
│ • Panel 4: Unified Server & Services Health Matrix Table    │
│ • Panel 5: Critical Incident & Service Prevention Feed      │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Cara Mengaktifkan / Update di Windows 11 (Host PC)

1. Buka File Explorer ke folder: `d:\Faris\Github\SEIM\scripts\`
2. Klik kanan file **`setup_windows_metrics.bat`** → pilih **Run as Administrator**.
3. Script akan menyalin script telemetri enterprise terbaru, memasang konfigurasi `monitored_services.json`, dan me-restart service agent.
4. Selesai!

---

## 3. Fleksibilitas Menambah Service yang Dipantau

Jika di masa depan Anda menginstall software/service baru (misal: MySQL, SQL Server, IIS, Nginx), Anda **tidak perlu mengutak-atik kode script**. Cukup buka dan tambahkan nama servicenya pada:
👉 [`config/monitored_services.json`](file:///d:/Faris/Github/SEIM/config/monitored_services.json)

```json
{
  "windows": [
    "WazuhSvc",
    "com.docker.service",
    "MSSQLSERVER",
    "MySQL",
    "postgresql-x64-15",
    "postgresql-x64-16",
    "W3SVC"
  ],
  "linux": [
    "wazuh-agent",
    "docker",
    "ssh",
    "sshd",
    "nginx",
    "apache2",
    "mysql",
    "mariadb",
    "postgresql"
  ]
}
```

---

## 4. Monitoring Ubuntu VM: Metode Agent vs Agentless (SSH)

| Fitur | Metode 1: Wazuh Agent (Direkomendasikan) | Metode 2: Agentless via SSH |
|---|---|---|
| **Pemasangan di VM** | Install paket `wazuh-agent` 1x di VM | Tidak perlu install apa pun di VM |
| **Frekuensi Data** | Real-time kontinu (setiap 30 detik) | Periodik via SSH scheduler (misal: tiap 5–10 menit) |
| **Beban Jaringan** | Sangat ringan (protokol biner terenkripsi port 1514) | Membuka sesi SSH baru setiap kali audit |
| **Fitur Lengkap** | FIM, Log Analysis, Security CIS, Metrik | Hanya menjalankan perintah bash jarak jauh |

Untuk mengaktifkan di Ubuntu VM dengan Agent, cukup jalankan:
```bash
sudo bash /path/ke/SEIM/scripts/setup_linux_metrics.sh
```

---

## 5. Cara Mengakses Dashboard di Browser

1. Buka browser: **`https://localhost`** (Login: `admin` / `SecretPassword`).
2. Klik menu garis tiga (**☰**) di kiri atas → pilih menu **Dashboard**.
3. Klik dashboard: **`Enterprise NOC - Server Health & Incident Prevention`**.
4. Tekan **F5** atau tombol **Refresh**.
5. Dashboard akan otomatis me-refresh pergerakan metrik setiap 30 detik secara live!
