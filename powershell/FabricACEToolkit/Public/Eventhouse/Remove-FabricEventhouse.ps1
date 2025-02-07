<#
.SYNOPSIS
    Removes an Eventhouse from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an Eventhouse 
    from the specified workspace using the provided WorkspaceId and EventhouseId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Eventhouse will be removed.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to be removed.

.EXAMPLE
     Remove-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example removes the Eventhouse with ID "eventhouse-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Remove-FabricEventhouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId
    )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/eventhouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventhouseId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Delete `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"
        
            # Step 4: Handle response
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }

        Write-Message -Message "Eventhouse '$EventhouseId' deleted successfully from workspace '$WorkspaceId'." -Level Info  
    }
    catch {
        # Step 5: Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to delete Eventhouse '$EventhouseId'. Error: $errorDetails" -Level Error
    }
}
