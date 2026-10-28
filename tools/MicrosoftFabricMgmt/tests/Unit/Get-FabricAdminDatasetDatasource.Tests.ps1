#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDatasetDatasource.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (datasetId / DatasetName / GatewayName + type), and that -Raw returns the
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricDatasetName { 'DS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricGatewayName { 'GW-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ datasourceType = 'Sql'; datasourceId = 'src-1'; gatewayId = 'gw-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDatasetDatasource' -Tag 'UnitTests' {

    It 'calls GET on the admin dataset datasources endpoint' {
        $null = Get-FabricAdminDatasetDatasource -DatasetId '66666666-6666-6666-6666-666666666666'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/datasets/66666666-6666-6666-6666-666666666666/datasources'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with datasetId, DatasetName, GatewayName and type by default (originals preserved)' {
        $r = Get-FabricAdminDatasetDatasource -DatasetId '66666666-6666-6666-6666-666666666666'
        $r[0].datasetId             | Should -Be '66666666-6666-6666-6666-666666666666'
        $r[0].DatasetName           | Should -Be 'DS-Name'
        $r[0].GatewayName           | Should -Be 'GW-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDatasetDatasource'
        $r[0].datasourceType        | Should -Be 'Sql'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminDatasetDatasource -DatasetId '66666666-6666-6666-6666-666666666666' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'DatasetName'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'GatewayName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDatasetDatasource'
    }
}
