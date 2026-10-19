# [V2] Agentless SSH Read-Only Provisioning (1-Click Setup & Uninstall)

Paket skrip ini dirancang khusus untuk menghubungkan komputer target (**Windows** maupun **Linux**) ke **Enterprise Hardware & Security Dashboard** secara **Agentless** (tanpa perlu menginstall aplikasi berat, agen background pihak ketiga, ataupun membuka akses berbahaya).

---

## 🛡️ Jaminan Keamanan (Strict Least Privilege & Read-Only)

Banyak admin khawatir jika monitoring memerlukan akses Administrator/Root. **Pada versi V2 ini, prinsip *Least Privilege* diterapkan secara ketat:**

| Platform | Akun Monitoring | Hak Akses | Apa yang BISA Dilakukan | Apa yang TIDAK BISA Dilakukan |
| :--- | :--- | :--- | :--- | :--- |
| **Windows** | `siem-monitor` | **100% NON-ADMIN** *(Hanya anggota 'Performance Monitor Users' & 'Distributed COM Users')* | Membaca metrik WMI/CIM secara read-only (CPU %, RAM, Free Disk, Suhu, Fan, Network I/O). | ❌ Tidak bisa menginstall/menghapus software.<br>❌ Tidak bisa edit file sistem/registry.<br>❌ Tidak bisa RDP ke desktop.<br>❌ Tidak bisa mengakses dokumen user lain. |
| **Linux** | `siem-monitor` | **100% NON-ROOT & NON-SUDO** *(Standard Linux User)* | Membaca file telemetri standar kernel (`/proc/stat`, `/proc/meminfo`, `df -h`, `ip -s link`). | ❌ Tidak memiliki akses `sudo` / `su`.<br>❌ Tidak bisa modifikasi file sistem `/etc`, `/var`, dll.<br>❌ Tidak bisa restart/matikan service. |

> **Catatan Penggunaan Hak Admin saat Setup:**
> Hak administrator/root **HANYA** digunakan 1 kali saat Anda menjalankan skrip setup untuk:
> 1. Mendaftarkan daemon OpenSSH ke sistem operasi.
> 2. Membuka port firewall lokal (default port 3000 untuk Windows, port 22/3000 untuk Linux).
> Setelah skrip selesai, seluruh koneksi dashboard harian berjalan menggunakan akun terbatas `siem-monitor`.

---

## 🚀 Panduan 1-Klik: Windows Target (PC / Laptop / Server)

### 1. Instalasi (Setup)
1. Salin folder `agentless_readonly_v2` ke komputer Windows target (misal di Desktop atau Downloads).
2. Klik kanan pada file **`setup_windows_readonly_1click.bat`** -> Pilih **"Run as Administrator"**.
3. Jendela konsol akan muncul:
   - Tekan **ENTER** jika ingin menggunakan port default **3000** (atau ketik nomor port lain sesuai kebutuhan).
4. Skrip akan otomatis:
   - Memastikan OpenSSH Server aktif.
   - Mengunci izin keamanan private keys (`icacls`) agar tidak terjadi **Error 10054 / Connection Reset** pada OpenSSH 9.5+.
   - Membuat akun `siem-monitor` non-admin dengan password default `Siem@Indriati2026!`.
   - Mengatur Windows Firewall otomatis.
   - Menjalankan uji koneksi lokal (Self-test).
5. Daftarkan endpoint di Web Dashboard:
   - **IP Address**: IP Komputer target (misal `192.168.27.201`)
   - **Port**: `3000` (atau port yang Anda pilih)
   - **Username**: `siem-monitor`
   - **Password**: `Siem@Indriati2026!`

### 2. Uninstalasi (Hapus Total)
Jika PC target tidak lagi ingin dimonitor dan Anda ingin menghapus semua jejaknya:
1. Klik kanan pada **`uninstall_windows_readonly_1click.bat`** -> Pilih **"Run as Administrator"**.
2. Skrip akan otomatis menghapus user `siem-monitor`, membersihkan rule firewall, dan mengembalikan sistem seperti semula.

---

## 🐧 Panduan 1-Klik: Linux Target (Ubuntu / Debian / CentOS / VM)

### 1. Instalasi (Setup)
1. Salin skrip ke mesin Linux target, atau download langsung.
2. Berikan izin eksekusi dan jalankan:
   ```bash
   sudo bash setup_linux_readonly_1click.sh
   ```
   *(Opsional: Jika ingin port khusus selain 22, contoh: `sudo bash setup_linux_readonly_1click.sh 3000`)*
3. Skrip akan otomatis:
   - Memasang `openssh-server` jika belum ada.
   - Membuat user `siem-monitor` (murni non-root, tanpa akses sudo).
   - Menyetel konfigurasi `UseDNS no` untuk latensi respon super cepat (< 20ms).
   - Menyesuaikan firewall (UFW / Firewalld).
4. Daftarkan endpoint di Web Dashboard dengan kredensial yang sama.

### 2. Uninstalasi (Hapus Total)
Jika ingin membersihkan akun monitoring dari Linux:
```bash
sudo bash uninstall_linux_readonly_1click.sh
```
*(Opsional: `sudo bash uninstall_linux_readonly_1click.sh 3000` jika sebelumnya menggunakan port custom).*

---

## 🔍 Mengapa Versi V2 Ini Memperbaiki Masalah Koneksi (Error 10054)?

Pada versi sebelumnya di Windows (khususnya OpenSSH 9.5+ pada Windows 10/11 versi terbaru), service `sshd` menolak koneksi (`Connection reset by peer` / `10054`) sesaat setelah client mengirim paket handshake `SSH2_MSG_KEXINIT`. 

Penyebabnya adalah:
- Windows OpenSSH 9.5 mewajibkan **Strict HostKey Access Control List (ACL)**. Jika file host key di `C:\ProgramData\ssh` masih memiliki izin read untuk `Users` biasa atau mewarisi hak dari folder induk (*inherited permissions*), OpenSSH secara diam-diam menolak membaca kunci dan langsung memutus koneksi (RST).
- Pada **V2**, kami menyertakan perbaikan deterministik:
  ```powershell
  icacls.exe "$sshDataDir" /inheritance:r /grant:r "NT AUTHORITY\SYSTEM:(OI)(CI)F" "BUILTIN\Administrators:(OI)(CI)F"
  ```
  serta mendefinisikan path kunci host secara eksplisit tanpa BOM (Byte Order Mark) pada `sshd_config`. Hasilnya koneksi SSH langsung tersambung 100% stabil.
