#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "InputObject"
        "Depth"
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

Describe "Convert-FabricRequestBody" -Tag "UnitTests" {

    BeforeDiscovery {
        . $PSScriptRoot\..\..\source\Private\Convert-FabricRequestBody.ps1
        . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
        $command = Get-Command -Name Convert-FabricRequestBody
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            . $PSScriptRoot\..\..\source\Private\Convert-FabricRequestBody.ps1
            . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
            $command = Get-Command -Name Convert-FabricRequestBody
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
