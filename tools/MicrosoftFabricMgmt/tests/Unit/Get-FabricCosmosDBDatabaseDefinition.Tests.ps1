#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricCosmosDBDatabaseDefinition.
    Verifies the getDefinition endpoint + POST method, that the API response passes
    through untouched (no name enrichment / no type decoration), and that -Raw returns
    the response.
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
        [pscustomobject]@{
            definition = [pscustomobject]@{
                parts = @([pscustomobject]@{ path = 'db.json'; payload = 'eyJ9'; payloadType = 'InlineBase64' })
            }
        }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricCosmosDBDatabaseDefinition' -Tag 'UnitTests' {

    It 'calls POST on the cosmosDbDatabases getDefinition endpoint' {
        $null = Get-FabricCosmosDBDatabaseDefinition -WorkspaceId 'ws-1' -CosmosDBDatabaseId 'db-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/cosmosDbDatabases/db-1/getDefinition'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'returns the response with the base64 definition parts intact' {
        $r = Get-FabricCosmosDBDatabaseDefinition -WorkspaceId 'ws-1' -CosmosDBDatabaseId 'db-1'
        $r.definition.parts[0].path        | Should -Be 'db.json'
        $r.definition.parts[0].payloadType | Should -Be 'InlineBase64'
    }

    It '-Raw returns the response' {
        $r = Get-FabricCosmosDBDatabaseDefinition -WorkspaceId 'ws-1' -CosmosDBDatabaseId 'db-1' -Raw
        $r.definition.parts[0].payload | Should -Be 'eyJ9'
    }
}
