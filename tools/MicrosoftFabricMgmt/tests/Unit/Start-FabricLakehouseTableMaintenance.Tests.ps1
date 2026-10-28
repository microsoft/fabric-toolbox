#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "WorkspaceId"
    "LakehouseId"
    "JobType"
    "SchemaName"
    "TableName"
    "IsVOrder"
    "ColumnsZOrderBy"
    "retentionPeriod"
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

Describe "Start-FabricLakehouseTableMaintenance" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Start-FabricLakehouseTableMaintenance
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Start-FabricLakehouseTableMaintenance
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

Describe "Start-FabricLakehouseTableMaintenance behavior" -Tag "UnitTests" {

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
        # The function first fetches the lakehouse to check for schema support; return one without a defaultSchema.
        Mock -ModuleName MicrosoftFabricMgmt Get-FabricLakehouse {
            [pscustomobject]@{ displayName = 'LH'; properties = [pscustomobject]@{} }
        }
        Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
            $global:__capUri    = $BaseURI
            $global:__capMethod = $Method
            $global:__capBody   = $Body
            [pscustomobject]@{ id = 'job-1' }
        }
    }

    AfterAll {
        Remove-Variable -Name __capUri, __capMethod, __capBody -Scope Global -ErrorAction SilentlyContinue
    }

    It "POSTs to the job-type-in-path instances endpoint (/jobs/TableMaintenance/instances)" {
        $null = Start-FabricLakehouseTableMaintenance -WorkspaceId 'ws-1' -LakehouseId 'lh-1' -TableName 'Sales' -Confirm:$false
        $global:__capUri    | Should -Be 'https://api.fabric.microsoft.com/v1/workspaces/ws-1/lakehouses/lh-1/jobs/TableMaintenance/instances'
        $global:__capMethod | Should -Be 'Post'
    }

    It "still sends the executionData table maintenance body" {
        $null = Start-FabricLakehouseTableMaintenance -WorkspaceId 'ws-1' -LakehouseId 'lh-1' -TableName 'Sales' -Confirm:$false
        ($global:__capBody | ConvertFrom-Json).executionData.tableName | Should -Be 'Sales'
    }

    It "does not use the legacy ?jobType= query form" {
        $null = Start-FabricLakehouseTableMaintenance -WorkspaceId 'ws-1' -LakehouseId 'lh-1' -TableName 'Sales' -Confirm:$false
        $global:__capUri | Should -Not -Match '\?jobType='
    }

    It "-WhatIf makes no API call" {
        $global:__capUri = $null
        Start-FabricLakehouseTableMaintenance -WorkspaceId 'ws-1' -LakehouseId 'lh-1' -TableName 'Sales' -WhatIf
        $global:__capUri | Should -BeNullOrEmpty
    }
}
