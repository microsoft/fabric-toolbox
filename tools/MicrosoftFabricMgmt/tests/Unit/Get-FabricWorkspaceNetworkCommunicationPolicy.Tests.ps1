#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricWorkspaceNetworkCommunicationPolicy:
    GET /workspaces/{id}/networking/communicationPolicy, default enrichment (WorkspaceName + type),
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
        [pscustomobject]@{ inbound = @{ defaultAction = 'Allow' }; outbound = @{ publicAccessRules = @{ defaultAction = 'Deny' } } }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricWorkspaceNetworkCommunicationPolicy' -Tag 'UnitTests' {

    It 'GETs the networking/communicationPolicy endpoint' {
        $null = Get-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/networking/communicationPolicy'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1'
        $r.WorkspaceName            | Should -Be 'WS-Name'
        $r.workspaceId              | Should -Be 'ws-1'
        $r.PSObject.TypeNames[0]    | Should -Be 'MicrosoftFabric.WorkspaceNetworkCommunicationPolicy'
        $r.outbound.publicAccessRules.defaultAction | Should -Be 'Deny'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricWorkspaceNetworkCommunicationPolicy -WorkspaceId 'ws-1' -Raw
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.WorkspaceNetworkCommunicationPolicy'
    }
}
