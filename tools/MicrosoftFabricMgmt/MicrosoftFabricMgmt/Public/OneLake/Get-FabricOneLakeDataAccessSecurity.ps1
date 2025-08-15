<#
.SYNOPSIS
    Sets data access security for OneLake items in a Microsoft Fabric workspace.

.DESCRIPTION
    Configures data access security by assigning roles, permissions, and members to a OneLake item in a Fabric workspace.
    Sends a PUT request to the Microsoft Fabric API to update security settings for the specified workspace and item.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the OneLake item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the OneLake item to secure. Mandatory.

.PARAMETER RoleName
    The name of the security role to assign. Mandatory.

.PARAMETER Paths
    The list of paths within the OneLake item to which the permissions apply. Mandatory.

.PARAMETER Actions
    The list of actions (e.g., Read, Write) to permit on the specified paths. Mandatory.

.PARAMETER ItemAccess
    (Optional) The access levels for fabric item members (e.g., Read, Write, Reshare, Explore, Execute, ReadAll).

.PARAMETER FabricSourcePath
    (Optional) The source path in the format workspaceId/itemId for fabric item members.

.PARAMETER ObjectType
    (Optional) The type of Microsoft Entra object (Group, User, ServicePrincipal, ManagedIdentity).

.PARAMETER ObjectId
    (Optional) The object ID of the Microsoft Entra member.

.PARAMETER TenantId
    (Optional) The tenant ID of the Microsoft Entra member.

.PARAMETER DryRun
    (Optional) If specified, performs a dry run without applying changes.

.EXAMPLE
    Set-FabricOneLakeDataAccessSecurity -WorkspaceId "workspace-12345" -ItemId "item-67890" -RoleName "DataReaders" -Paths "/data" -Actions "Read" -ObjectType "User" -ObjectId "user-guid" -TenantId "tenant-guid"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricOneLakeDataAccessSecurity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [string]$RoleName    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
    
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/dataAccessRoles" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams              
        return $response     
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to get OneLake Data Access Security. Error: $errorDetails" -Level Error
    }
}