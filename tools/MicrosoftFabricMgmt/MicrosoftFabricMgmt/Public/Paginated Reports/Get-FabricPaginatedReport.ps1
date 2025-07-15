<#
.SYNOPSIS
    Retrieves paginated report details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves paginated report details from a specified workspace using either the provided PaginatedReportId or PaginatedReportName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the paginated reports exist. This parameter is mandatory.

.PARAMETER PaginatedReportId
    The unique identifier of the paginated report to retrieve. This parameter is optional.

.PARAMETER PaginatedReportName
    The name of the paginated report to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricPaginatedReports -WorkspaceId "workspace-12345" -PaginatedReportId "report-67890"
    This example retrieves the paginated report details for the report with ID "report-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricPaginatedReports -WorkspaceId "workspace-12345" -PaginatedReportName "My Paginated Report"
    This example retrieves the paginated report details for the report named "My Paginated Report" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricPaginatedReport {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$PaginatedReportId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$PaginatedReportName
    )
    try {
        # Validate input parameters
        if ($PaginatedReportId -and $PaginatedReportName) {
            Write-Message -Message "Specify only one parameter: either 'PaginatedReportId' or 'PaginatedReportName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/paginatedReports" -f $FabricConfig.BaseUrl, $WorkspaceId
          Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
         
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
        if ($PaginatedReportId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $PaginatedReportId }, 'First')
        }
        elseif ($PaginatedReportName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $PaginatedReportName }, 'First')
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
        Write-Message -Message "Failed to retrieve Paginated Report. Error: $errorDetails" -Level Error
    } 
}
