#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricOperationsAgent: correct create endpoint + method,
    ShouldProcess (-WhatIf makes no API call), and that it returns the created object.
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
        [pscustomobject]@{ id = 'oa-1'; displayName = 'OA'; type = 'OperationsAgent' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricOperationsAgent' -Tag 'UnitTests' {

    It 'POSTs to the workspace OperationsAgents endpoint' {
        $null = New-FabricOperationsAgent -WorkspaceId 'ws-1' -OperationsAgentName 'OA' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/OperationsAgents'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'returns the created object' {
        $r = New-FabricOperationsAgent -WorkspaceId 'ws-1' -OperationsAgentName 'OA' -Confirm:$false
        $r.id | Should -Be 'oa-1'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        New-FabricOperationsAgent -WorkspaceId 'ws-1' -OperationsAgentName 'OA' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
