#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDashboardSubscription.
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
        @([pscustomobject]@{ id = 'sub-1'; title = 'Daily digest'; frequency = 'Daily' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDashboardSubscription' -Tag 'UnitTests' {

    It 'calls GET on the admin dashboard subscriptions endpoint' {
        $null = Get-FabricAdminDashboardSubscription -DashboardId '33333333-3333-3333-3333-333333333333'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/dashboards/33333333-3333-3333-3333-333333333333/subscriptions'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with dashboardId context and type by default (originals preserved)' {
        $r = Get-FabricAdminDashboardSubscription -DashboardId '33333333-3333-3333-3333-333333333333'
        $r[0].dashboardId           | Should -Be '33333333-3333-3333-3333-333333333333'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDashboardSubscription'
        $r[0].title                 | Should -Be 'Daily digest'
    }

    It '-Raw returns the untouched response (no dashboardId, no type)' {
        $r = Get-FabricAdminDashboardSubscription -DashboardId '33333333-3333-3333-3333-333333333333' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'dashboardId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDashboardSubscription'
    }
}
