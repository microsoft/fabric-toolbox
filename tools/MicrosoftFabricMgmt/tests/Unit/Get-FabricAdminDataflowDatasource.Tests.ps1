#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDataflowDatasource.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (dataflowId context + type), and that -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ datasourceType = 'Sql'; datasourceId = 'src-1'; gatewayId = 'gw-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDataflowDatasource' -Tag 'UnitTests' {

    It 'calls GET on the admin dataflow datasources endpoint' {
        $null = Get-FabricAdminDataflowDatasource -DataflowId '44444444-4444-4444-4444-444444444444'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/dataflows/44444444-4444-4444-4444-444444444444/datasources'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with dataflowId context and type by default (originals preserved)' {
        $r = Get-FabricAdminDataflowDatasource -DataflowId '44444444-4444-4444-4444-444444444444'
        $r[0].dataflowId            | Should -Be '44444444-4444-4444-4444-444444444444'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDataflowDatasource'
        $r[0].datasourceType        | Should -Be 'Sql'
    }

    It '-Raw returns the untouched response (no dataflowId, no type)' {
        $r = Get-FabricAdminDataflowDatasource -DataflowId '44444444-4444-4444-4444-444444444444' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'dataflowId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDataflowDatasource'
    }
}
