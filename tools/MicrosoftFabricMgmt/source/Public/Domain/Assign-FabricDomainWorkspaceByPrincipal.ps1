<#
.SYNOPSIS
Assigns workspaces to a domain based on principal IDs in Microsoft Fabric.

.DESCRIPTION
The `Assign-FabricDomainWorkspaceByPrincipal` function sends a request to assign workspaces to a specified domain using a JSON object of principal IDs and types.

.PARAMETER DomainId
The ID of the domain to which workspaces will be assigned. This parameter is mandatory.

.PARAMETER PrincipalIds
An array representing the principals with their `id` and `type` properties. Must contain a `principals` key with an array of objects.

.EXAMPLE
$PrincipalIds = @( 
    @{id = "813abb4a-414c-4ac0-9c2c-bd17036fd58c";  type = "User"},
    @{id = "b5b9495c-685a-447a-b4d3-2d8e963e6288"; type = "User"}
    )

Assign-FabricDomainWorkspaceByPrincipal -DomainId "12345" -PrincipalIds $principals

Assigns the workspaces based on the provided principal IDs and types.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Assign-FabricDomainWorkspaceByPrincipal {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$PrincipalIds # Must contain 'id' and 'type' properties
    )

    try {
        # Validate PrincipalIds structure
        foreach ($principal in $PrincipalIds) {
            if (-not ($principal.ContainsKey('id') -and $principal.ContainsKey('type'))) {
                throw "Each principal object must contain 'id' and 'type' properties."
            }
        }

        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug
                
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/assignWorkspacesByPrincipals" -f $FabricConfig.BaseUrl, $DomainId
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            principals = $PrincipalIds
        }

        # Convert the PrincipalIds to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-Message -Message "Assigning domain workspaces by principal completed successfully!" -Level Info
       
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to assign domain workspaces by principals. Error: $errorDetails" -Level Error
    }
}
