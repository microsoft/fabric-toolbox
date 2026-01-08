#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "Resource"
        "WorkspaceId"
        "ItemId"
        "Subresource"
        "QueryParameters"
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

Describe "New-FabricAPIUri" -Tag "UnitTests" {

    BeforeDiscovery {
        . $PSScriptRoot\..\..\source\Private\New-FabricAPIUri.ps1
        . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
        $command = Get-Command -Name New-FabricAPIUri
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            . $PSScriptRoot\..\..\source\Private\New-FabricAPIUri.ps1
            . $PSScriptRoot\..\..\source\Private\Write-FabricLog.ps1
            $command = Get-Command -Name New-FabricAPIUri
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
