<#
.SYNOPSIS
    Retrieves the definition of an Eventhouse from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an Eventhouse from a specified workspace using the provided EventhouseId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is mandatory.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to retrieve the definition for. This parameter is optional.

.PARAMETER EventhouseFormat
    The format in which to retrieve the Eventhouse definition. This parameter is optional.

.EXAMPLE
     Get-FabricEventhouseDefinition -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example retrieves the definition of the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricEventhouseDefinition -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890" -EventhouseFormat "json"
    This example retrieves the definition of the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricEventhouseDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseFormat
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI with filtering logic
        $queryParams = if ($EventhouseFormat) { @{ format = $EventhouseFormat } } else { $null }
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource "eventhouses/$EventhouseId/getDefinition" -QueryParameters $queryParams

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Eventhouse '$EventhouseId' definition retrieved successfully!" -Level Debug
        $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventhouse definition. Error: $errorDetails" -Level Error
    }

}
