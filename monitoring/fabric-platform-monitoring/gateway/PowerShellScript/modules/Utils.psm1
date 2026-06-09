function Add-FolderToBlobStorage {
    [cmdletbinding()]
    param
    (
        [string]
        $storageAccountName,
        [string]
        $storageAccountKey,
        [string]
        $storageAccountConnStr,
        [string]
        $storageContainerName,
        [string]
        $storageRootPath,
        [string]
        $folderPath,
        [string]
        $rootFolderPath,
        [bool]
        $ensureContainer = $true
    )
        
    if ($storageAccountConnStr) {
        $ctx = New-AzStorageContext -ConnectionString $storageAccountConnStr
    }
    else {
        $ctx = New-AzStorageContext -StorageAccountName $storageAccountName -StorageAccountKey $storageAccountKey
    }
    
    if ($ensureContainer) {
        New-AzStorageContainer -Context $ctx -Name $storageContainerName -Permission Off -ErrorAction SilentlyContinue | Out-Null
    }

    $files = @(Get-ChildItem -Path $folderPath -Filter *.* -Recurse -File)
    
    Write-Host "Adding folder '$folderPath' (files: $($files.Count)) to blobstorage '$storageAccountName/$storageContainerName/$storageRootPath'"

    if (!$rootFolderPath) {
        $rootFolderPath = $folderPath
    }

    foreach ($file in $files) {    
        $filePath = $file.FullName

        Add-FileToBlobStorageInternal -ctx $ctx -filePath $filePath -storageRootPath $storageRootPath -rootFolderPath  $rootFolderPath  
    }
}

function Add-FileToBlobStorage {
    [cmdletbinding()]
    param
    (
        [string]
        $storageAccountName,
        [string]
        $storageAccountKey,
        [string]
        $storageAccountConnStr,
        [string]
        $storageContainerName,
        [string]
        $storageRootPath,
        [string]
        $filePath,
        [string]
        $rootFolderPath,
        [bool]
        $ensureContainer = $true
    )
        
    if ($storageAccountConnStr) {
        $ctx = New-AzStorageContext -ConnectionString $storageAccountConnStr
    }
    else {
        $ctx = New-AzStorageContext -StorageAccountName $storageAccountName -StorageAccountKey $storageAccountKey
    }
    
    if ($ensureContainer) {                
        New-AzStorageContainer -Context $ctx -Name $storageContainerName -Permission Off -ErrorAction SilentlyContinue | Out-Null
    }
    
    Add-FileToBlobStorageInternal -ctx $ctx -filePath $filePath -storageRootPath $storageRootPath -rootFolderPath $rootFolderPath
    
}

