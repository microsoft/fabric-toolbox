<# 
.SYNOPSIS
Create a Heartbeat process for the Gateway

.DESCRIPTION
This script will loop and send to the EventStream process in Fabric a status of the Gateway.
It checks the process "Microsoft.PowerBI.EnterpriseGateway"

.INFO
 .\Run-GatewayHeartbeat.ps1 .\Config.json .
#>
#requires -Version 7 -Modules Az.Accounts, Az.Storage

param(
    [string]
    $configFilePath = ".\configs\Config.json",
    [string]
    $logFolder = ".\logs\"
)

$ErrorActionPreference = "Stop"

$currentPath = (Split-Path $MyInvocation.MyCommand.Definition -Parent)

Set-Location $currentPath

Write-Host "Loading modules"

#import the powershell functions to run the rest of the script
$modulesFolder = "$currentPath\Modules"
Get-Childitem $modulesFolder -Name -Filter "*.psm1" `
| Sort-Object -Property @{ Expression = { if ($_ -eq "Utils.psm1") { " " }else { $_ } } } `
| ForEach-Object {
    $modulePath = "$modulesFolder\$_"
    Unblock-File $modulePath
    Import-Module $modulePath -Force
}

Write-Host "Current Path: $currentPath"

Write-Host "Config Path: $configFilePath"

if (Test-Path $configFilePath) {
    $config = Get-Content $configFilePath | ConvertFrom-Json
}
else {
    throw "Cannot find config file '$configFilePath'"
}

if (!(Test-Path $logFolder)) {
    New-Item -Path $logFolder -ItemType Directory
}

$processName = "Microsoft.PowerBI.EnterpriseGateway"

$EventHub = $config.EventHubs.ConnectionStrings | Where-Object { $_.Report -eq "Heartbeat" }

$HearbeatInterval = $config.HeartbeatInterval * 1000

$gatewayId = $config.GatewayId

$ErrorCount = 0
$PreviewsErrorDate = [datetime]::UtcNow  

do {
    try {
        #Timer and current date
        $stopwatch = [System.Diagnostics.Stopwatch]::new()
        $stopwatch.Start()   

        $process = Get-Process $processName -ErrorAction SilentlyContinue

        $currentDate = [datetime]([datetime]::UtcNow).ToString("yyyy-MM-dd HH:mm:ss")

        if ($process) {
            $processMsg = @{
                "GatewayId"          = $gatewayId
                "ProcessName"        = $processName
                "ProductVersion"     = $process.ProductVersion
                "FileVersion"        = $process.FileVersion
                "Responding"         = $process.Responding
                "StartTime"          = $process.StartTime
                "ServerTimestampUTC" = $currentDate
            }
        }
        else {
            $processMsg = @{
                "GatewayId"          = $gatewayId
                "ProcessName"        = $processName
                "ProductVersion"     = $null
                "FileVersion"        = $null
                "Responding"         = $false
                "StartTime"          = $null
                "ServerTimestampUTC" = $currentDate
            }
        }

        $msg = $processMsg | ConvertTo-Json

        Add-MsgEventHub -connectionString $EventHub.EventHubConnectionString -msg $msg -connectionProperties $config.ConnectionProperties
    }
    catch {
        $ex = $_.Exception
        $ErrorDate = [datetime]::UtcNow
        Write-Error "Error on GatewayHearbeat - $ex" -ErrorAction Continue     
        Out-File  -FilePath "$($logFolder)Heartbeat.log" -InputObject "[Error] $ErrorDate; $ex" -Force -Append
        $ErrorCount += 1
        if (($ErrorDate - $PreviewsErrorDate).TotalMinutes -lt 1 -and $ErrorCount -gt 5) {
            break
        }
        elseif (($ErrorDate - $PreviewsErrorDate).TotalMinutes -gt 1 -and $ErrorCount -gt 0) {
            $ErrorCount = 0
        }
        $PreviewsErrorDate = $ErrorDate
    }
    finally {
        $stopwatch.Stop()   
        $LogInterval = [math]::Abs($HearbeatInterval - $stopwatch.Elapsed.TotalMilliseconds)
        Write-Host "Waiting $LogInterval"
        Start-Sleep -Milliseconds $LogInterval            
    }

} while ($true)

