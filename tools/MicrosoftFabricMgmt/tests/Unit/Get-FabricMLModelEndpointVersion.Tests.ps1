#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricMLModelEndpointVersion: GET list + by-name endpoints,
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
        @([pscustomobject]@{ versionName = '1'; status = 'Active' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricMLModelEndpointVersion' -Tag 'UnitTests' {

    It 'calls GET on the versions list endpoint (lowercase mlmodels)' {
        $null = Get-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlmodels/model-1/endpoint/versions'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends the version name when -VersionName is supplied' {
        $null = Get-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -VersionName '3'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/mlmodels/model-1/endpoint/versions/3'
    }

    It 'enriches with WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1'
        $r[0].WorkspaceName         | Should -Be 'WS'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.MLModelEndpointVersion'
        $r[0].versionName           | Should -Be '1'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricMLModelEndpointVersion -WorkspaceId 'ws-1' -MLModelId 'model-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.MLModelEndpointVersion'
    }
}
