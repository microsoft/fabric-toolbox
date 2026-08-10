#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminCapacityUser.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (capacityId + CapacityName + type), and that -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName { 'Cap-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ displayName = 'Alice'; emailAddress = 'alice@contoso.com'; capacityUserAccessRight = 'Admin' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminCapacityUser' -Tag 'UnitTests' {

    It 'calls GET on the admin capacity users endpoint' {
        $null = Get-FabricAdminCapacityUser -CapacityId '22222222-2222-2222-2222-222222222222'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/capacities/22222222-2222-2222-2222-222222222222/users'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with capacityId, CapacityName and type by default (originals preserved)' {
        $r = Get-FabricAdminCapacityUser -CapacityId '22222222-2222-2222-2222-222222222222'
        $r[0].capacityId            | Should -Be '22222222-2222-2222-2222-222222222222'
        $r[0].CapacityName          | Should -Be 'Cap-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminCapacityUser'
        $r[0].displayName           | Should -Be 'Alice'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminCapacityUser -CapacityId '22222222-2222-2222-2222-222222222222' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'CapacityName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminCapacityUser'
    }
}
