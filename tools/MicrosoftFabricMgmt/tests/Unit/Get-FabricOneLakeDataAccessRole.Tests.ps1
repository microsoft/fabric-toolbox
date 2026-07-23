#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricOneLakeDataAccessRole.
    Verifies the dataAccessRoles list endpoint + method (default), the preview
    Get-by-name endpoint (?preview=true), default enrichment via Select-FabricResource,
    and that -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName  { 'Cap-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ id = 'role-1'; name = 'DefaultReader'; workspaceId = 'ws-1'; capacityId = 'cap-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricOneLakeDataAccessRole' -Tag 'UnitTests' {

    It 'calls GET on the dataAccessRoles list endpoint' {
        $null = Get-FabricOneLakeDataAccessRole -WorkspaceId 'ws-1' -ItemId 'item-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/dataAccessRoles'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'calls the preview Get-by-name endpoint when -RoleName is supplied' {
        $null = Get-FabricOneLakeDataAccessRole -WorkspaceId 'ws-1' -ItemId 'item-1' -RoleName 'DefaultReader'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/dataAccessRoles/DefaultReader?preview=true'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches list results with WorkspaceName, CapacityName and type by default (originals preserved)' {
        $r = Get-FabricOneLakeDataAccessRole -WorkspaceId 'ws-1' -ItemId 'item-1'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.OneLakeDataAccessRole'
        $r[0].name                  | Should -Be 'DefaultReader'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricOneLakeDataAccessRole -WorkspaceId 'ws-1' -ItemId 'item-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'CapacityName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.OneLakeDataAccessRole'
    }
}
