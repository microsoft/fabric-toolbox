<#
.SYNOPSIS
    Updates the definition of a User Data Function item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to update the definition or content of a User Data Function item
    in the specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the User Data Function item.

.PARAMETER UserDataFunctionId
    The unique identifier of the User Data Function item to update.

.PARAMETER UserDataFunctionPathDefinition
    File path to the User Data Function item definition JSON file to upload.

.PARAMETER UserDataFunctionPathPlatformDefinition
    Optional file path to the platform-specific definition file.

.EXAMPLE
    Update-FabricUserDataFunctionDefinition -WorkspaceId "workspace-12345" -UserDataFunctionId "-67890" -UserDataFunctionPathDefinition "C:\definitions\item.json"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function Update-FabricUserDataFunctionDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$UserDataFunctionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$UserDataFunctionPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$UserDataFunctionPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $segments = @('workspaces', $WorkspaceId, 'UserDataFunctions', $UserDataFunctionId, 'updateDefinition')
        $apiEndpointURI = New-FabricAPIUri -Segments $segments
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        # Add definition file content if provided
        if ($UserDataFunctionPathDefinition) {
            $UserDataFunctionEncodedContent = Convert-ToBase64 -filePath $UserDataFunctionPathDefinition

            if (-not [string]::IsNullOrEmpty($UserDataFunctionEncodedContent)) {
                $body.definition.parts += @{
                    path        = "-content.json"
                    payload     = $UserDataFunctionEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in User Data Function definition." -Level Error
                return
            }
        }

        # Add platform definition file content if provided
        if ($UserDataFunctionPathPlatformDefinition) {
            $UserDataFunctionEncodedPlatformContent = Convert-ToBase64 -filePath $UserDataFunctionPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($UserDataFunctionEncodedPlatformContent)) {
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $UserDataFunctionEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Update User Data Function Definition '$UserDataFunctionId'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "User Data Function definition '$UserDataFunctionId' updated successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update User Data Function definition. Error: $errorDetails" -Level Error
    }
}
