# Panduan Shutdown & Menjalankan Kembali Wazuh SIEM di Windows 11

Panduan ini berisi SOP singkat dan jelas ketika Anda ingin mematikan PC hari ini dan menyalakannya kembali besok agar Wazuh Server (Docker) dan Wazuh Agent (Windows 11) tetap berjalan normal.

---

## 🌙 Bagian 1: Prosedur Sebelum Shutdown (Hari Ini)

Secara default, data indexer dan database Wazuh tersimpan di Docker Named Volumes, sehingga aman saat PC dimatikan. Namun, disarankan mematikan container secara rapi (*graceful shutdown*) agar data transaksi log tidak korup.

### Cara 1: Menggunakan Script Otomatis (Direkomendasikan)
1. Buka folder `d:\Faris\Github\SEIM\scripts\`
2. Klik ganda file **`stop-wazuh.bat`**
3. Tunggu hingga muncul pesan *Semua container Wazuh telah dihentikan dengan aman*.
4. Lakukan **Shutdown PC** seperti biasa melalui Start Menu Windows.

### Cara 2: Melalui Terminal / PowerShell
```powershell
cd D:\Faris\Github\SEIM\wazuh-docker\single-node
docker compose stop
```
Lalu shutdown PC Anda.

---

## ☀️ Bagian 2: Prosedur Menjalankan Kembali PC (Besok)

Ketika PC dinyalakan kembali, ada beberapa komponen yang perlu diperiksa:
1. **Docker Desktop** (Engine server)
2. **Wazuh Containers** (Indexer, Manager, Dashboard)
3. **Wazuh Agent Service** (Agent monitoring di Windows 11)

### Cara 1: Menggunakan Script 1-Klik (Paling Praktis)
1. Nyalakan PC dan login ke Windows 11.
2. Buka folder `d:\Faris\Github\SEIM\scripts\`
3. Klik kanan file **`start-wazuh.bat`** → pilih **Run as Administrator** (atau double click).
4. Script akan otomatis:
   - Memastikan Docker Desktop aktif.
   - Menjalankan container Wazuh Server.
   - Memastikan Service Wazuh Agent di Windows berjalan.
   - Menampilkan status akhir.
5. Buka browser ke **`https://localhost`** dan login.

---

### Cara 2: Prosedur Manual (Langkah demi Langkah)

Jika ingin menjalankan secara manual via CLI:

#### 1. Pastikan Docker Desktop Menyala
- Buka aplikasi **Docker Desktop**.
- Pastikan ikon status di kiri bawah berwarna **Hijau** (*Engine running*).

#### 2. Jalankan Container Wazuh
Buka PowerShell dan jalankan:
```powershell
cd D:\Faris\Github\SEIM\wazuh-docker\single-node
docker compose up -d
```
Verifikasi dengan:
```powershell
docker compose ps
```
Pastikan 3 container berstatus **`Up`**:
- `single-node-wazuh.indexer-1`
- `single-node-wazuh.manager-1`
- `single-node-wazuh.dashboard-1`

#### 3. Periksa Service Wazuh Agent Windows 11
Buka PowerShell (Run as Administrator):
```powershell
# Cek status service
Get-Service -Name "WazuhSvc"

# Jika status stopped, nyalakan:
Start-Service -Name "WazuhSvc"
```
*(Catatan: Wazuh Agent di Windows biasanya diset ke Startup Type: **Automatic**, sehingga otomatis berjalan saat PC dinyalakan).*

#### 4. Akses Wazuh Dashboard
- Buka browser: **`https://localhost`** (atau via IP lokal PC Anda)
- Login:
  - **Username**: `admin`
  - **Password**: `SecretPassword`
- Masuk ke menu **Wazuh** → **Endpoints Summary** / **Agents**.
- Pastikan agent Windows 11 Anda dan node VM target berstatus **Active** (Warna Hijau).

---

## ⚠️ Hal Penting yang Perlu Diperhatikan (Troubleshooting / Tips)

### 1. Perubahan IP Address (DHCP Wi-Fi / LAN)
Jika PC Anda menggunakan koneksi Wi-Fi/LAN dengan DHCP (IP dinamis), ada kemungkinan IP lokal berubah saat reboot (misalnya dari `192.168.27.42` menjadi IP lain).
- **Untuk Agent di Windows 11 (PC ini)**: Jika saat install agent Anda mengarahkannya ke `127.0.0.1` atau `localhost`, agent tidak akan terpengaruh oleh perubahan IP network.
- **Untuk Agent di VM Ubuntu / Komputer Luar**: Jika IP host Windows berubah, perbarui IP target manager di agent VM Ubuntu pada file `/var/ossec/etc/ossec.conf` dan restart service agent di VM.
- **Solusi Terbaik**: Buat Static IP / DHCP Reservation pada router Anda untuk PC Windows ini.

### 2. Dashboard Belum Siap (*502 Bad Gateway* / Loading Lama)
Setelah menjalankan `docker compose up -d`, container **Wazuh Indexer** membutuhkan waktu sekitar 30 - 60 detik untuk inisialisasi database OpenSearch sebelum Dashboard bisa diakses. Jika browser menampilkan error, tunggu 30 detik lalu refresh halaman.
