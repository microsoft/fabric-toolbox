<#
.SYNOPSIS
    Retrieves the definition of an SparkJobDef        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $response = Invoke-FabricAPIRequest @apiParamsion from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an SparkJobDefinition from a specified workspace using the provided SparkJobDefinitionId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition exists. This parameter is mandatory.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to retrieve the definition for. This parameter is optional.

.PARAMETER SparkJobDefinitionFormat
    The format in which to retrieve the SparkJobDefinition definition. This parameter is optional.

.EXAMPLE
    Get-FabricSparkJobDefinitionDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890"
    This example retrieves the definition of the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSparkJobDefinitionDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890" -SparkJobDefinitionFormat "json"
    This example retrieves the definition of the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricSparkJobDefinitionDefinition {
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
        [ValidateSet('SparkJobDefinitionV1')]
        [string]$SparkJobDefinitionFormat = "SparkJobDefinitionV1"
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic 
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        if ($SparkJobDefinitionFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $SparkJobDefinitionFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post 
        
        # Return the API response
        Write-Message -Message "Spark Job Definition '$SparkJobDefinitionId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Spark Job Definition. Error: $errorDetails" -Level Error
    } 
}
