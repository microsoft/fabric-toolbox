<#
.SYNOPSIS
    Creates a new Managed Private Endpoint in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a Managed Private Endpoint (MPE)
    within the specified workspace. You must provide the workspace ID, the name for the MPE, the target private link resource ID,
    and the target subresource type. Optionally, you can include a request message.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Managed Private Endpoint will be created. Mandatory.

.PARAMETER ManagedPrivateEndpointName
    The name of the Managed Private Endpoint to create. Must not exceed 64 characters. Mandatory.

.PARAMETER TargetPrivateLinkResourceId
    The resource ID of the target private link. Mandatory.

.PARAMETER TargetSubresourceType
    The subresource type of the target private link. Mandatory.

.PARAMETER RequestMessage
    (Optional) A message to include with the request. Must not exceed 140 characters.

.EXAMPLE
    New-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointName "myMPE" -TargetPrivateLinkResourceId "/subscriptions/..." -TargetSubresourceType "sqlServer"

.EXAMPLE
    New-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointName "myMPE" -TargetPrivateLinkResourceId "/subscriptions/..." -TargetSubresourceType "sqlServer" -RequestMessage "Please approve"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricManagedPrivateEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetPrivateLinkResourceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetSubresourceType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RequestMessage
    )
    try {
        # Additional ManagedPrivateEndpointName validation

        if ($ManagedPrivateEndpointName.Length -gt 64) {
            Write-Message -Message "Managed Private Endpoint name exceeds 64 characters." -Level Error
            return $null
        }
        if ($requestMessage) {
            if ($requestMessage.Length -gt 140) {
                Write-Message -Message "Request message exceeds 140 characters." -Level Error
                return $null
            }
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/managedPrivateEndpoints" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            name                        = $ManagedPrivateEndpointName
            targetPrivateLinkResourceId = $TargetPrivateLinkResourceId
            targetSubresourceType       = $TargetSubresourceType
        }

        if ($RequestMessage) {
            $body.requestMessage = $RequestMessage
        }
        
        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Managed Private Endpoint created successfully!" -Level Info        
        return $response     
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Managed Private Endpoint. Error: $errorDetails" -Level Error
    }
}