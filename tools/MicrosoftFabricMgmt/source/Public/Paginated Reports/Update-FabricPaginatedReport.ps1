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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$PaginatedReportId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$PaginatedReportName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$PaginatedReportDescription
    )
    process {
        try {
            # Validate that at least one update parameter is provided
            if (-not $PaginatedReportName -and -not $PaginatedReportDescription) {
                Write-FabricLog -Message "At least one of PaginatedReportName or PaginatedReportDescription must be specified" -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointUrl = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'paginatedReports' -ItemId $PaginatedReportId
        Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

            # Construct the request body
            $body = @{}

            if ($PaginatedReportName) {
                $body.displayName = $PaginatedReportName
            }

            if ($PaginatedReportDescription) {
                $body.description = $PaginatedReportDescription
            }

            # Convert the body to JSON
            $bodyJson = $body | ConvertTo-Json
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

           # Make the API request when confirmed
            $target = "Paginated Report '$PaginatedReportId' in workspace '$WorkspaceId'"
            $action = "Update Paginated Report display name/description"
            if ($PSCmdlet.ShouldProcess($target, $action)) {
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointUrl
                    Method = 'Patch'
                    Body = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                # Return the API response
                Write-FabricLog -Message "Paginated Report '$PaginatedReportName' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Paginated Report. Error: $errorDetails" -Level Error
        }
    }
}
