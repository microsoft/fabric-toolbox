#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDatasetDataflowLink.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (workspaceId / WorkspaceName + type), and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ datasetObjectId = 'ds-1'; dataflowObjectId = 'df-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDatasetDataflowLink' -Tag 'UnitTests' {

    It 'calls GET on the admin dataset upstream dataflows endpoint' {
        $null = Get-FabricAdminDatasetDataflowLink -WorkspaceId '55555555-5555-5555-5555-555555555555'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/55555555-5555-5555-5555-555555555555/datasets/upstreamDataflows'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with workspaceId, WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricAdminDatasetDataflowLink -WorkspaceId '55555555-5555-5555-5555-555555555555'
        $r[0].workspaceId           | Should -Be '55555555-5555-5555-5555-555555555555'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDatasetDataflowLink'
        $r[0].datasetObjectId       | Should -Be 'ds-1'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminDatasetDataflowLink -WorkspaceId '55555555-5555-5555-5555-555555555555' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDatasetDataflowLink'
    }
}
