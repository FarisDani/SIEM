# [OFFLINE 1-CLICK] Agentless SSH Read-Only Provisioning

Paket ini dirancang khusus untuk mesin / server yang **memblokir Windows Update**, tidak memiliki akses internet, atau berada di jaringan intranet/air-gapped.

---

## 💡 Mengapa Solusi Ini Berhasil di Server yang Memblokir Windows Update?

1. **Biner OpenSSH Resmi Disertakan Langsung (Folder `bin/`)**:
   Skrip tidak lagi memanggil `Add-WindowsCapability` atau `DISM /Online` yang membutuhkan server Windows Update / WSUS.
   Jika di komputer target belum ada OpenSSH, skrip akan **otomatis menyalin biner OpenSSH resmi dari folder `bin/` ke `C:\Program Files\OpenSSH`** dan langsung mendaftarkannya sebagai Windows Service.
2. **100% Offline & Mandiri**:
   Tidak ada proses download paket dari internet.
3. **Strict Least Privilege (Non-Admin)**:
   Akun `siem-monitor` dibuat murni sebagai user terbatas (non-admin), hanya dimasukkan ke grup read-only `Performance Monitor Users` dan `Distributed COM Users`.

---

## 🚀 Panduan Penggunaan di Komputer Target Windows

1. Salin **seluruh folder `agentless_readonly_offline`** (pastikan folder `bin/` ikut tersalin) ke komputer target (misal di `C:\Temp` atau Desktop).
2. Klik kanan pada **`setup_windows_readonly_1click.bat`** -> Pilih **"Run as Administrator"**.
3. Tekan **ENTER** untuk menggunakan Port default `3000`.
4. Skrip akan menyelesaikan instalasi dan menampilkan status hijau:
   ```text
   [SUKSES] PROVISIONING OFFLINE SELESAI & SIAP DIDAFTARKAN!
   - Host / IP Address : <IP_KOMPUTER>
   - Port              : 3000
   - Username          : siem-monitor
   - Password          : Siem@Indriati2026!
   ```
5. Daftarkan di Dashboard Web SIEM.

### Uninstalasi Windows
Jika sewaktu-waktu ingin menghapus monitoring:
- Klik kanan **`uninstall_windows_readonly_1click.bat`** -> Pilih **"Run as Administrator"**.

---

## 🐧 Panduan Penggunaan di Komputer Target Linux

1. Salin skrip ke Linux:
   ```bash
   sudo bash setup_linux_readonly_1click.sh
   ```
2. Uninstalasi Linux:
   ```bash
   sudo bash uninstall_linux_readonly_1click.sh
   ```
