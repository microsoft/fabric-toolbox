<#
.SYNOPSIS
    Retrieves Eventhouse details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Eventhouse details from a specified workspace using either the provided EventhouseId or EventhouseName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is mandatory.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to retrieve. This parameter is optional.

.PARAMETER EventhouseName
    The name of the Eventhouse to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example retrieves the Eventhouse details for the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseName "My Eventhouse"
    This example retrieves the Eventhouse details for the Eventhouse named "My Eventhouse" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricEventhouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventhouseName
    )
    try {
        # Validate input parameters
        if ($EventhouseId -and $EventhouseName) {
            Write-Message -Message "Specify only one parameter: either 'EventhouseId' or 'EventhouseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI   
        $apiEndpointURI = "{0}/workspaces/{1}/eventhouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug
        
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
        if ($EventhouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $EventhouseId }, 'First')
        }
        elseif ($EventhouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $EventhouseName }, 'First')
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
        Write-Message -Message "Failed to retrieve Eventhouse. Error: $errorDetails" -Level Error
    } 
 
}
