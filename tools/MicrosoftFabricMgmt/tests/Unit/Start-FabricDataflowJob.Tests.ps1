#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Start-FabricDataflowJob.
    Verifies the POST dataflows jobs/{JobType}/instances endpoint and -WhatIf suppression.
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
        [pscustomobject]@{ ok = $true }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Start-FabricDataflowJob' -Tag 'UnitTests' {

    It 'calls POST on the dataflows Execute job instances endpoint' {
        $null = Start-FabricDataflowJob -WorkspaceId 'ws-1' -DataflowId 'df-1' -JobType 'Execute' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/dataflows/df-1/jobs/Execute/instances'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'uses the supplied JobType in the path (ApplyChanges)' {
        $null = Start-FabricDataflowJob -WorkspaceId 'ws-1' -DataflowId 'df-1' -JobType 'ApplyChanges' -Confirm:$false
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/dataflows/df-1/jobs/ApplyChanges/instances'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = Start-FabricDataflowJob -WorkspaceId 'ws-1' -DataflowId 'df-1' -JobType 'Execute' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
