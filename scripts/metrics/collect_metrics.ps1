# ==============================================================================
# Enterprise Wazuh System Metrics Collector for Windows
# RS Indriati Boyolali - IT Infrastructure & Security
# Features: Multi-Drive, Pagefile/Swap, Core Services Health, TCP Connections
# ==============================================================================

try {
    # 1. CPU Usage (%)
    $perfCpu = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue
    $cpu = if ($perfCpu -and $perfCpu.PercentProcessorTime -ne $null) { [double]$perfCpu.PercentProcessorTime } else { 0.0 }

    # 2. RAM Usage (Physical Memory)
    $os = Get-CimInstance Win32_OperatingSystem -ErrorAction SilentlyContinue
    $totalRamMb = [Math]::Round($os.TotalVisibleMemorySize / 1024, 0)
    $freeRamMb = [Math]::Round($os.FreePhysicalMemory / 1024, 0)
    $usedRamMb = $totalRamMb - $freeRamMb
    $ramPct = if ($totalRamMb -gt 0) { [Math]::Round(($usedRamMb / $totalRamMb) * 100, 1) } else { 0.0 }

    # 3. Virtual Memory / Pagefile Usage (%)
    $totalCommitLimitMb = [Math]::Round($os.TotalVirtualMemorySize / 1024, 0)
    $freeVirtualMb = [Math]::Round($os.FreeVirtualMemory / 1024, 0)
    $usedVirtualMb = $totalCommitLimitMb - $freeVirtualMb
    $pagefilePct = if ($totalCommitLimitMb -gt 0) { [Math]::Round(($usedVirtualMb / $totalCommitLimitMb) * 100, 1) } else { 0.0 }

    # 4. Multi-Drive Auto-Discovery (All Fixed Disks: C:, D:, E:, etc.)
    $allDisks = Get-CimInstance Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue
    $diskList = @()
    $worstDiskPct = 0.0
    $worstDiskDrive = "C:"
    $totalStorageGb = 0.0
    $usedStorageGb = 0.0

    foreach ($d in $allDisks) {
        if ($d.Size -gt 0) {
            $dTotalGb = [Math]::Round($d.Size / 1GB, 1)
            $dFreeGb = [Math]::Round($d.FreeSpace / 1GB, 1)
            $dUsedGb = [Math]::Round($dTotalGb - $dFreeGb, 1)
            $dPct = [Math]::Round(($dUsedGb / $dTotalGb) * 100, 1)
            
            $totalStorageGb += $dTotalGb
            $usedStorageGb += $dUsedGb

            if ($dPct -gt $worstDiskPct) {
                $worstDiskPct = $dPct
                $worstDiskDrive = $d.DeviceID
            }

            $diskList += "$($d.DeviceID) ($dPct% - $dFreeGb GB free)"
        }
    }
    $disksSummary = if ($diskList.Count -gt 0) { $diskList -join ", " } else { "N/A" }
    $globalDiskPct = if ($totalStorageGb -gt 0) { [Math]::Round(($usedStorageGb / $totalStorageGb) * 100, 1) } else { 0.0 }

    # 5. Core Services Health Check (Flexible & Dynamic)
    $defaultWinServices = @("WazuhSvc", "MSSQLSERVER", "MySQL", "postgresql-x64-15", "postgresql-x64-16", "W3SVC")
    $configPath = Join-Path $PSScriptRoot "..\..\config\monitored_services.json"
    $agentConfigPath = "C:\Program Files (x86)\ossec-agent\config\monitored_services.json"
    
    $servicesToMonitor = $defaultWinServices
    if (Test-Path $agentConfigPath) {
        try {
            $cfg = Get-Content $agentConfigPath -Raw | ConvertFrom-Json
            if ($cfg.windows) { $servicesToMonitor = $cfg.windows }
        } catch {}
    } elseif (Test-Path $configPath) {
        try {
            $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
            if ($cfg.windows) { $servicesToMonitor = $cfg.windows }
        } catch {}
    }

    $servicesChecked = @()
    $servicesDownList = @()

    # Check Docker Engine Status (Process / Service)
    $dockerRunning = $false
    $dockerProc = Get-Process "Docker Desktop" -ErrorAction SilentlyContinue
    if ($dockerProc) {
        $dockerRunning = $true
    } else {
        $dockSvc = Get-Service "com.docker.service" -ErrorAction SilentlyContinue
        if ($dockSvc -and $dockSvc.Status -eq "Running") { $dockerRunning = $true }
    }
    if ($dockerRunning) {
        $servicesChecked += "Docker:UP"
    } else {
        $servicesChecked += "Docker:DOWN"
        $servicesDownList += "Docker"
    }

    # Check Windows Services
    foreach ($svcName in $servicesToMonitor) {
        if ($svcName -ne "com.docker.service" -and $svcName -ne "Docker") {
            $svcObj = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($svcObj) {
                if ($svcObj.Status -eq "Running") {
                    $servicesChecked += "$svcName:UP"
                } else {
                    $servicesChecked += "$svcName:DOWN"
                    $servicesDownList += $svcName
                }
            }
        }
    }
    $servicesSummary = if ($servicesChecked.Count -gt 0) { $servicesChecked -join " | " } else { "All Clean" }
    $servicesDownCount = $servicesDownList.Count
    $servicesDownNames = if ($servicesDownList.Count -gt 0) { $servicesDownList -join ", " } else { "None" }

    # 6. Active TCP Connections Count
    $activeConns = 0
    try {
        $activeConns = (Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Measure-Object).Count
    } catch {
        $activeConns = 0
    }

    # 7. System Uptime (Hours)
    $uptimeHours = [Math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)

    # 8. Top CPU Process
    $topProc = Get-Process -ErrorAction SilentlyContinue | Sort-Object CPU -Descending | Select-Object -First 1
    $topProcStr = if ($topProc) { "$($topProc.ProcessName) ($($topProc.Id))" } else { "N/A" }

    # 9. JSON Payload
    $metrics = [ordered]@{
        integration          = "system-metrics"
        host                 = $env:COMPUTERNAME
        os_type              = "windows"
        cpu_pct              = [double]$cpu
        ram_used_mb          = [int]$usedRamMb
        ram_total_mb         = [int]$totalRamMb
        ram_pct              = [double]$ramPct
        pagefile_pct         = [double]$pagefilePct
        disk_used_gb         = [double]$usedStorageGb
        disk_total_gb        = [double]$totalStorageGb
        disk_pct             = [double]$globalDiskPct
        worst_disk_pct       = [double]$worstDiskPct
        worst_disk_drive     = $worstDiskDrive
        disks_summary        = $disksSummary
        services_summary     = $servicesSummary
        services_down_count  = [int]$servicesDownCount
        services_down_names  = $servicesDownNames
        active_connections   = [int]$activeConns
        uptime_hours         = [double]$uptimeHours
        top_process          = $topProcStr
    }

    $json = $metrics | ConvertTo-Json -Compress
    Write-Output $json
} catch {
    $err = $_.Exception.Message -replace '"','\"'
    Write-Output "{`"integration`":`"system-metrics`",`"error`":`"$err`"}"
}
