<#
.SYNOPSIS
    Creates an external data share for a path or list of paths in a Microsoft Fabric item.

.DESCRIPTION
    The New-FabricExternalDataShare function creates an external data share via POST to the
    Fabric endpoint /workspaces/{workspaceId}/items/{itemId}/externalDataShares
    (ExternalDataSharesProvider_CreateExternalDataShare).

    The request body (CreateExternalDataShareRequest) carries the list of item-relative
    paths to share and the recipient details. Because the recipient portion can vary, the
    recipient is supplied as a hashtable and an optional -Properties hashtable is merged
    into the body verbatim so any additional request fields can be expressed.

    By default the created object is enriched with the originating WorkspaceId (stamped from
    the parameter), a resolved WorkspaceName, and decorated for the custom table view. Pass
    -Raw to return the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item to share data from. Mandatory.

.PARAMETER Paths
    One or more item-relative paths to share (CreateExternalDataShareRequest.paths). Mandatory.

.PARAMETER Recipient
    A hashtable describing the recipient (CreateExternalDataShareRequest.recipient), e.g.
    @{ userPrincipalName = 'user@contoso.com'; tenantId = '00000000-0000-0000-0000-000000000000' }.
    Mandatory.

.PARAMETER Properties
    Optional hashtable of additional request fields merged into the body verbatim. Use this
    for any CreateExternalDataShareRequest fields not exposed as dedicated parameters.

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    New-FabricExternalDataShare -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -Paths 'Files/shared' -Recipient @{ userPrincipalName = 'user@contoso.com'; tenantId = '99999999-9999-9999-9999-999999999999' }

    Creates an external data share of the 'Files/shared' path for the specified recipient.

.OUTPUTS
    System.Object
    The created external data share object with all API-returned properties plus WorkspaceName when enriched.

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/items/{itemId}/externalDataShares
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function New-FabricExternalDataShare {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string[]]$Paths,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Recipient,

        [Parameter(Mandatory = $false)]
        [hashtable]$Properties,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Build the segment list explicitly; all segments are mandatory and non-null.
            $segments = @('workspaces', $WorkspaceId, 'items', $ItemId, 'externalDataShares')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body. The recipient (and any extra Properties) are passed
            # through verbatim so the polymorphic parts of the schema can be expressed.
            $body = @{
                paths     = $Paths
                recipient = $Recipient
            }
            if ($Properties) {
                foreach ($key in $Properties.Keys) {
                    $body[$key] = $Properties[$key]
                }
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($ItemId, "Create external data share in workspace '$WorkspaceId'")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after creating external data share for item '$ItemId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                # Resolve the workspace display name for the created share.
                $workspaceName = $WorkspaceId
                try {
                    $workspaceName = Resolve-FabricWorkspaceName -WorkspaceId $WorkspaceId
                }
                catch {
                    Write-FabricLog -Message "Failed to resolve workspace name for ID '$WorkspaceId': $($_.Exception.Message)" -Level Debug
                }

                $response | Add-Member -NotePropertyName 'workspaceId'   -NotePropertyValue $WorkspaceId   -Force
                $response | Add-Member -NotePropertyName 'WorkspaceName' -NotePropertyValue $workspaceName -Force

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.ExternalDataShare'
                Write-FabricLog -Message "External data share created successfully for item '$ItemId'!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to create external data share for item '$ItemId'. Error: $errorDetails" -Level Error
        }
    }
}
