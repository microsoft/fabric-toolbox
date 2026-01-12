<# 
.SYNOPSIS
Upload the logs from the Gateway to Fabric

.DESCRIPTION
Get the Logs and Reports file from the gateway and upload them to the Fabric Service
It can upload the gateway Reports to the EventStram/EventHub or to a Lakehouse
The Logs files will upload to the Lakehouse

TODO: Check if we can unblock the logfiles to upload the latest one and not wait for the process to release it

.INFO
 .\Run-UploadGatewayLogs.ps1 .\Config.json
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

    if (!$config.VerboseLogSendInterval) {
        $config | Add-Member -NotePropertyName "VerboseLogSendInterval" -NotePropertyValue 60 -Force
        ConvertTo-Json $config -Depth 5 | Out-File $configFilePath -force -Encoding utf8
    }
    
    if ($config.ServicePrincipal.SecretText) {
        $config.ServicePrincipal.SecretText = (ConvertFrom-SecureWithMachineKey  $config.ServicePrincipal.SecretText) | ConvertTo-SecureString -AsPlainText -Force
    }


}
else {
    throw "Cannot find config file '$configFilePath'"
}

if (!(Test-Path $logFolder)) {
    New-Item -Path $logFolder -ItemType Directory
}

$Interval = $config.ReportSendInterval * 1000

$ErrorCount = 0
$PreviewsErrorDate = [datetime]::UtcNow  

do {
    try {
        Write-Host "Running UploadGatewayLogs"

        $ElapsedTime = UploadGatewayLogs -config $config            

        $LogInterval = ($Interval - $ElapsedTime)

        if ($LogInterval -le 0) {
            $LogInterval = 1
        }

        Write-Host "Waiting $LogInterval"
    
        Start-Sleep -Milliseconds $LogInterval
    }
    catch {    
        $ex = $_.Exception   
        $ErrorDate = [datetime]::UtcNow     
        Write-Error "Error on UploadGatewayLogs - $ex" -ErrorAction Continue     
        Out-File  -FilePath "$($logFolder)GatewayMonitoring.log" -InputObject "[Error] $ErrorDate; $ex" -Force -Append
        $ErrorCount += 1
        if (($ErrorDate - $PreviewsErrorDate).TotalMinutes -lt 1 -and $ErrorCount -gt 5) {
            break
        }
        elseif (($ErrorDate - $PreviewsErrorDate).TotalMinutes -gt 1 -and $ErrorCount -gt 0) {
            $ErrorCount = 0
        }
        $PreviewsErrorDate = $ErrorDate
    }   
       
} while ($true)    
