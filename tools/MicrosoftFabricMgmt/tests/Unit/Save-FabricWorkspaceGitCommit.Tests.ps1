#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Save-FabricWorkspaceGitCommit: POST /workspaces/{id}/git/commitToGit,
    mode/comment/items body, -Raw untouched, -WhatIf makes no call.
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

Describe 'Save-FabricWorkspaceGitCommit' -Tag 'UnitTests' {

    It 'POSTs to the git/commitToGit endpoint' {
        $null = Save-FabricWorkspaceGitCommit -WorkspaceId 'ws-1' -Mode 'All' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/git/commitToGit'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends mode and comment in the body' {
        $null = Save-FabricWorkspaceGitCommit -WorkspaceId 'ws-1' -Mode 'All' -Comment 'msg' -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.mode    | Should -Be 'All'
        $b.comment | Should -Be 'msg'
    }

    It 'sends items for a selective commit' {
        $items = @(@{ objectId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee' })
        $null = Save-FabricWorkspaceGitCommit -WorkspaceId 'ws-1' -Mode 'Selective' -Items $items -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.mode              | Should -Be 'Selective'
        $b.items[0].objectId | Should -Be 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    }

    It '-Raw returns the untouched response' {
        $r = Save-FabricWorkspaceGitCommit -WorkspaceId 'ws-1' -Mode 'All' -Raw -Confirm:$false
        $r.id | Should -Be 'op-1'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Save-FabricWorkspaceGitCommit -WorkspaceId 'ws-1' -Mode 'All' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
