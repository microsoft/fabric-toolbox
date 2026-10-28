#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDataflowUpstream.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (workspaceId / dataflowId / WorkspaceName + type), and that -Raw returns the
    untouched response.
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
        @([pscustomobject]@{ targetDataflowId = 'up-1'; groupId = 'g-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDataflowUpstream' -Tag 'UnitTests' {

    It 'calls GET on the admin upstream dataflows endpoint' {
        $null = Get-FabricAdminDataflowUpstream -WorkspaceId '55555555-5555-5555-5555-555555555555' -DataflowId '44444444-4444-4444-4444-444444444444'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/55555555-5555-5555-5555-555555555555/dataflows/44444444-4444-4444-4444-444444444444/upstreamDataflows'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with workspaceId, dataflowId, WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricAdminDataflowUpstream -WorkspaceId '55555555-5555-5555-5555-555555555555' -DataflowId '44444444-4444-4444-4444-444444444444'
        $r[0].workspaceId           | Should -Be '55555555-5555-5555-5555-555555555555'
        $r[0].dataflowId            | Should -Be '44444444-4444-4444-4444-444444444444'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDataflowUpstream'
        $r[0].targetDataflowId      | Should -Be 'up-1'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminDataflowUpstream -WorkspaceId '55555555-5555-5555-5555-555555555555' -DataflowId '44444444-4444-4444-4444-444444444444' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDataflowUpstream'
    }
}
