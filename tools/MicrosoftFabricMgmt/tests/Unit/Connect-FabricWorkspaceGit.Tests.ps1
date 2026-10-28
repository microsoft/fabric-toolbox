#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Connect-FabricWorkspaceGit: POST /workspaces/{id}/git/connect,
    gitProviderDetails body, -Raw untouched, -WhatIf makes no call.
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

    $script:provider = @{ gitProviderType = 'AzureDevOps'; organizationName = 'org'; projectName = 'proj'; repositoryName = 'repo'; branchName = 'main'; directoryName = '/' }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Connect-FabricWorkspaceGit' -Tag 'UnitTests' {

    It 'POSTs to the git/connect endpoint' {
        $null = Connect-FabricWorkspaceGit -WorkspaceId 'ws-1' -GitProviderDetails $script:provider -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/git/connect'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends gitProviderDetails in the body verbatim' {
        $null = Connect-FabricWorkspaceGit -WorkspaceId 'ws-1' -GitProviderDetails $script:provider -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.gitProviderDetails.gitProviderType  | Should -Be 'AzureDevOps'
        $b.gitProviderDetails.repositoryName   | Should -Be 'repo'
    }

    It '-Raw returns the untouched response' {
        $r = Connect-FabricWorkspaceGit -WorkspaceId 'ws-1' -GitProviderDetails $script:provider -Raw -Confirm:$false
        $r.id | Should -Be 'op-1'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Connect-FabricWorkspaceGit -WorkspaceId 'ws-1' -GitProviderDetails $script:provider -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
