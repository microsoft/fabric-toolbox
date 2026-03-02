<#
.SYNOPSIS
    Retrieves folder details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets folder information from a workspace by folder name or root folder ID.
    Validates parameters, checks authentication, constructs the API request, and returns matching folder(s).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the folder. Mandatory.

.PARAMETER FolderName
    The name of the folder to retrieve. Optional.

.PARAMETER RootFolderId
    The unique identifier of the root folder to retrieve. Optional.

.PARAMETER Recursive
    If specified, retrieves folders recursively. Optional.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricFolder -WorkspaceId "workspace-12345" -FolderName "MyFolder"
    Retrieves details for the folder named "MyFolder" in the specified workspace.

.EXAMPLE
    Get-FabricFolder -WorkspaceId "workspace-12345" -RootFolderId "folder-67890" -Recursive
    Retrieves details for the folder with the given ID and its subfolders.

.EXAMPLE
    Get-FabricFolder -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all folders in the workspace without any formatting or type decoration.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricFolder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^(?!\s)(?!.*\s$)(?!.*[~"#.&*:<>?\/{|}])(?!\$recycle\.bin$|^recycled$|^recycler$)[^\x00-\x1F]{1,255}$')]
        [string]$FolderName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RootFolderId,

        [Parameter(Mandatory = $false)]
        [switch]$Recursive,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate input parameters
            if ($RootFolderId -and $FolderName) {
                Write-FabricLog -Message "Specify only one parameter: either 'RootFolderId' or 'FolderName'." -Level Error
                return
            }

            # Additional FolderName validation
            if ($FolderName) {
                if ($FolderName.Length -gt 255) {
                    Write-FabricLog -Message "Folder name exceeds 255 characters." -Level Error
                    return
                }
                if ($FolderName -match '^[\s]|\s$') {
                    Write-FabricLog -Message "Folder name cannot have leading or trailing spaces." -Level Error
                    return
                }
                if ($FolderName -match '[~"#.&*:<>?\/{|}]') {
                    Write-FabricLog -Message "Folder name contains invalid characters: ~ # . & * : < > ? / { | }\" -Level Error
                    return
                }
                if ($FolderName -match '^\$recycle\.bin$|^recycled$|^recycler$') {
                    Write-FabricLog -Message "Folder name cannot be a system-reserved name." -Level Error
                    return
                }
                if ($FolderName -match '[\x00-\x1F]') {
                    Write-FabricLog -Message "Folder name contains control characters." -Level Error
                    return
                }
            }

            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $queryParams = @{}
            if ($RootFolderId) {
                $queryParams.rootFolderId = $RootFolderId
            }
            $recursiveValue = if ($Recursive.IsPresent -and $Recursive) { 'True' } else { 'False' }
            $queryParams.recursive = $recursiveValue
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'folders' -QueryParameters $queryParams

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering logic
            Select-FabricResource -InputObject $dataItems -DisplayName $FolderName -ResourceType 'Folder' -TypeName 'MicrosoftFabric.Folder' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve Folder for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
