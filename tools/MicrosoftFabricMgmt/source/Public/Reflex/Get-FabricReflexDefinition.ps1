<#
.SYNOPSIS
    Retrieves the definition of an Reflex from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an Reflex from a specified workspace using the provided ReflexId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is mandatory.

.PARAMETER ReflexId
    The unique identifier of the Reflex to retrieve the definition for. This parameter is optional.

.PARAMETER ReflexFormat
    The format in which to retrieve the Reflex definition. This parameter is optional.

.EXAMPLE
    Get-FabricReflexDefinition -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890"
    This example retrieves the definition of the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReflexDefinition -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890" -ReflexFormat "json"
    This example retrieves the definition of the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricReflexDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic    
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReflexId
        if ($ReflexFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $ReflexFormat
        }   
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "Reflex '$ReflexId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Reflex. Error: $errorDetails" -Level Error
    } 
 
}
