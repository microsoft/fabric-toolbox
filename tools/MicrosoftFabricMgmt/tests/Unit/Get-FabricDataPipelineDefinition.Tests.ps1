#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricDataPipelineDefinition: POST /getDefinition endpoint,
    optional format query parameter, passthrough response, -Raw untouched.
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
        [pscustomobject]@{ definition = [pscustomobject]@{ parts = @(@{ path = 'pipeline-content.json' }) } }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricDataPipelineDefinition' -Tag 'UnitTests' {

    It 'POSTs to the getDefinition endpoint' {
        $null = Get-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/dataPipelines/dp-1/getDefinition'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'appends the format query parameter when -Format is supplied' {
        $null = Get-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1' -Format 'default'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/dataPipelines/dp-1/getDefinition?format=default'
    }

    It 'returns the definition passthrough' {
        $r = Get-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1'
        $r.definition.parts[0].path | Should -Be 'pipeline-content.json'
    }

    It '-Raw returns the untouched response' {
        $r = Get-FabricDataPipelineDefinition -WorkspaceId 'ws-1' -DataPipelineId 'dp-1' -Raw
        $r.definition.parts[0].path | Should -Be 'pipeline-content.json'
    }
}
