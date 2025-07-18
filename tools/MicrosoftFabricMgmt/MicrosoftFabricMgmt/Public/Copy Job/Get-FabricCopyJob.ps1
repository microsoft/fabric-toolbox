<#
.SYNOPSIS
    Retrieves details of one or more CopyJobs from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets CopyJob information from a Microsoft Fabric workspace by CopyJobId or CopyJobName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching CopyJob(s).
    If neither CopyJobId nor CopyJobName is specified, returns all CopyJobs in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the CopyJob(s). This parameter is required.

.PARAMETER CopyJobId
    The unique identifier of the CopyJob to retrieve. Optional; specify either CopyJobId or CopyJobName, not both.

.PARAMETER CopyJobName
    The display name of the CopyJob to retrieve. Optional; specify either CopyJobId or CopyJobName, not both.

.EXAMPLE
    Get-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobId "CopyJob-67890"
    Retrieves the CopyJob with ID "CopyJob-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobName "My CopyJob"
    Retrieves the CopyJob named "My CopyJob" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricCopyJob -WorkspaceId "workspace-12345"
    Retrieves all CopyJobs from workspace "workspace-12345".

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders` properties.
    Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricCopyJob {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CopyJobName
    )
    try {
        # Validate input parameters
        if ($CopyJobId -and $CopyJobName) {
            Write-Message -Message "Specify only one parameter: either 'CopyJobId' or 'CopyJobName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
        
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs" -f $FabricConfig.BaseUrl, $WorkspaceId
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
        if ($CopyJobId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $CopyJobId }, 'First')
        }
        elseif ($CopyJobName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $CopyJobName }, 'First')
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
        Write-Message -Message "Failed to retrieve CopyJob. Error: $errorDetails" -Level Error
    } 
}