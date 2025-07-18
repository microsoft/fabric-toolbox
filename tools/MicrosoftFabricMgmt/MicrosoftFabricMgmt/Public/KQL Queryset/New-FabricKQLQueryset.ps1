<#
.SYNOPSIS
Creates a new KQLQueryset in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new KQLQueryset 
in the specified workspace. It supports optional parameters for KQLQueryset description 
and path definitions for the KQLQueryset content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the KQLQueryset will be created.

.PARAMETER KQLQuerysetName
The name of the KQLQueryset to be created.

.PARAMETER KQLQuerysetDescription
An optional description for the KQLQueryset.

.PARAMETER KQLQuerysetPathDefinition
An optional path to the KQLQueryset definition file (e.g., .ipynb file) to upload.

.PARAMETER KQLQuerysetPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricKQLQueryset -WorkspaceId "workspace-12345" -KQLQuerysetName "New KQLQueryset" -KQLQuerysetPathDefinition "C:\KQLQuerysets\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function New-FabricKQLQueryset {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLQuerysetName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLQuerysetName
        }

        if ($KQLQuerysetDescription) {
            $body.description = $KQLQuerysetDescription
        }

        if ($KQLQuerysetPathDefinition) {
            $KQLQuerysetEncodedContent = Convert-ToBase64 -filePath $KQLQuerysetPathDefinition

            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $null
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "RealTimeQueryset.json"
                    payload     = $KQLQuerysetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-Message -Message "Invalid or empty content in KQLQueryset definition." -Level Error
                return $null
            }
        }

        if ($KQLQuerysetPathPlatformDefinition) {
            $KQLQuerysetEncodedPlatformContent = Convert-ToBase64 -filePath $KQLQuerysetPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $null
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLQuerysetEncodedPlatformContent
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
        Write-Message -Message "KQLQueryset '$KQLQuerysetName' created successfully!" -Level Info
        return $response
  
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create KQLQueryset. Error: $errorDetails" -Level Error
    }
}
