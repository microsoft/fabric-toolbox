<#
.SYNOPSIS
    Gets a Dataflow or lists all Dataflows in a workspace.

.DESCRIPTION
    The Get-FabricDataflow cmdlet retrieves Dataflow items from a specified Microsoft Fabric workspace.
    You can list all Dataflows or filter by a specific DataflowId or display name.

.PARAMETER WorkspaceId
    The GUID of the workspace containing the Dataflow resources.

.PARAMETER DataflowId
    Optional. Returns only the Dataflow matching this resource Id.

.PARAMETER DataflowName
    Optional. Returns only the Dataflow whose display name exactly matches this value.

.PARAMETER Raw
    Optional. When specified, returns the raw API response with resolved CapacityName and WorkspaceName
    properties added directly to the output objects.

.EXAMPLE
    Get-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012"

    Lists all Dataflows in the specified workspace.

.EXAMPLE
    Get-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

    Returns the Dataflow with the specified Id.

.EXAMPLE
    Get-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowName "SalesDataflow"

    Returns the Dataflow with the specified name.

.EXAMPLE
    Get-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -Raw | Export-Csv -Path "dataflows.csv"

    Exports all Dataflows with resolved names to a CSV file.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity before making the API request.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Get-FabricDataflow {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataflowId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataflowName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($DataflowId -and $DataflowName) {
                Write-FabricLog -Message "Specify only one parameter: either 'DataflowId' or 'DataflowName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $DataflowId -DisplayName $DataflowName -ResourceType 'Dataflow' -TypeName 'MicrosoftFabric.Dataflow' -Raw:$Raw
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Dataflow for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
