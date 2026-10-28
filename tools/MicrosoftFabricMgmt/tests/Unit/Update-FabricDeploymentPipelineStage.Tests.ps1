#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricDeploymentPipelineStage: PATCH
    /deploymentPipelines/{id}/stages/{stageId}, request body (incl. isPublic $false),
    type decoration by default, -Raw untouched, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'stage-1'; displayName = 'Production' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricDeploymentPipelineStage' -Tag 'UnitTests' {

    It 'PATCHes the stages by-id endpoint' {
        $null = Update-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -DisplayName 'Production' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/dp-1/stages/stage-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'sends supplied fields in the body' {
        $null = Update-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -DisplayName 'Production' -Description 'Prod stage' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.displayName | Should -Be 'Production'
        $b.description | Should -Be 'Prod stage'
    }

    It 'sends isPublic when explicitly set to $false' {
        $null = Update-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -IsPublic $false -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.PSObject.Properties.Name | Should -Contain 'isPublic'
        $b.isPublic                 | Should -Be $false
    }

    It 'omits isPublic when not supplied' {
        $null = Update-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -DisplayName 'Production' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.PSObject.Properties.Name | Should -Not -Contain 'isPublic'
    }

    It 'decorates the response type by default' {
        $r = Update-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -DisplayName 'Production' -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.DeploymentPipelineStage'
        $r.id                    | Should -Be 'stage-1'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = Update-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -DisplayName 'Production' -Raw -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.DeploymentPipelineStage'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricDeploymentPipelineStage -DeploymentPipelineId 'dp-1' -StageId 'stage-1' -DisplayName 'Production' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
