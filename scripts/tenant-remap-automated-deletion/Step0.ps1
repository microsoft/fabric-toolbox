#Requires -Modules Az.Accounts, Az.Resources

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
        do {
            $response = Invoke-RestMethod -Method GET -Uri $uri -Headers $h

            foreach ($ws in $response.workspaces) {
                switch ($ws.type) {
                    'Personal' {
                        $personalWorkspaceIds.Add($ws.id)
                    }
                    'Workspace' {
                        $nonPersonalWorkspaceIds.Add($ws.id)
                    }
                    default {
                        Write-Warning "Skipping workspace $($ws.id) with unrecognized type '$($ws.type)'"
                    }
                }
            }

            $continuationToken = if ($response.PSObject.Properties.Name -contains 'continuationToken') { $response.continuationToken } else { $null }
            if ($continuationToken) {
                $uri = "https://api.fabric.microsoft.com/v1/admin/workspaces?continuationToken=$([System.Uri]::EscapeDataString($continuationToken))"
            }
        } while ($continuationToken)

        Set-Content -Path $SharedWorkspaceIdsFilePath -Value $nonPersonalWorkspaceIds
        Set-Content -Path $PersonalWorkspaceIdsFilePath -Value $personalWorkspaceIds
        Set-Content -Path $AllWorkspaceIdsFilePath -Value ($nonPersonalWorkspaceIds + $personalWorkspaceIds)

        Write-Host "Wrote $($nonPersonalWorkspaceIds.Count) shared or non-personal workspace ID(s) to $SharedWorkspaceIdsFilePath"
        Write-Host "Wrote $($personalWorkspaceIds.Count) personal workspace ID(s) to $PersonalWorkspaceIdsFilePath"
        Write-Host "Wrote $($nonPersonalWorkspaceIds.Count + $personalWorkspaceIds.Count) total workspace ID(s) to $AllWorkspaceIdsFilePath"
    }
    catch {
        Write-Error "Error occurred: $($PSItem.Exception.Message)"
    }
    finally {
        $plainTextFabricToken = [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ssPtr)
        $h = $null
    }
}