function Add-FileToBlobStorageInternal {   
    param
    (        
        $ctx,             
        [string]
        $storageRootPath,
        [string]
        $filePath,
        [string]
        $rootFolderPath
    )
        
    if (Test-Path $filePath) {
        Write-Host "Adding file '$filePath' files to blobstorage '$storageAccountName/$storageContainerName/$storageRootPath'"
        
        $filePath = Resolve-Path $filePath        

        $filePath = $filePath.ToLower()

        $fileName = (Split-Path $filePath -Leaf)

        if ($rootFolderPath) {
            $rootFolderPath = Resolve-Path $rootFolderPath
            $rootFolderPath = $rootFolderPath.ToLower()
                
            $parentFolder = (Split-Path $filePath -Parent)
            $relativeFolder = $parentFolder.Replace($rootFolderPath, "").Replace("\", "/").TrimStart("/").Trim();
        }

        if (!([string]::IsNullOrEmpty($relativeFolder))) {
            $blobName = "$storageRootPath/$relativeFolder/$fileName"
        }
        else {
            $blobName = "$storageRootPath/$fileName"
        }

        Set-AzStorageBlobContent -File $filePath -Container $storageContainerName -Blob $blobName -Context $ctx -Force | Out-Null    
    }
    else {
        Write-Host "File '$filePath' dont exist"
    }
}

function Get-ArrayInBatches {
    [cmdletbinding()]
    param
    (        
        [array]$array
        ,
        [int]$batchCount
        ,
        [ScriptBlock]$script
        ,
        [string]$label = "Get-ArrayInBatches"
    )

    $skip = 0

    do {   
        $batchItems = @($array | Select-Object -First $batchCount -Skip $skip)

        if ($batchItems) {
            Write-Host "[$label] Batch: $($skip + $batchCount) / $($array.Count)"
            
            Invoke-Command -ScriptBlock $script -ArgumentList @(, $batchItems)

            $skip += $batchCount
        }       
        
    }
    while ($batchItems.Count -ne 0 -and $batchItems.Count -ge $batchCount)   
}

function Connect-Lakehouse {
    [cmdletbinding()]
    param (
        [string]
        $TenantId,
        [string]
        $AppId,
        [psobject]
        $SecretText
    )

    $sp = @{
        $TenantId           = $TenantId
        AppId               = $AppId
        PasswordCredentials = $SecretText
    }

    $pscredential = New-Object -TypeName System.Management.Automation.PSCredential -ArgumentList $sp.AppId, $sp.PasswordCredentials
    Connect-AzAccount -ServicePrincipal -Credential $pscredential -TenantId $sp.$TenantId
    
}

function Add-FileToLakehouse {
    [cmdletbinding()]
    param
    (        
        $ctx,             
        [string]
        $workspaceName,
        [string]
        $filePath,
        [string]
        $lakehousePath
    )

    if (!$ctx) {
        $ctx = New-AzStorageContext -StorageAccountName 'onelake' -UseConnectedAccount -endpoint 'fabric.microsoft.com' 
    }

    if (Test-Path $filePath) {
        Write-Host "Adding file '$filePath' files to Lakehouse '$workspaceName/$filePath/'"
        
        $filePath = Resolve-Path $filePath        

        $workspaceName = $workspaceName.ToLower()

        New-AzDataLakeGen2Item -Context $ctx -FileSystem $workspaceName -Path $lakehousePath -Source $filePath -Force 
    }
    else {
        Write-Host "File '$filePath' dont exist"
    }

    
}

function Split-EventHubConnectionString {
    [cmdletbinding()]
    param
    (
        [string]
        $connectionString #Event Hub Connection String - Endpoint=sb://{ehNameSpace}.servicebus.windows.net/;SharedAccessKeyName={keyname};SharedAccessKey={key};EntityPath={ehName}
    )

    $ehNameValues = $connectionString -split ";"

    $value = @{
        "ehNameSpace" = $ehNameValues[0] -replace "sb://", "" -split "=", 2  | Select-Object -Index 1
        "keyName"     = $ehNameValues[1] -split "=", 2 |  Select-Object -Index 1
        "key"         = $ehNameValues[2] -split "=", 2 |  Select-Object -Index 1
        "ehName"      = $ehNameValues[3] -split "=", 2 |  Select-Object -Index 1
    }

    return $value
}

function Add-LogToEventHub {
        
    [cmdletbinding()]
    param
    (
        [string]
        $connectionString,
        [string]
        $logPath,
        [string]
        $logType,
        [psobject]
        $ConnectionProperties
    )

    # create Request Body
    $csv = Import-Csv -Path $logPath 
    $csvCount = $csv.Count
    if ($csvCount -gt 0) {
        $csvMaxIndex = $csvCount - 1
        $continue = $true
        $correctSize = $true
        $chunckSize = 2000 
        $minIndex = 0
        $maxIndex = $minIndex + $chunckSize - 1
    
        do {

            if ($maxIndex -ge $csvMaxIndex) {
                $maxIndex = $csvMaxIndex
                $continue = $false
            }

            do {            

                $dif = ($maxIndex - $minIndex)
                $currentPart = $csv | Select-Object -Index ($minIndex..$maxIndex)

                if ($dif -eq 0 -and $correctSize -eq $false -and $logType -eq "QueryStartReport") {
                    $currentPart.QueryText = "QueryText too large!"
                }

                $body = @{
                    logType = $logType
                    log     = @($currentPart)
                    logDate = [datetime]::UtcNow
                } | ConvertTo-Json -Depth 5

                $jsonSize = [Text.Encoding]::UTF8.GetByteCount($body) / 1024

                if ($jsonSize -ge 980) {
                    $maxIndex = $minIndex + [math]::floor( $dif / 2)
                    $correctSize = $false
                    $continue = $true
                }
                else {
                    $correctSize = $true
                }

            } while (-Not $correctSize) 

            Add-MsgEventHub -connectionString $connectionString -msg $body -connectionProperties $ConnectionProperties

            $minIndex = $maxIndex + 1
            $maxIndex = $minIndex + $chunckSize
    
        } while ($continue)   
    }
}

function Add-MsgEventHub {
    [cmdletbinding()]
    param
    (
        [string]
        $connectionString,
        [string]
        $msg,
        [psobject]
        $connectionProperties
    )

    $connectionStringSplited = Split-EventHubConnectionString -connectionString $connectionString

    $ehName = $connectionStringSplited.ehName # hub name    
    $ehNameSpace = $connectionStringSplited.ehNameSpace # namespace    
    $keyName = $connectionStringSplited.keyName     
    $key = $connectionStringSplited.key


    # Load the System.Web assembly to enable UrlEncode
    [Reflection.Assembly]::LoadWithPartialName("System.Web") | Out-Null

    $URI = "{0}{1}" -f @($ehNameSpace, $ehName)
    $encodedURI = [System.Web.HttpUtility]::UrlEncode($URI)

    # Calculate expiry value one hour ahead
    $expiry = [string](([DateTimeOffset]::Now.ToUnixTimeSeconds()) + 3600)

    # Create the signature
    $stringToSign = [System.Web.HttpUtility]::UrlEncode($URI) + "`n" + $expiry

    $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
    $hmacsha.key = [Text.Encoding]::ASCII.GetBytes($key)

    $signature = $hmacsha.ComputeHash([Text.Encoding]::ASCII.GetBytes($stringToSign))
    $signature = [System.Web.HttpUtility]::UrlEncode([Convert]::ToBase64String($signature))

    # API headers
    #
    $headers = @{
        "Authorization" = "SharedAccessSignature sr=" + $encodedURI + "&sig=" + $signature + "&se=" + $expiry + "&skn=" + $keyName;
    }

    # execute the Azure REST API
    $method = "POST"
    $dest = "https://" + $URI + '/messages?timeout=60&api-version=2014-01'

    Invoke-RestMethod -Uri $dest -Method $method -Headers $headers -Body $msg -Verbose -ContentType "application/atom+xml;type=entry;charset=utf-8" -MaximumRetryCount $connectionProperties.MaximumRetryCount -RetryIntervalSec $connectionProperties.RetryIntervalSec

}

function Merge-ReportFiles {
    [cmdletbinding()]
    param (
        [string]
        $logFile,
        [string]
        $report
    )
        
    $logPath = Split-Path $logFile -Parent
    $logFileName = Split-Path $logFile -Leaf

    $date = [datetime]::UtcNow

    $historyFolder = New-Item -Path ("$(Split-Path $logPath -Parent)\History") -ItemType Directory -Force -ErrorAction SilentlyContinue 

    $packFiles = Get-ChildItem -Path $historyFolder -Filter "$report*_f.log" -Recurse -ErrorAction SilentlyContinue | where-object { ($date.Date -eq $_.CreationTime.Date) -and ($_.Length -lt 100mb) }

    $packFile = ""

    if ($packFiles.Count -eq 0) {
        $MachineName = $logFileName -split "_" | Select-Object -first 1 -Skip 1
        $DateString = $date.ToString("yyyyMMddTHHmmss")
        $packFile = "$($historyFolder.FullName)\$($report)_$($MachineName)_$($DateString)_f.log"
    }
    else {
        $packFile = $packFiles[0].FullName
    }

    Import-Csv -Path $logFile | Export-Csv $packFile -NoTypeInformation -Append -Force


    Remove-Item -Path $logFile -Force -ErrorAction SilentlyContinue | Out-Null

    return $packFile
}

function Remove-OldReportFiles {
    [cmdletbinding()]
    param (
        [string]
        $logFile,
        [int]
        $daysToKeep
    )
        
    $logPath = Split-Path $logFile -Parent


    $date = ([datetime]::UtcNow).AddDays(-$daysToKeep)

    $historyFolder = New-Item -Path ("$(Split-Path $logPath -Parent)\History") -ItemType Directory -Force -ErrorAction SilentlyContinue 

    $packFiles = Get-ChildItem -Path $historyFolder -Filter "$report*_f.log" -Recurse -ErrorAction SilentlyContinue | where-object { ($date -gt $_.LastWriteTimeUtc.Date) } | Remove-Item

    Return $packFiles


}
Function ConvertTo-SecureWithMachineKey($s) {
    Add-Type -AssemblyName System.Security

    $bytes = [System.Text.Encoding]::Unicode.GetBytes($s)
    $SecureStr = [Security.Cryptography.ProtectedData]::Protect($bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
    $SecureStrBase64 = [System.Convert]::ToBase64String($SecureStr)
    return $SecureStrBase64
}

Function ConvertFrom-SecureWithMachineKey($s) {
    Add-Type -AssemblyName System.Security

    $SecureStr = [System.Convert]::FromBase64String($s)
    $bytes = [Security.Cryptography.ProtectedData]::Unprotect($SecureStr, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine)
    $Password = [System.Text.Encoding]::Unicode.GetString($bytes)
    return $Password
}