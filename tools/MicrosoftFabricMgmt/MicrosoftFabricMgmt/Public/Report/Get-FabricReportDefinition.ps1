<#
.SYNOPSIS
    Retrieves the definition of an Report from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an Report from a specified workspace using the provided ReportId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is mandatory.

.PARAMETER ReportId
    The unique identifier of the Report to retrieve the definition for. This parameter is optional.

.PARAMETER ReportFormat
    The format in which to retrieve the Report definition. This parameter is optional.

.EXAMPLE
    Get-FabricReportDefinition -WorkspaceId "workspace-12345" -ReportId "Report-67890"
    This example retrieves the definition of the Report with ID "Report-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReportDefinition -WorkspaceId "workspace-12345" -ReportId "Report-67890" -ReportFormat "json"
    This example retrieves the definition of the Report with ID "Report-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricReportDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic 
        $apiEndpointURI = "{0}/workspaces/{1}/reports/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReportId
        if ($ReportFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $ReportFormat
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams 
        
        # Return the API response
        Write-Message -Message "Report '$ReportId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Report. Error: $errorDetails" -Level Error
    } 
}
