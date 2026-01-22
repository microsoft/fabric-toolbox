<#
.SYNOPSIS
    Retrieves Eventhouse details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Eventhouse details from a specified workspace using either the provided EventhouseId or EventhouseName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is mandatory.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to retrieve. This parameter is optional.

.PARAMETER EventhouseName
    The name of the Eventhouse to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example retrieves the Eventhouse details for the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseName "My Eventhouse"
    This example retrieves the Eventhouse details for the Eventhouse named "My Eventhouse" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricEventhouse {
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
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventhouseName
    )

    process {
        try {
            # Validate input parameters
            if ($EventhouseId -and $EventhouseName) {
                Write-FabricLog -Message "Specify only one parameter: either 'EventhouseId' or 'EventhouseName'." -Level Error
                return
            }

            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventhouses'

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering logic
            Select-FabricResource -InputObject $dataItems -Id $EventhouseId -DisplayName $EventhouseName -ResourceType 'Eventhouse' -TypeName 'MicrosoftFabric.Eventhouse'
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Eventhouse for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
