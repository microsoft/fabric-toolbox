#Requires -Modules Az.Accounts, Az.Resources

function Add-AdminOnPersonalWorkspaces {
    [CmdletBinding()]

    param(
        [string]$AdminUpn=$null,
        [Parameter(Mandatory=$true)]
        [string]$PersonalWorkspaceIdsFilePath
    )

    $ErrorActionPreference = 'Stop'

    Set-StrictMode -Version Latest

    if ($PersonalWorkspaceIdsFilePath -ne $null -and (Test-Path -Path $PersonalWorkspaceIdsFilePath)) {
        $personalWorkspaceIds = Get-Content -Path $PersonalWorkspaceIdsFilePath
    }
    else {
        Write-Error "Personal workspace IDs file path is not provided or invalid. Please try again."
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

    try {
        $intervalBetweenRequestsMilliseconds = 2405 # 2.4s in ms with 5ms additional jitter

        foreach ($wsId in $personalWorkspaceIds) {
            # to avoid 429 errors, smooth out requests every 2.4 seconds (60 sec/25 req/minute) and use retry-after for 429 edge cases
            $attemptCounter = 0
            while ($true) {
                $attemptCounter++
                if ($attemptCounter -gt 5) {
                    Write-Warning "Maximum retry attempts reached for $wsId. Skipping workspace."
                    break
                }

                Start-Sleep -Milliseconds $intervalBetweenRequestsMilliseconds

                try {
                    Invoke-RestMethod -Method POST -Uri "https://api.fabric.microsoft.com/v1/admin/workspaces/$wsId/grantAdminTemporaryAccess" -Headers $h

                    Write-Host "Admin granted to $wsId via API (lasts for 24 hours)"
                    break
                } catch {
                    $response = $_.Exception.Response
                    
                    if (-not $response) {
                        throw
                    }

                    $error_returned = $response.StatusCode

                    if ($error_returned -ne 429) {
                        Write-Warning "API grant failed for $wsId ($error_returned). This may happen if already Admin. Use UI link if NOT already Admin: https://app.powerbi.com/groups/$wsId"
                        break
                    }

                    # 429 error case
                    # docs: https://learn.microsoft.com/en-us/rest/api/fabric/articles/throttling
                    $retryAfter = $response.Headers.RetryAfter

                    # RetryAfter is a RetryConditionHeaderValue, so the seconds come from Delta rather than the object itself
                    if ($null -ne $retryAfter -and $null -ne $retryAfter.Delta) {
                        $retryAfterSeconds = [Math]::Ceiling($retryAfter.Delta.TotalSeconds)
                    }
                    else {
                        $retryAfterSeconds = 60
                    }

                    Write-Host "Throttled, waiting $retryAfterSeconds seconds before retrying to add admin to $wsId"

                    Start-Sleep -Seconds $retryAfterSeconds
                    # request is automatically retried after because of the while true
                }
            }
        }
    }
    finally {
        $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ssPtr)
        $h = $null
    }

}