#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminUserAccess.
    Verifies the Fabric admin user-access endpoint + method, default enrichment
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
        @([pscustomobject]@{ id = 'it-1'; itemType = 'Lakehouse'; permissions = 'Read' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminUserAccess' -Tag 'UnitTests' {

    It 'calls GET on the admin user access endpoint' {
        $null = Get-FabricAdminUserAccess -UserId 'user-1'
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/admin/users/user-1/access'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with userId context and type by default (originals preserved)' {
        $r = Get-FabricAdminUserAccess -UserId 'user-1'
        $r[0].userId                | Should -Be 'user-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminUserAccess'
        $r[0].id                    | Should -Be 'it-1'
        $r[0].itemType              | Should -Be 'Lakehouse'
    }

    It '-Raw returns the untouched response (no added context, no type)' {
        $r = Get-FabricAdminUserAccess -UserId 'user-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'userId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminUserAccess'
        $r[0].id                       | Should -Be 'it-1'
    }
}
