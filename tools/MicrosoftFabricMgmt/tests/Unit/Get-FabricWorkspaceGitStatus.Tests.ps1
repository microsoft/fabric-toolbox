#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricWorkspaceGitStatus: GET /workspaces/{id}/git/status,
    WorkspaceName enrichment + type by default, -Raw untouched.
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
        [pscustomobject]@{ workspaceHead = 'head1'; remoteCommitHash = 'abc123'; changes = @() }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricWorkspaceGitStatus' -Tag 'UnitTests' {

    It 'calls GET on the git/status endpoint' {
        $null = Get-FabricWorkspaceGitStatus -WorkspaceId 'ws-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/git/status'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricWorkspaceGitStatus -WorkspaceId 'ws-1'
        $r.WorkspaceName         | Should -Be 'WS'
        $r.workspaceId           | Should -Be 'ws-1'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.GitStatus'
        $r.remoteCommitHash      | Should -Be 'abc123'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricWorkspaceGitStatus -WorkspaceId 'ws-1' -Raw
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.GitStatus'
    }
}
