#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Remove-FabricAdminWorkspaceUser.
    Verifies the Power BI admin groups user endpoint + DELETE method and that -WhatIf issues no API call.
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

Describe 'Remove-FabricAdminWorkspaceUser' -Tag 'UnitTests' {

    It 'calls DELETE on the Power BI admin groups user endpoint' {
        $global:__capUri = $null
        $null = Remove-FabricAdminWorkspaceUser -WorkspaceId 'ws-1' -User 'user@contoso.com' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/ws-1/users/user@contoso.com'
        $global:__capMethod | Should -Be 'Delete'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        Remove-FabricAdminWorkspaceUser -WorkspaceId 'ws-1' -User 'user@contoso.com' -WhatIf
        $global:__capUri | Should -Be $null
    }
}
