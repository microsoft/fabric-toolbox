<#
.SYNOPSIS
    Retrieves Spark custom pools from a specified workspace.

.DESCRIPTION
    This function retrieves all Spark custom pools from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.
    The function supports filtering by SparkCustomPoolId or SparkCustomPoolName, but not both simultaneously.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve Spark custom pools. This parameter is mandatory.

.PARAMETER SparkCustomPoolId
    The ID of the specific Spark custom pool to retrieve. This parameter is optional.

.PARAMETER SparkCustomPoolName
    The name of the specific Spark custom pool to retrieve. This parameter is optional.

.PARAMETER Raw
    If specified, returns the raw API response without any transformation or filtering.

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345"
    This example retrieves all Spark custom pools from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolId "pool1"
    This example retrieves the Spark custom pool with ID "pool1" from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolName "MyPool"
    This example retrieves the Spark custom pool with name "MyPool" from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -Raw
    This example retrieves all Spark custom pools in the workspace with raw API response format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Handles continuation tokens to retrieve all Spark custom pools if there are multiple pages of results.

    Author: Tiago Balabuch
#>
function Get-FabricSparkCustomPool {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkCustomPoolId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkCustomPoolName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($SparkCustomPoolId -and $SparkCustomPoolName) {
                Write-FabricLog -Message "Specify only one parameter: either 'SparkCustomPoolId' or 'SparkCustomPoolName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure


            # Construct the API endpoint URI
            $apiEndpointURI = "{0}/workspaces/{1}/spark/pools" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering and formatting
            Select-FabricResource -InputObject $dataItems -Id $SparkCustomPoolId -DisplayName $SparkCustomPoolName -ResourceType 'SparkCustomPool' -TypeName 'MicrosoftFabric.SparkCustomPool' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve SparkCustomPool for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }

}
