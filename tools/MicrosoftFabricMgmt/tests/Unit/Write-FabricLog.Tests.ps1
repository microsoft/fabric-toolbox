#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "Message"
    "Level"
    "ErrorRecord"
    "Data"
    "Tag"
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

Describe "Write-FabricLog" -Tag "UnitTests" {

    BeforeDiscovery {
        . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
        $command = Get-Command -Name Write-FabricLog
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
        . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1

            $command = Get-Command -Name Write-FabricLog
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
