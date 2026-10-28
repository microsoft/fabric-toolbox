#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminGatewayInventory.
    This is an AGGREGATOR: it does not call Invoke-FabricAPIRequest directly, but joins the
    output of Get-FabricAdminGateway, Get-FabricAdminGatewayDatasource, Get-FabricAdminDataset,
    Get-FabricAdminDatasetDatasource and Get-FabricAdminReport into flat rows. These tests mock
    those functions and assert the aggregated output plus the -GatewayId scoping and -Raw behavior.
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

    # Gateway datasource id ('dsrc-1') must match the dataset datasource's datasourceId, and the
    # report's datasetId ('ds-1') must match the dataset id for a row to be emitted.
    Mock -ModuleName MicrosoftFabricMgmt Get-FabricAdminGateway {
        @([pscustomobject]@{ id = 'gw-1'; name = 'GW One' })
    }
    Mock -ModuleName MicrosoftFabricMgmt Get-FabricAdminGatewayDatasource {
        @([pscustomobject]@{
            id               = 'dsrc-1'
            datasourceName   = 'SQL DS'
            datasourceType   = 'Sql'
            connectionDetails = '{"server":"srv1","database":"db1"}'
        })
    }
    Mock -ModuleName MicrosoftFabricMgmt Get-FabricAdminDataset {
        @([pscustomobject]@{ id = 'ds-1'; name = 'Sales'; workspaceId = 'ws-1' })
    }
    Mock -ModuleName MicrosoftFabricMgmt Get-FabricAdminDatasetDatasource {
        @([pscustomobject]@{ datasourceId = 'dsrc-1' })
    }
    Mock -ModuleName MicrosoftFabricMgmt Get-FabricAdminReport {
        @([pscustomobject]@{ id = 'rep-1'; name = 'Sales Report'; datasetId = 'ds-1' })
    }
}

Describe 'Get-FabricAdminGatewayInventory' -Tag 'UnitTests' {

    It 'aggregates gateway/datasource/dataset/report into one flat row with resolved names' {
        $r = @(Get-FabricAdminGatewayInventory)
        $r.Count               | Should -Be 1
        $r[0].GatewayName      | Should -Be 'GW One'
        $r[0].GatewayId        | Should -Be 'gw-1'
        $r[0].DatasourceName   | Should -Be 'SQL DS'
        $r[0].DatasourceType   | Should -Be 'Sql'
        $r[0].Connection       | Should -Be 'srv1\db1'
        $r[0].DatasetId        | Should -Be 'ds-1'
        $r[0].DatasetName      | Should -Be 'Sales'
        $r[0].WorkspaceName    | Should -Be 'WS-Name'
        $r[0].ReportId         | Should -Be 'rep-1'
        $r[0].ReportName       | Should -Be 'Sales Report'
    }

    It 'scopes step 1 to a single gateway when -GatewayId is supplied' {
        $null = Get-FabricAdminGatewayInventory -GatewayId 'gw-1'
        Should -Invoke -ModuleName MicrosoftFabricMgmt Get-FabricAdminGateway -ParameterFilter { $GatewayId -eq 'gw-1' }
    }

    It '-Raw leaves the raw workspace id in the WorkspaceName column (no resolution)' {
        $r = @(Get-FabricAdminGatewayInventory -Raw)
        $r[0].WorkspaceName | Should -Be 'ws-1'
        Should -Not -Invoke -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName
    }
}
