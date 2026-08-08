#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Remove-FabricExternalDataShare: DELETE on the
    .../externalDataShares/{id} endpoint, -WhatIf makes no call.
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
        $null
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Remove-FabricExternalDataShare' -Tag 'UnitTests' {

    It 'calls DELETE on the external data share endpoint' {
        Remove-FabricExternalDataShare -WorkspaceId 'ws-1' -ItemId 'item-1' -ExternalDataShareId 'eds-9' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/items/item-1/externalDataShares/eds-9'
        $global:__capMethod | Should -Be 'Delete'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Remove-FabricExternalDataShare -WorkspaceId 'ws-1' -ItemId 'item-1' -ExternalDataShareId 'eds-9' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
