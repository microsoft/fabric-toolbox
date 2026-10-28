#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminReport.
    Verifies the tenant-wide and workspace-scoped Power BI admin report endpoints + method,
    default enrichment (WorkspaceName / CapacityName / type) and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ id = 'rp-1'; name = 'Sales'; workspaceId = 'ws-1'; datasetId = 'ds-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminReport' -Tag 'UnitTests' {

    It 'calls GET on the tenant-wide admin reports endpoint by default' {
        $null = Get-FabricAdminReport
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/reports'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'uses the workspace-scoped endpoint when -WorkspaceId is supplied' {
        $null = Get-FabricAdminReport -WorkspaceId 'ws-9'
        $global:__capUri | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/ws-9/reports'
    }

    It 'enriches with WorkspaceName, CapacityName and type by default (originals preserved)' {
        $r = Get-FabricAdminReport
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminReport'
        $r[0].id                    | Should -Be 'rp-1'
        $r[0].datasetId             | Should -Be 'ds-1'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminReport -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminReport'
        $r[0].id                       | Should -Be 'rp-1'
    }
}
