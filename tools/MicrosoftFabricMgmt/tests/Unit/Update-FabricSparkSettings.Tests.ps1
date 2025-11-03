#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "WorkspaceId"
        "automaticLogEnabled"
        "notebookInteractiveRunEnabled"
        "customizeComputeEnabled"
        "defaultPoolName"
        "defaultPoolType"
        "starterPoolMaxNode"
        "starterPoolMaxExecutors"
        "EnvironmentName"
        "EnvironmentRuntimeVersion"
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
        "WhatIf"
        "Confirm"
    )
)

Describe "Update-FabricSparkSettings" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Update-FabricSparkSettings
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Update-FabricSparkSettings
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
