#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricWarehouseRestorePoint: POST /restorePoints, request body,
    WorkspaceName enrichment + type by default, -Raw untouched, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'rp-1'; displayName = 'Before upgrade' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricWarehouseRestorePoint' -Tag 'UnitTests' {

    It 'POSTs to the restorePoints endpoint' {
        $null = New-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -DisplayName 'Before upgrade' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/warehouses/wh-1/restorePoints'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends displayName and description in the body' {
        $null = New-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -DisplayName 'Before upgrade' -Description 'pre-deploy' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.displayName | Should -Be 'Before upgrade'
        $b.description | Should -Be 'pre-deploy'
    }

    It 'enriches with WorkspaceName + type by default (originals preserved)' {
        $r = New-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -DisplayName 'Before upgrade' -Confirm:$false
        $r.WorkspaceName         | Should -Be 'WS'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.WarehouseRestorePoint'
        $r.id                    | Should -Be 'rp-1'
    }

    It '-Raw returns the untouched response' {
        $r = New-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -DisplayName 'Before upgrade' -Raw -Confirm:$false
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.WarehouseRestorePoint'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        New-FabricWarehouseRestorePoint -WorkspaceId 'ws-1' -WarehouseId 'wh-1' -DisplayName 'Before upgrade' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
