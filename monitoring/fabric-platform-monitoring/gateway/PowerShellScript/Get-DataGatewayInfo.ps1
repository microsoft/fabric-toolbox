# This sample helps automate the installation and configuration of the On-premises data gateway using available PowerShell cmdlets. This script helps with silent install of new gateway cluster with one gateway member only. The script also allows addition gateway admins. For information on each PowerShell script visit the help page for individual PowerSHell cmdlets.

# Before begining to install and register a gateway, for connecting to the gateway service, you would need to use the # Connect-DataGatewayServiceAccount. More information documented in the help page of that cmdlet.

#requires -Version 7 -Modules Az.Accounts

param(
    [string]
    $configFilePath = ".\configs\Config.json",
    [string]
    $logFolder = ".\logs\"
)

$ErrorActionPreference = "stop"

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

try {

    $secureClientSecret = $config.ServicePrincipal.SecretText  | ConvertTo-SecureString
    $memberId = $config.GatewayId
    $tenantId  = $config.ServicePrincipal.TennatId
    $appId = $Config.ServicePrincipal.AppId
    $servicePrincipal = New-Object PSCredential -ArgumentList $appId, $secureClientSecret
    

    Connect-AzAccount -ServicePrincipal -Credential $servicePrincipal -TenantId $tenantId
    Set-AzContext -Tenant $tenantId | Out-Null
    $resourceUrl = "https://api.fabric.microsoft.com"
    $authToken = (Get-AzAccessToken -ResourceUrl $resourceUrl).Token
    $fabricHeaders = @{
        'Content-Type'  = "application/json; charset=utf-8"
        'Authorization' = "Bearer {0}" -f $authToken
    }

    $gateways = (Invoke-WebRequest -Headers $fabricHeaders -Method Get -Uri "$resourceUrl/v1/gateways/").Content | ConvertFrom-Json

    foreach ($gateway in $gateways.value) {
        $member = ((Invoke-WebRequest -Headers $fabricHeaders -Method Get -Uri "$resourceUrl/v1/gateways/$($gateway.id)/members").Content | ConvertFrom-Json).value | Where-Object {$_.id -eq $memberId}
        if ($member) 
        {
            break
        }
    }

    $computerInfor = Get-ComputerInfo 

    $gatewayObject = @{
        clusterId = $gateway.id
        clusterName = $gateway.displayName
        nodeId = $member.id
        machine = $member.displayName
        cloudDatasourceRefresh = $gateway.allowCloudConnectionRefresh
        contactInformation = ""
        customConnectors = $gateway.allowCustomConnectors
        status = "Installed"
        type = $gateway.type
        version = $member.version
        versionStatus = ""
        osName = $computerInfor.OsName
        osVersion = $computerInfor.OsVersion
        cores = $computerInfor.CsNumberOfProcessors
        logicalCores = $computerInfor.CsNumberOfLogicalProcessors
        memoryGb = ($computerInfor.CsTotalPhysicalMemory / 1Gb)
    }

    $eventStreamConnection = ($config.EventHubs.ConnectionStrings | Where-Object { $_.Report -eq "Reports" }).EventHubConnectionString

    if ($eventStreamConnection){
        $body = @{
            logType = "GatewayNodeInfo"
            log     = @($gatewayObject)
            logDate = [datetime]::UtcNow
        } | ConvertTo-Json -Depth 5

        Add-MsgEventHub -connectionString $eventStreamConnection -msg $body -connectionProperties $config.ConnectionProperties
    }

}
catch {    
    $ex = $_.Exception   
    $ErrorDate = [datetime]::UtcNow     
    Write-Error "Error on UploadGatewayLogs - $ex" -ErrorAction Continue     
    Out-File  -FilePath "$($logFolder)GatewayMonitoring.log" -InputObject "[Error] $ErrorDate; $ex" -Force -Append
}   