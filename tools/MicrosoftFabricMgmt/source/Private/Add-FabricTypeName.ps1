function Add-FabricTypeName {
    <#
    .SYNOPSIS
        Adds PSTypeName to Fabric objects for custom formatting.

    .DESCRIPTION
        This helper function adds appropriate PSTypeNames to objects returned from the Fabric API.
        The type names are used by PowerShell's formatting system (via MicrosoftFabricMgmt.Format.ps1xml)
        to display objects with custom table views that include resolved capacity and workspace names.

    .PARAMETER InputObject
        The object(s) to decorate with type names. Can be a single object or an array.
        Accepts pipeline input.

    .PARAMETER TypeName
        The PSTypeName to add to the object(s). Common values:
        - MicrosoftFabric.Lakehouse
        - MicrosoftFabric.Notebook
        - MicrosoftFabric.Warehouse
        - MicrosoftFabric.Workspace
        - MicrosoftFabric.Capacity
        - MicrosoftFabric.DataPipeline
        - MicrosoftFabric.Environment
        - MicrosoftFabric.Eventhouse
        - MicrosoftFabric.KQLDatabase
        - MicrosoftFabric.MLExperiment
        - MicrosoftFabric.MLModel
        - MicrosoftFabric.Report
        - MicrosoftFabric.SemanticModel
        - MicrosoftFabric.SparkJobDefinition

    .EXAMPLE
        $lakehouse | Add-FabricTypeName -TypeName 'MicrosoftFabric.Lakehouse'

        Adds the Lakehouse type name to a single object.

    .EXAMPLE
        $items = Get-FabricLakehouse -WorkspaceId $wsId
        $items | Add-FabricTypeName -TypeName 'MicrosoftFabric.Lakehouse'

        Adds type names to multiple objects via pipeline.

    .EXAMPLE
        # Typical usage in a Get-* function
        $dataItems = Invoke-FabricAPIRequest @apiParams
        $dataItems | Add-FabricTypeName -TypeName 'MicrosoftFabric.Lakehouse'
        return $dataItems

    .NOTES
        This function modifies the PSObject.TypeNames collection directly.
        The type name is inserted at position 0 (highest priority).
        The custom format views defined in MicrosoftFabricMgmt.Format.ps1xml will
        automatically apply when objects with these type names are displayed.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory, ValueFromPipeline)]
        [AllowNull()]
        $InputObject,

        [Parameter(Mandatory)]
        [ValidateNotNullOrEmpty()]
        [string]$TypeName
    )

    process {
        # Handle null input gracefully
        if ($null -eq $InputObject) {
            return
        }

        # Handle arrays - process each item
        if ($InputObject -is [array]) {
            foreach ($item in $InputObject) {
                if ($null -ne $item -and $item.PSObject) {
                    # Only add if not already present
                    if ($item.PSObject.TypeNames[0] -ne $TypeName) {
                        $item.PSObject.TypeNames.Insert(0, $TypeName)
                    }
                }
            }
        }
        # Handle single objects
        elseif ($InputObject.PSObject) {
            # Only add if not already present
            if ($InputObject.PSObject.TypeNames[0] -ne $TypeName) {
                $InputObject.PSObject.TypeNames.Insert(0, $TypeName)
            }
        }
    }
}
