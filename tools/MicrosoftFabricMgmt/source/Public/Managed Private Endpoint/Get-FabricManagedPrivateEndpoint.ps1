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

.EXAMPLE
    Get-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointId "endpoint-67890"
    Retrieves details for the Managed Private Endpoint with ID "endpoint-67890" in workspace "workspace-12345".

.EXAMPLE
    Get-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointName "MyEndpoint"
    Retrieves details for the Managed Private Endpoint named "MyEndpoint" in workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricManagedPrivateEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointName
    )

    try {
        # Validate input parameters
        if ($ManagedPrivateEndpointId -and $ManagedPrivateEndpointName) {
            Write-Message -Message "Specify only one parameter: either 'ManagedPrivateEndpointId' or 'ManagedPrivateEndpointName'." -Level Error
            return $null
        }

        if ($ManagedPrivateEndpointName.Length -gt 64) {
            Write-Message -Message "Managed Private Endpoint name exceeds 64 characters." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/managedPrivateEndpoints" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ManagedPrivateEndpointId) {
            $matchedItems = $dataItems.Where({ $_.id -eq $ManagedPrivateEndpointId }, 'First')
        }
        elseif ($ManagedPrivateEndpointName) {
            $matchedItems = $dataItems.Where({ $_.name -eq $ManagedPrivateEndpointName }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Managed Private Endpoints. Error: $errorDetails" -Level Error
    } 
}