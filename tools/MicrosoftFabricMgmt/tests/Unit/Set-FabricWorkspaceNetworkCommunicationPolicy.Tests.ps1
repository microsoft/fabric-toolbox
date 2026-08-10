#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Set-FabricWorkspaceNetworkCommunicationPolicy:
    PUT /workspaces/{id}/networking/communicationPolicy, policy body verbatim, optional If-Match header,
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
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri     = $BaseURI
        $global:__capMethod  = $Method
        $global:__capBody    = $Body
        $global:__capHeaders = $Headers
        [pscustomobject]@{ status = 'ok' }
    }

    $script:policy = @{ inbound = @{ defaultAction = 'Allow' }; outbound = @{ publicAccessRules = @{ defaultAction = 'Deny' } } }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody, __capHeaders -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Set-FabricWorkspaceNetworkCommunicationPolicy' -Tag 'UnitTests' {

    It 'PUTs the networking/communicationPolicy endpoint' {
        $null = Set-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1' -CommunicationPolicy $script:policy -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/networking/communicationPolicy'
        $global:__capMethod | Should -Be 'Put'
    }

    It 'sends the policy verbatim as the body' {
        $null = Set-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1' -CommunicationPolicy $script:policy -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.outbound.publicAccessRules.defaultAction | Should -Be 'Deny'
        $b.inbound.defaultAction                     | Should -Be 'Allow'
    }

    It 'adds the If-Match header when supplied (without mutating the shared context headers)' {
        $null = Set-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1' -CommunicationPolicy $script:policy -IfMatch '"etag123"' -Confirm:$false
        $global:__capHeaders['If-Match'] | Should -Be '"etag123"'
        InModuleScope MicrosoftFabricMgmt {
            $script:FabricAuthContext.FabricHeaders.ContainsKey('If-Match') | Should -BeFalse
        }
    }

    It '-Raw returns the untouched response' {
        $r = Set-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1' -CommunicationPolicy $script:policy -Raw -Confirm:$false
        $r.status | Should -Be 'ok'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Set-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1' -CommunicationPolicy $script:policy -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
