#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminAppUser.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (appId context + type decoration), and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ displayName = 'Alice'; emailAddress = 'alice@contoso.com'; appUserAccessRight = 'Read' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminAppUser' -Tag 'UnitTests' {

    It 'calls GET on the admin app users endpoint' {
        $null = Get-FabricAdminAppUser -AppId '11111111-1111-1111-1111-111111111111'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/apps/11111111-1111-1111-1111-111111111111/users'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with appId context and type by default (originals preserved)' {
        $r = Get-FabricAdminAppUser -AppId '11111111-1111-1111-1111-111111111111'
        $r[0].appId                 | Should -Be '11111111-1111-1111-1111-111111111111'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminAppUser'
        $r[0].displayName           | Should -Be 'Alice'
        $r[0].appUserAccessRight    | Should -Be 'Read'
    }

    It '-Raw returns the untouched response (no appId, no type)' {
        $r = Get-FabricAdminAppUser -AppId '11111111-1111-1111-1111-111111111111' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'appId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminAppUser'
    }
}
