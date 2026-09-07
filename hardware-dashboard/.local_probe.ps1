
$bios = Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\BIOS' -ErrorAction SilentlyContinue
$boardMfg = if ($bios.BaseBoardManufacturer) { $bios.BaseBoardManufacturer } else { $bios.SystemManufacturer }
$boardProd = if ($bios.BaseBoardProduct -and $bios.BaseBoardProduct -ne 'Default string') { $bios.BaseBoardProduct } else { $bios.SystemProductName }
$biosVer = if ($bios.BIOSVersion) { $bios.BIOSVersion } else { $bios.BaseBoardVersion }

$cpuName = (Get-ItemProperty 'HKLM:\HARDWARE\DESCRIPTION\System\CentralProcessor\0' -ErrorAction SilentlyContinue).ProcessorNameString
if (-not $cpuName) { $cpuName = $env:PROCESSOR_IDENTIFIER }

$procObj = Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $procObj) { $procObj = Get-WmiObject Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1 }

$cores = if ($procObj.NumberOfCores) { [int]$procObj.NumberOfCores } else { [int]$env:NUMBER_OF_PROCESSORS }
$threads = if ($procObj.NumberOfLogicalProcessors) { [int]$procObj.NumberOfLogicalProcessors } else { [int]$env:NUMBER_OF_PROCESSORS }
$maxClock = if ($procObj.MaxClockSpeed) { [int]$procObj.MaxClockSpeed } else { 0 }
$l3Kb = if ($procObj.L3CacheSize) { [int]$procObj.L3CacheSize } else { 0 }

# RAM Modules via Win32_PhysicalMemory (Direct hardware read, no heuristics)
$memModules = @()
try {
    $rawMems = Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue
    if (-not $rawMems) { $rawMems = Get-WmiObject Win32_PhysicalMemory -ErrorAction SilentlyContinue }
    if ($rawMems) {
        $mList = if ($rawMems -is [array]) { $rawMems } else { @($rawMems) }
        foreach ($m in $mList) {
            $capGb = [math]::Round($m.Capacity / 1GB, 1)
            $spd = if ($m.ConfiguredClockSpeed) { [int]$m.ConfiguredClockSpeed } elseif ($m.Speed) { [int]$m.Speed } else { 0 }
            $smbType = if ($m.SMBIOSMemoryType) { [int]$m.SMBIOSMemoryType } elseif ($m.MemoryType) { [int]$m.MemoryType } else { 0 }
            $mType = switch ($smbType) {
                26 { "DDR4" }
                34 { "DDR5" }
                35 { "LPDDR5" }
                30 { "LPDDR4" }
                24 { "DDR3" }
                default { if ($spd -ge 4800) { "DDR5" } elseif ($spd -ge 2133) { "DDR4" } else { "RAM" } }
            }
            $loc = if ($m.DeviceLocator) { $m.DeviceLocator } else { "Slot" }
            $bank = if ($m.BankLabel) { $m.BankLabel } else { "" }
            $mfg = if ($m.Manufacturer -and $m.Manufacturer.Trim() -ne 'Unknown' -and $m.Manufacturer.Trim() -ne '0000') { $m.Manufacturer.Trim() } else { "Physical DIMM" }
            $part = if ($m.PartNumber -and $m.PartNumber.Trim() -ne 'Unknown') { $m.PartNumber.Trim() } else { "$mType-$spd" }
            $memModules += [PSCustomObject]@{
                slot = $loc
                bank = $bank
                capacityGb = $capGb
                speedMhz = $spd
                smbiosType = $smbType
                manufacturer = $mfg
                partNumber = $part
                type = $mType
            }
        }
    }
} catch {}

Add-Type -AssemblyName Microsoft.VisualBasic -ErrorAction SilentlyContinue
$comp = New-Object Microsoft.VisualBasic.Devices.ComputerInfo
$totRamGb = [math]::Round($comp.TotalPhysicalMemory / 1GB, 1)
$freeRamGb = [math]::Round($comp.AvailablePhysicalMemory / 1GB, 1)
$usedRamGb = [math]::Round($totRamGb - $freeRamGb, 1)
$usedRamPct = if ($totRamGb -gt 0) { [math]::Round(($usedRamGb / $totRamGb) * 100, 1) } else { 0 }

