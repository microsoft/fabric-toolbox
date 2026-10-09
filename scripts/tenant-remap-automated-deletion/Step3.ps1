#Requires -Modules Az.Accounts, Az.Resources
#Requires -Version 7

function Add-AdminOnSharedWorkspaces {
    [CmdletBinding()]

    param(
        [string]$AdminUpn=$null,
        [Parameter(Mandatory=$true)]
        [string]$SharedWorkspaceIdsFilePath
    )

    $ErrorActionPreference = 'Stop'

    Set-StrictMode -Version Latest

    if ($SharedWorkspaceIdsFilePath -ne $null -and (Test-Path -Path $SharedWorkspaceIdsFilePath)) {
        $sharedWorkspaceIds = Get-Content -Path $SharedWorkspaceIdsFilePath
    }
    else {
        Write-Error "Shared workspace IDs file path is not provided or invalid. Please try again."
        return
    }

    # authentication to get admin object ID for API calls
    if (($null -eq (Get-AzContext)) -or ((Get-AzContext).Account -like "MSI@*")) {
        # force device authentication if no account present or if using Managed Service ID (MSI)
        Connect-AzAccount -UseDeviceAuthentication | Out-Null
    }

    if (-not $AdminUpn) { $AdminUpn = (Get-AzContext).Account.Id }

    $adminOid = (Get-AzADUser -UserPrincipalName $AdminUpn).Id
    $adminEmailAddress = (Get-AzADUser -UserPrincipalName $AdminUpn).mail

    $secureFabricToken = (Get-AzAccessToken -ResourceUrl 'https://api.fabric.microsoft.com').Token
    $ssPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureFabricToken)
    $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ssPtr)

    $h = @{ Authorization = "Bearer $plainTextFabricToken"; 'Content-Type' = 'application/json' }

    try {
        foreach ($wsId in $sharedWorkspaceIds) {
            $intervalBetweenRequestsMilliseconds = 18000 # 3600s/200 requests = 18s/request = 18000ms
            $numGetUsersRetries = 0

            while ($true) {
                if ($numGetUsersRetries -gt 5) {
                    Write-Warning "Maximum retry attempts reached. Skipping workspace $wsId"
                    $getSucceeded = $false
                    break
                }

                try {
                    Start-Sleep -Milliseconds $intervalBetweenRequestsMilliseconds
                    $users = Invoke-RestMethod -Method GET -Uri "https://api.powerbi.com/v1.0/myorg/admin/groups/$wsId/users" -Headers $h
                    $getSucceeded = $true
                    break
                }
                catch {
                    $getSucceeded = $false
                    $numGetUsersRetries++

                    $response = $_.Exception.Response
                    
                    if (-not $response) {
                        continue
                    }

                    $error_returned = $response.StatusCode

                    if ($error_returned -ne 429) {
                        Write-Warning "Get Workspace Users API failed with error code ($error_returned)."
                        break
                    }

                    $retryAfter = $_.Exception.Response.Headers.RetryAfter
                    if ($null -ne $retryAfter -and $null -ne $retryAfter.Delta) {
                        $retryAfterSeconds = [Math]::Ceiling($retryAfter.Delta.TotalSeconds)
                    }
                    else {
                        # default to 60 seconds if Retry-After header is not present or invalid
                        $retryAfterSeconds = 60
                    }

                    Write-Host "Throttled, waiting $retryAfterSeconds seconds before retrying to get workspace users again."
                    Start-Sleep -Seconds $retryAfterSeconds
                }
            }

            if ($getSucceeded -eq $false) {
                Write-Warning "Skipping workspace $wsId due to failures in retrieving its users."
                continue
            }

            $isAdmin = $users.value | Where-Object { $_.graphId -eq $adminOid -and $_.groupUserAccessRight -eq 'Admin' }

            if ($isAdmin) { Write-Host "Admin already assigned to workspace $wsId"; continue }

            $body = @{ emailAddress = $adminEmailAddress; groupUserAccessRight = 'Admin' } | ConvertTo-Json -Depth 5

            $numAddAdminRetries = 0
            while ($true) {
                if ($numAddAdminRetries -gt 5) {
                    Write-Warning "Maximum retry attempts reached. Skipping adding admin for workspace $wsId"
                    break
                }

                try {
                    Start-Sleep -Milliseconds $intervalBetweenRequestsMilliseconds
                    Invoke-RestMethod -Method POST -Uri "https://api.powerbi.com/v1.0/myorg/admin/groups/$wsId/users" -Headers $h -Body $body
                    Write-Host "Admin granted to $wsId via API."
                    break
                }
                catch {
                    $numAddAdminRetries++
                    $response = $_.Exception.Response
                    
                    if (-not $response) {
                        continue
                    }

                    $error_returned = $response.StatusCode

                    if ($error_returned -ne 429) {
                        Write-Warning "Add Admin API failed with error code ($error_returned)."
                        break
                    }

                    $retryAfter = $_.Exception.Response.Headers.RetryAfter
                    if ($null -ne $retryAfter -and $null -ne $retryAfter.Delta) {
                        $retryAfterSeconds = [Math]::Ceiling($retryAfter.Delta.TotalSeconds)
                    }
                    else {
                        # default to 60 seconds if Retry-After header is not present or invalid
                        $retryAfterSeconds = 60
                    }

                    Write-Host "Throttled, waiting $retryAfterSeconds seconds before retrying to add admin to $wsId"
                    Start-Sleep -Seconds $retryAfterSeconds
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
