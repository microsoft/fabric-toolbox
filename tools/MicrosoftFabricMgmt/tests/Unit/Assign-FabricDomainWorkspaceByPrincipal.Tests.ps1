#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "DomainId"
        "PrincipalIds"
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

Describe "Assign-FabricDomainWorkspaceByPrincipal" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Assign-FabricDomainWorkspaceByPrincipal
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Assign-FabricDomainWorkspaceByPrincipal
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
