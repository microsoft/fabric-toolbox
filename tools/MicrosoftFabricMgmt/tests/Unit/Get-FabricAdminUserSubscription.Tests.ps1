#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminUserSubscription.
    Verifies the Power BI admin user-subscriptions endpoint + method, default enrichment
    (userId context + type) and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ id = 'sub-1'; title = 'Weekly report'; frequency = 'Weekly' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminUserSubscription' -Tag 'UnitTests' {

    It 'calls GET on the admin user subscriptions endpoint' {
        $null = Get-FabricAdminUserSubscription -UserId 'user-1'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/users/user-1/subscriptions'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with userId context and type by default (originals preserved)' {
        $r = Get-FabricAdminUserSubscription -UserId 'user-1'
        $r[0].userId                | Should -Be 'user-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminUserSubscription'
        $r[0].id                    | Should -Be 'sub-1'
        $r[0].title                 | Should -Be 'Weekly report'
    }

    It '-Raw returns the untouched response (no added context, no type)' {
        $r = Get-FabricAdminUserSubscription -UserId 'user-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'userId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminUserSubscription'
        $r[0].id                       | Should -Be 'sub-1'
    }
}
