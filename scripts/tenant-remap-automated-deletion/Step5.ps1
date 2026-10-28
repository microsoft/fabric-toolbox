#Requires -Modules Az.Accounts, Az.Resources

function Remove-AllActiveArtifacts {
    [CmdletBinding()]

    param(
        [string]$AdminUpn=$null,
        [Parameter(Mandatory=$true)]
        [string]$WorkspaceIdsFilePath
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

    if (($null -eq (Get-AzContext)) -or ((Get-AzContext).Account -like "MSI@*")) {
        Connect-AzAccount -UseDeviceAuthentication | Out-Null
    }

    if (-not $AdminUpn) { $AdminUpn = (Get-AzContext).Account.Id }

    $adminOid = (Get-AzADUser -UserPrincipalName $AdminUpn).Id

    $secureFabricToken = (Get-AzAccessToken -ResourceUrl 'https://api.fabric.microsoft.com').Token
    $ssPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureFabricToken)
    $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ssPtr)

    $h = @{ Authorization = "Bearer $plainTextFabricToken"; 'Content-Type' = 'application/json' }

    $confirmationPromptResponse = Read-Host "Are you sure that you want to permanently delete ALL of your active artifacts? Type YES (case-sensitive) to confirm" 
    if ($confirmationPromptResponse -cne "YES") {
        Write-Error "Confirmation not received. Skipping deletion of active artifacts. Please try again."
        return
    }
    
    try {
        foreach ($wsId in $workspaceIds) {
            Write-Host "[Workspace] $($wsId)`n"
            
            $workspaceItems = [System.Collections.ArrayList]::new()

            $uri = "https://api.fabric.microsoft.com/v1/workspaces/$wsId/items?include=DefaultIdentity"
            do {
                $response = Invoke-RestMethod -Method GET -Uri $uri -Headers $h
                $response.value | ForEach-Object { $workspaceItems.Add($_) | Out-Null }

                $continuationToken = if ($response.PSObject.Properties.Name -contains 'continuationToken') { $response.continuationToken } else { $null }
                if ($continuationToken) {
                    $uri = "https://api.fabric.microsoft.com/v1/workspaces/$wsId/items?include=DefaultIdentity&continuationToken=$([System.Uri]::EscapeDataString($continuationToken))"
                }
            } while ($continuationToken)
            
            $formattedWorkspaceItems = $workspaceItems | ConvertTo-Json -Depth 5
            $formattedWorkspaceItems | Out-File -FilePath "workspace_$($wsId)_active_artifacts.json"

            # filter down to Fabric only
            $fabricItems = $workspaceItems | Where-Object { $_.type -NotIn @('SemanticModel', 'Dashboard', 'Report', 'PaginatedReport')}
            $formattedFabricItems = $fabricItems | ConvertTo-Json -Depth 5
            $formattedFabricItems | Out-File -FilePath "workspace_$($wsId)_active_fabric_artifacts.json"

            foreach ($artifact in $fabricItems) {
                $attemptCounter = 0
                while ($true) {
                    $attemptCounter++
                    if ($attemptCounter -gt 5) {
                        Write-Warning "Maximum retry attempts reached for artifact $($artifact.id). Skipping artifact."
                        break
                    }

                    try {
                        Write-Host "Found artifact, ID: $($artifact.id), Type: $($artifact.type), Name: $($artifact.displayName)`n"
                
                        Invoke-RestMethod -Method DELETE -Uri "https://api.fabric.microsoft.com/v1/workspaces/$wsId/items/$($artifact.id)?hardDelete=True" -Headers $h
                        Write-Host "Hard deleted artifact, ID: $($artifact.id)"
                        break
                    }
                    catch {
                        $response = $_.Exception.Response
                    
                        if (-not $response) {
                            throw
                        }

                        $error_returned = $response.StatusCode

                        if ($error_returned -ne 429) {
                            Write-Warning "API grant failed for $wsId ($error_returned). This may happen if already Admin. Use UI link if NOT already Admin: https://app.powerbi.com/groups/$wsId"
                            break
                        }

                        $retryAfter = $response.Headers.RetryAfter

                        # RetryAfter is a RetryConditionHeaderValue, so the seconds come from Delta rather than the object itself
                        if ($null -ne $retryAfter -and $null -ne $retryAfter.Delta) {
                            $retryAfterSeconds = [Math]::Ceiling($retryAfter.Delta.TotalSeconds)
                        }
                        else {
                            $retryAfterSeconds = 60
                        }

                        Write-Host "Throttled, waiting $retryAfterSeconds seconds before retrying to delete $($artifact.id)"

                        Start-Sleep -Seconds $retryAfterSeconds
                    }
                }
            }
        }
    }
    catch {
        Write-Error "Error occurred: $($PSItem.Exception.Message)"
    }
    finally {
        $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ssPtr)
        $h = $null
    }
}