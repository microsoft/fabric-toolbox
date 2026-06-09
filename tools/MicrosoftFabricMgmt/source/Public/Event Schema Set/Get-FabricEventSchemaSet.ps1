<#
.SYNOPSIS
    Retrieves details of one or more Event Schema Set items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Event Schema Set information from a Microsoft Fabric workspace by EventSchemaSetId or EventSchemaSetName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching Event Schema Set(s).
    If neither EventSchemaSetId nor EventSchemaSetName is specified, returns all Event Schema Set items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Event Schema Set item(s). This parameter is required.

.PARAMETER EventSchemaSetId
    The unique identifier of the Event Schema Set item to retrieve. Optional; specify either EventSchemaSetId or EventSchemaSetName, not both.

.PARAMETER EventSchemaSetName
    The display name of the Event Schema Set item to retrieve. Optional; specify either EventSchemaSetId or EventSchemaSetName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricEventSchemaSet -WorkspaceId "workspace-12345" -EventSchemaSetId "EventSchemaSet-67890"
    Retrieves the Event Schema Set with ID "EventSchemaSet-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricEventSchemaSet -WorkspaceId "workspace-12345" -EventSchemaSetName "My Event Schema Set"
    Retrieves the Event Schema Set named "My Event Schema Set" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricEventSchemaSet -WorkspaceId "workspace-12345"
    Retrieves all Event Schema Set items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricEventSchemaSet -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all Event Schema Set items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricEventSchemaSet {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventSchemaSetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventSchemaSetName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'eventSchemaSets'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $EventSchemaSetId -DisplayName $EventSchemaSetName -ResourceType 'Event Schema Set' -TypeName 'MicrosoftFabric.EventSchemaSet' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Event Schema Set for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
