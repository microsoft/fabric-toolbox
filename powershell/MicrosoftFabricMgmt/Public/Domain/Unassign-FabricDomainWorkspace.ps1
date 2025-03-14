
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
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        # Determine the API endpoint URL based on the presence of WorkspaceIds
        $endpointSuffix = if ($WorkspaceIds) { "unassignWorkspaces" }  else { "unassignAllWorkspaces" }

        $apiEndpointUrl = "{0}/admin/domains/{1}/{2}" -f $FabricConfig.BaseUrl, $DomainId, $endpointSuffix
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug
        

        # Step 3: Construct the request body (if needed)
        $bodyJson = if ($WorkspaceIds) {
            $body = @{ workspacesIds = $WorkspaceIds }
            $body | ConvertTo-Json -Depth 2
        }
        else {
            $null
        }
    
        Write-Message -Message "Request Body: $bodyJson" -Level Debug
        # Step 4: Make the API request to unassign specific workspaces
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Post `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 5: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }
        Write-Message -Message "Successfully unassigned workspaces to the domain with ID '$DomainId'." -Level Info
    }
    catch {
        # Step 6: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to unassign workspaces to the domain with ID '$DomainId'. Error: $errorDetails" -Level Error
    }
}