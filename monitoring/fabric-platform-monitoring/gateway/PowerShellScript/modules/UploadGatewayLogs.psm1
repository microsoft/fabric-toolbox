function ProcessLogFiles {
    param
    (
        [psobject]
        $logFiles, 
        [string]
        $storagePath, 
        [datetime]
        $executionDate, 
        [psobject]
        $eventHubs,
        [psobject]
        $lakehouse,
        [psobject]
        $servicePrincipal,
        [int]
        $reportRetention,
        [bool]
        $isReport,
        [psobject]
        $ConnectionProperties
    )

    Write-Host "Files modified since last run: $($logFiles.Count)"

    foreach ($logFile in $logFiles) {
                
        $storagePathTemp = $storagePath
        $fileReady = $true        

        Write-Host "Processing file: '$($logFile.FullName)'"            
        $fileOutputPath = ""     
            
        if ($isReport) {
            # Try to parse the report name of the file name
            $reportName = $logFile.Name -split "_" | Select-Object -first 1

            $storagePathTemp = ("$storagePath/$reportName/{0:yyyy}/{0:MM}/{0:dd}/" -f $executionDate)
                
            if ((Split-Path $logFile.DirectoryName -Leaf) -ne "Temp") {                   
                $fileOutputPath = "$($logFile.DirectoryName)\Temp\$($logFile.Name -replace ".log",("_{0:HH}{0:mm}{0:ss}_x.log" -f $executionDate))"     
                New-Item -Path (Split-Path $fileOutputPath -Parent) -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
            }
            else {
                $fileOutputPath = "$($logFile.DirectoryName)\$($logFile.Name)"     
            }

            # Local Move the file with retry in case of locked
            Write-Host "Copy/Moving file: '$($logFile.FullName)' to '$fileOutputPath'"
                
            $Stoploop = $false
            [int]$Retrycount = 0

            do {
                try {
                    # Try to parse the date out of the file name
                    $logFile = Move-Item -Path $logFile.FullName -Destination $fileOutputPath -Force -PassThru
                    $fileOutputPath = $logFile.FullName
                    Write-Host "Job completed"
                    $Stoploop = $true
                }
                catch {
                    if ($Retrycount -gt 0) {
                        Write-Host "Could not move the file after $Retrycount retrys."
                        Write-Host "Canceling $logFile.Name"
                        $Stoploop = $true
                        $fileReady = $false
                    }
                    else {
                        Write-Host "Could not move the file retrying..."
                        $Retrycount = $Retrycount + 1
                    }
                }
            }
            While ($Stoploop -eq $false)
        }
        else {

            $FilePattern = $logFile.Name | Select-String -Pattern "([a-zA-Z]+)(\d{4})(\d{2})(\d{2})"
                
            if ($FilePattern -and ($FilePattern.Matches[0].Groups.Count -ge 5)) {
                $FileType = $FilePattern.Matches[0].Groups[1].Value
                $FileYear = $FilePattern.Matches[0].Groups[2].Value
                $FileMonth = $FilePattern.Matches[0].Groups[3].Value
                $FileDay = $FilePattern.Matches[0].Groups[4].Value
                $storagePathTemp = ("$storagePath/$FileType/$FileYear/$FileMonth/$FileDay/")
            }
            else {
                $storagePathTemp = ("$storagePath/OtherLogs/{0:yyyy}/{0:MM}/{0:dd}/" -f $executionDate)
            }
            $fileOutputPath = $logFile.FullName
        }

        #Upload to EventStram
        if ($eventHubs.UploadReports -and $fileReady -and $isReport) {
            Write-Host "Loading $($logFile.Name)"            
            $eventStreamConnection = ($eventHubs.ConnectionStrings | Where-Object { $_.Report -eq "Reports" }).EventHubConnectionString

            if ($eventStreamConnection) {
                Write-Host "Sending to EventHub"
                Add-LogToEventHub -connectionString $eventStreamConnection -logPath $fileOutputPath -logType $reportName -ConnectionProperties $ConnectionProperties
            }
        }        

        #Upload to Lakehouse
        if ((($isReport -and $lakehouse.UploadReports) -or ($lakehouse.UploadLogs -and !$isReport)) -and $fileReady) {
            Write-Host "Loading $logFile.Name"

            $itemPath = "$($lakehouse.LakehouseName)/Files/$($storagePathTemp)$(Split-Path $fileOutputPath -Leaf)"
            $tempFile = ".\temp\$(Split-Path $fileOutputPath -Leaf)"
            if (!(Test-Path ".\temp")) {
                New-Item -Path ".\temp" -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
            }

            Connect-Lakehouse -TenantId $servicePrincipal.TennatId -AppId $servicePrincipal.AppId -SecretText $servicePrincipal.SecretText

            Copy-Item -Path $fileOutputPath -Destination $tempFile -Force -PassThru
            Add-FileToLakehouse -workspaceName $lakehouse.WorkspaceName -lakehousePath $itemPath -filePath $tempFile
            Remove-Item -Path $tempFile -Force
        }

        if ($isReport) {
            $fileOutputPath = Merge-ReportFiles -logFile $fileOutputPath -report $reportName
            Remove-OldReportFiles -logFile $fileOutputPath -daysToKeep $reportRetention
        }
    }
}

