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
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReportName
    )

    process {
        try {
            # Validate input parameters
            if ($ReportId -and $ReportName) {
                Write-FabricLog -Message "Specify only one parameter: either 'ReportId' or 'ReportName'." -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'reports'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Immediately handle empty response
            if (-not $dataItems) {
                Write-FabricLog -Message "No reports found in workspace: $WorkspaceId" -Level Debug
                return
            }

            # Apply filtering logic efficiently
            if ($ReportId) {
                $matchedItems = $dataItems.Where({ $_.Id -eq $ReportId }, 'First')
            }
            elseif ($ReportName) {
                $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ReportName }, 'First')
            }
            else {
                Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
                $matchedItems = $dataItems
            }

            # Handle results
            if ($matchedItems) {
                Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
                $matchedItems
            }
            else {
                Write-FabricLog -Message "No item found matching the provided criteria." -Level Debug
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Report for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
