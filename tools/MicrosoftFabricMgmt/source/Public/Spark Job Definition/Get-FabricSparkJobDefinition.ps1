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

.PARAMETER Raw
    If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
    Get-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890"
    This example retrieves the SparkJobDefinition details for the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionName "My SparkJobDefinition"
    This example retrieves the SparkJobDefinition details for the SparkJobDefinition named "My SparkJobDefinition" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -Raw
    This example retrieves all Spark Job Definitions in the workspace with raw API response format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSparkJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$SparkJobDefinitionName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($SparkJobDefinitionId -and $SparkJobDefinitionName) {
                Write-FabricLog -Message "Specify only one parameter: either 'SparkJobDefinitionId' or 'SparkJobDefinitionName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $SparkJobDefinitionId -DisplayName $SparkJobDefinitionName -ResourceType 'SparkJobDefinition' -TypeName 'MicrosoftFabric.SparkJobDefinition' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve SparkJobDefinition for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
