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

.PARAMETER Raw
    If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
    Get-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890"
    Returns the variable library with ID "library-67890" from the specified workspace.

.EXAMPLE
    Get-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryName "My Variable Library"
    Returns the variable library named "My Variable Library" from the specified workspace.

.EXAMPLE
    Get-FabricVariableLibrary -WorkspaceId "workspace-12345" -Raw
    Returns all variable libraries in the workspace with raw API response format.

.NOTES
    - Requires a `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` to validate authentication before making the API call.

    Author: Updated by Jess Pomfret and Rob Sewell November 2026
    Author: Tiago Balabuch
#>
function Get-FabricVariableLibrary {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$VariableLibraryName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($VariableLibraryId -and $VariableLibraryName) {
                Write-FabricLog -Message "Specify only one parameter: either 'VariableLibraryId' or 'VariableLibraryName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $VariableLibraryId -DisplayName $VariableLibraryName -ResourceType 'VariableLibrary' -TypeName 'MicrosoftFabric.VariableLibrary' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Variable Library for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
