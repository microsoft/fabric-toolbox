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
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'copyJobs')
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering
        Select-FabricResource -InputObject $dataItems -Id $CopyJobId -Name $CopyJobName -ResourceType 'Copy Job'
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve CopyJob. Error: $errorDetails" -Level Error
    }
}
