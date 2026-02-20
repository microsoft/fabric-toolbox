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

.PARAMETER Raw
    If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
    Get-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryId "MountedDataFactory-67890"
    Retrieves the mounted Data Factory with ID "MountedDataFactory-67890" from the specified workspace.

.EXAMPLE
    Get-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryName "My Data Factory"
    Retrieves the mounted Data Factory named "My Data Factory" from the specified workspace.

.EXAMPLE
    Get-FabricMountedDataFactory -WorkspaceId "workspace-12345" -Raw
    Retrieves all mounted Data Factories in the workspace with raw API response format.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricMountedDataFactory {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MountedDataFactoryName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($MountedDataFactoryId -and $MountedDataFactoryName) {
                Write-FabricLog -Message "Specify only one parameter: either 'MountedDataFactoryId' or 'MountedDataFactoryName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $MountedDataFactoryId -DisplayName $MountedDataFactoryName -ResourceType 'MountedDataFactory' -TypeName 'MicrosoftFabric.MountedDataFactory' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Mounted Data Factory for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
