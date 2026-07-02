#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminWorkspace.
    Verifies the Fabric admin workspaces endpoint + method (list and by-id), default enrichment
    (WorkspaceName / CapacityName / type) and that -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName           { 'WS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityIdFromWorkspace { 'cap-1' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName            { 'Cap-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ id = 'ws-1'; displayName = 'Analytics'; workspaceId = 'ws-1'; type = 'Workspace' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminWorkspace' -Tag 'UnitTests' {

    It 'calls GET on the admin workspaces list endpoint by default' {
        $null = Get-FabricAdminWorkspace
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/admin/workspaces'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'targets the by-id endpoint when -WorkspaceId is supplied' {
        $null = Get-FabricAdminWorkspace -WorkspaceId 'ws-9'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/admin/workspaces/ws-9'
    }

    It 'enriches with WorkspaceName, CapacityName and type by default (originals preserved)' {
        $r = Get-FabricAdminWorkspace
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminWorkspace'
        $r[0].id                    | Should -Be 'ws-1'
        $r[0].displayName           | Should -Be 'Analytics'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminWorkspace -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminWorkspace'
        $r[0].id                       | Should -Be 'ws-1'
    }
}
