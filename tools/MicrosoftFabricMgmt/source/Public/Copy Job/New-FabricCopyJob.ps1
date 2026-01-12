<#
.SYNOPSIS
    Creates a new copy job in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new copy job in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the copy job will be created. Mandatory.

.PARAMETER CopyJobName
    The name of the copy job to be created. Mandatory.

.PARAMETER CopyJobDescription
    Optional description for the copy job.

.PARAMETER CopyJobPathDefinition
    Optional file path to the copy job definition JSON file.

.PARAMETER CopyJobPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobName "New Copy Job" -CopyJobDescription "Description of the new copy job"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricCopyJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CopyJobName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'copyJobs')
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $CopyJobName
        }

        if ($CopyJobDescription) {
            $body.description = $CopyJobDescription
        }

        # Add copy job definition file content if provided
        if ($CopyJobPathDefinition) {
            $CopyJobEncodedContent = Convert-ToBase64 -filePath $CopyJobPathDefinition

            if (-not [string]::IsNullOrEmpty($CopyJobEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

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
        # Add platform definition file content if provided
        if ($CopyJobPathPlatformDefinition) {
            $CopyJobEncodedPlatformContent = Convert-ToBase64 -filePath $CopyJobPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($CopyJobEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

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

        if ($PSCmdlet.ShouldProcess("workspace '$WorkspaceId'", "Create Copy Job '$CopyJobName'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Copy Job created successfully!" -Level Host
            $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Copy Job. Error: $errorDetails" -Level Error
    }
}
