<#
.SYNOPSIS
    Surfaces useful scalars buried in a Fabric item's nested `properties` object as flat,
    top-level NoteProperties.

.DESCRIPTION
    Many Fabric items return the information users most want (connection strings, service
    URIs, OneLake paths, SQL server FQDN / restore points, provisioning state) nested under
    a `properties` object - and sometimes one level deeper (e.g.
    properties.sqlEndpointProperties.connectionString). This helper copies those inner
    scalars up to flat top-level NoteProperties (e.g. `SqlEndpointConnectionString`) so they
    are easy to select, sort, export and display, WITHOUT removing the original nested object.

    Every mapping is guarded by existence + non-null checks, so the helper is safe to run on
    any item: an object that lacks `properties` (or a given inner field) is returned unchanged.
    Objects are mutated in place (Add-Member -Force) and also emitted for pipeline chaining.

    This runs only on the ENRICHED (default) output path - it is deliberately NOT applied to
    `-Raw` output, which must mirror the untouched API response.

    The set of fields mapped here is derived from docs/api-property-map.md (the "High-value
    targets" table); regenerate that doc and extend the maps below as the API evolves.

.PARAMETER InputObject
    One or more resource objects to flatten. Accepts pipeline input.

.OUTPUTS
    System.Object[] - the same objects, each with flat NoteProperties added where applicable.

.EXAMPLE
    $lakehouse | Add-FabricFlattenedProperty

    Adds SqlEndpointConnectionString / OneLakeTablesPath / OneLakeFilesPath / DefaultSchema
    (when present) to the lakehouse object.

.NOTES
    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Add-FabricFlattenedProperty {
    [CmdletBinding()]
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory = $true, ValueFromPipeline = $true)]
        [AllowNull()]
        [object[]]$InputObject
    )

    begin {
        # Scalar fields found DIRECTLY under .properties -> flat top-level NoteProperty name.
        $directMap = [ordered]@{
            connectionString        = 'ConnectionString'
            oneLakeTablesPath       = 'OneLakeTablesPath'
            oneLakeFilesPath        = 'OneLakeFilesPath'
            oneLakeRootPath         = 'OneLakeRootPath'
            defaultSchema           = 'DefaultSchema'
            queryServiceUri         = 'QueryServiceUri'
            ingestionServiceUri     = 'IngestionServiceUri'
            serverFqdn              = 'ServerFqdn'
            databaseName            = 'DatabaseName'
            createdDate             = 'CreatedDate'
            lastUpdatedTime         = 'LastUpdatedTime'
            earliestRestorePoint    = 'EarliestRestorePoint'
            latestRestorePoint      = 'LatestRestorePoint'
            backupRetentionDays     = 'BackupRetentionDays'
            parentEventhouseItemId  = 'ParentEventhouseItemId'
            parentWarehouseId       = 'ParentWarehouseId'
            snapshotDateTime        = 'SnapshotDateTime'
            minimumConsumptionUnits = 'MinimumConsumptionUnits'
        }
    }

    process {
        foreach ($obj in $InputObject) {
            if (-not $obj) { continue }

            $propsMember = $obj.PSObject.Properties['properties']
            $p = if ($propsMember) { $propsMember.Value } else { $null }

            if ($p) {
                # Direct properties.<field> scalars.
                foreach ($src in $directMap.Keys) {
                    $member = $p.PSObject.Properties[$src]
                    if ($member -and $null -ne $member.Value) {
                        $obj | Add-Member -NotePropertyName $directMap[$src] -NotePropertyValue $member.Value -Force
                    }
                }

                # Nested: properties.sqlEndpointProperties.* (Lakehouse, MirroredDatabase).
                $sepMember = $p.PSObject.Properties['sqlEndpointProperties']
                if ($sepMember -and $sepMember.Value) {
                    $sep = $sepMember.Value
                    $sepCs = $sep.PSObject.Properties['connectionString']
                    if ($sepCs -and $null -ne $sepCs.Value) {
                        $obj | Add-Member -NotePropertyName 'SqlEndpointConnectionString' -NotePropertyValue $sepCs.Value -Force
                    }
                    $sepId = $sep.PSObject.Properties['id']
                    if ($sepId -and $null -ne $sepId.Value) {
                        $obj | Add-Member -NotePropertyName 'SqlEndpointId' -NotePropertyValue $sepId.Value -Force
                    }
                    $sepPs = $sep.PSObject.Properties['provisioningStatus']
                    if ($sepPs -and $null -ne $sepPs.Value) {
                        # provisioningStatus is itself an object ({ status, ... }); surface its status.
                        $statusValue = if ($sepPs.Value.PSObject.Properties['status']) { $sepPs.Value.status } else { $sepPs.Value }
                        $obj | Add-Member -NotePropertyName 'SqlEndpointProvisioningStatus' -NotePropertyValue $statusValue -Force
                    }
                }

                # Nested: properties.publishDetails.state (Environment).
                $pdMember = $p.PSObject.Properties['publishDetails']
                if ($pdMember -and $pdMember.Value) {
                    $pdState = $pdMember.Value.PSObject.Properties['state']
                    if ($pdState -and $null -ne $pdState.Value) {
                        $obj | Add-Member -NotePropertyName 'PublishState' -NotePropertyValue $pdState.Value -Force
                    }
                }
            }

            $obj
        }
    }
}
