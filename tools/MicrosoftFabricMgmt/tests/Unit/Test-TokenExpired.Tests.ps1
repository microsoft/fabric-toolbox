#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
'Verbose'
'Debug'
'ErrorAction'
'WarningAction'
'InformationAction'
'ProgressAction'
'ErrorVariable'
'WarningVariable'
'InformationVariable'
'OutVariable'
'OutBuffer'
'PipelineVariable'

    )
)

Describe "Test-TokenExpired" -Tag "UnitTests" {

    BeforeDiscovery {
        . $PSScriptRoot\..\..\source\Private\Test-TokenExpired.ps1
        $command = Get-Command -Name Test-TokenExpired
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
        . $PSScriptRoot\..\..\source\Private\Test-TokenExpired.ps1

            $command = Get-Command -Name Test-TokenExpired
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
}
