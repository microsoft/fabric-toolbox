<#
.SYNOPSIS
Creates a new MirroredDatabase in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new MirroredDatabase
in the specified workspace. It supports optional parameters for MirroredDatabase description
and path definitions for the MirroredDatabase content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the MirroredDatabase will be created.

.PARAMETER MirroredDatabaseName
The name of the MirroredDatabase to be created.

.PARAMETER MirroredDatabaseDescription
An optional description for the MirroredDatabase.

.PARAMETER MirroredDatabasePathDefinition
An optional path to the MirroredDatabase definition file to upload.

.PARAMETER MirroredDatabasePathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricMirroredDatabase -WorkspaceId "workspace-12345" -MirroredDatabaseName "New MirroredDatabase" -MirroredDatabasePathDefinition "C:\MirroredDatabases\example.json"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricMirroredDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MirroredDatabaseName
        }

        if ($MirroredDatabaseDescription) {
            $body.description = $MirroredDatabaseDescription
        }

        if ($MirroredDatabasePathDefinition) {
            $MirroredDatabaseEncodedContent = Convert-ToBase64 -filePath $MirroredDatabasePathDefinition

            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "mirroredDatabase.json"
                    payload     = $MirroredDatabaseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in MirroredDatabase definition." -Level Error
                return $null
            }
        }

        if ($MirroredDatabasePathPlatformDefinition) {
            $MirroredDatabaseEncodedPlatformContent = Convert-ToBase64 -filePath $MirroredDatabasePathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "MirroredDatabase"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MirroredDatabaseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseName, "Create Mirrored Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseName' created successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
