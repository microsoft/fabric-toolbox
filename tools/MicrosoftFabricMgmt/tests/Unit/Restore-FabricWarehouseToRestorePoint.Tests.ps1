#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Restore-FabricWarehouseToRestorePoint: POST /restorePoints/{id}/restore,
    no request body, -WhatIf makes no call.
#>

BeforeAll {
    Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule   = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop

    InModuleScope MicrosoftFabricMgmt {
        $script:FabricAuthContext = [pscustomobject]@{
            BaseUrl       = 'https://api.fabric.microsoft.com/v1'
            FabricHeaders = @{ Authorization = 'Bearer test' }
        }
    }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck {}
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog {}
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        $global:__capBody   = $Body
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Restore-FabricWarehouseToRestorePoint' -Tag 'UnitTests' {

    It 'POSTs to the restore endpoint with no body' {
        $global:__capBody = 'sentinel'
        Restore-FabricWarehouseToRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -RestorePointId 'rp-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/warehouses/wh-1/restorePoints/rp-1/restore'
        $global:__capMethod | Should -Be 'Post'
        $global:__capBody   | Should -BeNullOrEmpty
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Restore-FabricWarehouseToRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -RestorePointId 'rp-1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
