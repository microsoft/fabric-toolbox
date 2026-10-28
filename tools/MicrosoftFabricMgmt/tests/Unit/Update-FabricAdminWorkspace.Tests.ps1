#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Update-FabricAdminWorkspace.
    Verifies the constructed Power BI admin endpoint + PATCH method and that
    -WhatIf issues no API request.
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
        [pscustomobject]@{ id = 'ws-1' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Update-FabricAdminWorkspace' -Tag 'UnitTests' {

    It 'calls PATCH on the admin groups endpoint' {
        $null = Update-FabricAdminWorkspace -WorkspaceId 'ws-1' -DisplayName 'Updated' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/groups/ws-1'
        $global:__capMethod | Should -Be 'Patch'
    }

    It '-WhatIf makes no API call' {
        $global:__capUri = $null
        $null = Update-FabricAdminWorkspace -WorkspaceId 'ws-1' -DisplayName 'Updated' -WhatIf
        $global:__capUri | Should -Be $null
    }
}
