<#
.SYNOPSIS
Retrieves one or more Spark Livy sessions for a specified workspace in Microsoft Fabric.

.DESCRIPTION
The Get-FabricSparkLivySession function queries the Fabric API to obtain Spark Livy session details for a given workspace. Optionally, it can filter results by a specific Livy session ID.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Spark Livy sessions.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricSparkLivySession -WorkspaceId "12345"

Retrieves all Spark Livy sessions for the specified workspace.

.EXAMPLE
Get-FabricSparkLivySession -WorkspaceId "12345" -LivyId "abcde"

Retrieves the Spark Livy session with ID "abcde" for the specified workspace.

.NOTES
- Requires the global $FabricConfig object with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricSparkLivySession {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/livySessions" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Spark Livy Session. Error: $errorDetails" -Level Error
    }
}