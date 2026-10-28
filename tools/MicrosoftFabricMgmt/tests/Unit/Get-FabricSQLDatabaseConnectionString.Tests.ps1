#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricSQLDatabaseConnectionString.
    Verifies the connectionString endpoint + GET method, that the API response passes
    through untouched, query parameters, and that -Raw returns the response.
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
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog        {}
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        [pscustomobject]@{ connectionString = 'tcp:server.database.fabric.microsoft.com,1433' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricSQLDatabaseConnectionString' -Tag 'UnitTests' {

    It 'calls GET on the connectionString endpoint' {
        $null = Get-FabricSQLDatabaseConnectionString -WorkspaceId 'ws-1' -SQLDatabaseId 'sql-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/sqlDatabases/sql-1/connectionString'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends the privateLinkType query parameter when supplied' {
        $null = Get-FabricSQLDatabaseConnectionString -WorkspaceId 'ws-1' -SQLDatabaseId 'sql-1' -PrivateLinkType 'Workspace'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/sqlDatabases/sql-1/connectionString?privateLinkType=Workspace'
    }

    It 'returns the response with the connection string intact' {
        $r = Get-FabricSQLDatabaseConnectionString -WorkspaceId 'ws-1' -SQLDatabaseId 'sql-1'
        $r.connectionString | Should -Be 'tcp:server.database.fabric.microsoft.com,1433'
    }

    It '-Raw returns the response' {
        $r = Get-FabricSQLDatabaseConnectionString -WorkspaceId 'ws-1' -SQLDatabaseId 'sql-1' -Raw
        $r.connectionString | Should -Be 'tcp:server.database.fabric.microsoft.com,1433'
    }
}
