<#
.SYNOPSIS
    Updates an existing Copy Job in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update an existing Copy Job
    in the specified workspace. Allows updating the Copy Job's name and optionally its description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Copy Job. This parameter is mandatory.

.PARAMETER CopyJobId
    The unique identifier of the Copy Job to be updated. This parameter is mandatory.

.PARAMETER CopyJobName
    The new name for the Copy Job. This parameter is mandatory.

.PARAMETER CopyJobDescription
    An optional new description for the Copy Job.

.EXAMPLE
    Update-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobId "copyjob-67890" -CopyJobName "Updated Copy Job" -CopyJobDescription "Updated description"
    Updates the Copy Job with ID "copyjob-67890" in the workspace "workspace-12345" with a new name and description.

.NOTES
    - Requires the `$FabricConfig` global configuration, which includes `BaseUrl` and `FabricHeaders`.
    - Ensures token validity by calling `Test-TokenExpired` before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricCopyJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$CopyJobId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [Alias('DisplayName')]
        [string]$CopyJobName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$CopyJobDescription
    )

    process {
        try {
        # Validate that at least one update parameter is provided
        if (-not $CopyJobName -and -not $CopyJobDescription) {
            Write-FabricLog -Message "At least one of CopyJobName or CopyJobDescription must be specified" -Level Error
            return
        }

        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'copyJobs' -ItemId $CopyJobId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($CopyJobName) {
            $body.displayName = $CopyJobName
        }

        if ($CopyJobDescription) {
            $body.description = $CopyJobDescription
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Copy Job '$CopyJobId' in workspace '$WorkspaceId'", "Update properties")) {
            # Make the API request
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Copy Job '$CopyJobName' updated successfully!" -Level Host
            $response
        }
    }
    catch {
            # Handle and log errors
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Copy Job. Error: $errorDetails" -Level Error
        }
    }
}
