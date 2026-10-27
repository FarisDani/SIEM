# [OFFLINE 1-CLICK V2] Agentless SSH Read-Only Provisioning

Paket ini dirancang khusus untuk mesin / server yang **memblokir Windows Update**, tidak memiliki akses internet, atau berada di jaringan intranet/air-gapped.

---

### 💡 Pembaruan & Koreksi pada Versi Offline V2:

1. **Perbaikan Batasan Karakter `Description` (Maksimal 48 Karakter)**:
   - Pada Windows PowerShell, cmdlet `New-LocalUser -Description` dibatasi maksimal **48 karakter**.
   - Deskripsi akun kini diperpendek menjadi `"SIEM Read-Only Telemetry"` (25 karakter).
   - Ditambahkan fallback deterministik otomatis ke `net user siem-monitor ...` untuk menjamin akun selalu 100% berhasil dibuat di semua edisi Windows (Windows 10, Windows 11, Windows Server 2012–2025).
2. **Perbaikan Deteksi Status Layanan `sshd` & Binding Port**:
   - Skrip kini memastikan daemon `sshd` benar-benar berstatus `RUNNING` melalui polling check sebelum memverifikasi alokasi port.
3. **Biner OpenSSH Resmi Disertakan Langsung (Folder `bin/`)**:
   - Skrip tidak memanggil `Add-WindowsCapability` atau `DISM /Online`, sehingga 100% aman dijalankan di server dengan Windows Update terblokir.

---

## 🚀 Panduan Penggunaan di Komputer Target Windows

1. Salin **seluruh folder `agentless_readonly_offline_v2`** (pastikan folder `bin/` ikut tersalin) ke komputer target (misal di `C:\Temp` atau Desktop).
2. Klik kanan pada **`setup_windows_readonly_1click.bat`** -> Pilih **"Run as Administrator"**.
3. Tekan **ENTER** untuk menggunakan Port default `3000`.
4. Skrip akan menyelesaikan instalasi tanpa error dan menampilkan status hijau:
   ```text
   [SUKSES] PROVISIONING OFFLINE V2 SELESAI & SIAP DIDAFTARKAN!
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
