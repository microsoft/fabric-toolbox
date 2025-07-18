<#
.SYNOPSIS
    Retrieves dashboards from a specified workspace.

.DESCRIPTION
    This function retrieves all dashboards from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve dashboards. This parameter is mandatory.

.EXAMPLE
     Get-FabricDashboard -WorkspaceId "12345"
    This example retrieves all dashboards from the workspace with ID "12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch  
#>

function Get-FabricDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {
        # Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/dashboards" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Invoke the Fabric API to retrieve capacity details
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $Dashboards = Invoke-FabricAPIRequest @apiParams
        
        return $Dashboards

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Dashboard. Error: $errorDetails" -Level Error
    } 
}
