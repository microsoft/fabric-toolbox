<#
.SYNOPSIS
    Retrieves mounted Data Factory details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets information about mounted Data Factories in a given workspace. You can filter the results by specifying either the MountedDataFactoryId or the MountedDataFactoryName.
    The function validates authentication, constructs the API endpoint, sends the request, and returns the matching Data Factory details.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the mounted Data Factory. This parameter is required.

.PARAMETER MountedDataFactoryId
    The unique identifier of the mounted Data Factory to retrieve. Optional.

.PARAMETER MountedDataFactoryName
    The display name of the mounted Data Factory to retrieve. Optional.

.EXAMPLE
    Get-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryId "MountedDataFactory-67890"
    Retrieves the mounted Data Factory with ID "MountedDataFactory-67890" from the specified workspace.

.EXAMPLE
    Get-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryName "My Data Factory"
    Retrieves the mounted Data Factory named "My Data Factory" from the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricMountedDataFactory {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MountedDataFactoryName
    )
    try {
        # Validate input parameters
        if ($MountedDataFactoryId -and $MountedDataFactoryName) {
            Write-Message -Message "Specify only one parameter: either 'MountedDataFactoryId' or 'MountedDataFactoryName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        
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
        if ($MountedDataFactoryId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MountedDataFactoryId }, 'First')
        }
        elseif ($MountedDataFactoryName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MountedDataFactoryName }, 'First')
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
        Write-Message -Message "Failed to retrieve Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}