<#
.SYNOPSIS
Updates the properties of a Fabric Eventstream.

.DESCRIPTION
The `Update-FabricEventstream` function updates the name and/or description of a specified Fabric Eventstream by making a PATCH request to the API.

.PARAMETER EventstreamId
The unique identifier of the Eventstream to be updated.

.PARAMETER EventstreamName
The new name for the Eventstream.

.PARAMETER EventstreamDescription
(Optional) The new description for the Eventstream.

.EXAMPLE
Update-FabricEventstream -EventstreamId "Eventstream123" -EventstreamName "NewEventstreamName"

Updates the name of the Eventstream with the ID "Eventstream123" to "NewEventstreamName".

.EXAMPLE
Update-FabricEventstream -EventstreamId "Eventstream123" -EventstreamName "NewName" -EventstreamDescription "Updated description"

Updates both the name and description of the Eventstream "Eventstream123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Update-FabricEventstream {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamDescription
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $EventstreamName
        }

        if ($EventstreamDescription) {
            $body.description = $EventstreamDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams 

        # Return the API response
        Write-Message -Message "Eventstream '$EventstreamName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Eventstream. Error: $errorDetails" -Level Error
    }
}
