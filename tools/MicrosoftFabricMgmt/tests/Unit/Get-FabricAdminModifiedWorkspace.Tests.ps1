#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminModifiedWorkspace.
    Verifies the Power BI admin modified-workspaces endpoint + method, default enrichment
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
        @([pscustomobject]@{ id = 'mw-1'; workspaceId = 'ws-1'; lastUpdate = '2026-01-01T00:00:00Z' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminModifiedWorkspace' -Tag 'UnitTests' {

    It 'calls GET on the admin modified workspaces endpoint' {
        $null = Get-FabricAdminModifiedWorkspace
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/workspaces/modified'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with WorkspaceName, CapacityName and type by default (originals preserved)' {
        $r = Get-FabricAdminModifiedWorkspace
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminModifiedWorkspace'
        $r[0].id                    | Should -Be 'mw-1'
        $r[0].lastUpdate            | Should -Be '2026-01-01T00:00:00Z'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminModifiedWorkspace -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminModifiedWorkspace'
        $r[0].id                       | Should -Be 'mw-1'
    }
}
