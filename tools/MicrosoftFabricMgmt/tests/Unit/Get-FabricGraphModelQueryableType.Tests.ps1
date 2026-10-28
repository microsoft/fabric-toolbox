#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricGraphModelQueryableType.
    Verifies the constructed sub-resource endpoint (with the beta query parameter)
    + method, default enrichment (WorkspaceName / CapacityName / PSTypeName),
    and that -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck                 {}
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog                        {}
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName            { 'WS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityIdFromWorkspace  { 'cap-1' }
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName             { 'Cap-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ queryableGraphType = 'MyType' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricGraphModelQueryableType' -Tag 'UnitTests' {

    It 'calls GET on the getQueryableGraphType endpoint with the beta query parameter' {
        $null = Get-FabricGraphModelQueryableType -WorkspaceId 'ws-1' -GraphModelId 'gm-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/GraphModels/gm-1/getQueryableGraphType?beta=true'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with WorkspaceName, CapacityName and PSTypeName by default (originals preserved)' {
        $r = Get-FabricGraphModelQueryableType -WorkspaceId 'ws-1' -GraphModelId 'gm-1'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].workspaceId           | Should -Be 'ws-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.GraphModelQueryableType'
        $r[0].queryableGraphType    | Should -Be 'MyType'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricGraphModelQueryableType -WorkspaceId 'ws-1' -GraphModelId 'gm-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'CapacityName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.GraphModelQueryableType'
        $r[0].queryableGraphType       | Should -Be 'MyType'
    }
}
