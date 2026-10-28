#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminWorkspaceUnusedArtifact.
    Verifies the Power BI admin UnusedArtifacts endpoint + method, optional OData query
    parameters, default enrichment (workspaceId / WorkspaceName / PSTypeName), and that
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
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck      {}
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog            {}
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ artifactId = 'art-1'; displayName = 'Old Report'; artifactType = 'Report' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminWorkspaceUnusedArtifact' -Tag 'UnitTests' {

    It 'calls GET on the Power BI admin UnusedArtifacts endpoint' {
        $null = Get-FabricAdminWorkspaceUnusedArtifact -WorkspaceId 'ws-1'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/ws-1/UnusedArtifacts'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends OData query parameters when supplied' {
        $null = Get-FabricAdminWorkspaceUnusedArtifact -WorkspaceId 'ws-1' -Top 5
        $global:__capUri | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/ws-1/UnusedArtifacts?$top=5'
    }

    It 'enriches with workspaceId, WorkspaceName and PSTypeName by default (originals preserved)' {
        $r = Get-FabricAdminWorkspaceUnusedArtifact -WorkspaceId 'ws-1'
        $r[0].workspaceId           | Should -Be 'ws-1'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminWorkspaceUnusedArtifact'
        $r[0].artifactId            | Should -Be 'art-1'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminWorkspaceUnusedArtifact -WorkspaceId 'ws-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminWorkspaceUnusedArtifact'
        $r[0].artifactId               | Should -Be 'art-1'
    }
}
