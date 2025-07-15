<#
.SYNOPSIS
Assigns a label in bulk to multiple items in Microsoft Fabric.

.DESCRIPTION
The Set-FabricLabel function assigns a specified label to an array of items (such as datasets, reports, or other supported types) in Microsoft Fabric using a single API call. It supports optional assignment methods and delegated principal scenarios.

.PARAMETER Items
An array of objects, each containing 'id' and 'type' properties, representing the items to which the label will be assigned.

.PARAMETER LabelId
The unique identifier of the label to assign.

.PARAMETER AssignmentMethod
(Optional) The method of label assignment. Valid values are 'Priviledged' or 'Standard'. Defaults to 'Standard'.

.PARAMETER DelegatedPrincipal
(Optional) An object specifying the delegated principal for the label assignment.

.EXAMPLE
Set-FabricLabel -Items @(@{id='item1';type='dataset'}, @{id='item2';type='report'}) -LabelId 'label-123'

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Set-FabricLabel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Items, # Array with 'id' and 'type'
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LabelId,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Priviledged', 'Standard')]
        [string]$AssignmentMethod = 'Standard',
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$DelegatedPrincipal
    )
    try {
        # Validate Items structure
        foreach ($item in $Items) {
            if (-not ($item.id -and $item.type)) {
                throw "Each Item must contain 'id' and 'type' properties. Found: $item"
            }
        }
        
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/admin/items/bulkSetLabels" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            items   = $Items
            labelId = $LabelId
        }

        if ($AssignmentMethod) {
            $body.assignmentMethod = $AssignmentMethod
        }

        if ($DelegatedPrincipal) {
            $body.delegatedPrincipal = $DelegatedPrincipal
        }
       
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 5
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Bulk label assignment completed successfully for $($Items.Count) item(s) with LabelId '$LabelId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Bulk label assignment failed for LabelId '$LabelId'. Error details: $errorDetails" -Level Error
    }
}
