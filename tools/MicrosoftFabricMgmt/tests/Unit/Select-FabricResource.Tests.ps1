#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "InputObject"
        "Id"
        "DisplayName"
        "ResourceType"
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

Describe "Select-FabricResource" -Tag "UnitTests" {

    BeforeDiscovery {
        . $PSScriptRoot\..\..\source\Private\Select-FabricResource.ps1
        . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
        $command = Get-Command -Name Select-FabricResource
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            . $PSScriptRoot\..\..\source\Private\Select-FabricResource.ps1
            . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
            $command = Get-Command -Name Select-FabricResource
            $expected = $expectedParams
        }

        It "Has parameter: <_>" -ForEach $expected {
            $command | Should -HaveParameter $PSItem
        }

        It "Should have exactly the number of expected parameters $($expected.Count)" {
            $hasparms = $command.Parameters.Values.Name
            Compare-Object -ReferenceObject $expected -DifferenceObject $hasparms | Should -BeNullOrEmpty
        }
    }
}
