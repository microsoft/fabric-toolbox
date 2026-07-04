#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
param(
    $ModuleName = "MicrosoftFabricMgmt",
$expectedParams = @(
    "WorkspaceId"
    "WarehouseSnapshotId"
    "WarehouseSnapshotName"
    "Raw"
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

Describe "Get-FabricWarehouseSnapshot" -Tag "UnitTests" {

    BeforeDiscovery {
        $command = Get-Command -Name Get-FabricWarehouseSnapshot
        $expected = $expectedParams
    }

    Context "Parameter validation" {
        BeforeAll {
            $command = Get-Command -Name Get-FabricWarehouseSnapshot
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

Describe "Get-FabricWarehouseSnapshot flattening" -Tag "UnitTests" {

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
        Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricWorkspaceName { 'WS' }
        Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityIdFromWorkspace { 'cap-1' }
        Mock -ModuleName MicrosoftFabricMgmt Resolve-FabricCapacityName { 'CAP' }
        Mock -ModuleName MicrosoftFabricMgmt Invoke-FabricAPIRequest {
            @([pscustomobject]@{
                    id          = 'snap-1'
                    displayName = 'Nightly'
                    properties  = [pscustomobject]@{
                        connectionString = 'snap.datawarehouse.fabric.microsoft.com'
                        parentWarehouseId = 'wh-1'
                        snapshotDateTime  = '2026-07-01T00:00:00Z'
                    }
                })
        }
    }

    It "flattens properties.* onto the default output" {
        $r = Get-FabricWarehouseSnapshot -WorkspaceId 'ws-1'
        $r[0].ConnectionString  | Should -Be 'snap.datawarehouse.fabric.microsoft.com'
        $r[0].ParentWarehouseId | Should -Be 'wh-1'
        $r[0].SnapshotDateTime  | Should -Be '2026-07-01T00:00:00Z'
        # nested object intact + name enrichment present
        $r[0].properties.connectionString | Should -Be 'snap.datawarehouse.fabric.microsoft.com'
        $r[0].WorkspaceName | Should -Be 'WS'
    }

    It "-Raw does NOT flatten" {
        $r = Get-FabricWarehouseSnapshot -WorkspaceId 'ws-1' -Raw
        $r[0].PSObject.Properties.Name | Should -Not -Contain 'ConnectionString'
        $r[0].properties.connectionString | Should -Be 'snap.datawarehouse.fabric.microsoft.com'
    }
}
