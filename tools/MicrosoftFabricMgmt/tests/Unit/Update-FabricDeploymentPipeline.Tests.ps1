#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricDeploymentPipeline: PATCH /deploymentPipelines/{id},
    request body, type decoration by default, -Raw untouched, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'dp-1'; displayName = 'Renamed' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricDeploymentPipeline' -Tag 'UnitTests' {

    It 'PATCHes the deploymentPipelines by-id endpoint' {
        $null = Update-FabricDeploymentPipeline -DeploymentPipelineId 'dp-1' -DeploymentPipelineName 'Renamed' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/dp-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'sends only supplied fields in the body' {
        $null = Update-FabricDeploymentPipeline -DeploymentPipelineId 'dp-1' -DeploymentPipelineName 'Renamed' -Description 'NewDesc' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.displayName | Should -Be 'Renamed'
        $b.description | Should -Be 'NewDesc'
    }

    It 'decorates the response type by default' {
        $r = Update-FabricDeploymentPipeline -DeploymentPipelineId 'dp-1' -DeploymentPipelineName 'Renamed' -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.DeploymentPipeline'
        $r.id                    | Should -Be 'dp-1'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = Update-FabricDeploymentPipeline -DeploymentPipelineId 'dp-1' -DeploymentPipelineName 'Renamed' -Raw -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.DeploymentPipeline'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricDeploymentPipeline -DeploymentPipelineId 'dp-1' -DeploymentPipelineName 'Renamed' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
