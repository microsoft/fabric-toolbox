#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "Verbose"
                "Debug"
                "ErrorAction"
                "WarningAction"
                "InformationAction"
                "ProgressAction"
                "ErrorVariable"
                "WarningVariable"
                "InformationVariable"
                "OutVariable"
                "OutBuffer"
                "PipelineVariable"

    )
)

Describe "Get-FabricExternalDataShares" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Get-FabricExternalDataShares
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Get-FabricExternalDataShares
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
    }

     Context "Alias validation" {
        $testCases = @('Get-FabricExternalDataShares')

        It "Should have the alias <_>" -TestCases $TestCases {
            $Alias = Get-Alias -Name $_ -ErrorAction SilentlyContinue
            $Alias | Should -Not -BeNullOrEmpty
            $Alias.ResolvedCommand.Name | Should -Be  'Get-FabricExternalDataShare'
        }
    }

}
