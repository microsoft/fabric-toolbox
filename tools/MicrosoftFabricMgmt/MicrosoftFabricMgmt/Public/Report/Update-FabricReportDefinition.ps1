<#
.SYNOPSIS
    Updates the definition of an existing Report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Report 
    in the specified workspace. It supports optional parameters for Report definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is mandatory.

.PARAMETER ReportId
    The unique identifier of the Report to be updated. This parameter is mandatory.

.PARAMETER ReportPathDefinition
    A mandatory path to the Report definition file to upload.

.EXAMPLE
    Update-FabricReportDefinition -WorkspaceId "workspace-12345" -ReportId "Report-67890" -ReportPathDefinition "C:\Path\To\ReportDefinition.json"
    This example updates the definition of the Report with ID "Report-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricReportDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportPathDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic  
        $apiEndpointURI = "{0}/workspaces/{1}/Reports/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReportId

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            } 
        }
      
        if ($ReportPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    parts = @()
                }
            }
            $jsonObjectParts = Get-FileDefinitionParts -sourceDirectory $ReportPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }
        # Check if any path is .platform
        foreach ($part in $jsonObjectParts.parts) {
            if ($part.path -eq ".platform") {
                $hasPlatformFile = $true
                Write-Message -Message "Platform File: $hasPlatformFile" -Level Debug
            }
        }

        # If the platform file exists, append the query parameter to the URL
        if ($hasPlatformFile -eq $true) {
            $apiEndpointURI += "?updateMetadata=true" -f $apiEndpointURI 
        }
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
       
        # Return the API response
        Write-Message -Message "Successfully updated the definition for Report with ID '$ReportId' in workspace '$WorkspaceId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update Report. Error: $errorDetails" -Level Error
    }
}
