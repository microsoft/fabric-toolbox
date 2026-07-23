#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Add-FabricDeploymentPipelineRoleAssignment:
    POST roleAssignments endpoint, principal + role body, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'ra-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Add-FabricDeploymentPipelineRoleAssignment' -Tag 'UnitTests' {

    It 'POSTs to the roleAssignments endpoint' {
        $null = Add-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId 'pipe-1' -PrincipalId 'user-1' -PrincipalType 'User' -Role 'Admin' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/deploymentPipelines/pipe-1/roleAssignments'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends principal (id + type) and role in the body' {
        $null = Add-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId 'pipe-1' -PrincipalId 'user-1' -PrincipalType 'User' -Role 'Admin' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.principal.id   | Should -Be 'user-1'
        $b.principal.type | Should -Be 'User'
        $b.role           | Should -Be 'Admin'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Add-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId 'pipe-1' -PrincipalId 'user-1' -PrincipalType 'User' -Role 'Admin' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
