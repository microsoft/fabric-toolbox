#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Remove-FabricDeploymentPipelineRoleAssignment:
    DELETE roleAssignments/{principalId} endpoint, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'ra-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Remove-FabricDeploymentPipelineRoleAssignment' -Tag 'UnitTests' {

    It 'DELETEs the roleAssignments/{principalId} endpoint' {
        $null = Remove-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId 'pipe-1' -PrincipalId 'user-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/pipe-1/roleAssignments/user-1'
        $global:__capMethod | Should -Be 'Delete'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Remove-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId 'pipe-1' -PrincipalId 'user-1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
