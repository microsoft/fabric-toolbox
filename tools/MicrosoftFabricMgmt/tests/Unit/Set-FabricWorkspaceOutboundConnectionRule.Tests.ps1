#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Set-FabricWorkspaceOutboundConnectionRule:
    PUT /workspaces/{id}/networking/communicationPolicy/outbound/connections, body verbatim,
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
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        $global:__capBody   = $Body
        [pscustomobject]@{ status = 'ok' }
    }

    $script:rules = @{ value = @(@{ connectionId = '3f2504e0-4f89-11d3-9a0c-0305e82c3301' }) }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Set-FabricWorkspaceOutboundConnectionRule' -Tag 'UnitTests' {

    It 'PUTs the outbound/connections endpoint' {
        $null = Set-FabricWorkspaceOutboundConnectionRule -WorkspaceId 'ws-1' -Connections $script:rules -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/networking/communicationPolicy/outbound/connections'
        $global:__capMethod | Should -Be 'Put'
    }

    It 'sends the connection rules verbatim as the body' {
        $null = Set-FabricWorkspaceOutboundConnectionRule -WorkspaceId 'ws-1' -Connections $script:rules -Confirm:$false
        ($global:__capBody | ConvertFrom-Json).value[0].connectionId | Should -Be '3f2504e0-4f89-11d3-9a0c-0305e82c3301'
    }

    It '-Raw returns the untouched response' {
        $r = Set-FabricWorkspaceOutboundConnectionRule -WorkspaceId 'ws-1' -Connections $script:rules -Raw -Confirm:$false
        $r.status | Should -Be 'ok'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Set-FabricWorkspaceOutboundConnectionRule -WorkspaceId 'ws-1' -Connections $script:rules -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
