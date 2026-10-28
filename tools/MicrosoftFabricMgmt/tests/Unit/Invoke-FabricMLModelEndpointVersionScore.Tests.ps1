#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Invoke-FabricMLModelEndpointVersionScore: POST version score URI
    (lowercase mlmodels), InputData passed through as body, response returned.
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

Describe 'Invoke-FabricMLModelEndpointVersionScore' -Tag 'UnitTests' {

    It 'POSTs to the version score URI (lowercase mlmodels)' {
        $null = Invoke-FabricMLModelEndpointVersionScore -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -InputData $script:input
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlmodels/model-1/endpoint/versions/3/score'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'passes InputData through as the request body' {
        $null = Invoke-FabricMLModelEndpointVersionScore -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -InputData $script:input
        $b = $global:__capBody | ConvertFrom-Json
        $b.inputs[0][0] | Should -Be 5.1
    }

    It 'returns the score response' {
        $r = Invoke-FabricMLModelEndpointVersionScore -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3' -InputData $script:input
        $r.predictions | Should -Not -BeNullOrEmpty
    }
}
