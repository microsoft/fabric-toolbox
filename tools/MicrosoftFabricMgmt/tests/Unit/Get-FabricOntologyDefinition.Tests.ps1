#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricOntologyDefinition.
    Verifies the getDefinition endpoint + POST method, that the API response passes
    through untouched, and that -Raw returns the response.
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
                parts = @([pscustomobject]@{ path = 'ontology.json'; payload = 'eyJ9'; payloadType = 'InlineBase64' })
            }
        }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricOntologyDefinition' -Tag 'UnitTests' {

    It 'calls POST on the ontologies getDefinition endpoint' {
        $null = Get-FabricOntologyDefinition -WorkspaceId 'ws-1' -OntologyId 'ont-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/ontologies/ont-1/getDefinition'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'returns the response with the base64 definition parts intact' {
        $r = Get-FabricOntologyDefinition -WorkspaceId 'ws-1' -OntologyId 'ont-1'
        $r.definition.parts[0].path        | Should -Be 'ontology.json'
        $r.definition.parts[0].payloadType | Should -Be 'InlineBase64'
    }

    It '-Raw returns the response' {
        $r = Get-FabricOntologyDefinition -WorkspaceId 'ws-1' -OntologyId 'ont-1' -Raw
        $r.definition.parts[0].payload | Should -Be 'eyJ9'
    }
}
