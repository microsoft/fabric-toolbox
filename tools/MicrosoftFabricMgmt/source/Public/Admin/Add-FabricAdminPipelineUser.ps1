<#
.SYNOPSIS
    Adds a user to a pipeline using the Power BI admin API.

.DESCRIPTION
    The Add-FabricAdminPipelineUser cmdlet adds a user, group, or service principal to a pipeline with specified permissions using the admin API.

.PARAMETER PipelineId
    Required. The pipeline ID to add the user to.

.PARAMETER Identifier
    Required. The user's email, object ID, or user principal name.

.PARAMETER AccessRight
    Required. The permission level: Admin, Member, or Contributor.

.PARAMETER PrincipalType
    Required. The type of principal: User, Group, or App.

.EXAMPLE
    Add-FabricAdminPipelineUser -PipelineId "pipeline123" -Identifier "user@example.com" -AccessRight "Member" -PrincipalType "User"

    Adds a user as a member to the specified pipeline.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/pipelines/{pipelineId}/users
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Add-FabricAdminPipelineUser {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$PipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Identifier,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Admin', 'Member', 'Contributor')]
        [string]$AccessRight,

        [Parameter(Mandatory = $true)]
        [ValidateSet('User', 'Group', 'App')]
        [string]$PrincipalType
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/pipelines/$PipelineId/users"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                identifier     = $Identifier
                accessRight    = $AccessRight
                principalType  = $PrincipalType
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Pipeline '$PipelineId'", "Add user '$Identifier' with '$AccessRight' role")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Post'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "User '$Identifier' added to pipeline '$PipelineId' with '$AccessRight' role." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to add user to pipeline. Error: $errorDetails" -Level Error
        }
    }
}
