#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricWorkspaceOutboundConnectionRule:
    GET /workspaces/{id}/networking/communicationPolicy/outbound/connections, default enrichment,
    -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        [pscustomobject]@{ defaultAction = 'Deny'; publicAccessRules = @() }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricWorkspaceOutboundConnectionRule' -Tag 'UnitTests' {

    It 'GETs the outbound/connections endpoint' {
        $null = Get-FabricWorkspaceOutboundConnectionRule -WorkspaceId 'ws-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/networking/communicationPolicy/outbound/connections'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with WorkspaceName and type by default' {
        $r = Get-FabricWorkspaceOutboundConnectionRule -WorkspaceId 'ws-1'
        $r.WorkspaceName         | Should -Be 'WS-Name'
        $r.workspaceId           | Should -Be 'ws-1'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.WorkspaceOutboundConnectionRule'
    }

    It '-Raw returns the untouched response' {
        $r = Get-FabricWorkspaceOutboundConnectionRule -WorkspaceId 'ws-1' -Raw
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.defaultAction            | Should -Be 'Deny'
    }
}
