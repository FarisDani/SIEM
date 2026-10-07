# 🛡️ Enterprise SIEM & Hardware NOC Telemetry Dashboard
**RS Indriati Boyolali — IT Infrastructure & Security Operations Center (SOC)**

Sistem pemantauan telemetri perangkat keras dan keamanan infrastruktur mandiri (*agentless & standalone*) berkinerja tinggi, terinspirasi oleh standar CLI monitor enterprise `btop` v1.4+.

Dashboard dapat diakses langsung secara multi-perangkat via Web:
👉 **`http://localhost:8088/siem.html`** (Lokal)  
👉 **`http://192.168.27.41:8088/siem.html`** (Jaringan LAN / HP / Laptop Lain)

---

## 🌟 Fitur Utama

| Modul | Standar & Realisasi Teknis |
| :--- | :--- |
| **🌐 Multi-Device Remote Web** | Server daemon binding `0.0.0.0:8088`. Dilengkapi skrip 1-klik pembuka Windows Firewall (`allow_firewall_port_8088.bat`) dan badge salin URL LAN instan. |
| **🖥️ CPU Saturation Sentinel** | Load %, Base Clock, True Suhu Package/Core, VCore, Daya (Watt), dan **Rolling Load Average (1m, 5m, 15m)** ala `btop`. |
| **🧠 Memory & Dedicated Swap** | Multi-segment RAM (Active Used, Standby Cache, Free) + bar mandiri **Swap / Pagefile** (Ungu `#8B5CF6`) terpisah dari Commit Limit. |
| **💾 Drive Integrity & I/O** | Kecepatan baca/tulis (MB/s), deteksi tipe HDD/SSD otentik (eliminasi false optical drive), serta **Dual-Color Partition Bar** (Merah Terpakai + Hijau Sisa). |
| **📡 Network Traffic Waveform** | Throughput real-time (Inbound/Outbound KB/s) + **Top Peak Throughput** & **Total Akumulasi Transfer Data (GiB)**. |
| **⚙️ Processes Sentinel** | Tab proses berada di paling kiri (default), auto-scaling format RAM ala `btop` (`42G`, `777M`, `16M`, `5.3M`), serta mode Hierarki Pohon (*Tree View*) vs Detail PID. |
| **🎨 Density Toggle (UX Mode)** | Pilihan mode kerapatan tampilan: **Mode Normal (Clean SOC)** untuk visual eksekutif atau **Mode Kompak** untuk kenyamanan *SysAdmin*. |

---

## 🚀 Cara Menjalankan (Plug & Play)

### 1. Menjalankan Dashboard
1. Buka folder `hardware-dashboard/`.
2. Jalankan `start_hardware_dashboard.bat` atau via terminal:
   ```bash
   python hardware-dashboard/server.py
   ```
3. Buka browser pada alamat:
   * **`http://localhost:8088/siem.html`** (Tampilan SOC & btop Alignment)
   * **`http://localhost:8088/index.html`** (Tampilan Hardware NOC Gauges)

### 2. Membuka Akses untuk Perangkat Lain (HP / Laptop / Tablet di LAN)
1. Klik kanan `hardware-dashboard/allow_firewall_port_8088.bat` -> pilih **Run as administrator**.
2. Dari HP atau laptop lain di jaringan Wi-Fi yang sama, buka:
   ```text
   http://192.168.27.41:8088/siem.html
   ```

---

## 📁 Struktur Repositori

```
SEIM/
├── hardware-dashboard/
│   ├── server.py                        # Python Telemetry & SSH Remote Gateway Daemon (Port 8088)
│   ├── siem.html                        # Frontend SOC Operations Dashboard (btop Alignment)
│   ├── siem.js                          # Logika telemetri, format btop, density mode, & proses
│   ├── index.html                       # Frontend Hardware NOC (Gauge & Dial Tachometer)
│   ├── app.js                           # Logika sensor hardware NOC
│   ├── styles.css                       # CSS Design System & Density Mode (.density-compact)
│   ├── config.json                      # Konfigurasi endpoint profil target SSH & local
│   ├── allow_firewall_port_8088.bat     # Skrip 1-klik buka port 8088 di Windows Defender Firewall
│   ├── start_hardware_dashboard.bat     # Launcher 1-klik untuk host
│   ├── setup_target_ssh_1click.bat      # Skrip 1-klik pasang SSH server di target Windows
│   └── uninstall_target_ssh_linux_1click.sh # Skrip pencopotan SSH target Linux
├── docs/
│   └── plans/                           # Dokumen perencanaan & matriks implementasi btop
└── .gitignore                           # Git ignore rules untuk file cache & temporary
```
