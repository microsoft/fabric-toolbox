<#
.SYNOPSIS
    Retrieves Report details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Report details from a specified workspace using either the provided ReportId or ReportName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is mandatory.

.PARAMETER ReportId
    The unique identifier of the Report to retrieve. This parameter is optional.

.PARAMETER ReportName
    The name of the Report to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricReport -WorkspaceId "workspace-12345" -ReportId "Report-67890"
    This example retrieves the Report details for the Report with ID "Report-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReport -WorkspaceId "workspace-12345" -ReportName "My Report"
    This example retrieves the Report details for the Report named "My Report" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricReport {
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
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReportName
    )
    try {
        # Validate input parameters
        if ($ReportId -and $ReportName) {
            Write-Message -Message "Specify only one parameter: either 'ReportId' or 'ReportName'." -Level Error
            return $null
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/reports" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($ReportId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ReportId }, 'First')
        }
        elseif ($ReportName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ReportName }, 'First')
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
        Write-Message -Message "Failed to retrieve Report. Error: $errorDetails" -Level Error
    } 
}
