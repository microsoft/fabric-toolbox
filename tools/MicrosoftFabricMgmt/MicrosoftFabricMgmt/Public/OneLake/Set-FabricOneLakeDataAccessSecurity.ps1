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
function Set-FabricOneLakeDataAccessSecurity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [string]$RoleName,

        [Parameter(Mandatory = $true)]
        [string[]]$Paths,

        [Parameter(Mandatory = $true)]
        [string[]]$Actions,

        [Parameter(Mandatory = $false)]
        [ValidateSet("Read", "Write", "Reshare", "Explore", "Execute", "ReadAll")]
        [string[]]$ItemAccess,

        [Parameter(Mandatory = $false)]
        [string]$FabricSourcePath,  # Format: workspaceId/itemId

        [Parameter(Mandatory = $false)]
        [ValidateSet("Group", "User", "ServicePrincipal", "ManagedIdentity")]
        [string]$ObjectType,

        [Parameter(Mandatory = $false)]
        [string]$ObjectId,

        [Parameter(Mandatory = $false)]
        [string]$TenantId,
        
        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
    
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/dataAccessRoles" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        if ($DryRun.IsPresent) {
            $apiEndpointURI += "?dryRun=true"
        }
        
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Build decision rule
        $decisionRule = @{
            effect     = "Permit"
            permission = @(
                @{
                    attributeName            = "Path"
                    attributeValueIncludedIn = $Paths
                },
                @{
                    attributeName            = "Action"
                    attributeValueIncludedIn = $Actions
                }
            )
        }

        # Build members object
        $members = @{}

        if ($ItemAccess -and $FabricSourcePath) {
            $members.fabricItemMembers = @(
                @{
                    itemAccess = $ItemAccess
                    sourcePath = $FabricSourcePath
                }
            )
        }

        if ($ObjectType -and $ObjectId -and $TenantId) {
            $members.microsoftEntraMembers = @(
                @{
                    objectId   = $ObjectId
                    objectType = $ObjectType
                    tenantId   = $TenantId
                }
            )
        }

        # Final role structure
        $roleDefinition = @{
            name          = $RoleName
            decisionRules = @($decisionRule)
            members       = $members
        }

        $body = @{
            value = @($roleDefinition)
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Put'
            Body    = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        if ($DryRun.IsPresent) {
            Write-Message -Message "Dry run completed. No changes were made." -Level Info
        }
        else {
            Write-Message -Message "OneLake Data Access Security set up successfully!" -Level Info   
        }
              
        return $response     
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to set up OneLake Data Access Security. Error: $errorDetails" -Level Error
    }
}