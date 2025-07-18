<#
.SYNOPSIS
    Retrieves access entities for a specified user in Microsoft Fabric.

.DESCRIPTION
    This function retrieves a list of access entities associated with a specified user in Microsoft Fabric.
    It supports filtering by entity type and handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER UserId
    The unique identifier of the user whose access entities are to be retrieved. This parameter is mandatory.

.PARAMETER Type
    The type of access entity to filter the results by. This parameter is optional and supports predefined values such as 'CopyJob', 'Dashboard', 'DataPipeline', etc.

.EXAMPLE
    Get-FabricUserListAccessEntities -UserId "user-12345"
    This example retrieves all access entities associated with the user having ID "user-12345".

.EXAMPLE
    Get-FabricUserListAccessEntities -UserId "user-12345" -Type "Dashboard"
    This example retrieves only the 'Dashboard' access entities associated with the user having ID "user-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricUserListAccessEntities {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$UserId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('CopyJob', ' Dashboard', 'DataPipeline', 'Datamart', 'Environment', 'Eventhouse', 'Eventstream', 'GraphQLApi', 'KQLDashboard', 'KQLDatabase', 'KQLQueryset', 'Lakehouse', 'MLExperiment', 'MLModel', 'MirroredDatabase', 'MountedDataFactory', 'Notebook', 'PaginatedReport', 'Reflex', 'Report', 'SQLDatabase', 'SQLEndpoint', 'SemanticModel', 'SparkJobDefinition', 'VariableLibrary', 'Warehouse')]
        [string]$Type
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}admin/users/{1}/access" -f $FabricConfig.BaseUrl, $UserId
        if ($Type) {
            $apiEndpointURI += "?type=$Type"
        }
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
        else {
            # Return all workspace tenant setting overrides
            Write-Message -Message "Successfully retrieved access entities for user ID '$UserId'. Entity count: $($dataItems.Count)" -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Warehouse. Error: $errorDetails" -Level Error
    } 
}
