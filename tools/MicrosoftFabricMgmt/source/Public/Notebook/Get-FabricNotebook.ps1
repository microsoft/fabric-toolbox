<#
.SYNOPSIS
Gets a Notebook or lists all Notebooks in a workspace.

.DESCRIPTION
The Get-FabricNotebook cmdlet retrieves Notebook items for a specific Microsoft Fabric workspace. You can list all
notebooks or filter by an exact display name or resource Id. Only one of NotebookId or NotebookName can be specified.

.PARAMETER WorkspaceId
The GUID of the workspace to query for notebooks. This parameter is required to scope the API request.

.PARAMETER NotebookId
Optional. When supplied, returns only the notebook whose Id matches this value. Use this when you already know the
resource Id from a prior call.

.PARAMETER NotebookName
Optional. When supplied, returns only the notebook whose display name exactly matches this string. Do not combine with
NotebookId.

.PARAMETER Raw
When specified, returns the raw API response without any filtering or formatting.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -NotebookId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the notebook matching the provided Id.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -NotebookName "Development"

Retrieves the notebook named Development from workspace 12345.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345"

Lists all notebooks in the workspace.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -Raw

Returns the raw API response for all notebooks in the workspace without any processing.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricNotebook {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$NotebookName,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($NotebookId -and $NotebookName) {
                Write-FabricLog -Message "Specify only one parameter: either 'NotebookId' or 'NotebookName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/notebooks" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $NotebookId -DisplayName $NotebookName -ResourceType 'Notebook' -TypeName 'MicrosoftFabric.Notebook' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Notebook for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
