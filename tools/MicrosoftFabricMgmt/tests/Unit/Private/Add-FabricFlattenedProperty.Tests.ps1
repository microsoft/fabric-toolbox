#Requires -Module @{ ModuleName="Pester"; ModuleVersion="5.0"}
<#
    Unit tests for the private Add-FabricFlattenedProperty helper: surfaces nested
    properties.* scalars (and properties.sqlEndpointProperties.* / publishDetails.state)
    as flat top-level NoteProperties, guarded per-field, mutating in place.
#>

BeforeAll {
    Get-Module MicrosoftFabricMgmt | Remove-Module -Force -ErrorAction SilentlyContinue
    $BuiltModule   = "$PSScriptRoot/../../../output/module/MicrosoftFabricMgmt"
    $ModuleVersion = (Get-ChildItem $BuiltModule -Directory | Sort-Object { [version]$_.Name } -Descending | Select-Object -First 1).Name
    Import-Module (Join-Path $BuiltModule "$ModuleVersion/MicrosoftFabricMgmt.psd1") -Force -ErrorAction Stop
}

Describe 'Add-FabricFlattenedProperty' -Tag 'UnitTests' {

    It 'flattens a lakehouse: sqlEndpointProperties + oneLake paths + defaultSchema' {
        InModuleScope MicrosoftFabricMgmt {
            $lh = [pscustomobject]@{
                id         = 'lh-1'
                properties = [pscustomobject]@{
                    oneLakeTablesPath     = 'abfss://ws/lh/Tables'
                    oneLakeFilesPath      = 'abfss://ws/lh/Files'
                    defaultSchema         = 'dbo'
                    sqlEndpointProperties = [pscustomobject]@{
                        id                 = 'sep-1'
                        connectionString   = 'srv.datawarehouse.fabric.microsoft.com'
                        provisioningStatus = [pscustomobject]@{ status = 'Success' }
                    }
                }
            }
            $null = $lh | Add-FabricFlattenedProperty
            $lh.OneLakeTablesPath            | Should -Be 'abfss://ws/lh/Tables'
            $lh.OneLakeFilesPath             | Should -Be 'abfss://ws/lh/Files'
            $lh.DefaultSchema                | Should -Be 'dbo'
            $lh.SqlEndpointConnectionString  | Should -Be 'srv.datawarehouse.fabric.microsoft.com'
            $lh.SqlEndpointId                | Should -Be 'sep-1'
            $lh.SqlEndpointProvisioningStatus | Should -Be 'Success'
            # Original nested object is left intact.
            $lh.properties.sqlEndpointProperties.connectionString | Should -Be 'srv.datawarehouse.fabric.microsoft.com'
        }
    }

    It 'flattens a warehouse: direct properties.connectionString + createdDate' {
        InModuleScope MicrosoftFabricMgmt {
            $wh = [pscustomobject]@{ id = 'wh-1'; properties = [pscustomobject]@{ connectionString = 'wh.fabric'; createdDate = '2026-01-01' } }
            $null = $wh | Add-FabricFlattenedProperty
            $wh.ConnectionString | Should -Be 'wh.fabric'
            $wh.CreatedDate      | Should -Be '2026-01-01'
        }
    }

    It 'flattens a SQL database: serverFqdn / databaseName / restore points' {
        InModuleScope MicrosoftFabricMgmt {
            $db = [pscustomobject]@{ id = 'db-1'; properties = [pscustomobject]@{
                    connectionString     = 'sql.fabric'
                    databaseName         = 'Sales'
                    serverFqdn           = 'srv.database.windows.net'
                    earliestRestorePoint = '2026-01-01T00:00:00Z'
                    latestRestorePoint   = '2026-07-01T00:00:00Z'
                    backupRetentionDays  = 7
                } }
            $null = $db | Add-FabricFlattenedProperty
            $db.ServerFqdn           | Should -Be 'srv.database.windows.net'
            $db.DatabaseName         | Should -Be 'Sales'
            $db.EarliestRestorePoint | Should -Be '2026-01-01T00:00:00Z'
            $db.BackupRetentionDays  | Should -Be 7
        }
    }

    It 'flattens Environment publishDetails.state -> PublishState' {
        InModuleScope MicrosoftFabricMgmt {
            $env = [pscustomobject]@{ id = 'env-1'; properties = [pscustomobject]@{ publishDetails = [pscustomobject]@{ state = 'Success' } } }
            $null = $env | Add-FabricFlattenedProperty
            $env.PublishState | Should -Be 'Success'
        }
    }

    It 'leaves an object with no properties untouched (no new members)' {
        InModuleScope MicrosoftFabricMgmt {
            $plain = [pscustomobject]@{ id = 'x'; displayName = 'y' }
            $before = @($plain.PSObject.Properties.Name)
            $null = $plain | Add-FabricFlattenedProperty
            @($plain.PSObject.Properties.Name) | Should -Be $before
        }
    }

    It 'only adds fields that are present (partial properties)' {
        InModuleScope MicrosoftFabricMgmt {
            $kql = [pscustomobject]@{ id = 'k'; properties = [pscustomobject]@{ queryServiceUri = 'https://q'; ingestionServiceUri = 'https://i' } }
            $null = $kql | Add-FabricFlattenedProperty
            $kql.QueryServiceUri     | Should -Be 'https://q'
            $kql.IngestionServiceUri | Should -Be 'https://i'
            $kql.PSObject.Properties.Name | Should -Not -Contain 'ConnectionString'
        }
    }

    It 'is idempotent (re-running does not duplicate or change values)' {
        InModuleScope MicrosoftFabricMgmt {
            $wh = [pscustomobject]@{ id = 'wh'; properties = [pscustomobject]@{ connectionString = 'c1' } }
            $null = $wh | Add-FabricFlattenedProperty
            $null = $wh | Add-FabricFlattenedProperty
            @($wh.PSObject.Properties | Where-Object Name -eq 'ConnectionString').Count | Should -Be 1
            $wh.ConnectionString | Should -Be 'c1'
        }
    }
}
