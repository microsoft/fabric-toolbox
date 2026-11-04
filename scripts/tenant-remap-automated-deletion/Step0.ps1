#Requires -Modules Az.Accounts, Az.Resources
#Requires -Version 7

function Get-WorkspaceIds {
    [CmdletBinding()]

    param()

    $SharedWorkspaceIdsFilePath = 'sharedWorkspaceIds.txt'
    $PersonalWorkspaceIdsFilePath = 'personalWorkspaceIds.txt'
    $AllWorkspaceIdsFilePath = 'workspaceIds.txt'

    $ErrorActionPreference = 'Stop'

    Set-StrictMode -Version Latest

    if (($null -eq (Get-AzContext)) -or ((Get-AzContext).Account -like "MSI@*")) {
        Connect-AzAccount -UseDeviceAuthentication | Out-Null
    }

    $secureFabricToken = (Get-AzAccessToken -ResourceUrl 'https://api.fabric.microsoft.com').Token
    $ssPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureFabricToken)
    $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ssPtr)

    $h = @{ Authorization = "Bearer $plainTextFabricToken"; 'Content-Type' = 'application/json' }

    try {
        $nonPersonalWorkspaceIds = [System.Collections.Generic.List[string]]::new()
        $personalWorkspaceIds = [System.Collections.Generic.List[string]]::new()

        $uri = "https://api.fabric.microsoft.com/v1/admin/workspaces"
        $intervalBetweenRequestsMilliseconds = 18000
        $numRetries = 0
        $enumerationPassed = $true
        do {
            if ($numRetries -gt 5) {
                Write-Warning "Maximum retry attempts reached. Skipping remaining workspaces."
                $enumerationPassed = $false
                break
            }
            try {
                Start-Sleep -Milliseconds $intervalBetweenRequestsMilliseconds
                $response = Invoke-RestMethod -Method GET -Uri $uri -Headers $h
                $numRetries = 0
            }
            catch {
                $numRetries++
                $response = $_.Exception.Response
                        
                if (-not $response) {
                    continue
                }

                $error_returned = $response.StatusCode

                if ($error_returned -ne 429) {
                    Write-Warning "List Workspace API failed with error code ($error_returned)."
                    $enumerationPassed = $false
                    break
                }

                $retryAfter = $_.Exception.Response.Headers.RetryAfter
                if ($null -ne $retryAfter -and $null -ne $retryAfter.Delta) {
                    $retryAfterSeconds = [Math]::Ceiling($retryAfter.Delta.TotalSeconds)
                }
                else {
                    $retryAfterSeconds = 600
                }

                Write-Host "Throttled, waiting $retryAfterSeconds seconds before retrying to list workspaces again."

                Start-Sleep -Seconds $retryAfterSeconds

                continue
            }

            foreach ($ws in $response.workspaces) {
                switch ($ws.type) {
                    'Personal' {
                        $personalWorkspaceIds.Add($ws.id)
                    }
                    { $_ -in @('Workspace', 'AdminWorkspace') } {
                        $nonPersonalWorkspaceIds.Add($ws.id)
                    }
                    default {
                        Write-Warning "Skipping workspace $($ws.id) with unrecognized type '$($ws.type)'."
                    }
                }
            }

            $continuationToken = if ($response.PSObject.Properties.Name -contains 'continuationToken') { $response.continuationToken } else { $null }
            if ($continuationToken) {
                $uri = "https://api.fabric.microsoft.com/v1/admin/workspaces?continuationToken=$([System.Uri]::EscapeDataString($continuationToken))"
            }
        } while ($continuationToken)

        if (-not $enumerationPassed) {
            Write-Error "Workspace enumeration failed. Run this script again (Step0.ps1) before proceeding."
            return
        }

        Set-Content -Path $SharedWorkspaceIdsFilePath -Value $nonPersonalWorkspaceIds
        Set-Content -Path $PersonalWorkspaceIdsFilePath -Value $personalWorkspaceIds
        Set-Content -Path $AllWorkspaceIdsFilePath -Value ($nonPersonalWorkspaceIds + $personalWorkspaceIds)

        Write-Host "Wrote $($nonPersonalWorkspaceIds.Count) shared or non-personal workspace ID(s) to $SharedWorkspaceIdsFilePath"
        Write-Host "Wrote $($personalWorkspaceIds.Count) personal workspace ID(s) to $PersonalWorkspaceIdsFilePath"
        Write-Host "Wrote $($nonPersonalWorkspaceIds.Count + $personalWorkspaceIds.Count) total workspace ID(s) to $AllWorkspaceIdsFilePath"
    }
    catch {
        Write-Error "Error occurred: $($PSItem.Exception.Message)."
    }
    finally {
        $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ssPtr)
        $h = $null
    }
}