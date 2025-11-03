<#
.SYNOPSIS
Retrieves Spark Job Definition Livy sessions for a specified workspace and job definition in Microsoft Fabric.

.DESCRIPTION
Get-FabricSparkJobDefinitionLivySession queries the Fabric API to return Livy session details for a given workspace and Spark Job Definition. You can optionally filter by a specific Livy session ID.

.PARAMETER WorkspaceId
The ID of the workspace containing the Spark Job Definition.

.PARAMETER SparkJobDefinitionId
The ID of the Spark Job Definition whose Livy sessions are to be retrieved.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricSparkJobDefinitionLivySession -WorkspaceId "12345" -SparkJobDefinitionId "jobdef-001"

Returns all Livy sessions for the specified Spark Job Definition in the workspace.

.EXAMPLE
Get-FabricSparkJobDefinitionLivySession -WorkspaceId "12345" -SparkJobDefinitionId "jobdef-001" -LivyId "livy-abc"

Returns the Livy session with ID "livy-abc" for the specified Spark Job Definition.

.NOTES
- Requires a global $FabricConfig object with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricSparkJobDefinitionLivySession {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId
    )
    try {   
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions/{2}/livySessions" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
  
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
           
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-Message -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-Message -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Spark Job Definition Livy Session. Error: $errorDetails" -Level Error
    }
}