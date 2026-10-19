# 📋 Telemetry Plan: Penanganan Telemetri Suhu & Deteksi Virtual Machine (VM)
**RS Indriati Boyolali — IT Infrastructure & Hardware NOC Monitoring**  
**Document ID**: `2026-10-19_01`  
**Status**: 📝 Planned / Draft (Do Not Execute)  
**Standard**: Strict Zero Fake Data & Hypervisor-Aware UX Architecture  

---

## 1. 🔍 Analisis Teknis: Mengapa Linux VM Tidak Memiliki Sensor Suhu?

### A. Arsitektur Isolasi Hypervisor (VirtualBox / VMware / KVM)
Pada sistem operasi fisik (*bare-metal*), pembacaan suhu CPU diambil langsung dari register perangkat keras mikroprosesor:
- **Intel DTS (*Digital Thermal Sensor*)**: Dibaca melalui MSR (*Model-Specific Register*) `IA32_THERM_STATUS` (0x19C) oleh modul kernel Linux `coretemp`.
- **AMD K10 / Zen Thermal**: Dibaca melalui antarmuka PCI Host Bridge `k10temp`.
- **ACPI Thermal Zones**: Disediakan oleh BIOS/UEFI motherboard pada `/sys/class/thermal/thermal_zone*`.

Pada lingkungan **Virtual Machine (VM)**:
1. **vCPU Abstraction**: Hypervisor (seperti VirtualBox) mengeksekusi instruksi CPU melalui ekstensi virtualisasi hardware (Intel VT-x / AMD-V), namun **tidak mengemulasikan register MSR sensor termal fisik** ke dalam Guest OS.
2. **Keamanan & Portabilitas**: VM didesain agar portabel antar mesin fisik (dapat dimigrasikan antar-host dengan karakteristik thermal berbeda). Mengizinkan Guest OS mengakses register fisik MSR berpotensi membuka celah keamanan (*side-channel attacks* seperti Spectre/Meltdown).
3. **Kondisi di Linux Guest**:
   - Perintah `sensors` (*lm-sensors*) selalu menghasilkan respons: `No sensors found!`.
   - Direktori `/sys/class/hwmon/` dan `/sys/class/thermal/` tidak memiliki objek sensor termal CPU fisik.

> [!NOTE]
> Oleh karena itu, ketiadaan data suhu pada VM Ubuntu/Linux di VirtualBox adalah **perilaku standar dan normal dari semua hypervisor di dunia**, bukan kerusakan pada script monitoring atau dashboard SIEM kita.

---

## 2. 🎯 Tujuan Rencana (Objectives)

1. **Deteksi Otomatis Node Virtual (Hypervisor Detection)**:
   Mendeteksi secara akurat apakah node target merupakan mesin fisik (*Bare-Metal*) atau mesin virtual (*VirtualBox, VMware, KVM, Hyper-V*).
2. **Penyajian Status UX yang Edukatif & Transparan**:
   Mengganti label generik `N/A` atau `0°C` pada card suhu menjadi penanda cerdas:  
   `"Virtual Machine (Hypervisor Abstraction)"` lengkap dengan badge `[VM GUEST]`.
3. **Menjaga Integritas "Zero Fake Data"**:
   Tidak merekayasa nilai suhu dummy untuk VM, melainkan mengedukasi operator NOC bahwa node tersebut berada di dalam layer virtualisasi.

---

## 3. 🛠️ Rincian Arsitektur yang Direncanakan (Action Items)

### Item 1: Deteksi Virtualisasi pada Probe Telemetri

#### A. Pada Probe Linux (`LINUX_INV_SCRIPT`):
Menggunakan perintah standar Linux yang ringan dan tidak membutuhkan dependensi tambahan:
```python
# Cek virtualisasi via systemd-detect-virt atau DMI vendor
virt_type = "bare-metal"
try:
    p = subprocess.run(['systemd-detect-virt'], capture_output=True, text=True, timeout=2)
    if p.returncode == 0 and p.stdout.strip():
        virt_type = p.stdout.strip().lower() # e.g. 'oracle' (VirtualBox), 'vmware', 'kvm'
    else:
        # Fallback cek DMI vendor/product
        with open('/sys/class/dmi/id/product_name', 'r') as f:
            p_name = f.read().lower()
            if 'virtualbox' in p_name: virt_type = 'oracle'
            elif 'vmware' in p_name: virt_type = 'vmware'
            elif 'kvm' in p_name or 'qemu' in p_name: virt_type = 'kvm'
except Exception:
    pass
```

#### B. Pada Probe Windows (`GENERIC_INV_POWERSHELL`):
Memanfaatkan properti model dari `Win32_ComputerSystem`:
```powershell
$isVm = $false
$virtVendor = 'Physical'
$cs = Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
if ($cs.Model -match 'VirtualBox|VMware|Virtual Machine|KVM') {
    $isVm = $true
    $virtVendor = $cs.Model
}
```

---

### Item 2: Standardisasi Payload Telemetri Backend (`server.py`)

Menambahkan field identifikasi virtualisasi pada payload snapshot node:
```json
{
  "systemSpecs": {
    "isVirtualMachine": true,
    "hypervisor": "oracle (VirtualBox)",
    "cpuTempCapable": false
  },
  "cpu": {
    "temp": null,
    "tempStatus": "VM_HYPERVISOR_NO_SENSOR",
    "tempDisplay": "N/A (VM Hypervisor)"
  }
}
```

---

### Item 3: Penyempurnaan Tampilan Frontend (`app.js` & `siem.js`)

Pada Card Telemetri CPU & Sensor Suhu:
1. **Kondisi Normal (Bare-Metal)**:
   - Menampilkan angka suhu: `45.2°C` (badge Hijau/Kuning/Merah).
2. **Kondisi Mesin Virtual (VM Guest)**:
   - Menampilkan badge netral: `[ 🛡️ VM Hypervisor ]`.
   - Tooltip interaktif:
     > *"Node ini berjalan di dalam mesin virtual (VirtualBox). Hypervisor tidak mengekspos sensor termal CPU fisik ke dalam Guest OS."*
   - Menghilangkan indikasi peringatan palsu (*error alert*) sehingga operator NOC tidak mengira sensor sedang rusak.

---

## 4. 🔀 Alternatif Lanjutan (Opsional di Masa Depan)

Jika di kemudian hari administrator mewajibkan suhu mesin fisik tetap tampil pada monitoring VM, terdapat 2 opsi arsitektur lanjutan:
1. **Host-to-Guest Shared Telemetry (VirtualBox Guest Properties)**:
   - Host Windows menjalankan script kecil yang menulis suhu host ke properti VM:  
     `VBoxManage guestproperty set "<VM_Name>" "/VirtualBox/GuestAdd/HostTemp" "48.5"`
   - Linux VM membaca properti tersebut via `VBoxControl guestproperty get`.
2. **Node Monitoring Terpisah (Rekomendasi Terbaik)**:
   - Memonitor Host Fisik (Laptop/Server Host) sebagai 1 node tersendiri (mengukur suhu fisik CPU/GPU).
   - Memonitor VM sebagai node tersendiri (mengukur resource virtual: vCPU, vRAM, Disk IO, Network, Sockets).

---

## 5. 🚦 Status Rencana
- [x] Dokumen Rencana Disusun (`docs/plans/2026-10-19_01_plan_vm_detection_dan_thermal_handling.md`)
- [ ] Review dan Persetujuan Pengguna
- [ ] Eksekusi Implementasi (Menunggu instruksi pengguna lebih lanjut)
