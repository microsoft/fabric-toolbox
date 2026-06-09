<# 
.SYNOPSIS
Set Up the Gateway Logs Configuration

.DESCRIPTION
TODO: Add a description

Default Gateway logs path: "C:\\Windows\\ServiceProfiles\\PBIEgwService\\AppData\\Local\\Microsoft\\On-premises data gateway"
C:\Windows\ServiceProfiles\PBIEgwService\AppData\Local\Microsoft\On-premises data gateway

.INFO
 .\Run-UploadGatewayLogs.ps1 .\Config.json
#>

#requires -Version 7

param(
    [string]
    $configFilePath = ".\configs\Config.json",
    [string]
    $logFolder = ".\logs\"
)

$ErrorActionPreference = "Stop"

Write-Host "*******************************************************************"
Write-Host "Starting Gateway Monitor Configuration"
Write-Host "*******************************************************************"
Write-Host "*******************************************************************"

if ((Read-Host "Install PowerShell Module Az.Accounts? Needed only for Lakehouse connectivity (Y/N)").ToUpper() -eq "Y") {
    Install-Module -Name Az.Accounts -Force
}

if ((Read-Host "Install PowerShell Module Az.Storage? Needed only for Lakehouse connectivity (Y/N)").ToUpper() -eq "Y") {
    Install-Module -Name Az.Storage -Force
}

if ((Read-Host "Install PowerShell Module DataGateway? Needed only for Lakehouse connectivity (Y/N)").ToUpper() -eq "Y") {
    Install-Module -Name DataGateway -Force
}

if ((Read-Host "Install PowerShell Module MicrosoftPowerBIMgmt? Needed only for GatewayInfo (Y/N)").ToUpper() -eq "Y") {
    Install-Module -Name MicrosoftPowerBIMgmt -Force
}

Write-Host "*******************************************************************"
Write-Host "*******************************************************************"

$ErrorActionPreference = "Stop"

Write-Host "Loading modules"

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

if (Test-Path $configFilePath) {

    $config = Get-Content $configFilePath | ConvertFrom-Json
    
}
else {
    throw "Cannot find config file '$configFilePath'"
}

Write-Host "*******************************************************************"
Write-Host "*******************************************************************"


#Set Gateway Id
Write-Host "Gateway Log Path: $($config.GatewayLogsPath[0])"

#Set Gateway Heartbeat
if ((Read-Host "Do you want to change the default Gateway Log Path? (Y/N)").ToUpper() -eq "Y") {

    $GatewayPath = $config.GatewayLogsPath[0]

    do {
        $GatewayPath = Read-Host "Set a valid Gateway Log folder"
    } while (!(Test-Path $GatewayPath))

    $config.GatewayLogsPath[0] = $GatewayPath 

    Write-Host "Gateway Log Path: $($config.GatewayLogsPath[0])"
}

Write-Host "*******************************************************************"
Write-Host "*******************************************************************"


#Set Gateway Id
Write-Host "Gateway Id: $($config.GatewayId)"

$reportFile = Get-ChildItem -path $config.GatewayLogsPath[0] -Recurse  | Where-Object { $_.Name -ilike "*Report_*.log" } | Sort-Object Length | Select-Object -first 1

if (!$reportFile) {
    Write-Host "Cannot find any report ('*Report_*.log') file on '$($config.GatewayLogsPath[0])' to infer the GatewayId."
    $config.GatewayId = Read-Host "Set the Gateway Id Manually"
}
else {
    $gatewayIdFromCSV = Get-Content -path $reportFile.FullName -First 2 | ConvertFrom-Csv | Select-Object -ExpandProperty GatewayObjectId            
    $config.GatewayId = $gatewayIdFromCSV  
}

Write-Host "Gateway Id: $($config.GatewayId)"


Write-Host "*******************************************************************"
Write-Host "*******************************************************************"

#Configure Service Principal

$config.ServicePrincipal.SecretText = ConvertTo-SecureWithMachineKey (Read-Host "Set the Service Principal Secret Text" -MaskInput)

Write-Host "*******************************************************************"
Write-Host "*******************************************************************"

New-Item -Path (Split-Path $configFilePath -Parent) -ItemType Directory -Force
    
ConvertTo-Json $config -Depth 5 | Out-File $configFilePath -force -Encoding utf8