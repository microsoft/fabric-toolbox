#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminDatasetUser.
    Verifies the constructed Power BI admin endpoint + method, default enrichment
    (datasetId / DatasetName + type), and that -Raw returns the untouched response.
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
    Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricDatasetName { 'DS-Name' }
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        @([pscustomobject]@{ displayName = 'Dave'; emailAddress = 'dave@contoso.com'; datasetUserAccessRight = 'ReadWrite' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminDatasetUser' -Tag 'UnitTests' {

    It 'calls GET on the admin dataset users endpoint' {
        $null = Get-FabricAdminDatasetUser -DatasetId '66666666-6666-6666-6666-666666666666'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/datasets/66666666-6666-6666-6666-666666666666/users'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with datasetId, DatasetName and type by default (originals preserved)' {
        $r = Get-FabricAdminDatasetUser -DatasetId '66666666-6666-6666-6666-666666666666'
        $r[0].datasetId             | Should -Be '66666666-6666-6666-6666-666666666666'
        $r[0].DatasetName           | Should -Be 'DS-Name'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminDatasetUser'
        $r[0].displayName           | Should -Be 'Dave'
    }

    It '-Raw returns the untouched response (no added names, no type)' {
        $r = Get-FabricAdminDatasetUser -DatasetId '66666666-6666-6666-6666-666666666666' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'DatasetName'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminDatasetUser'
    }
}
