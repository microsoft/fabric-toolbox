<#
.SYNOPSIS
    Retrieves the definition of a mounted Data Factory from a Microsoft Fabric workspace.

.DESCRIPTION
    Gets the definition of a mounted Data Factory in the specified workspace by its ID. Handles authentication, builds the API endpoint, and returns the response.

.PARAMETER WorkspaceId
    The ID of the workspace containing the mounted Data Factory. Required.

.PARAMETER MountedDataFactoryId
    The ID of the mounted Data Factory to retrieve. Optional.

.PARAMETER MountedDataFactoryFormat
    The format for the Data Factory definition (e.g., 'json'). Optional.

.EXAMPLE
    Get-FabricMountedDataFactoryDefinition -WorkspaceId "workspace-12345" -MountedDataFactoryId "factory-67890"
    Retrieves the definition for the specified mounted Data Factory.

.EXAMPLE
    Get-FabricMountedDataFactoryDefinition -WorkspaceId "workspace-12345" -MountedDataFactoryId "factory-67890" -MountedDataFactoryFormat "json"
    Retrieves the mounted Data Factory definition in JSON format.

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Uses `Test-TokenExpired` for authentication validation.

    Author: Tiago Balabuch
#>
function Get-FabricMountedDataFactoryDefinition {
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
        [string]$MountedDataFactoryFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic     
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        if ($MountedDataFactoryFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $MountedDataFactoryFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
    
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "Mounted Data Factory '$MountedDataFactoryId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Mounted Data Factory. Error: $errorDetails" -Level Error
    } 
 }