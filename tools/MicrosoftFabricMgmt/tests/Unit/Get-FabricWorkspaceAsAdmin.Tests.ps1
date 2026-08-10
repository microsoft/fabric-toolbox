#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricWorkspaceAsAdmin.
    Verifies the admin/workspaces endpoint + method, default enrichment
    (CapacityName + MicrosoftFabric.AdminWorkspace type), query filters, and that
    -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName { 'Cap-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ id = 'ws-1'; name = 'Finance'; type = 'Workspace'; capacityId = 'cap-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricWorkspaceAsAdmin' -Tag 'UnitTests' {

    It 'calls GET on the admin workspaces endpoint' {
        $null = Get-FabricWorkspaceAsAdmin
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/admin/workspaces'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'adds the state query parameter (lowercased) when -WorkspaceState is supplied' {
        $null = Get-FabricWorkspaceAsAdmin -WorkspaceState Deleted
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/admin/workspaces?state=deleted'
    }

    It 'enriches with CapacityName and the AdminWorkspace type by default (originals preserved)' {
        $r = Get-FabricWorkspaceAsAdmin
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminWorkspace'
        $r[0].name                  | Should -Be 'Finance'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricWorkspaceAsAdmin -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'CapacityName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminWorkspace'
    }
}
