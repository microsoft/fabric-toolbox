<#
.SYNOPSIS
    Updates a user's access level in a pipeline using the Power BI admin API.

.DESCRIPTION
    The Update-FabricAdminPipelineUser cmdlet updates a user's permissions in a pipeline using the admin API.

.PARAMETER PipelineId
    Required. The pipeline ID containing the user.

.PARAMETER Identifier
    Required. The user identifier (email or object ID).

.PARAMETER AccessRight
    Required. The new permission level: Admin, Member, or Contributor.

.EXAMPLE
    Update-FabricAdminPipelineUser -PipelineId "pipeline123" -Identifier "user@example.com" -AccessRight "Admin"

    Updates the user's access level to Admin.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/pipelines/{pipelineId}/users/{identifier}
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Update-FabricAdminPipelineUser {
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
        [string]$AccessRight
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/pipelines/$PipelineId/users/$Identifier"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $body = @{
                accessRight = $AccessRight
            }
            $bodyJson = $body | ConvertTo-Json -Depth 10

            if ($PSCmdlet.ShouldProcess("Pipeline '$PipelineId'", "Update user '$Identifier' to '$AccessRight'")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Patch'
                    Body    = $bodyJson
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "User '$Identifier' access level updated to '$AccessRight' in pipeline '$PipelineId'." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update pipeline user. Error: $errorDetails" -Level Error
        }
    }
}