# Physical Disks via Win32_DiskDrive
$physicalDisks = @()
try {
    $rawDisks = Get-CimInstance Win32_DiskDrive -ErrorAction SilentlyContinue
    if (-not $rawDisks) { $rawDisks = Get-WmiObject Win32_DiskDrive -ErrorAction SilentlyContinue }
    if ($rawDisks) {
        $dList = if ($rawDisks -is [array]) { $rawDisks } else { @($rawDisks) }
        foreach ($d in $dList) {
            $szGb = [math]::Round($d.Size / 1GB, 1)
            $model = if ($d.Model) { $d.Model.Trim() } else { $d.Caption }
            $ifType = if ($d.InterfaceType) { $d.InterfaceType } else { "SCSI/NVMe" }
            $media = if ($d.MediaType) { $d.MediaType } else { "Fixed hard disk" }
            $idx = if ($d.Index -ne $null) { [int]$d.Index } else { 0 }
            $devId = if ($d.DeviceID) { $d.DeviceID } else { "" }
            
            $physicalDisks += [PSCustomObject]@{
                index = $idx
                model = $model
                sizeGb = $szGb
                interface = if ($model -match 'NVMe|SN5000|TM8FP' -or $ifType -match 'NVMe') { 'NVMe PCIe M.2 SSD' } elseif ($model -match 'SSD|SATA|RESCUE' -or $ifType -match 'IDE|ATA') { 'SATA SSD' } else { 'SATA HDD' }
                mediaType = $media
                deviceId = $devId
            }
        }
    }
} catch {}

