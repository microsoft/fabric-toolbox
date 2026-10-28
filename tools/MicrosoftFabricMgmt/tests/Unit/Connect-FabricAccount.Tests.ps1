#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "TenantId"
    "AppId"
    "AppSecret"
    "UseManagedIdentity"
    "ClientId"
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

Describe "Connect-FabricAccount" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Connect-FabricAccount
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Connect-FabricAccount
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

Describe "Set-FabricApiHeaders backward-compatibility alias" -Tag "UnitTests" {

    BeforeAll {
        Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
        $BuiltModule   = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
        $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
        Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop
    }

    It "exports Set-FabricApiHeaders as an alias" {
        $cmd = Get-Command -Name Set-FabricApiHeaders -ErrorAction SilentlyContinue
        $cmd | Should -Not -BeNullOrEmpty
        $cmd.CommandType | Should -Be 'Alias'
    }

    It "resolves Set-FabricApiHeaders to Connect-FabricAccount" {
        (Get-Alias -Name Set-FabricApiHeaders).ResolvedCommand.Name | Should -Be 'Connect-FabricAccount'
    }

    It "lists the alias in the module's ExportedAliases" {
        (Get-Module MicrosoftFabricMgmt).ExportedAliases.Keys | Should -Contain 'Set-FabricApiHeaders'
    }
}