function UploadGatewayLogs {
    param(               
        [psobject]
        $config,
        [string]
        $stateFilePath = ".\configs\state.json"    
    )    

    try {

        #Timer and current date
        $stopwatch = [System.Diagnostics.Stopwatch]::new()
        $stopwatch.Start()   

        $runDate = [datetime]::UtcNow

        Write-Host "Upload - Gateway Logs Start"        

        $lastRunDate = $null

        if (Test-Path $stateFilePath) {
            $state = Get-Content $stateFilePath

            if ([string]::IsNullOrEmpty($state)) {
                $state = New-Object psobject 
            }
            else {
                $state = Get-Content $stateFilePath | ConvertFrom-Json
            }
        }
        else {
            $state = New-Object psobject 
        }
    
        if ($state.GatewayLogs.LastRun) {
            if (!($state.GatewayLogs.LastRun -is [datetime])) {
                $state.GatewayLogs.LastRun = [datetime]::Parse($state.GatewayLogs.LastRun).ToUniversalTime()
            }
            $lastRunDate = $state.GatewayLogs.LastRun
        }
        else {
            $state | Add-Member -NotePropertyName "GatewayLogs" -NotePropertyValue @{"LastRun" = $null } -Force
        }

        Write-Host "LastRun: '$lastRunDate'"

        if ($state.GatewayLogs.VerboseLastRun) {
            if (!($state.GatewayLogs.VerboseLastRun -is [datetime])) {
                $state.GatewayLogs.VerboseLastRun = [datetime]::Parse($state.GatewayLogs.VerboseLastRun).ToUniversalTime()
            }
            $verboseLastRun = $state.GatewayLogs.VerboseLastRun
        }
        else {
            if ($state.GatewayLogs) {
                $state.GatewayLogs.VerboseLastRun = (Get-Date -Date "2000-01-01")
            }
            else {
                $state | Add-Member -NotePropertyName "GatewayLogs" -NotePropertyValue @{"VerboseLastRun" = Get-Date -Date "2000-01-01" } -Force
            }
            $verboseLastRun = $state.GatewayLogs.VerboseLastRun
        }

        Write-Host "VerboseLastRun: '$verboseLastRun'"

        # Test the gateway logs path
        if (!(Test-Path $config.GatewayLogsPath)) {
            throw "Cannot find gateway logs path '$($config.GatewayLogsPath)' - https://docs.microsoft.com/en-us/data-integration/gateway/service-gateway-log-files"
        }

        #For each Log Paths in the Config
        foreach ($path in $config.GatewayLogsPath) {

            #Get metadata
            $gatewayProperties = @{                
                GatewayObjectId = $config.GatewayId             
            }

            # If GatewayObjectId is not specified try to find it in the logs
            if (!$gatewayProperties.GatewayObjectId) {
                $reportFile = Get-ChildItem -path $path -Recurse  | Where-Object { $_.Name -ilike "*Report_*.log" } | Sort-Object Length | Select-Object -first 1

                if (!$reportFile) {
                    Write-Host "Cannot find any report ('*Report_*.log') file on '$path' to infer the GatewayId. Please ensure there is at least one report. If its a newly installed Gateway you may need to run a refresh and wait a couple of minutes."
                    Exit
                }

                $gatewayIdFromCSV = Get-Content -path $reportFile.FullName -First 2 | ConvertFrom-Csv | Select-Object -ExpandProperty GatewayObjectId
            
                $gatewayProperties.GatewayObjectId = $gatewayIdFromCSV  

            }

            $gatewayId = $gatewayProperties.GatewayObjectId

            if (!$gatewayId) {
                throw "Gateway Id is not defined."
            }  

            $ConnectionProperties = $gatewayProperties.ConnectionProperties

            if (!$ConnectionProperties) {
                $ConnectionProperties = @{
                    MaximumRetryCount = 3
                    RetryIntervalSec  = 1
                }
            }
        
            # Gateway Reports
            if ($config.EventHubs.UploadReports -or $config.Lakehouse.UploadReports) {
                
                $outputPathReports = ("$($config.RootPath)/{0:gatewayid}/reports" -f $gatewayId)

                $logFiles = @(Get-ChildItem -File -Path "$path\*Report_*.log" -Exclude "*_f.log" -Recurse -ErrorAction SilentlyContinue)

                Write-Host "Gateway Report log count: $($logFiles.Count)"

                if ($logFiles.Count -gt 0) {
                    ProcessLogFiles -logFiles $logFiles -storagePath $outputPathReports -executionDate $runDate -eventHubs $config.EventHubs -lakehouse $config.Lakehouse -servicePrincipal $config.ServicePrincipal -reportRetention $config.ReportRetention -isReport $true  -ConnectionProperties $ConnectionProperties | Out-Null
                }
            }

            # Gateway Logs
            $VerboseLastRunDif = New-TimeSpan -Start $verboseLastRun -End $runDate
            if ($config.Lakehouse.UploadLogs -and ($VerboseLastRunDif.TotalSeconds -ge $config.VerboseLogSendInterval)) {

                $outputPathLogs = ("$($config.RootPath)/{0:gatewayid}/logs" -f $gatewayId)  

                $logFiles = @(Get-ChildItem -File -Path "$path\*.log" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -ge $verboseLastRun })

                Write-Host "Gateway Verbose Log count: $($logFiles.Count)"

                if ($logFiles.Count -gt 0) {
                    ProcessLogFiles -logFiles $logFiles -storagePath $outputPathLogs -executionDate $runDate -eventHubs $config.EventHubs  -lakehouse $config.Lakehouse -servicePrincipal $config.ServicePrincipal -isReport $false -ConnectionProperties $ConnectionProperties | Out-Null
                }

                $state.GatewayLogs.VerboseLastRun = $runDate.ToString("o")
            }
        }
    
        # Save state 

        $state.GatewayLogs.LastRun = $runDate.ToString("o")

        New-Item -Path (Split-Path $stateFilePath -Parent) -ItemType Directory -Force -ErrorAction SilentlyContinue | Out-Null
    
        ConvertTo-Json $state | Out-File $stateFilePath -force -Encoding utf8
        
    }
    finally {            
        $stopwatch.Stop()           
    }

    return $stopwatch.Elapsed.TotalMilliseconds
}