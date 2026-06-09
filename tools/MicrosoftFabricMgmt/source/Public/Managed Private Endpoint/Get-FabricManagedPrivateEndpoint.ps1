<#
.SYNOPSIS
    Retrieves Managed Private Endpoint details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Managed Private Endpoint information from a workspace using either the ManagedPrivateEndpointId or ManagedPrivateEndpointName.
    Validates authentication, builds the API endpoint, sends the request, and processes the results.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Managed Private Endpoint. Mandatory.

.PARAMETER ManagedPrivateEndpointId
    The unique identifier of the Managed Private Endpoint to retrieve. Optional.

.PARAMETER ManagedPrivateEndpointName
    The name of the Managed Private Endpoint to retrieve. Optional.

.PARAMETER Raw
    If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
    Get-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointId "endpoint-67890"
    Retrieves details for the Managed Private Endpoint with ID "endpoint-67890" in workspace "workspace-12345".

.EXAMPLE
    Get-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointName "MyEndpoint"
    Retrieves details for the Managed Private Endpoint named "MyEndpoint" in workspace "workspace-12345".

.EXAMPLE
    Get-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -Raw
    Retrieves all Managed Private Endpoints in the workspace with raw API response format.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricManagedPrivateEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($ManagedPrivateEndpointId -and $ManagedPrivateEndpointName) {
                Write-FabricLog -Message "Specify only one parameter: either 'ManagedPrivateEndpointId' or 'ManagedPrivateEndpointName'." -Level Error
                return
            }

            if ($ManagedPrivateEndpointName.Length -gt 64) {
                Write-FabricLog -Message "Managed Private Endpoint name exceeds 64 characters." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/managedPrivateEndpoints" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $ManagedPrivateEndpointId -DisplayName $ManagedPrivateEndpointName -ResourceType 'ManagedPrivateEndpoint' -TypeName 'MicrosoftFabric.ManagedPrivateEndpoint' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Managed Private Endpoints for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
