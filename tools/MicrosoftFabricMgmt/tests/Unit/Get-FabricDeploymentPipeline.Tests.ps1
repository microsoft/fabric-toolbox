#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricDeploymentPipeline: GET list + by-id endpoints,
    type decoration by default, -Raw untouched.
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
        @([pscustomobject]@{ id = 'dp-1'; displayName = 'Pipeline1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricDeploymentPipeline' -Tag 'UnitTests' {

    It 'calls GET on the deploymentPipelines list endpoint' {
        $null = Get-FabricDeploymentPipeline
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends the pipeline id when -DeploymentPipelineId is supplied' {
        $null = Get-FabricDeploymentPipeline -DeploymentPipelineId 'dp-9'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/dp-9'
    }

    It 'decorates the response type by default' {
        $r = Get-FabricDeploymentPipeline
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.DeploymentPipeline'
        $r[0].id                    | Should -Be 'dp-1'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = Get-FabricDeploymentPipeline -Raw
        $r[0].PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.DeploymentPipeline'
    }
}
