<#
.SYNOPSIS
Updates the properties of a Fabric KQLDashboard.

.DESCRIPTION
The `Update-FabricKQLDashboard` function updates the name and/or description of a specified Fabric KQLDashboard by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the KQL Dashboard to update. Required to scope the API request.

.PARAMETER KQLDashboardId
The unique identifier of the KQLDashboard to be updated.

.PARAMETER KQLDashboardName
The new name for the KQLDashboard.

.PARAMETER KQLDashboardDescription
(Optional) The new description for the KQLDashboard.

.EXAMPLE
Update-FabricKQLDashboard -KQLDashboardId "KQLDashboard123" -KQLDashboardName "NewKQLDashboardName"

Updates the name of the KQLDashboard with the ID "KQLDashboard123" to "NewKQLDashboardName".

.EXAMPLE
Update-FabricKQLDashboard -KQLDashboardId "KQLDashboard123" -KQLDashboardName "NewName" -KQLDashboardDescription "Updated description"

Updates both the name and description of the KQLDashboard "KQLDashboard123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricKQLDashboard {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDashboardName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLDashboardName
        }

        if ($KQLDashboardDescription) {
            $body.description = $KQLDashboardDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDashboardId, "Update KQL Dashboard in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDashboard '$KQLDashboardName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update KQLDashboard. Error: $errorDetails" -Level Error
    }
}
