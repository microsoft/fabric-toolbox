#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminEncryptionKey (list path).
    Verifies the constructed Power BI admin endpoint + method, default type decoration,
    and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ id = 'key-1'; name = 'Tenant Key'; isDefault = $true })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminEncryptionKey' -Tag 'UnitTests' {

    It 'calls GET on the admin tenantKeys endpoint' {
        $null = Get-FabricAdminEncryptionKey
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/tenantKeys'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'decorates results with the custom type by default (originals preserved)' {
        $r = Get-FabricAdminEncryptionKey
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminEncryptionKey'
        $r[0].id                    | Should -Be 'key-1'
        $r[0].name                  | Should -Be 'Tenant Key'
    }

    It '-Raw returns the untouched response (no type decoration)' {
        $r = Get-FabricAdminEncryptionKey -Raw
        $r[0].PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.AdminEncryptionKey'
        $r[0].id                    | Should -Be 'key-1'
    }
}
