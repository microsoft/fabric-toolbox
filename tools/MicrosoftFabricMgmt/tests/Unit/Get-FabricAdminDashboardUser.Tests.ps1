#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDashboardUser.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (dashboardId context + type), and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ displayName = 'Bob'; emailAddress = 'bob@contoso.com'; dashboardUserAccessRight = 'Read' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDashboardUser' -Tag 'UnitTests' {

    It 'calls GET on the admin dashboard users endpoint' {
        $null = Get-FabricAdminDashboardUser -DashboardId '33333333-3333-3333-3333-333333333333'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/dashboards/33333333-3333-3333-3333-333333333333/users'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with dashboardId context and type by default (originals preserved)' {
        $r = Get-FabricAdminDashboardUser -DashboardId '33333333-3333-3333-3333-333333333333'
        $r[0].dashboardId           | Should -Be '33333333-3333-3333-3333-333333333333'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDashboardUser'
        $r[0].displayName           | Should -Be 'Bob'
    }

    It '-Raw returns the untouched response (no dashboardId, no type)' {
        $r = Get-FabricAdminDashboardUser -DashboardId '33333333-3333-3333-3333-333333333333' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'dashboardId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDashboardUser'
    }
}
