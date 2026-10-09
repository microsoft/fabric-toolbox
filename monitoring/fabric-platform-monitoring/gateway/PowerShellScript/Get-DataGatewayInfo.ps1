<#
.SYNOPSIS
    Collects On-premises Data Gateway node information from the Microsoft Fabric
    REST API and publishes it to an Event Hub for platform monitoring.

.DESCRIPTION
    This script authenticates to Microsoft Fabric using a service principal defined
    in a JSON configuration file, then performs the following steps:

        1. Loads the helper modules found in the '.\Modules' folder (loading
           Utils.psm1 first so shared functions are available to the others).
        2. Reads and parses the configuration file (default '.\configs\Config.json').
        3. Decrypts the service principal client secret (protected with the local
           machine key) and signs in with Connect-AzAccount.
        4. Acquires a Fabric API access token and enumerates all gateways together
           with their members to locate the gateway member whose id matches the
           configured GatewayId.
        5. Gathers local machine details (OS, cores, memory) via Get-ComputerInfo
           and combines them with the gateway/member metadata into a single object.
        6. If an Event Hub connection string flagged as "Reports" exists in the
           configuration, wraps the object as a "GatewayNodeInfo" log message and
           sends it to the Event Hub via Add-MsgEventHub.

    Any error is written to the console and appended to
    '<logFolder>GatewayMonitoring.log'.

    This script is intended to run on the gateway machine itself (for example on a
    schedule) so that the reported machine metrics reflect that node.

.PARAMETER configFilePath
    Path to the JSON configuration file. Defaults to '.\configs\Config.json'.

    The configuration is expected to contain:
        - GatewayId                           Id of the gateway member to report on.
        - ServicePrincipal.TennatId           Azure AD tenant id.
        - ServicePrincipal.AppId              Service principal (application) id.
        - ServicePrincipal.SecretText         Client secret encrypted with the
                                              local machine key
                                              (see ConvertFrom-SecureWithMachineKey).
        - EventHubs.ConnectionStrings         Array of Event Hub connection strings;
                                              the entry with Report = "Reports" is used.
        - ConnectionProperties                Additional connection properties passed
                                              to Add-MsgEventHub.

.PARAMETER logFolder
    Folder where the error log ('GatewayMonitoring.log') is written.
    Defaults to '.\logs\'.

.EXAMPLE
    .\Get-DataGatewayInfo.ps1

    Runs the script using the default configuration and log paths.

.EXAMPLE
    .\Get-DataGatewayInfo.ps1 -configFilePath "C:\Fabric\Config.json" -logFolder "C:\Fabric\logs\"

    Runs the script using a custom configuration file and log folder.

.NOTES
    Requires PowerShell 7 or later and the Az.Accounts module.
    Depends on the helper modules in the '.\Modules' folder, including
    ConvertFrom-SecureWithMachineKey and Add-MsgEventHub.

    Before installing and registering a gateway, use Connect-DataGatewayServiceAccount
    to connect to the gateway service. See that cmdlet's help for details.
#>

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

    $secureClientSecret = (ConvertFrom-SecureWithMachineKey  $config.ServicePrincipal.SecretText) | ConvertTo-SecureString -AsPlainText -Force
    $memberId = $config.GatewayId
    $tenantId  = $config.ServicePrincipal.TenantId
    $appId = $Config.ServicePrincipal.AppId
    $servicePrincipal = [System.Management.Automation.PSCredential]::new($appId, $secureClientSecret)
    

    Connect-AzAccount -ServicePrincipal -Credential $servicePrincipal -TenantId $tenantId
    Set-AzContext -Tenant $tenantId | Out-Null
    $resourceUrl = "https://api.fabric.microsoft.com"
    $authTokenInfo = (Get-AzAccessToken -ResourceUrl $resourceUrl -AsSecureString)
    $authToken = $authTokenInfo.Token | ConvertFrom-SecureString -AsPlainText
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

    $computerInfo = Get-ComputerInfo 

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
        osName = $computerInfo.OsName
        osVersion = $computerInfo.OsVersion
        cores = $computerInfo.CsNumberOfProcessors
        logicalCores = $computerInfo.CsNumberOfLogicalProcessors
        memoryGb = ($computerInfo.CsTotalPhysicalMemory / 1Gb)
    }


    $body = @{
        logType = "GatewayNodeInfo"
        log     = @($gatewayObject)
        logDate = [datetime]::UtcNow
    } | ConvertTo-Json -Depth 5

    Add-MsgEventHub -msg $body -connectionType "Reports" -config $config

}
catch {    
    $ex = $_.Exception   
    $ErrorDate = [datetime]::UtcNow     
    Write-Error "Error on Get-DataGatewayInfo - $ex" -ErrorAction Continue     
    Out-File  -FilePath "$($logFolder)GatewayMonitoring.log" -InputObject "[Error] $ErrorDate; $ex" -Force -Append
}   