<#
.SYNOPSIS
Updates the definition of a Copy Job in a Microsoft Fabric workspace.

.DESCRIPTION
This function updates the content or metadata of a Copy Job within a Microsoft Fabric workspace.
The Copy Job content and platform-specific definitions can be provided as file paths, which will be encoded as Base64 and sent in the request.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace containing the Copy Job.

.PARAMETER CopyJobId
(Mandatory) The unique identifier of the Copy Job to be updated.

.PARAMETER CopyJobPathDefinition
(Mandatory) The file path to the Copy Job content definition file. The file content will be encoded as Base64.

.PARAMETER CopyJobPathPlatformDefinition
(Optional) The file path to the platform-specific definition file for the Copy Job. The file content will be encoded as Base64.

.EXAMPLE
Update-FabricCopyJobDefinition -WorkspaceId "12345" -CopyJobId "67890" -CopyJobPathDefinition "C:\CopyJobs\CopyJob.ipynb"

Updates the content of the Copy Job with ID `67890` in the workspace `12345` using the specified Copy Job file.

.EXAMPLE
Update-FabricCopyJobDefinition -WorkspaceId "12345" -CopyJobId "67890" -CopyJobPathDefinition "C:\CopyJobs\CopyJob.ipynb" -CopyJobPathPlatformDefinition "C:\CopyJobs\Platform.json"

Updates both the content and platform-specific definition of the Copy Job with ID `67890` in the workspace `12345`.

.NOTES
- Requires the `$FabricConfig` global configuration, which must include `BaseUrl` and `FabricHeaders`.
- Validates token expiration using `Test-TokenExpired` before making the API request.
- Encodes file content as Base64 before sending it to the Fabric API.
- Logs detailed messages for debugging and error handling.

Author: Tiago Balabuch
#>

function Update-FabricCopyJobDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API URL
        $segments = @('workspaces', $WorkspaceId, 'copyJobs', $CopyJobId, 'updateDefinition')
        $queryParams = @{}
        if ($CopyJobPathPlatformDefinition) {
            $queryParams['updateMetadata'] = 'true'
        }
        $apiEndpointURI = New-FabricAPIUri -Segments $segments -QueryParameters $queryParams
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($CopyJobPathDefinition) {
            $CopyJobEncodedContent = Convert-ToBase64 -filePath $CopyJobPathDefinition

            if (-not [string]::IsNullOrEmpty($CopyJobEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "copyjob-content.json"
                    payload     = $CopyJobEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Copy Job definition." -Level Error
                return
            }
        }

        if ($CopyJobPathPlatformDefinition) {
            $CopyJobEncodedPlatformContent = Convert-ToBase64 -filePath $CopyJobPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($CopyJobEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $CopyJobEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Copy Job '$CopyJobId' in workspace '$WorkspaceId'", "Update definition/metadata")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Successfully updated the definition for Copy Job with ID '$CopyJobId' in workspace '$WorkspaceId'." -Level Info
            $response
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Copy Job. Error: $errorDetails" -Level Error
    }
}
