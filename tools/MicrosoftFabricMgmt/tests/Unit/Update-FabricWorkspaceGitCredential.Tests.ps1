#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricWorkspaceGitCredential:
    PATCH /workspaces/{id}/git/myGitCredentials, credential details body passed verbatim,
    -Raw untouched, -WhatIf makes no call.
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
        [pscustomobject]@{ id = 'cred-1'; source = 'ConfiguredConnection' }
    }

    $script:cred = @{ source = 'ConfiguredConnection'; connectionId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricWorkspaceGitCredential' -Tag 'UnitTests' {

    It 'PATCHes the git/myGitCredentials endpoint' {
        $null = Update-FabricWorkspaceGitCredential -WorkspaceId 'ws-1' -CredentialDetails $script:cred -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/git/myGitCredentials'
        $global:__capMethod | Should -Be 'Patch'
    }

    It 'sends the credential details verbatim as the body' {
        $null = Update-FabricWorkspaceGitCredential -WorkspaceId 'ws-1' -CredentialDetails $script:cred -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.source       | Should -Be 'ConfiguredConnection'
        $b.connectionId | Should -Be '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    }

    It '-Raw returns the untouched response' {
        $r = Update-FabricWorkspaceGitCredential -WorkspaceId 'ws-1' -CredentialDetails $script:cred -Raw -Confirm:$false
        $r.id | Should -Be 'cred-1'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Update-FabricWorkspaceGitCredential -WorkspaceId 'ws-1' -CredentialDetails $script:cred -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
