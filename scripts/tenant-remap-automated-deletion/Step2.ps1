#Requires -Modules Az.Accounts, Az.Resources

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
            $ws = Invoke-RestMethod -Method GET -Uri "https://api.fabric.microsoft.com/v1/admin/workspaces/$wsId" -Headers $h

            if (-not $ws.capacityId) {
                Write-Host "[Assign Capacity] Assigning workspace $wsId to capacity $CapacityId"
                $body = @{ capacityId = $CapacityId } | ConvertTo-Json

                Invoke-RestMethod -Method POST -Uri "https://api.fabric.microsoft.com/v1/admin/workspaces/$wsId/assignToCapacity" -Headers $h -Body $body
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