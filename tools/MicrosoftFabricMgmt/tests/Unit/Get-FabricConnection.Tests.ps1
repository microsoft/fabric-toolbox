#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "ConnectionId"
    "ConnectionName"
    "Raw"
    "ProgressAction"
    "Verbose"
    "Debug"
    "ErrorAction"
    "WarningAction"
    "InformationAction"
    "InformationVariable"
    "OutVariable"
    "OutBuffer"
    "PipelineVariable"
    "ErrorVariable"
    "WarningVariable"
)
)

Describe "Get-FabricConnection" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Get-FabricConnection
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Get-FabricConnection
            $expected = $expectedParams
        }

        It "Has parameter: <_>" -ForEach $expected {
            $command | Should -HaveParameter $PSItem
        }

        It "Should have exactly the number of expected parameters $($expected.Count)" {
            $hasparms = $command.Parameters.Values.Name
            #$hasparms.Count | Should -BeExactly $expected.Count
            Compare-Object -ReferenceObject $expected -DifferenceObject $hasparms | Should -BeNullOrEmpty
        }

        It "Should accept ConnectionName values containing hyphens, dots and parentheses" {
            $command = Get-Command -Name Get-FabricConnection
            $attr = $command.Parameters['ConnectionName'].Attributes |
                Where-Object { $_ -is [System.Management.Automation.ValidatePatternAttribute] }
            # No restrictive character pattern should be applied to the name filter.
            $attr | Should -BeNullOrEmpty
        }
    }
}

Describe "Get-FabricConnection ConnectionName filtering" -Tag "UnitTests" {

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
        Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricGatewayName { 'GW' }
        Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
            @(
                [pscustomobject]@{ id = 'c1'; displayName = 'Prod-SQL (EU).01' }
                [pscustomobject]@{ id = 'c2'; displayName = 'Other' }
            )
        }
    }

    It "accepts a name with special characters and filters to the match" {
        # A restrictive pattern would throw at binding; calling directly proves it is accepted.
        $r = Get-FabricConnection -ConnectionName 'Prod-SQL (EU).01'
        @($r).Count       | Should -Be 1
        $r[0].displayName | Should -Be 'Prod-SQL (EU).01'
    }
}
