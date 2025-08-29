<#
.SYNOPSIS
    Creates a new Variable Library in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a Variable Library resource within the given workspace.
    Allows specifying optional description, definition file path, and folder location.

.PARAMETER WorkspaceId
    The ID of the workspace where the Variable Library will be created. Required.

.PARAMETER VariableLibraryName
    The display name for the new Variable Library. Required.

.PARAMETER VariableLibraryDescription
    Optional. A description for the Variable Library.

.PARAMETER VariableLibraryPathDefinition
    Optional. Path to the Variable Library definition files.

.PARAMETER FolderId
    Optional. The folder ID where the Variable Library will be placed.

.EXAMPLE
    New-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryName "MyLibrary" -VariableLibraryDescription "Sample Variable Library"
    Creates a new Variable Library named "MyLibrary" in the specified workspace with a description.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function New-FabricVariableLibrary {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$VariableLibraryName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryPathDefinition,
        
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $VariableLibraryName
        }

        if ($FolderId) {
            $body.folderId = $FolderId
        }

        if ($VariableLibraryDescription) {
            $body.description = $VariableLibraryDescription
        }
        
        if ($VariableLibraryPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    format = "VariableLibraryV1"
                    parts  = @()
                }
            }

            # As VariableLibrary has multiple parts, we need to get the definition parts
            $jsonObjectParts = Get-FileDefinitionParts -sourceDirectory $VariableLibraryPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }
  
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams
        
        # Return the API response
        Write-Message -Message "Variable Library '$VariableLibraryName' created successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Variable Library. Error: $errorDetails" -Level Error
    }
}