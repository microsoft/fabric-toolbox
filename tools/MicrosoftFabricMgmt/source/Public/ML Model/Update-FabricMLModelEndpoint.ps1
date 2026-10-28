<#
.SYNOPSIS
    Updates the endpoint (default version configuration) of a Microsoft Fabric ML Model.

.DESCRIPTION
    The Update-FabricMLModelEndpoint function updates the default version configuration of a
    machine learning model's serving endpoint via PATCH to
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint.

    Supplied fields from the UpdateMLModelEndpointRequest schema (defaultVersionName,
    defaultVersionAssignmentBehavior) are sent in the request body. Any additional or
    future fields may be supplied via the -Properties hashtable, which is merged into the
    body verbatim. The full updated endpoint object is returned; pass -Raw for the
    untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the ML Model. Mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model whose endpoint is updated. Mandatory.

.PARAMETER DefaultVersionName
    Optional. The name of the endpoint version to set as the default.

.PARAMETER DefaultVersionAssignmentBehavior
    Optional. The default version assignment behavior. Valid values: StaticallyConfigured, NotConfigured.

.PARAMETER Properties
    Optional hashtable of additional endpoint properties merged into the request body
    verbatim (passthrough for any UpdateMLModelEndpointRequest field not exposed as a
    dedicated parameter).

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Update-FabricMLModelEndpoint -WorkspaceId $ws -MLModelId $model -DefaultVersionName '3' -DefaultVersionAssignmentBehavior 'StaticallyConfigured'

    Sets version '3' as the statically configured default version for the endpoint.

.OUTPUTS
    System.Object
    The updated ML Model endpoint object.

.NOTES
    - API Endpoint: PATCH /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricMLModelEndpoint {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DefaultVersionName,

        [Parameter(Mandatory = $false)]
        [ValidateSet('StaticallyConfigured', 'NotConfigured')]
        [string]$DefaultVersionAssignmentBehavior,

        [Parameter(Mandatory = $false)]
        [hashtable]$Properties,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('workspaces', $WorkspaceId, 'mlmodels', $MLModelId, 'endpoint')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build the body from supplied fields; -Properties passes through any extra keys.
            $body = @{}
            if ($DefaultVersionName) { $body.defaultVersionName = $DefaultVersionName }
            if ($DefaultVersionAssignmentBehavior) { $body.defaultVersionAssignmentBehavior = $DefaultVersionAssignmentBehavior }
            if ($Properties) {
                foreach ($key in $Properties.Keys) { $body[$key] = $Properties[$key] }
            }

            $bodyJson = $body | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Patch'
                Body    = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($MLModelId, "Update Fabric ML Model endpoint")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after updating endpoint for ML Model '$MLModelId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.MLModelEndpoint'
                Write-FabricLog -Message "Endpoint for ML Model '$MLModelId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update endpoint for ML Model '$MLModelId'. Error: $errorDetails" -Level Error
        }
    }
}
