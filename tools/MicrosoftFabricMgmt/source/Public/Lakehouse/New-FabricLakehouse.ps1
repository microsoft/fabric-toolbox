<#
.SYNOPSIS
Creates a new Lakehouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new Lakehouse
in the specified workspace. It supports optional parameters for Lakehouse description
and path definitions for the Lakehouse content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the Lakehouse will be created.

.PARAMETER LakehouseName
The name of the Lakehouse to be created.

.PARAMETER LakehouseDescription
An optional description for the Lakehouse.

.PARAMETER LakehouseEnableSchemas
An optional path to enable schemas in the Lakehouse

.EXAMPLE
 Add-FabricLakehouse -WorkspaceId "workspace-12345" -LakehouseName "New Lakehouse" -LakehouseEnableSchemas $true

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricLakehouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$LakehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$LakehouseEnableSchemas = $false
    )
    try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $LakehouseName
        }

        if ($LakehouseDescription) {
            $body.description = $LakehouseDescription
        }

        if ($true -eq $LakehouseEnableSchemas) {
            $body.creationPayload = @{
                enableSchemas = $LakehouseEnableSchemas
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($LakehouseName, "Create Lakehouse in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Lakehouse '$LakehouseName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Lakehouse. Error: $errorDetails" -Level Error
    }
}
