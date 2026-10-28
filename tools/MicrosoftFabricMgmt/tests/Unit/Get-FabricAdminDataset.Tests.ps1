#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDataset.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (DatasetName / WorkspaceName / type), and that -Raw returns the untouched response.
#>

BeforeAll {
    # Load ONLY the freshly built module (avoid a stale installed copy shadowing it).
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
    # Capture the request; return a representative unwrapped item array.
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ id = 'ds-1'; name = 'Sales'; workspaceId = 'ws-1'; configuredBy = 'u@contoso.com' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDataset' -Tag 'UnitTests' {

    It 'calls GET on the admin datasets endpoint' {
        $null = Get-FabricAdminDataset
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/datasets'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with DatasetName, WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricAdminDataset
        $r[0].DatasetName           | Should -Be 'Sales'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDataset'
        $r[0].id                    | Should -Be 'ds-1'
        $r[0].configuredBy          | Should -Be 'u@contoso.com'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminDataset -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'DatasetName'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDataset'
    }

    It 'scopes to a workspace group when -WorkspaceId is supplied' {
        $null = Get-FabricAdminDataset -WorkspaceId 'ws-9'
        $global:__capUri | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/ws-9/datasets'
    }
}
