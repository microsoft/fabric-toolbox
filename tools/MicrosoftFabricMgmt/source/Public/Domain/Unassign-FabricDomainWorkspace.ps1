
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
Unassign-FabricDomainWorkspace -DomainId "12345"

Unassigns all workspaces from the domain with ID "12345".

.EXAMPLE
Unassign-FabricDomainWorkspace -DomainId "12345" -WorkspaceIds @("workspace1", "workspace2")

Unassigns the specified workspaces from the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.


Author: Tiago Balabuch  

#>
function Unassign-FabricDomainWorkspace {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [array]$WorkspaceIds
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI based on the presence of WorkspaceIds
        # Construct the request body
        if ($WorkspaceIds -and $WorkspaceIds.Count -gt 0) {
            $endpointSuffix = "unassignWorkspaces"
            $body = @{
                workspacesIds = $WorkspaceIds
            }

            $bodyJson = $body | ConvertTo-Json -Depth 2
        }
        else {
            $endpointSuffix = "unassignAllWorkspaces"
            $bodyJson = $null
        }
        $apiEndpointURI = "{0}/admin/domains/{1}/{2}" -f $FabricConfig.BaseUrl, $DomainId, $endpointSuffix
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request 
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Successfully unassigned workspaces to the domain with ID '$DomainId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to unassign workspaces to the domain with ID '$DomainId'. Error: $errorDetails" -Level Error
    }
}