#Requires -Modules Az.Accounts, Az.Resources
#Requires -Version 7

function Set-WorkspacesToCapacity {
    [CmdletBinding()]

    param(
        [Parameter(Mandatory=$true)]
        [string]$WorkspaceIdsFilePath,
        [Parameter(Mandatory=$true)]
        [string]$CapacityId
    )

    $ErrorActionPreference = 'Stop'

    Set-StrictMode -Version Latest

    if ($WorkspaceIdsFilePath -ne $null -and (Test-Path -Path $WorkspaceIdsFilePath)) {
        $workspaceIds = Get-Content -Path $WorkspaceIdsFilePath
    }
    else {
        Write-Error "Workspace IDs file path is not provided or invalid. Please try again."
        return
    }

    if ($CapacityId -eq $null -or $CapacityId -eq '') {
        Write-Error "Capacity ID is not provided or invalid. Please try again."
        return
    }

    if (($null -eq (Get-AzContext)) -or ((Get-AzContext).Account -like "MSI@*")) {
        Connect-AzAccount -UseDeviceAuthentication | Out-Null
    }

    $secureFabricToken = (Get-AzAccessToken -ResourceUrl 'https://api.fabric.microsoft.com').Token
    $ssPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureFabricToken)
    $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ssPtr)

    $h = @{ Authorization = "Bearer $plainTextFabricToken"; 'Content-Type' = 'application/json' }

    try {
        foreach ($wsId in $workspaceIds) {
            $numGetWorkspaceRetries = 0

            while ($true) {
                if ($numGetWorkspaceRetries -gt 5) {
                    Write-Warning "Maximum retry attempts reached. Skipping getting information about workspace $wsId"
                    $getSucceeded = $false
                    break
                }

                try {
                    $ws = Invoke-RestMethod -Method GET -Uri "https://api.fabric.microsoft.com/v1/admin/workspaces/$wsId" -Headers $h
                    $getSucceeded = $true
                    break
                }
                catch {
                    $getSucceeded = $false
                    $numGetWorkspaceRetries++
                    
                    $response = $_.Exception.Response
                    
                    if (-not $response) {
                        continue
                    }

                    $error_returned = $response.StatusCode

                    if ($error_returned -ne 429) {
                        Write-Warning "Get Workspace API failed with error code ($error_returned)."
                        break
                    }
                    else {
                        $retryAfter = $_.Exception.Response.Headers.RetryAfter
                        
                        if ($null -ne $retryAfter -and $null -ne $retryAfter.Delta) {
                            $retryAfterSeconds = [Math]::Ceiling($retryAfter.Delta.TotalSeconds)
                        }
                        else {
                            $retryAfterSeconds = 60
                        }

                        Write-Host "Throttled, waiting $retryAfterSeconds seconds before retrying to get workspace status again."
                        Start-Sleep -Seconds $retryAfterSeconds
                        continue
                    }
                }
            }

            if ($getSucceeded -eq $false) {
                Write-Warning "Skipping workspace $wsId, could not retrieve workspace status."
                continue
            }

            if (-not $ws.capacityId) {
                Write-Host "[Assign Capacity] Assigning workspace $wsId to capacity $CapacityId"
                $body = @{ capacityId = $CapacityId } | ConvertTo-Json

                $numAssignCapacityRetries = 0
                while ($true) {
                    if ($numAssignCapacityRetries -gt 5) {
                        Write-Warning "Maximum retry attempts reached. Skipping assigning capacity for workspace $wsId"
                        break
                    }
                    try {
                        Invoke-RestMethod -Method POST -Uri "https://api.fabric.microsoft.com/v1/admin/workspaces/$wsId/assignToCapacity" -Headers $h -Body $body
                        break
                    }
                    catch {
                        $numAssignCapacityRetries++

                        $response = $_.Exception.Response
                        
                        if (-not $response) {
                            continue
                        }

                        $error_returned = $response.StatusCode

                        if ($error_returned -ne 429) {
                            Write-Warning "Assign Capacity API failed with error code ($error_returned)."
                            break
                        }

                        $retryAfter = $_.Exception.Response.Headers.RetryAfter
                        if ($null -ne $retryAfter -and $null -ne $retryAfter.Delta) {
                            $retryAfterSeconds = [Math]::Ceiling($retryAfter.Delta.TotalSeconds)
                        }
                        else {
                            $retryAfterSeconds = 60
                        }

                        Write-Host "Throttled, waiting $retryAfterSeconds seconds before retrying to assign capacity again."
                        Start-Sleep -Seconds $retryAfterSeconds
                        continue
                    }
                }
            }
        }
    }
    catch {
        Write-Error "Error occurred: $($PSItem.Exception.Message)."
    }
    finally {
        $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ssPtr)
        $h = $null
    }
}