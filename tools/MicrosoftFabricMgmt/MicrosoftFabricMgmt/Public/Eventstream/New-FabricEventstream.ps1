<#
.SYNOPSIS
Creates a new Eventstream in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new Eventstream 
in the specified workspace. It supports optional parameters for Eventstream description 
and path definitions for the Eventstream content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the Eventstream will be created.

.PARAMETER EventstreamName
The name of the Eventstream to be created.

.PARAMETER EventstreamDescription
An optional description for the Eventstream.

.PARAMETER EventstreamPathDefinition
An optional path to the Eventstream definition file (e.g., .ipynb file) to upload.

.PARAMETER EventstreamPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricEventstream -WorkspaceId "workspace-12345" -EventstreamName "New Eventstream" -EventstreamPathDefinition "C:\Eventstreams\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function New-FabricEventstream {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EventstreamName
        }

        if ($EventstreamDescription) {
            $body.description = $EventstreamDescription
        }

        if ($EventstreamPathDefinition) {
            $EventstreamEncodedContent = Convert-ToBase64 -filePath $EventstreamPathDefinition

            if (-not [string]::IsNullOrEmpty($EventstreamEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "eventstream"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "eventstream.json"
                    payload     = $EventstreamEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in Eventstream definition." -Level Error
                return $null
            }
        }

        if ($EventstreamPathPlatformDefinition) {
            $EventstreamEncodedPlatformContent = Convert-ToBase64 -filePath $EventstreamPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($EventstreamEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "eventstream"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventstreamEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
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
        Write-Message -Message "Eventstream '$EventstreamName' created successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Eventstream. Error: $errorDetails" -Level Error
    }
}
