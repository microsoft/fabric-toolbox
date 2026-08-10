#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricDeploymentPipelineStage: GET list + by-id endpoints,
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
        @([pscustomobject]@{ id = 'stage-1'; displayName = 'Development' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricDeploymentPipelineStage' -Tag 'UnitTests' {

    It 'calls GET on the stages list endpoint' {
        $null = Get-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/dp-1/stages'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends the stage id when -StageId is supplied' {
        $null = Get-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-9'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/dp-1/stages/stage-9'
    }

    It 'decorates the response type by default' {
        $r = Get-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.DeploymentPipelineStage'
        $r[0].id                    | Should -Be 'stage-1'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = Get-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -Raw
        $r[0].PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.DeploymentPipelineStage'
    }
}
