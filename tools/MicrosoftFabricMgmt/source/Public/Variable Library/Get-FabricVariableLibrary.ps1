<#
.SYNOPSIS
    Retrieves variable library information from a Microsoft Fabric workspace.

.DESCRIPTION
    Fetches variable libraries from a specified workspace. You can filter results by providing either the VariableLibraryId or VariableLibraryName.
    The function ensures authentication, builds the API endpoint, performs the request, and returns the relevant variable library details.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the variable library. Required.

.PARAMETER VariableLibraryId
    The unique identifier of the variable library to retrieve. Optional.

.PARAMETER VariableLibraryName
    The display name of the variable library to retrieve. Optional.

.EXAMPLE
    Get-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890"
    Returns the variable library with ID "library-67890" from the specified workspace.

.EXAMPLE
    Get-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryName "My Variable Library"
    Returns the variable library named "My Variable Library" from the specified workspace.

.NOTES
    - Requires a `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` to validate authentication before making the API call.

    Author: Tiago Balabuch
#>
function Get-FabricVariableLibrary {
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
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$VariableLibraryName
    )
    try {
        # Validate input parameters
        if ($VariableLibraryId -and $VariableLibraryName) {
            Write-Message -Message "Specify only one parameter: either 'VariableLibraryId' or 'VariableLibraryName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($VariableLibraryId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $VariableLibraryId }, 'First')
        }
        elseif ($VariableLibraryName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $VariableLibraryName }, 'First')
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
        Write-Message -Message "Failed to retrieve Variable Library. Error: $errorDetails" -Level Error
    }
}