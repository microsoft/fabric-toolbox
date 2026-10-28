#Requires -Modules Az.Accounts, Az.Resources

function Restore-Workspaces {
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

    try {
        foreach ($wsId in $workspaceIds) {
            try {
                $workspaceStatus = Invoke-RestMethod -Method GET -Uri "https://api.fabric.microsoft.com/v1/admin/workspaces/$wsId" -Headers $h
                $workspaceDisplayName = $workspaceStatus.name
                $workspaceState = $workspaceStatus.state

                if ($workspaceState -eq 'Deleted') {
                    $body = @{ newWorkspaceAdminPrincipal = @{ id = $adminOid; type = 'User' }; 'newWorkspaceName' = "RestoredWorkspace_$($workspaceDisplayName)_$wsId" } | ConvertTo-Json -Depth 5
                    
                    Invoke-RestMethod -Method POST -Uri "https://api.fabric.microsoft.com/v1/admin/workspaces/$wsId/restore" -Headers $h -Body $body
                    Write-Host "Restored inactive workspace, new workspace name: RestoredWorkspace_$($workspaceDisplayName)_$wsId"
                }
                elseif ($workspaceState -eq 'Removing') {
                    Write-Host "Workspace $wsId is in 'Removing' state, cannot reliably restore workspace as it is in the process of being permanently deleted"
                }
            }
            catch {
                Write-Warning "Error occurred: $($PSItem.Exception.Message)"
                continue
            }
        }
    }
    finally {
        $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ssPtr)
        $h = $null
    }
}