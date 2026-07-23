#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for New-FabricExternalDataShare: POST .../externalDataShares, request body,
    WorkspaceName enrichment + type by default, -Raw untouched, -WhatIf makes no call.
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
        $global:__capBody   = $Body
        [pscustomobject]@{ id = 'eds-1'; displayName = 'Share1' }
    }

    $script:recipient = @{ userPrincipalName = 'user@contoso.com'; tenantId = 'tenant-1' }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
}

Describe 'New-FabricExternalDataShare' -Tag 'UnitTests' {

    It 'POSTs to the externalDataShares endpoint' {
        $null = New-FabricExternalDataShare -WorkspaceId 'ws-1' -ItemId 'item-1' -Paths 'Files/shared' -Recipient $script:recipient -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/externalDataShares'
        $global:__capMethod | Should -Be 'Post'
    }

    It 'sends paths and recipient in the body' {
        $null = New-FabricExternalDataShare -WorkspaceId 'ws-1' -ItemId 'item-1' -Paths 'Files/shared' -Recipient $script:recipient -Confirm:$false
        $b = $global:__capBody | ConvertFrom-Json
        $b.paths                      | Should -Contain 'Files/shared'
        $b.recipient.userPrincipalName | Should -Be 'user@contoso.com'
    }

    It 'enriches with WorkspaceName + type by default (originals preserved)' {
        $r = New-FabricExternalDataShare -WorkspaceId 'ws-1' -ItemId 'item-1' -Paths 'Files/shared' -Recipient $script:recipient -Confirm:$false
        $r.WorkspaceName         | Should -Be 'WS'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.ExternalDataShare'
        $r.id                    | Should -Be 'eds-1'
    }

    It '-Raw returns the untouched response' {
        $r = New-FabricExternalDataShare -WorkspaceId 'ws-1' -ItemId 'item-1' -Paths 'Files/shared' -Recipient $script:recipient -Raw -Confirm:$false
        $r.PSObject.Properties.Name | Should -Not -Contain 'WorkspaceName'
        $r.PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.ExternalDataShare'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        New-FabricExternalDataShare -WorkspaceId 'ws-1' -ItemId 'item-1' -Paths 'Files/shared' -Recipient $script:recipient -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
