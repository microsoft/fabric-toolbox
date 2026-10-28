#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminActivityEvent.
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
        @([pscustomobject]@{ Id = 'evt-1'; Activity = 'ViewReport'; UserId = 'u@contoso.com' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminActivityEvent' -Tag 'UnitTests' {

    It 'calls GET on the admin activityevents endpoint with date range' {
        $null = Get-FabricAdminActivityEvent -StartDateTime '2024-01-01' -EndDateTime '2024-01-31'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/activityevents?startDateTime=2024-01-01&endDateTime=2024-01-31'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'decorates results with the custom type by default (originals preserved)' {
        $r = Get-FabricAdminActivityEvent -StartDateTime '2024-01-01' -EndDateTime '2024-01-31'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminActivityEvent'
        $r[0].Id                    | Should -Be 'evt-1'
        $r[0].Activity              | Should -Be 'ViewReport'
    }

    It '-Raw returns the untouched response (no type decoration)' {
        $r = Get-FabricAdminActivityEvent -StartDateTime '2024-01-01' -EndDateTime '2024-01-31' -Raw
        $r[0].PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.AdminActivityEvent'
        $r[0].Id                    | Should -Be 'evt-1'
    }
}
