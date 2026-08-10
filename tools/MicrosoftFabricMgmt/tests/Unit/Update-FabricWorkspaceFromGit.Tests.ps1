#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricWorkspaceFromGit: POST /workspaces/{id}/git/updateFromGit,
    remoteCommitHash/conflictResolution/options body, -Raw untouched, -WhatIf makes no call.
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

Describe 'Update-FabricWorkspaceFromGit' -Tag 'UnitTests' {

    It 'POSTs to the git/updateFromGit endpoint' {
        $null = Update-FabricWorkspaceFromGit -WorkspaceId 'ws-1' -RemoteCommitHash 'abc123' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/git/updateFromGit'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends remoteCommitHash in the body' {
        $null = Update-FabricWorkspaceFromGit -WorkspaceId 'ws-1' -RemoteCommitHash 'abc123' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.remoteCommitHash | Should -Be 'abc123'
    }

    It 'sends conflictResolution and options verbatim' {
        $conflict = @{ conflictResolutionType = 'Workspace'; conflictResolutionPolicy = 'PreferWorkspace' }
        $options  = @{ allowOverrideItems = $true }
        $null = Update-FabricWorkspaceFromGit -WorkspaceId 'ws-1' -RemoteCommitHash 'abc123' -WorkspaceHead 'head1' -ConflictResolution $conflict -Options $options -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.workspaceHead                        | Should -Be 'head1'
        $b.conflictResolution.conflictResolutionPolicy | Should -Be 'PreferWorkspace'
        $b.options.allowOverrideItems           | Should -BeTrue
    }

    It '-Raw returns the untouched response' {
        $r = Update-FabricWorkspaceFromGit -WorkspaceId 'ws-1' -RemoteCommitHash 'abc123' -Raw -Confirm:$false
        $r.id | Should -Be 'op-1'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricWorkspaceFromGit -WorkspaceId 'ws-1' -RemoteCommitHash 'abc123' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
