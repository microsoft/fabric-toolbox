<#
.SYNOPSIS
    Retrieves Spark Job Definition details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves SparkJobDefinition details from a specified workspace using either the provided SparkJobDefinitionId or SparkJobDefinitionName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition exists. This parameter is mandatory.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to retrieve. This parameter is optional.

.PARAMETER SparkJobDefinitionName
    The name of the SparkJobDefinition to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890"
    This example retrieves the SparkJobDefinition details for the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionName "My SparkJobDefinition"
    This example retrieves the SparkJobDefinition details for the SparkJobDefinition named "My SparkJobDefinition" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricSparkJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkJobDefinitionName
    )
    try {
        # Validate input parameters
        if ($SparkJobDefinitionId -and $SparkJobDefinitionName) {
            Write-Message -Message "Specify only one parameter: either 'SparkJobDefinitionId' or 'SparkJobDefinitionName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
 
        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams
           
        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SparkJobDefinitionId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $SparkJobDefinitionId }, 'First')
        }
        elseif ($SparkJobDefinitionName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $SparkJobDefinitionName }, 'First')
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
        Write-Message -Message "Failed to retrieve SparkJobDefinition. Error: $errorDetails" -Level Error
    } 
}
