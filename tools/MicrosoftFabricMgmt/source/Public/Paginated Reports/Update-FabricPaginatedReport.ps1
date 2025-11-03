<#
.SYNOPSIS
    Updates an existing paginated report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing paginated report 
    in the specified workspace. It supports optional parameters for paginated report description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the paginated report exists. This parameter is optional.

.PARAMETER PaginatedReportId
    The unique identifier of the paginated report to be updated. This parameter is mandatory.

.PARAMETER PaginatedReportName
    The new name of the paginated report. This parameter is mandatory.

.PARAMETER PaginatedReportDescription
    An optional new description for the paginated report.

.EXAMPLE
    Update-FabricPaginatedReport -WorkspaceId "workspace-12345" -PaginatedReportId "report-67890" -PaginatedReportName "Updated Paginated Report" -PaginatedReportDescription "Updated description"
    This example updates the paginated report with ID "report-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricPaginatedReport {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$PaginatedReportId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$PaginatedReportName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$PaginatedReportDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointUrl = "{0}/workspaces/{1}/paginatedReports/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $PaginatedReportId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $PaginatedReportName
        }

        if ($PaginatedReportDescription) {
            $body.description = $PaginatedReportDescription
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
        Write-Message -Message "Paginated Report '$PaginatedReportName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Paginated Report. Error: $errorDetails" -Level Error
    }
}
