#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminReportSubscription.
    Verifies the Power BI admin report-subscriptions endpoint + method, default enrichment
    (reportId context + type) and that -Raw returns the untouched response.
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

Describe 'Get-FabricAdminReportSubscription' -Tag 'UnitTests' {

    It 'calls GET on the admin report subscriptions endpoint' {
        $null = Get-FabricAdminReportSubscription -ReportId 'rep-1'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/reports/rep-1/subscriptions'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with reportId context and type by default (originals preserved)' {
        $r = Get-FabricAdminReportSubscription -ReportId 'rep-1'
        $r[0].reportId              | Should -Be 'rep-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminReportSubscription'
        $r[0].id                    | Should -Be 'sub-1'
        $r[0].title                 | Should -Be 'Daily digest'
    }

    It '-Raw returns the untouched response (no added context, no type)' {
        $r = Get-FabricAdminReportSubscription -ReportId 'rep-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'reportId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminReportSubscription'
        $r[0].id                       | Should -Be 'sub-1'
    }
}
