<#
.SYNOPSIS
Updates the properties of a Fabric Environment.

.DESCRIPTION
The `Update-FabricEnvironment` function updates the name and/or description of a specified Fabric Environment by making a PATCH request to the API.

.PARAMETER EnvironmentId
The unique identifier of the Environment to be updated.

.PARAMETER EnvironmentName
The new name for the Environment.

.PARAMETER EnvironmentDescription
(Optional) The new description for the Environment.

.EXAMPLE
Update-FabricEnvironment -EnvironmentId "Environment123" -EnvironmentName "NewEnvironmentName"

Updates the name of the Environment with the ID "Environment123" to "NewEnvironmentName".

.EXAMPLE
Update-FabricEnvironment -EnvironmentId "Environment123" -EnvironmentName "NewName" -EnvironmentDescription "Updated description"

Updates both the name and description of the Environment "Environment123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Update-FabricEnvironment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentDescription
    )

    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/environments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $EnvironmentName
        }

        if ($EnvironmentDescription) {
            $body.description = $EnvironmentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Patch `
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

        # Step 6: Handle results
        Write-Message -Message "Environment '$EnvironmentName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Step 7: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Environment. Error: $errorDetails" -Level Error
    }
}
