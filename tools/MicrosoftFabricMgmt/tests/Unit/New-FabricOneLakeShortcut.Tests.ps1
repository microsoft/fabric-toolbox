#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "WorkspaceId"
    "ItemId"
    "ShortcutName"
    "Path"
    "ShortcutConflictPolicy"
    "Target"
    "ConnectionId"
    "Location"
    "SubPath"
    "DeltaLakeFolder"
    "EnvironmentDomain"
    "TableName"
    "TargetItemId"
    "TargetPath"
    "TargetWorkspaceId"
    "Bucket"
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
    "Confirm"
    "WhatIf"
)
)

Describe "New-FabricOneLakeShortcut" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name New-FabricOneLakeShortcut
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name New-FabricOneLakeShortcut
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