# Logical Partitions
$drives = @()
try {
    $driveObjs = [System.IO.DriveInfo]::GetDrives()
    foreach ($d in $driveObjs) {
        if ($d.DriveType -eq 'Fixed' -and $d.IsReady) {
            $totD = [math]::Round($d.TotalSize / 1GB, 1)
            $freeD = [math]::Round($d.AvailableFreeSpace / 1GB, 1)
            $usedD = [math]::Round($totD - $freeD, 1)
            $pctD = if ($totD -gt 0) { [math]::Round(($usedD / $totD) * 100, 1) } else { 0 }
            $label = if ($d.VolumeLabel) { $d.VolumeLabel } else { 'Local Disk' }
            $drives += [PSCustomObject]@{
                drive = $d.Name.TrimEnd('\')
                label = $label
                fileSystem = $d.DriveFormat
                totalGb = $totD
                freeGb = $freeD
                usedGb = $usedD
                usedPct = $pctD
            }
        }
    }
} catch {}

# GPUs
$gpus = @()
try {
    $videoKeys = Get-ChildItem 'HKLM:\SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}' -ErrorAction SilentlyContinue
    foreach ($k in $videoKeys) {
        $props = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
        if ($props.DriverDesc) {
            $mem = $props."HardwareInformation.qwMemorySize"
            if (-not $mem) { $mem = $props.HardwareInformation_MemorySize }
            $vramGb = if ($mem) { [math]::Round($mem / 1GB, 1) } else { 0 }
            $name = $props.DriverDesc
            $isDiscrete = ($name -match 'RTX|GTX|Radeon RX|GeForce|Arc A|Quadro|Radeon Pro') -and -not ($name -match 'UHD|HD Graphics|Iris|Radeon\(TM\) Graphics')
            $gpus += [PSCustomObject]@{
                Name = $name
                VRAM_GB = $vramGb
                DriverVersion = $props.DriverVersion
                IsDiscrete = $isDiscrete
            }
        }
    }
} catch {}

# Battery / Power
$battVolt = 0.0
$battPct = 100
$hasBattery = $false
try {
    $batt = Get-CimInstance Win32_Battery -ErrorAction SilentlyContinue
    if (-not $batt) { $batt = Get-WmiObject Win32_Battery -ErrorAction SilentlyContinue }
    if ($batt) {
        $hasBattery = $true
        $battVolt = if ($batt.DesignVoltage) { [math]::Round($batt.DesignVoltage / 1000, 2) } else { 17.58 }
        $battPct = if ($batt.EstimatedChargeRemaining) { [int]$batt.EstimatedChargeRemaining } else { 100 }
    }
} catch {}

$osObj = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
if (-not $osObj) { $osObj = Get-WmiObject Win32_OperatingSystem -ErrorAction SilentlyContinue }
$osReg = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion' -ErrorAction SilentlyContinue

$osCaption = if ($osObj.Caption) { $osObj.Caption } else { $osReg.ProductName }
$buildNum = if ($osObj.BuildNumber) { [int]$osObj.BuildNumber } elseif ($osReg.CurrentBuild) { [int]$osReg.CurrentBuild } else { 0 }
$dispVer = if ($osReg.DisplayVersion) { $osReg.DisplayVersion } else { '' }
$ubr = if ($osReg.UBR) { $osReg.UBR } else { 0 }

if ($buildNum -ge 22000 -and $osCaption -match 'Windows 10') {
    $osCaption = $osCaption -replace 'Windows 10', 'Windows 11'
}

$rawTicks = [Environment]::TickCount
$ticks = if ($rawTicks -lt 0) { [int64]$rawTicks + [int64]4294967296 } else { [int64]$rawTicks }
$uptimeSec = [math]::Round($ticks / 1000)

$rx = 0; $tx = 0
try {
    $nics = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()
    foreach ($nic in $nics) {
        if ($nic.OperationalStatus -eq 'Up' -and $nic.NetworkInterfaceType -ne 'Loopback') {
            $stats = $nic.GetIPStatistics()
            $rx += $stats.BytesReceived
            $tx += $stats.BytesSent
        }
    }
} catch {}

# Combined Application & System Events (Real user app & system activity)
$events = @()
try {
    $rawEvents = Get-WinEvent -FilterHashtable @{LogName=@('Application','System')} -MaxEvents 30 -ErrorAction SilentlyContinue
    if ($rawEvents) {
        foreach ($e in $rawEvents) {
            $events += [PSCustomObject]@{
                Time = $e.TimeCreated.ToString('HH:mm:ss')
                Date = $e.TimeCreated.ToString('yyyy-MM-dd')
                Log = $e.LogName
                Source = $e.ProviderName
                EventId = $e.Id
                Level = $e.LevelDisplayName
                Message = ($e.Message.Trim() -replace '[\r\n]+', ' ')
            }
        }
    }
} catch {}

[PSCustomObject]@{
    Board = [PSCustomObject]@{
        Manufacturer = $boardMfg
        Product = $boardProd
        BIOSVersion = $biosVer
    }
    CPU = [PSCustomObject]@{
        Name = $cpuName.Trim()
        Cores = $cores
        Threads = $threads
        MaxClockMhz = $maxClock
        L3CacheKb = $l3Kb
    }
    RAM_Summary = [PSCustomObject]@{
        Total = $totRamGb
        Free = $freeRamGb
        Used = $usedRamGb
        Pct = $usedRamPct
    }
    RAM_Modules = $memModules
    PhysicalDisks = $physicalDisks
    Partitions = $drives
    GPUs = $gpus
    Battery = [PSCustomObject]@{
        HasBattery = $hasBattery
        Voltage = $battVolt
        Percent = $battPct
    }
    OS = [PSCustomObject]@{
        ProductName = $osCaption
        DisplayVersion = $dispVer
        CurrentBuild = $buildNum
        UBR = $ubr
    }
    UptimeSeconds = $uptimeSec
    NetRxBytes = $rx
    NetTxBytes = $tx
    Events = $events
} | ConvertTo-Json -Depth 5 -Compress
