#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "WorkspaceId"
    "LakehouseId"
    "JobType"
    "WaitForCompletion"
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

Describe "Start-FabricLakehouseRefreshMaterializedLakeView" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Start-FabricLakehouseRefreshMaterializedLakeView
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Start-FabricLakehouseRefreshMaterializedLakeView
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

Describe "Start-FabricLakehouseRefreshMaterializedLakeView behavior" -Tag "UnitTests" {

    BeforeAll {
        Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
        $BuiltModule   = "$PSScriptRoot/../../output/module/MicrosoftFabricMgmt"
        $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
        Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop

        InModuleScope MicrosoftFabricMgmt {
            $script:FabricAuthContext = [pscustomobject]@{
                BaseUrl       = 'https://api.fabric.microsoft.com/v1'
                FabricHeaders = @{ Authorization = 'Bearer test' }
            }
        }
        Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAuthCheck {}
        Mock -ModuleName MicrosoftFabricMgmt Write-FabricLog {}
        Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
            $global:__capUri    = $BaseURI
            $global:__capMethod = $Method
            [pscustomobject]@{ id = 'job-1' }
        }
    }

    AfterAll {
        Remove-Variable -Name __capUri, __capMethod -Scope Global -ErrorAction SilentlyContinue
    }

    It "POSTs to the job-type-in-path instances endpoint (/jobs/RefreshMaterializedLakeViews/instances)" {
        $null = Start-FabricLakehouseRefreshMaterializedLakeView -WorkspaceId 'ws-1' -LakehouseId 'lh-1' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/lakehouses/lh-1/jobs/RefreshMaterializedLakeViews/instances'
        $global:__capMethod | Should -Be 'Post'
    }

    It "does not use the legacy ?jobType= query form" {
        $null = Start-FabricLakehouseRefreshMaterializedLakeView -WorkspaceId 'ws-1' -LakehouseId 'lh-1' -Confirm:$false
        $global:__capUri | Should -Not -Match '\?jobType='
    }

    It "-WhatIf makes no API call" {
        $global:__capUri = $null
        Start-FabricLakehouseRefreshMaterializedLakeView -WorkspaceId 'ws-1' -LakehouseId 'lh-1' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
