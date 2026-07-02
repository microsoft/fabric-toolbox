#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Start-FabricItemJob: POST .../jobs/{jobType}/instances,
    optional executionData body, -WhatIf makes no call.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        $global:__capBody   = $Body
        [pscustomobject]@{ id = 'inst-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Start-FabricItemJob' -Tag 'UnitTests' {

    It 'POSTs to the instances endpoint' {
        $global:__capBody = 'unset'
        $null = Start-FabricItemJob -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/jobs/RunNotebook/instances'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends no body when no execution data supplied' {
        $global:__capBody = 'unset'
        $null = Start-FabricItemJob -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -Confirm:$false
        $global:__capBody | Should -BeNullOrEmpty
    }

    It 'sends executionData in the body when supplied' {
        $exec = @{ parameters = @{ p1 = 'v1' } }
        $null = Start-FabricItemJob -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -ExecutionData $exec -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.executionData.parameters.p1 | Should -Be 'v1'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Start-FabricItemJob -WorkspaceId 'ws-1' -ItemId 'item-1' -JobType 'RunNotebook' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
