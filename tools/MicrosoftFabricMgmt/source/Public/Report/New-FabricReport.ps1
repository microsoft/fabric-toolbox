<#
.SYNOPSIS
    Creates a new Report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Report
    in the specified workspace. It supports optional parameters for Report description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report will be created. This parameter is mandatory.

.PARAMETER ReportName
    The name of the Report to be created. This parameter is mandatory.

.PARAMETER ReportDescription
    An optional description for the Report.

.PARAMETER ReportPathDefinition
    A mandatory path to the folder that contains Report definition files to upload.


.EXAMPLE
    New-FabricReport -WorkspaceId "workspace-12345" -ReportName "New Report" -ReportDescription "Description of the new Report"
    This example creates a new Report named "New Report" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricReport {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReportName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportDescription,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportPathDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reports" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $ReportName
        }

        if ($ReportDescription) {
            $body.description = $ReportDescription
        }
        if ($ReportPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    parts = @()
                }
            }

            # As Report has multiple parts, we need to get the definition parts
            $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $ReportPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Report '$ReportName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Report '$ReportName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Report. Error: $errorDetails" -Level Error
    }
}
