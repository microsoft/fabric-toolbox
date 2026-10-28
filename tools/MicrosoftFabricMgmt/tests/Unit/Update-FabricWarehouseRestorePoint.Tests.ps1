#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricWarehouseRestorePoint: PATCH /restorePoints/{id},
    request body with supplied fields, enrichment + type by default, -Raw untouched,
    -WhatIf makes no call.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        $global:__capBody   = $Body
        [pscustomobject]@{ id = 'rp-1'; displayName = 'Renamed' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricWarehouseRestorePoint' -Tag 'UnitTests' {

    It 'PATCHes the restorePoints by-id endpoint' {
        $null = Update-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -RestorePointId 'rp-1' -DisplayName 'Renamed' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/warehouses/wh-1/restorePoints/rp-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'sends only supplied fields in the body' {
        $null = Update-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -RestorePointId 'rp-1' -DisplayName 'Renamed' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.displayName | Should -Be 'Renamed'
        $b.PSObject.Properties.Name | Should -Not -Contain 'description'
    }

    It 'enriches with WorkspaceName + type by default' {
        $r = Update-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -RestorePointId 'rp-1' -DisplayName 'Renamed' -Confirm:$false
        $r.WorkspaceName         | Should -Be 'WS'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.WarehouseRestorePoint'
    }

    It '-Raw returns the untouched response' {
        $r = Update-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -RestorePointId 'rp-1' -DisplayName 'Renamed' -Raw -Confirm:$false
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.WarehouseRestorePoint'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -RestorePointId 'rp-1' -DisplayName 'Renamed' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
