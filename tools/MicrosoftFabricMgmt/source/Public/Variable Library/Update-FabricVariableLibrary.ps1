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
function Update-FabricVariableLibrary
{
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$VariableLibraryId,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [Alias('DisplayName')]
        [string]$VariableLibraryName,

        [Parameter(Mandatory = $false, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('Description')]
        [string]$VariableLibraryDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ActiveValueSetName
    )
    process
    {
        try
        {
            # Validate that at least one update parameter is provided
            if (-not $VariableLibraryName -and -not $VariableLibraryDescription -and -not $ActiveValueSetName)
            {
                Write-FabricLog -Message "At least one of VariableLibraryName, VariableLibraryDescription, or ActiveValueSetName must be specified" -Level Error
                return
            }

            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'VariableLibraries' -ItemId $VariableLibraryId
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body conditionally
            $body = @{}

            if ($VariableLibraryName)
            {
                $body.displayName = $VariableLibraryName
            }

            if ($VariableLibraryDescription)
            {
                $body.description = $VariableLibraryDescription
            }
            if ($ActiveValueSetName)
            {
                if (-not $body.ContainsKey('properties') -or $null -eq $body.properties)
                {
                    $body.properties = @{}
                }
                $body.properties.activeValueSetName = $ActiveValueSetName
            }

            # Convert the body to JSON
            $bodyJson = $body | ConvertTo-Json
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            # Make the API request
            if ($PSCmdlet.ShouldProcess("Variable Library '$VariableLibraryName' in workspace '$WorkspaceId'", "Update"))
            {
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method  = 'Patch'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                # Return the API response
                Write-FabricLog -Message "Variable Library '$VariableLibraryName' updated successfully!" -Level Host
                return $response
            }
        }
        catch
        {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update Variable Library. Error: $errorDetails" -Level Error
        }
    }
}
