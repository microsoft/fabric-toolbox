#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminWorkspaceScanStatus.
    Verifies the Power BI admin scanStatus endpoint + method, the default PSTypeName
    decoration, and that -Raw returns the untouched response (no type decoration).
    This function does NOT perform workspace/capacity name enrichment.
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
    Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog        {}
    Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
        $global:__capUri    = $BaseURI
        $global:__capMethod = $Method
        [pscustomobject]@{ id = 'scan-1'; status = 'Succeeded' }
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminWorkspaceScanStatus' -Tag 'UnitTests' {

    It 'calls GET on the Power BI admin scanStatus endpoint' {
        $null = Get-FabricAdminWorkspaceScanStatus -ScanId 'scan-1'
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/admin/workspaces/scanStatus/scan-1'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'decorates the response with the PSTypeName by default (original properties preserved)' {
        $r = Get-FabricAdminWorkspaceScanStatus -ScanId 'scan-1'
        $r.PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.AdminWorkspaceScanStatus'
        $r.id                    | Should -Be 'scan-1'
        $r.status                | Should -Be 'Succeeded'
    }

    It '-Raw returns the untouched response (no type decoration)' {
        $r = Get-FabricAdminWorkspaceScanStatus -ScanId 'scan-1' -Raw
        $r.PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.AdminWorkspaceScanStatus'
        $r.status                | Should -Be 'Succeeded'
    }
}
