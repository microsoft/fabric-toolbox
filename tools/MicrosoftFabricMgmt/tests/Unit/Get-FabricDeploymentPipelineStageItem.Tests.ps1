#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricDeploymentPipelineStageItem: GET
    /deploymentPipelines/{id}/stages/{stageId}/items, type decoration by default,
    -Raw untouched.
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
        @([pscustomobject]@{ id = 'item-1'; itemDisplayName = 'MyLakehouse' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricDeploymentPipelineStageItem' -Tag 'UnitTests' {

    It 'calls GET on the stage items endpoint' {
        $null = Get-FabricDeploymentPipelineStageItem -DeploymentPipelineId 'dp-1' -StageId 'stage-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/dp-1/stages/stage-1/items'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'decorates the response type by default' {
        $r = Get-FabricDeploymentPipelineStageItem -DeploymentPipelineId 'dp-1' -StageId 'stage-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.DeploymentPipelineStageItem'
        $r[0].id                    | Should -Be 'item-1'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = Get-FabricDeploymentPipelineStageItem -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -Raw
        $r[0].PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.DeploymentPipelineStageItem'
    }
}
