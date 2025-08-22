<#
.SYNOPSIS
    Retrieves connection details from a Microsoft Fabric workspace.

.DESCRIPTION
    Fetches connection information from a workspace, optionally filtered by GatewayId or ConnectionName.
    Ensures authentication, constructs the API endpoint, performs the request, and returns the results.

.PARAMETER GatewayId
    Optional. The unique identifier of the connection.

.PARAMETER ConnectionName
    Optional. The display name of the connection.

.EXAMPLE
    Get-FabricConnection -GatewayId "Connection-67890"
    Returns details for the connection with ID "Connection-67890".

.EXAMPLE
    Get-FabricConnection -ConnectionName "My Connection"
    Returns details for the connection named "My Connection".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` for authentication validation.

    Author: Tiago Balabuch
#>
function Get-FabricConnectionSupportedType {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GatewayId,

        [Parameter(Mandatory = $false)]
        [switch]$ShowAllCreationMethods
    )

    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI        
        $apiEndpointURI = "{0}/connections/supportedConnectionTypes" -f $FabricConfig.BaseUrl
        
        # Build query parameters dynamically
        $queryParams = @()
        if ($GatewayId) {
            Write-Message -Message "Filtering by GatewayId: $GatewayId" -Level Debug
            $queryParams += "gatewayId=$GatewayId"
        }
        if ($ShowAllCreationMethods) {
            Write-Message -Message "Including all creation methods." -Level Debug
            $queryParams += "showAllCreationMethods=true"
        }
        if ($queryParams.Count -gt 0) {
            $apiEndpointURI = "{0}/connections/supportedConnectionTypes?{1}" -f $FabricConfig.BaseUrl, ($queryParams -join '&')
        }

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-Message -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-Message -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Connection. Error: $errorDetails" -Level Error
    } 
}