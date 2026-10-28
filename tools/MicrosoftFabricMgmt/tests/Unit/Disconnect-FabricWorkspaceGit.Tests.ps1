#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Disconnect-FabricWorkspaceGit: POST /workspaces/{id}/git/disconnect,
    no body, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'op-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Disconnect-FabricWorkspaceGit' -Tag 'UnitTests' {

    It 'POSTs to the git/disconnect endpoint' {
        $null = Disconnect-FabricWorkspaceGit -WorkspaceId 'ws-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/git/disconnect'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends no request body' {
        $global:__capBody = 'preset'
        $null = Disconnect-FabricWorkspaceGit -WorkspaceId 'ws-1' -Confirm:$false
        $global:__capBody | Should -BeNullOrEmpty
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Disconnect-FabricWorkspaceGit -WorkspaceId 'ws-1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
