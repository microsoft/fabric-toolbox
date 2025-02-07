<#
.SYNOPSIS
Assigns workspaces to a specified domain in Microsoft Fabric by their IDs.

.DESCRIPTION
The `Assign-FabricDomainWorkspaceById` function sends a request to assign multiple workspaces to a specified domain using the provided domain ID and an array of workspace IDs.

.PARAMETER DomainId
The ID of the domain to which workspaces will be assigned. This parameter is mandatory.

.PARAMETER WorkspaceIds
An array of workspace IDs to be assigned to the domain. This parameter is mandatory.

.EXAMPLE
Assign-FabricDomainWorkspaceById -DomainId "12345" -WorkspaceIds @("ws1", "ws2", "ws3")

Assigns the workspaces with IDs "ws1", "ws2", and "ws3" to the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Assign-FabricDomainWorkspaceById {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [array]$WorkspaceIds
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/admin/domains/{1}/assignWorkspaces" -f $FabricConfig.BaseUrl, $DomainId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug
        
        # Step 3: Construct the request body
        $body = @{
            workspacesIds = $WorkspaceIds
        }
      
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
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
        Write-Message -Message "Successfully assigned workspaces to the domain with ID '$DomainId'." -Level Info
    }
    catch {
        # Step 6: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to assign workspaces to the domain with ID '$DomainId'. Error: $errorDetails" -Level Error
    }
}
