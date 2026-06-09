#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "WorkspaceId"
    "KQLQuerysetId"
    "KQLQuerysetFormat"
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

Describe "Get-FabricKQLQuerysetDefinition" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Get-FabricKQLQuerysetDefinition
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Get-FabricKQLQuerysetDefinition
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
