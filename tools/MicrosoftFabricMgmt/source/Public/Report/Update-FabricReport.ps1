<#
.SYNOPSIS
    Updates an existing Report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Report
    in the specified workspace. It supports optional parameters for Report description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is optional.

.PARAMETER ReportId
    The unique identifier of the Report to be updated. This parameter is mandatory.

.PARAMETER ReportName
    The new name of the Report. This parameter is mandatory.

.PARAMETER ReportDescription
    An optional new description for the Report.

.EXAMPLE
    Update-FabricReport -WorkspaceId "workspace-12345" -ReportId "Report-67890" -ReportName "Updated Report" -ReportDescription "Updated description"
    This example updates the Report with ID "Report-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricReport {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ReportId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$ReportName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$ReportDescription
    )
    process {
        try {
            # Validate that at least one update parameter is provided
            if (-not $ReportName -and -not $ReportDescription) {
                Write-FabricLog -Message "At least one of ReportName or ReportDescription must be specified" -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'reports' -ItemId $ReportId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body
            $body = @{}

            if ($ReportName) {
                $body.displayName = $ReportName
            }

            if ($ReportDescription) {
                $body.description = $ReportDescription
            }

            # Convert the body to JSON
            $bodyJson = $body | ConvertTo-Json
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Make the API request
            if ($PSCmdlet.ShouldProcess("Report '$ReportName' (ID: $ReportId) in workspace '$WorkspaceId'", "Update")) {
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Patch'
                    Body = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                # Return the API response
                Write-FabricLog -Message "Report '$ReportName' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Report. Error: $errorDetails" -Level Error
        }
    }
}
