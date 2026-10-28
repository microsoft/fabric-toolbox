#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Set-FabricWorkspaceGitOutboundPolicy:
    PUT /workspaces/{id}/networking/communicationPolicy/outbound/git, policy body verbatim,
    optional If-Match header, -Raw untouched, -WhatIf makes no call.
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
        $global:__capUri     = $BaseURI
        $global:__capMethod  = $Method
        $global:__capBody    = $Body
        $global:__capHeaders = $Headers
        [pscustomobject]@{ status = 'ok' }
    }

    $script:policy = @{ defaultAction = 'Deny' }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody, __capHeaders -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Set-FabricWorkspaceGitOutboundPolicy' -Tag 'UnitTests' {

    It 'PUTs the outbound/git endpoint' {
        $null = Set-FabricWorkspaceGitOutboundPolicy -WorkspaceId 'ws-1' -GitPolicy $script:policy -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/networking/communicationPolicy/outbound/git'
        $global:__capMethod | Should -Be 'Put'
    }

    It 'sends the policy verbatim as the body' {
        $null = Set-FabricWorkspaceGitOutboundPolicy -WorkspaceId 'ws-1' -GitPolicy $script:policy -Confirm:$false
        ($global:__capBody | ConvertFrom-Json).defaultAction | Should -Be 'Deny'
    }

    It 'adds the If-Match header when supplied' {
        $null = Set-FabricWorkspaceGitOutboundPolicy -WorkspaceId 'ws-1' -GitPolicy $script:policy -IfMatch '"etag123"' -Confirm:$false
        $global:__capHeaders['If-Match'] | Should -Be '"etag123"'
    }

    It '-Raw returns the untouched response' {
        $r = Set-FabricWorkspaceGitOutboundPolicy -WorkspaceId 'ws-1' -GitPolicy $script:policy -Raw -Confirm:$false
        $r.status | Should -Be 'ok'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Set-FabricWorkspaceGitOutboundPolicy -WorkspaceId 'ws-1' -GitPolicy $script:policy -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
