#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Behavior tests for Get-FabricAdminGateway (list path).
    Verifies the constructed Power BI endpoint + method, default enrichment
    (gatewayId corrected to id + type), and that -Raw returns the untouched response.
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
        @([pscustomobject]@{ id = 'gw-1'; name = 'On-Prem GW'; gatewayId = 'cluster-99'; type = 'Resource' })
    }
}

AfterAll {
    Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
}

Describe 'Get-FabricAdminGateway' -Tag 'UnitTests' {

    It 'calls GET on the gateways endpoint' {
        $null = Get-FabricAdminGateway
        $global:__capUri    | Should -Be 'https://api.powerbi.com/v1.0/myorg/gateways'
        $global:__capMethod | Should -Be 'Get'
    }

    It 'corrects gatewayId to id and adds type by default (originals preserved)' {
        $r = Get-FabricAdminGateway
        $r[0].gatewayId             | Should -Be 'gw-1'
        $r[0].PSObject.TypeNames[0] | Should -Be 'MicrosoftFabric.Gateway'
        $r[0].id                    | Should -Be 'gw-1'
        $r[0].name                  | Should -Be 'On-Prem GW'
    }

    It '-Raw returns the untouched response (gatewayId not corrected, no type)' {
        $r = Get-FabricAdminGateway -Raw
        $r[0].gatewayId             | Should -Be 'cluster-99'
        $r[0].PSObject.TypeNames[0] | Should -Not -Be 'MicrosoftFabric.Gateway'
    }

    It 'targets a specific gateway when -GatewayId is supplied' {
        $null = Get-FabricAdminGateway -GatewayId 'gw-7'
        $global:__capUri | Should -Be 'https://api.powerbi.com/v1.0/myorg/gateways/gw-7'
    }
}
