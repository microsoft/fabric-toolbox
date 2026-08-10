#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminUserArtifactAccess.
    Verifies the Power BI admin user-artifactAccess endpoint + method, default enrichment
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
        @([pscustomobject]@{ artifactId = 'art-1'; displayName = 'Sales Report'; accessRight = 'Owner' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminUserArtifactAccess' -Tag 'UnitTests' {

    It 'calls GET on the admin user artifactAccess endpoint' {
        $null = Get-FabricAdminUserArtifactAccess -UserId 'user-1'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/users/user-1/artifactAccess'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'enriches with userId context and type by default (originals preserved)' {
        $r = Get-FabricAdminUserArtifactAccess -UserId 'user-1'
        $r[0].userId                | Should -Be 'user-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminUserArtifactAccess'
        $r[0].artifactId            | Should -Be 'art-1'
        $r[0].displayName           | Should -Be 'Sales Report'
    }

    It '-Raw returns the untouched response (no added context, no type)' {
        $r = Get-FabricAdminUserArtifactAccess -UserId 'user-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'userId'
        $r[0].PSObject.TypeNames[0]    | Should -Not -Be 'MicrosoftFabric.AdminUserArtifactAccess'
        $r[0].artifactId               | Should -Be 'art-1'
    }
}
