#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Remove-FabricDeploymentPipelineStageWorkspace:
    POST unassignWorkspace endpoint, no body, -WhatIf makes no call.
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

Describe 'Remove-FabricDeploymentPipelineStageWorkspace' -Tag 'UnitTests' {

    It 'POSTs to the unassignWorkspace endpoint' {
        $null = Remove-FabricDeploymentPipelineStageWorkspace -DeploymentPipelineId 'pipe-1' -StageId 'stage-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/pipe-1/stages/stage-1/unassignWorkspace'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends no request body' {
        $global:__capBody = 'sentinel'
        $null = Remove-FabricDeploymentPipelineStageWorkspace -DeploymentPipelineId 'pipe-1' -StageId 'stage-1' -Confirm:$false
        $global:__capBody | Should -BeNullOrEmpty
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Remove-FabricDeploymentPipelineStageWorkspace -DeploymentPipelineId 'pipe-1' -StageId 'stage-1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
