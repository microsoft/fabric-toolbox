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

BeforeAll {
    Get-Module MicrosoftFabricMgmt -All | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object Name -Descending | Select-Object -First 1).Name
    $ModuleManifest = Join-Path $BuiltModule "$ModuleVersion\MicrosoftFabricMgmt.psd1"
    Import-Module $ModuleManifest -Force -ErrorAction Stop
}

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

        It "Should have exactly the expected parameters" {
            $hasparms = $command.Parameters.Values.Name
            Compare-Object -ReferenceObject $expected -DifferenceObject $hasparms | Should -BeNullOrEmpty
        }
    }

    Context "Authentication behaviour" {
        BeforeAll {
            Mock -ModuleName MicrosoftFabricMgmt Connect-AzAccount { }
            Mock -ModuleName MicrosoftFabricMgmt Get-AzAccessToken {
                [PSCustomObject]@{
                    Token     = (ConvertTo-SecureString 'fake-token' -AsPlainText -Force)
                    ExpiresOn = ([DateTimeOffset]::Now).AddHours(1)
                }
            }
        }

        It "Acquires a token for user principal auth" {
            Connect-FabricAccount -TenantId '00000000-0000-0000-0000-000000000001' -Confirm:$false
            Should -Invoke -ModuleName MicrosoftFabricMgmt Get-AzAccessToken -Times 1 -Exactly
        }
    }
}
