#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricDeploymentPipeline: POST /deploymentPipelines, request body,
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
        [pscustomobject]@{ id = 'dp-1'; displayName = 'Pipeline1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricDeploymentPipeline' -Tag 'UnitTests' {

    It 'POSTs to the deploymentPipelines endpoint' {
        $null = New-FabricDeploymentPipeline -DeploymentPipelineName 'Pipeline1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends displayName in the body' {
        $null = New-FabricDeploymentPipeline -DeploymentPipelineName 'Pipeline1' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.displayName | Should -Be 'Pipeline1'
    }

    It 'sends description and stages when supplied' {
        $stages = @(@{ displayName = 'Development'; isPublic = $false }, @{ displayName = 'Production'; isPublic = $true })
        $null = New-FabricDeploymentPipeline -DeploymentPipelineName 'Pipeline1' -Description 'Desc' -Stages $stages -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.description         | Should -Be 'Desc'
        $b.stages.Count        | Should -Be 2
        $b.stages[0].displayName | Should -Be 'Development'
    }

    It 'decorates the response type by default' {
        $r = New-FabricDeploymentPipeline -DeploymentPipelineName 'Pipeline1' -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.DeploymentPipeline'
        $r.id                    | Should -Be 'dp-1'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = New-FabricDeploymentPipeline -DeploymentPipelineName 'Pipeline1' -Raw -Confirm:$false
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.DeploymentPipeline'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        New-FabricDeploymentPipeline -DeploymentPipelineName 'Pipeline1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
