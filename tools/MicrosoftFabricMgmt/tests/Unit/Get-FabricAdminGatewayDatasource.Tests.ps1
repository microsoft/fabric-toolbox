#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminGatewayDatasource.
    Verifies the constructed Power BI endpoint + method, default enrichment
    (gatewayId corrected / GatewayName / parsed Connection + type), and that -Raw
    returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricGatewayName { 'GW-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{
            id                = 'src-1'
            gatewayId         = 'cluster-99'
            datasourceName    = 'Sales DB'
            datasourceType    = 'Sql'
            connectionDetails = '{"server":"srv1","database":"db1"}'
        })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminGatewayDatasource' -Tag 'UnitTests' {

    It 'calls GET on the gateway datasources endpoint' {
        $null = Get-FabricAdminGatewayDatasource -GatewayId '77777777-7777-7777-7777-777777777777'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/gateways/77777777-7777-7777-7777-777777777777/datasources'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with corrected gatewayId, GatewayName, Connection and type by default (originals preserved)' {
        $r = Get-FabricAdminGatewayDatasource -GatewayId '77777777-7777-7777-7777-777777777777'
        $r[0].gatewayId             | Should -Be '77777777-7777-7777-7777-777777777777'
        $r[0].GatewayName           | Should -Be 'GW-Name'
        $r[0].Connection            | Should -Be 'srv1\db1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.GatewayDatasource'
        $r[0].datasourceName        | Should -Be 'Sales DB'
    }

    It 'unflattens connectionDetails onto the object (Sql: Server/Database + parsed object; raw preserved)' {
        $r = Get-FabricAdminGatewayDatasource -GatewayId '77777777-7777-7777-7777-777777777777'
        $r[0].Server   | Should -Be 'srv1'
        $r[0].Database | Should -Be 'db1'
        $r[0].ConnectionDetailsParsed.server | Should -Be 'srv1'
        # raw connectionDetails string left intact
        $r[0].connectionDetails | Should -Be '{"server":"srv1","database":"db1"}'
    }

    It '-Raw returns the untouched response (gatewayId not corrected, no added names, no flattening, no type)' {
        $r = Get-FabricAdminGatewayDatasource -GatewayId '77777777-7777-7777-7777-777777777777' -Raw
        $r[0].gatewayId                | Should -Be 'cluster-99'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'GatewayName'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'Connection'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'Server'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'ConnectionDetailsParsed'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.GatewayDatasource'
    }
}

Describe 'Get-FabricAdminGatewayDatasource unflatten by type' -Tag 'UnitTests' {

    BeforeAll {
        Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
            @(
                [pscustomobject]@{ id = 'o1'; datasourceName = 'Feed';   datasourceType = 'OData'; connectionDetails = '{"url":"https://contoso/odata"}' }
                [pscustomobject]@{ id = 'f1'; datasourceName = 'Budget'; datasourceType = 'File';  connectionDetails = '{"path":"\\\\nas\\fin\\b.xlsx"}' }
                [pscustomobject]@{ id = 'x1'; datasourceName = 'ERP';    datasourceType = 'Odbc';  connectionDetails = '{"connectionString":"Driver={PG};Server=pg1"}' }
            )
        }
    }

    It 'surfaces the type-specific field (OData->Url, File->Path, Odbc->ConnectionString)' {
        $r = Get-FabricAdminGatewayDatasource -GatewayId '77777777-7777-7777-7777-777777777777'
        ($r | Where-Object datasourceType -eq 'OData').Url              | Should -Be 'https://contoso/odata'
        ($r | Where-Object datasourceType -eq 'File').Path              | Should -Be '\\nas\fin\b.xlsx'
        ($r | Where-Object datasourceType -eq 'Odbc').ConnectionString  | Should -Be 'Driver={PG};Server=pg1'
    }
}
