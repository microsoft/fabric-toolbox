<#
.SYNOPSIS
    Creates a new User Data Function item in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new User Data Function item in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the User Data Function item will be created. Mandatory.

.PARAMETER UserDataFunctionName
    The name of the User Data Function item to be created. Mandatory.

.PARAMETER UserDataFunctionDescription
    Optional description for the User Data Function item.

.PARAMETER UserDataFunctionPathDefinition
    Optional file path to the User Data Function item definition JSON file.

.PARAMETER UserDataFunctionPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricUserDataFunction -WorkspaceId "workspace-12345" -UserDataFunctionName "New User Data Function" -UserDataFunctionDescription "Description of the new User Data Function item"

.NOTES
    - Requires $FabricConfig global configuration, including BaseUrl and FabricHeaders.
    - Calls Invoke-FabricAuthCheck to ensure token validity before making the API request.

#>
function New-FabricUserDataFunction {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$UserDataFunctionName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$UserDataFunctionDescription,

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
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'UserDataFunctions'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $UserDataFunctionName
        }

        if ($UserDataFunctionDescription) {
            $body.description = $UserDataFunctionDescription
        }

        # Add User Data Function item definition file content if provided
        if ($UserDataFunctionPathDefinition) {
            $UserDataFunctionEncodedContent = Convert-ToBase64 -filePath $UserDataFunctionPathDefinition

            if (-not [string]::IsNullOrEmpty($UserDataFunctionEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
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
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
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

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create User Data Function '$UserDataFunctionName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
                WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "User Data Function '$UserDataFunctionName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create User Data Function. Error: $errorDetails" -Level Error
    }
}
