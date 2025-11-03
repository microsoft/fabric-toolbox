<#
.SYNOPSIS
Updates the properties of a Fabric KQLDatabase.

.DESCRIPTION
The `Update-FabricKQLDatabase` function updates the name and/or description of a specified Fabric KQLDatabase by making a PATCH request to the API.

.PARAMETER KQLDatabaseId
The unique identifier of the KQLDatabase to be updated.

.PARAMETER KQLDatabaseName
The new name for the KQLDatabase.

.PARAMETER KQLDatabaseDescription
(Optional) The new description for the KQLDatabase.

.EXAMPLE
Update-FabricKQLDatabase -KQLDatabaseId "KQLDatabase123" -KQLDatabaseName "NewKQLDatabaseName"

Updates the name of the KQLDatabase with the ID "KQLDatabase123" to "NewKQLDatabaseName".

.EXAMPLE
Update-FabricKQLDatabase -KQLDatabaseId "KQLDatabase123" -KQLDatabaseName "NewName" -KQLDatabaseDescription "Updated description"

Updates both the name and description of the KQLDatabase "KQLDatabase123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Update-FabricKQLDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseDescription
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLDatabaseName
        }

        if ($KQLDatabaseDescription) {
            $body.description = $KQLDatabaseDescription
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
        Write-Message -Message "KQLDatabase '$KQLDatabaseName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update KQLDatabase. Error: $errorDetails" -Level Error
    }
}
