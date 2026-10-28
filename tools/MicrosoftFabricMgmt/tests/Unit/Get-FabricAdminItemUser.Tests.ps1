#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminItemUser.
    Verifies the Fabric admin item-users endpoint + method, default enrichment
    (workspaceId / itemId / WorkspaceName context + type) and that -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ displayName = 'Alice'; accessRight = 'Read'; principalType = 'User' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminItemUser' -Tag 'UnitTests' {

    It 'calls GET on the admin item users endpoint' {
        $null = Get-FabricAdminItemUser -WorkspaceId 'ws-1' -ItemId 'item-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/admin/workspaces/ws-1/items/item-1/users'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with workspaceId/itemId context, WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricAdminItemUser -WorkspaceId 'ws-1' -ItemId 'item-1'
        $r[0].workspaceId           | Should -Be 'ws-1'
        $r[0].itemId                | Should -Be 'item-1'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminItemUser'
        $r[0].displayName           | Should -Be 'Alice'
    }

    It '-Raw returns the untouched response (no added context, no type)' {
        $r = Get-FabricAdminItemUser -WorkspaceId 'ws-1' -ItemId 'item-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'itemId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminItemUser'
        $r[0].displayName              | Should -Be 'Alice'
    }
}
