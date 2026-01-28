<#
.SYNOPSIS
    Creates a new Graph Model in a Fabric workspace.

.DESCRIPTION
    The New-FabricGraphModel cmdlet creates a new Graph Model within a specified Fabric workspace.
    The Graph Model can be created with just a name and optional description, or with a full definition.

.PARAMETER WorkspaceId
    The GUID of the workspace where the Graph Model will be created.

.PARAMETER GraphModelName
    The display name for the new Graph Model.

.PARAMETER Description
    Optional. A description for the Graph Model.

.PARAMETER Definition
    Optional. A hashtable containing the Graph Model definition with parts array.

.EXAMPLE
    New-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelName "MyGraphModel"

    Creates a new Graph Model with the specified name.

.EXAMPLE
    New-FabricGraphModel -WorkspaceId "12345678-1234-1234-1234-123456789012" -GraphModelName "MyGraphModel" -Description "My graph model for analytics"

    Creates a new Graph Model with a name and description.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - This API supports long running operations (LRO).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function New-FabricGraphModel {
    [CmdletBinding(SupportsShouldProcess)]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Description,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Definition
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'GraphModels'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request body
            $body = @{
                displayName = $GraphModelName
            }

            if ($Description) {
                $body.description = $Description
            }

            if ($Definition) {
                $body.definition = $Definition
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Graph Model '$GraphModelName'", "Create")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                if ($response) {
                    Write-FabricLog -Message "Graph Model '$GraphModelName' created successfully." -Level Debug
                    return $response
                }
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create Graph Model '$GraphModelName'. Error: $errorDetails" -Level Error
        }
    }
}
