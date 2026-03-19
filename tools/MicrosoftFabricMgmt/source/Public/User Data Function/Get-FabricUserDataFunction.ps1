<#
.SYNOPSIS
    Retrieves details of one or more User Data Function items from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets User Data Function information from a Microsoft Fabric workspace by UserDataFunctionId or UserDataFunctionName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching User Data Function(s).
    If neither UserDataFunctionId nor UserDataFunctionName is specified, returns all User Data Function items in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the User Data Function item(s). This parameter is required.

.PARAMETER UserDataFunctionId
    The unique identifier of the User Data Function item to retrieve. Optional; specify either UserDataFunctionId or UserDataFunctionName, not both.

.PARAMETER UserDataFunctionName
    The display name of the User Data Function item to retrieve. Optional; specify either UserDataFunctionId or UserDataFunctionName, not both.

.PARAMETER Raw
    Returns the raw API response without any filtering or transformation. Use this switch when you need the complete, unprocessed response from the API.

.EXAMPLE
    Get-FabricUserDataFunction -WorkspaceId "workspace-12345" -UserDataFunctionId "UserDataFunction-67890"
    Retrieves the User Data Function with ID "UserDataFunction-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricUserDataFunction -WorkspaceId "workspace-12345" -UserDataFunctionName "My User Data Function"
    Retrieves the User Data Function named "My User Data Function" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricUserDataFunction -WorkspaceId "workspace-12345"
    Retrieves all User Data Function items from workspace "workspace-12345".

.EXAMPLE
    Get-FabricUserDataFunction -WorkspaceId "workspace-12345" -Raw
    Returns the raw API response for all User Data Function items in the workspace without any formatting or type decoration.

.NOTES
    Requires the $FabricConfig global variable with BaseUrl and FabricHeaders properties.
    Calls Invoke-FabricAuthCheck to ensure the authentication token is valid before making the API request.

#>
function Get-FabricUserDataFunction {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$UserDataFunctionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$UserDataFunctionName,

        [Parameter(Mandatory = $false)]
        [switch]$Raw
    )

    process {
        try {
            # Validate authentication token before proceeding
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'UserDataFunctions'
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Get'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Apply filtering
            Select-FabricResource -InputObject $dataItems -Id $UserDataFunctionId -DisplayName $UserDataFunctionName -ResourceType 'User Data Function' -TypeName 'MicrosoftFabric.UserDataFunction' -Raw:$Raw
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to retrieve User Data Function for workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
        }
    }
}
