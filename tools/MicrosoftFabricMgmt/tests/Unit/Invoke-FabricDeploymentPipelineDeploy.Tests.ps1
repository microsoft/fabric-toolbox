#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Invoke-FabricDeploymentPipelineDeploy:
    POST deploy endpoint, request body from supplied fields, -Raw, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'op-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Invoke-FabricDeploymentPipelineDeploy' -Tag 'UnitTests' {

    It 'POSTs to the deploy endpoint' {
        $null = Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId 'pipe-1' -SourceStageId 'src-1' -TargetStageId 'tgt-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/pipe-1/deploy'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends sourceStageId and targetStageId in the body' {
        $null = Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId 'pipe-1' -SourceStageId 'src-1' -TargetStageId 'tgt-1' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.sourceStageId | Should -Be 'src-1'
        $b.targetStageId | Should -Be 'tgt-1'
    }

    It 'includes note, items and options only when supplied' {
        $items = @(@{ sourceItemId = 'item-1'; itemType = 'Report' })
        $null = Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId 'pipe-1' -SourceStageId 'src-1' -Items $items -Note 'my note' -Options @{ allowCrossRegionDeployment = $true } -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.note | Should -Be 'my note'
        $b.items[0].sourceItemId | Should -Be 'item-1'
        $b.options.allowCrossRegionDeployment | Should -BeTrue
    }

    It 'omits optional fields when not supplied' {
        $null = Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId 'pipe-1' -SourceStageId 'src-1' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.PSObject.Properties.Name | Should -Not -Contain 'targetStageId'
        $b.PSObject.Properties.Name | Should -Not -Contain 'note'
    }

    It '-Raw returns the response' {
        $r = Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId 'pipe-1' -SourceStageId 'src-1' -Raw -Confirm:$false
        $r.id | Should -Be 'op-1'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Invoke-FabricDeploymentPipelineDeploy -DeploymentPipelineId 'pipe-1' -SourceStageId 'src-1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
