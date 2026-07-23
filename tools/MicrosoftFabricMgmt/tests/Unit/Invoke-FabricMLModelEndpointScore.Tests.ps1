#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Invoke-FabricMLModelEndpointScore: POST score URI (CAPITAL mlModels),
    InputData passed through as body, response returned.
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
        $global:__capBody   = $Body
        [pscustomobject]@{ predictions = @(@(1)) }
    }

    $script:input = @{ inputs = @(, @(5.1, 3.5, 1.4, 0.2)) }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Invoke-FabricMLModelEndpointScore' -Tag 'UnitTests' {

    It 'POSTs to the score URI (CAPITAL mlModels)' {
        $null = Invoke-FabricMLModelEndpointScore -WorkspaceId 'ws-1' -MLModelId 'model-1' -InputData $script:input
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlModels/model-1/endpoint/score'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'passes InputData through as the request body' {
        $null = Invoke-FabricMLModelEndpointScore -WorkspaceId 'ws-1' -MLModelId 'model-1' -InputData $script:input
        $b = $global:__capBody | ConvertFrom-Json
        $b.inputs[0][0] | Should -Be 5.1
    }

    It 'returns the score response' {
        $r = Invoke-FabricMLModelEndpointScore -WorkspaceId 'ws-1' -MLModelId 'model-1' -InputData $script:input
        $r.predictions | Should -Not -BeNullOrEmpty
    }
}
