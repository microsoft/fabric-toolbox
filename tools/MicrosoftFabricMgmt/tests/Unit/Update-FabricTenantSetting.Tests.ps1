#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "TenantSettingName"
    "EnableTenantSetting"
    "DelegateToCapacity"
    "DelegateToDomain"
    "DelegateToWorkspace"
    "EnabledSecurityGroups"
    "ExcludedSecurityGroups"
    "Properties"
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

Describe "Update-FabricTenantSetting" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Update-FabricTenantSetting
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Update-FabricTenantSetting
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
