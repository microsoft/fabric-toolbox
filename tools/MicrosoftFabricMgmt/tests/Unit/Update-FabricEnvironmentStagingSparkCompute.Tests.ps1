#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
    $expectedParams = @(
        "WorkspaceId"
        "EnvironmentId"
        "InstancePoolName"
        "InstancePoolType"
        "DriverCores"
        "DriverMemory"
        "ExecutorCores"
        "ExecutorMemory"
        "DynamicExecutorAllocationEnabled"
        "DynamicExecutorAllocationMinExecutors"
        "DynamicExecutorAllocationMaxExecutors"
        "RuntimeVersion"
        "SparkProperties"
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

Describe "Update-FabricEnvironmentStagingSparkCompute" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Update-FabricEnvironmentStagingSparkCompute
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Update-FabricEnvironmentStagingSparkCompute
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
