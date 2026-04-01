<#
.SYNOPSIS
    Removes a user from a pipeline using the Power BI admin API.

.DESCRIPTION
    The Remove-FabricAdminPipelineUser cmdlet removes a user from a pipeline using the admin API.

.PARAMETER PipelineId
    Required. The pipeline ID to remove the user from.

.PARAMETER Identifier
    Required. The user identifier (email or object ID).

.EXAMPLE
    Remove-FabricAdminPipelineUser -PipelineId "pipeline123" -Identifier "user@example.com"

    Removes a user from the specified pipeline.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/pipelines/{pipelineId}/users/{identifier}
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Remove-FabricAdminPipelineUser {
    [CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$PipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Identifier
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/pipelines/$PipelineId/users/$Identifier"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            if ($PSCmdlet.ShouldProcess("Pipeline '$PipelineId'", "Remove user '$Identifier'")) {
                $apiParams = @{
                    BaseURI = $apiEndpointURI
                    Headers = $script:FabricAuthContext.FabricHeaders
                    Method  = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams

                Write-FabricLog -Message "User '$Identifier' removed from pipeline '$PipelineId'." -Level Debug
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to remove user from pipeline. Error: $errorDetails" -Level Error
        }
    }
}
