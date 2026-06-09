#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "ThrowOnFailure"
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

Describe "Invoke-FabricAuthCheck" -Tag "UnitTests" {

    BeforeDiscovery {
        . $PSScriptRoot\..\..\source\Private\Invoke-FabricAuthCheck.ps1
        . $PSScriptRoot\..\..\source\Private\Test-TokenExpired.ps1
        . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
        $command = Get-Command -Name Invoke-FabricAuthCheck
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            . $PSScriptRoot\..\..\source\Private\Invoke-FabricAuthCheck.ps1
            . $PSScriptRoot\..\..\source\Private\Test-TokenExpired.ps1
            . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
            $command = Get-Command -Name Invoke-FabricAuthCheck
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
