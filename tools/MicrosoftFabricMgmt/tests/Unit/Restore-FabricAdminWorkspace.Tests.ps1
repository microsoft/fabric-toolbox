#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Restore-FabricAdminWorkspace.
    Verifies the constructed Fabric admin restore endpoint + POST method and that -WhatIf issues no API call.
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

Describe 'Restore-FabricAdminWorkspace' -Tag 'UnitTests' {

    It 'calls POST on the admin workspaces restore endpoint' {
        $global:__capUri = $null
        $null = Restore-FabricAdminWorkspace -WorkspaceId 'ws-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/admin/workspaces/ws-1/restore'
        $global:__capMethod | Should -Be 'Post'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Restore-FabricAdminWorkspace -WorkspaceId 'ws-1' -WhatIf
        $global:__capUri | Should -Be $null
    }
}
