#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Tests for Add-FabricDatasetProperties (internal helper co-located with
    Get-FabricAdminDataset): promotes 'name' to DatasetName and resolves WorkspaceName.
#>

BeforeAll {
    Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule   = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop

    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog {}
}

Describe 'Add-FabricDatasetProperties' -Tag 'UnitTests' {

    It 'promotes name to DatasetName and resolves WorkspaceName' {
        InModuleScope MicrosoftFabricMgmt {
            $ds = [pscustomobject]@{ id = 'ds-1'; name = 'Sales'; workspaceId = 'ws-1' }
            Add-FabricDatasetProperties -Dataset $ds
            $ds.DatasetName   | Should -Be 'Sales'
            $ds.WorkspaceName | Should -Be 'WS-Name'
            $ds.id            | Should -Be 'ds-1'   # original preserved
        }
    }

    It 'adds DatasetName but no WorkspaceName when workspaceId is absent' {
        InModuleScope MicrosoftFabricMgmt {
            $ds = [pscustomobject]@{ id = 'ds-2'; name = 'NoWs' }
            Add-FabricDatasetProperties -Dataset $ds
            $ds.DatasetName | Should -Be 'NoWs'
            $ds.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        }
    }
}
