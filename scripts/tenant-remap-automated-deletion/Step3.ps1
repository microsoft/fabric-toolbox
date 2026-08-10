#Requires -Modules Az.Accounts, Az.Resources

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
            $users = Invoke-RestMethod -Method GET -Uri "https://api.powerbi.com/v1.0/myorg/admin/groups/$wsId/users" -Headers $h
            $isAdmin = $users.value | Where-Object { $_.graphId -eq $adminOid -and $_.groupUserAccessRight -eq 'Admin' }

            if ($isAdmin) { Write-Host "Already Admin on $wsId"; continue }

            $body = @{ emailAddress = $adminEmailAddress; groupUserAccessRight = 'Admin' } | ConvertTo-Json -Depth 5

            Invoke-RestMethod -Method POST -Uri "https://api.powerbi.com/v1.0/myorg/admin/groups/$wsId/users" -Headers $h -Body $body

            Write-Host "Admin granted to $wsId via API"
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
