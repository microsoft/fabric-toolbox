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

Describe "Write-Message" -Tag "UnitTests" {

    BeforeDiscovery {
        . $PSScriptRoot\..\..\source\Private\Write-Message.ps1
        $command = Get-Command -Name Write-Message
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
        . $PSScriptRoot\..\..\source\Private\Write-Message.ps1
            $command = Get-Command -Name Write-Message
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
