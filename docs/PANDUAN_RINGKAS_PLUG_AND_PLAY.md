# Panduan Ringkas & Plug-and-Play: Wazuh SIEM & Health Monitoring
**RS Indriati Boyolali — IT Infrastructure & Security**

Panduan ini dibuat khusus agar **mudah dipahami dan langsung siap pakai (*Plug & Play*)** untuk operasional sehari-hari tanpa perlu konfigurasi teknis yang rumit.

---

## 1. 💡 Apa Saja yang Baru Ditambahkan?

Sistem Wazuh SIEM Anda kini dilengkapi dengan **Pusat Monitoring Kesehatan Server Terpadu (Enterprise NOC)** yang bekerja otomatis:

| Fitur yang Ditambahkan | Manfaat Praktis untuk Anda |
|---|---|
| **Multi-Drive Monitoring** | Otomatis memantau seluruh partisi harddisk (`C:`, `D:`, `E:`, dll) dan memperingatkan jika ada partisi yang hampir penuh. |
| **RAM & Pagefile/Swap Monitor** | Memantau beban memori secara real-time untuk mencegah server lambat (*lagging*) atau aplikasi tertutup paksa. |
| **Pemeriksa Status Aplikasi (Service)** | Memastikan aplikasi penting (Docker, Database, Web Server) berstatus **`UP` (Hidup)**. Jika **`DOWN` (Mati)**, alarm darurat Level 12 langsung berbunyi. |
| **Dashboard Visual Siap Pakai** | Semua metrik langsung tampil dalam bentuk grafik tren, diagram batang, dan tabel status di web browser dengan pembaruan otomatis setiap 30 detik. |

---

## 2. 🚀 Panduan 3 Langkah Operasional Sehari-hari

### Langkah 1: Membuka Dashboard di Browser
1. Buka browser (Chrome / Edge / Firefox): **`https://localhost`**
2. Login dengan akun default:
   - **Username**: `admin`
   - **Password**: `SecretPassword`
3. Klik menu navigasi samping kiri atas (**☰**) → pilih menu **Dashboard**.
4. Klik dashboard: **`Enterprise NOC - Server Health & Incident Prevention`**.
5. *Dashboard akan memperbarui data grafik secara live setiap 30 detik secara otomatis!*

---

### Langkah 2: Mematikan & Menyalakan PC
Telah disediakan script 1-klik di folder [`scripts/`](file:///d:/Faris/Github/SEIM/scripts/):

```
d:\Faris\Github\SEIM\scripts\
├── start-wazuh.bat      <-- Klik kanan "Run as Administrator" saat menyalakan PC besok
├── stop-wazuh.bat       <-- Klik ganda sebelum mematikan PC hari ini (Graceful Stop)
└── status-wazuh.bat     <-- Klik ganda kapan saja untuk cek status Docker & Agent
```

- **Sebelum Shutdown PC Hari Ini**: Klik ganda file [`scripts/stop-wazuh.bat`](file:///d:/Faris/Github/SEIM/scripts/stop-wazuh.bat), lalu lakukan Shutdown Windows seperti biasa.
- **Saat Menyalakan PC Besok**: Klik kanan file [`scripts/start-wazuh.bat`](file:///d:/Faris/Github/SEIM/scripts/start-wazuh.bat) → pilih **Run as Administrator**.

---

### Langkah 3: Menambah Aplikasi / Database yang Ingin Dipantau (Tanpa Koding)
Jika di masa depan Anda menginstall database atau web server baru di server (misalnya: MySQL, SQL Server, PostgreSQL, Nginx, Apache), Anda cukup:
1. Buka file konfigurasi: [`config/monitored_services.json`](file:///d:/Faris/Github/SEIM/config/monitored_services.json).
2. Masukkan nama aplikasinya ke dalam daftar, contoh:
   ```json
   {
     "windows": [
       "WazuhSvc",
       "com.docker.service",
       "MSSQLSERVER",
       "MySQL",
       "postgresql-x64-16"
     ],
     "linux": [
       "wazuh-agent",
       "docker",
       "ssh",
       "nginx",
       "mysql"
     ]
   }
   ```
3. Simpan file tersebut. Sistem akan otomatis memantau service baru tersebut dan membunyikan alarm jika service mati.

---

## 3. 📑 Daftar File & Folder Proyek (Sitemap)

| File / Folder | Fungsi & Kegunaan |
|---|---|
| [`scripts/start-wazuh.bat`](file:///d:/Faris/Github/SEIM/scripts/start-wazuh.bat) | Menyalakan Docker Engine, 3 container Wazuh, dan service agent Windows. |
| [`scripts/stop-wazuh.bat`](file:///d:/Faris/Github/SEIM/scripts/stop-wazuh.bat) | Menghentikan container secara aman sebelum PC dimatikan. |
| [`scripts/status-wazuh.bat`](file:///d:/Faris/Github/SEIM/scripts/status-wazuh.bat) | Memeriksa status hidup/matinya container dan IP Windows saat ini. |
| [`config/monitored_services.json`](file:///d:/Faris/Github/SEIM/config/monitored_services.json) | File daftar aplikasi/service yang ingin dipantau kesehatannya. |
| [`docs/panduan_shutdown_dan_restart.md`](file:///d:/Faris/Github/SEIM/docs/panduan_shutdown_dan_restart.md) | Panduan langkah demi langkah prosedur shutdown dan reboot. |
| [`docs/panduan_system_metrics_monitoring.md`](file:///d:/Faris/Github/SEIM/docs/panduan_system_metrics_monitoring.md) | Dokumentasi teknis mendalam arsitektur monitoring server. |
