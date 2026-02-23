
<#
.SYNOPSIS
Unassign workspaces from a specified Fabric domain.

.DESCRIPTION
The `Unassign -FabricDomainWorkspace` function allows you to Unassign  specific workspaces from a given Fabric domain or unassign all workspaces if no workspace IDs are specified.
It makes a POST request to the relevant API endpoint for this operation.

.PARAMETER DomainId
The unique identifier of the Fabric domain.

.PARAMETER WorkspaceIds
(Optional) An array of workspace IDs to unassign. If not provided, all workspaces will be unassigned.

.EXAMPLE
Remove-FabricDomainWorkspace -DomainId "12345"

Unassigns all workspaces from the domain with ID "12345".

.EXAMPLE
Remove-FabricDomainWorkspace -DomainId "12345" -WorkspaceIds @("workspace1", "workspace2")

Unassigns the specified workspaces from the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.


Author: Tiago Balabuch

#>
function Remove-FabricDomainWorkspace {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Unassign-FabricDomainWorkspace')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DomainId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [array]$WorkspaceIds
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI based on the presence of WorkspaceIds
            # Construct the request body
            if ($WorkspaceIds -and $WorkspaceIds.Count -gt 0) {
                $endpointSuffix = "unassignWorkspaces"
                $body = @{
                    workspacesIds = $WorkspaceIds
                }
                $bodyJson = Convert-FabricRequestBody -InputObject $body
            }
            else {
                $endpointSuffix = "unassignAllWorkspaces"
                $bodyJson = $null
            }
            $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains', $DomainId, $endpointSuffix)
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Make the API request (guarded by ShouldProcess)
            if ($PSCmdlet.ShouldProcess($DomainId, 'Unassign workspaces from domain')) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "Successfully unassigned workspaces to the domain with ID '$DomainId'." -Level Host
                $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to unassign workspaces to the domain with ID '$DomainId'. Error: $errorDetails" -Level Error
        }
    }
}
