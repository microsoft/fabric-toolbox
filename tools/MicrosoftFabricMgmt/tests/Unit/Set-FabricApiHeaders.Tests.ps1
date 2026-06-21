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

Describe "Set-FabricApiHeaders" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Set-FabricApiHeaders
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Set-FabricApiHeaders
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

    Context "Backward-compatible wrapper" {
        BeforeAll {
            Mock -ModuleName MicrosoftFabricMgmt Connect-FabricAccount { }
            Mock -ModuleName MicrosoftFabricMgmt Write-PSFMessage { }
        }

        It "Forwards parameters to Connect-FabricAccount" {
            Set-FabricApiHeaders -TenantId '00000000-0000-0000-0000-000000000002' -Confirm:$false
            Should -Invoke -ModuleName MicrosoftFabricMgmt Connect-FabricAccount -Times 1 -Exactly -ParameterFilter {
                $TenantId -eq '00000000-0000-0000-0000-000000000002'
            }
        }

        It "Emits a deprecation warning via Write-PSFMessage -Once" {
            Set-FabricApiHeaders -TenantId '00000000-0000-0000-0000-000000000003' -Confirm:$false
            Should -Invoke -ModuleName MicrosoftFabricMgmt Write-PSFMessage -ParameterFilter {
                $Level -eq 'Warning' -and $Once -eq 'MicrosoftFabricMgmt.SetFabricApiHeaders.Deprecation'
            }
        }
    }
}
