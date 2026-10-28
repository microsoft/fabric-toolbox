#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricItem.
    Verifies the items list endpoint + method (default, no ItemId), default enrichment
    (WorkspaceName / CapacityName / type via Select-FabricResource), and that -Raw
    returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName  { 'Cap-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ id = 'itm-1'; displayName = 'Sales Lakehouse'; type = 'Lakehouse'; workspaceId = 'ws-1'; capacityId = 'cap-1' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricItem' -Tag 'UnitTests' {

    It 'calls GET on the items endpoint' {
        $null = Get-FabricItem -WorkspaceId 'ws-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'appends the type query filter when -ItemType is supplied' {
        $null = Get-FabricItem -WorkspaceId 'ws-1' -ItemType 'Lakehouse'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items?type=Lakehouse'
    }

    It 'gets a single item by id from the item endpoint' {
        $null = Get-FabricItem -WorkspaceId 'ws-1' -ItemId 'itm-1'
        $global:__capUri | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/itm-1'
    }

    It 'enriches with WorkspaceName, CapacityName and type by default (originals preserved)' {
        $r = Get-FabricItem -WorkspaceId 'ws-1'
        $r[0].WorkspaceName         | Should -Be 'WS-Name'
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.Item'
        $r[0].displayName           | Should -Be 'Sales Lakehouse'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricItem -WorkspaceId 'ws-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'CapacityName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.Item'
    }
}
