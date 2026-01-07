<#
.SYNOPSIS
    Updates an existing Variable Library in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update the specified Variable Library's name and optionally its description within a workspace.

.PARAMETER WorkspaceId
    Mandatory. The GUID of the workspace that contains the Variable Library being updated.

.PARAMETER VariableLibraryId
    Mandatory. The unique identifier (GUID) of the Variable Library to update.

.PARAMETER VariableLibraryName
    Mandatory. The new display name to assign to the Variable Library.

.PARAMETER VariableLibraryDescription
    Optional. A longer description that explains the purpose or scope of the Variable Library.

.PARAMETER ActiveValueSetName
    Optional. The name of the active value set to select for this Variable Library. This determines which set of variable values is effective for dependent items within the workspace.

.EXAMPLE
    Update-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryId "VariableLibrary-67890" -VariableLibraryName "Updated API" -VariableLibraryDescription "Updated description"
    Updates the Variable Library with the specified ID in the given workspace with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricVariableLibrary {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$VariableLibraryName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ActiveValueSetName
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $VariableLibraryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $VariableLibraryName
        }

        if ($VariableLibraryDescription) {
            $body.description = $VariableLibraryDescription
        }
        if ($ActiveValueSetName) {
            if (-not $body.ContainsKey('properties') -or $null -eq $body.properties) {
                $body.properties = @{}
            }
            $body.properties.activeValueSetName = $ActiveValueSetName
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Variable Library '$VariableLibraryName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Variable Library '$VariableLibraryName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Variable Library. Error: $errorDetails" -Level Error
    }
}
