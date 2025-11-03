<#
.SYNOPSIS
    Retrieves the definition of a variable library from a Microsoft Fabric workspace.

.DESCRIPTION
    Gets the definition of a variable library in a specified workspace by its ID. Handles authentication, builds the API endpoint, and returns the response.

.PARAMETER WorkspaceId
    The ID of the workspace containing the variable library. Required.

.PARAMETER VariableLibraryId
    The ID of the variable library to retrieve. Optional.

.PARAMETER VariableLibraryFormat
    The format for the variable library definition (e.g., 'json'). Optional.

.EXAMPLE
    Get-FabricVariableLibraryDefinition -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890"
    Retrieves the definition for the specified variable library in the given workspace.

.EXAMPLE
    Get-FabricVariableLibraryDefinition -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890" -VariableLibraryFormat "json"
    Retrieves the variable library definition in JSON format.

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Uses `Test-TokenExpired` to validate authentication before the request.
#>
function Get-FabricVariableLibraryDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic     
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $VariableLibraryId
        if ($VariableLibraryFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $VariableLibraryFormat
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
        Write-Message -Message "Variable Library '$VariableLibraryId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Variable Library. Error: $errorDetails" -Level Error
    } 
}