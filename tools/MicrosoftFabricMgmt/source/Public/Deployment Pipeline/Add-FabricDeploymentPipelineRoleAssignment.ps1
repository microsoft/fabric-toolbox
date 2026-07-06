<#
.SYNOPSIS
    Adds a role assignment to a Microsoft Fabric deployment pipeline.

.DESCRIPTION
    The Add-FabricDeploymentPipelineRoleAssignment function assigns a role to a principal
    (User, Group, ServicePrincipal, ServicePrincipalProfile) on a deployment pipeline via
    POST /deploymentPipelines/{deploymentPipelineId}/roleAssignments.

    The request body contains the principal (id and type) and the role to assign.

.PARAMETER DeploymentPipelineId
    The unique identifier of the deployment pipeline. Mandatory.

.PARAMETER PrincipalId
    The unique identifier of the principal to assign the role to. Mandatory.

.PARAMETER PrincipalType
    The type of principal. Valid values: Group, ServicePrincipal, ServicePrincipalProfile, User. Mandatory.

.PARAMETER Role
    The role to assign to the principal. Valid values: Admin. Mandatory.

.EXAMPLE
    Add-FabricDeploymentPipelineRoleAssignment -DeploymentPipelineId "11111111-1111-1111-1111-111111111111" -PrincipalId "22222222-2222-2222-2222-222222222222" -PrincipalType "User" -Role "Admin"

    Assigns the Admin role to the specified user on the deployment pipeline.

.OUTPUTS
    System.Object
    The API response for the created role assignment.

.NOTES
    - API Endpoint: POST /deploymentPipelines/{deploymentPipelineId}/roleAssignments
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Add-FabricDeploymentPipelineRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DeploymentPipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$PrincipalId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Group', 'ServicePrincipal', 'ServicePrincipalProfile', 'User')]
        [string]$PrincipalType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admin')]
        [string]$Role
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $segments = @('deploymentPipelines', $DeploymentPipelineId, 'roleAssignments')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Construct the request body
            $body = @{
                principal = @{
                    id   = $PrincipalId
                    type = $PrincipalType
                }
                role      = $Role
            }
            $bodyJson = Convert-FabricRequestBody -InputObject $body

            if ($PSCmdlet.ShouldProcess("Role '$Role' to principal '$PrincipalId' on deployment pipeline '$DeploymentPipelineId'", "Assign")) {
                # Make the API request
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Role '$Role' assigned to principal '$PrincipalId' on deployment pipeline '$DeploymentPipelineId'." -Level Host
                $response
            }
        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to assign role to principal '$PrincipalId' on deployment pipeline '$DeploymentPipelineId'. Error: $errorDetails" -Level Error
        }
    }
}
