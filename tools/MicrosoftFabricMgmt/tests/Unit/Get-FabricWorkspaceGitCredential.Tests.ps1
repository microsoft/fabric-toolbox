#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricWorkspaceGitCredential:
    GET /workspaces/{id}/git/myGitCredentials, type by default, -Raw untouched.
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
        [pscustomobject]@{ source = 'ConfiguredConnection'; connectionId = 'conn-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricWorkspaceGitCredential' -Tag 'UnitTests' {

    It 'calls GET on the git/myGitCredentials endpoint' {
        $null = Get-FabricWorkspaceGitCredential -WorkspaceId 'ws-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/git/myGitCredentials'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'decorates with type by default (originals preserved)' {
        $r = Get-FabricWorkspaceGitCredential -WorkspaceId 'ws-1'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.GitCredentials'
        $r.source                | Should -Be 'ConfiguredConnection'
    }

    It '-Raw returns the untouched response (no type)' {
        $r = Get-FabricWorkspaceGitCredential -WorkspaceId 'ws-1' -Raw
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.GitCredentials'
    }
}
