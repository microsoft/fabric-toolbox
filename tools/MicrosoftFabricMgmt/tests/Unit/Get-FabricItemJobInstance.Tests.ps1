#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricItemJobInstance: GET list + by-id endpoints
    (no jobType segment), WorkspaceName enrichment + type, -Raw untouched.
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
        @([pscustomobject]@{ id = 'inst-1'; status = 'Completed' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricItemJobInstance' -Tag 'UnitTests' {

    It 'calls GET on the instances list endpoint (no jobType segment)' {
        $null = Get-FabricItemJobInstance -WorkspaceId 'ws-1' -ItemId 'item-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/jobs/instances'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends the job instance id when -JobInstanceId is supplied' {
        $null = Get-FabricItemJobInstance -WorkspaceId 'ws-1' -ItemId 'item-1' -JobInstanceId 'inst-9'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/jobs/instances/inst-9'
    }

    It 'enriches with WorkspaceName and type by default (originals preserved)' {
        $r = Get-FabricItemJobInstance -WorkspaceId 'ws-1' -ItemId 'item-1'
        $r[0].WorkspaceName         | Should -Be 'WS'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.ItemJobInstance'
        $r[0].id                    | Should -Be 'inst-1'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricItemJobInstance -WorkspaceId 'ws-1' -ItemId 'item-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.ItemJobInstance'
    }
}
