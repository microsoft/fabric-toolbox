<#
.SYNOPSIS
    Updates a specific endpoint version of a Microsoft Fabric ML Model.

.DESCRIPTION
    The Update-FabricMLModelEndpointVersion function updates the configuration of a specific
    machine learning model endpoint version via PATCH to
    /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}.

    Supplied fields from the UpdateMLModelEndpointVersionRequest schema (scaleRule) are sent
    in the request body. Any additional or future fields may be supplied via the -Properties
    hashtable, which is merged into the body verbatim. The full updated version object is
    returned; pass -Raw for the untouched API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the ML Model. Mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model whose endpoint version is updated. Mandatory.

.PARAMETER VersionName
    The name of the endpoint version to update. Mandatory.

.PARAMETER ScaleRule
    Optional. The scale rule for the endpoint version. Valid values: AlwaysOn, AllowScaleToZero.

.PARAMETER Properties
    Optional hashtable of additional version properties merged into the request body
    verbatim (passthrough for any UpdateMLModelEndpointVersionRequest field not exposed as
    a dedicated parameter).

.PARAMETER Raw
    If specified, returns the untouched API response with no added properties or type decoration.

.EXAMPLE
    Update-FabricMLModelEndpointVersion -WorkspaceId $ws -MLModelId $model -VersionName '3' -ScaleRule 'AllowScaleToZero'

    Configures version '3' of the endpoint to allow scaling to zero.

.OUTPUTS
    System.Object
    The updated ML Model endpoint version object.

.NOTES
    - API Endpoint: PATCH /workspaces/{workspaceId}/mlmodels/{modelId}/endpoint/versions/{name}
    - Requires: authentication via Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Update-FabricMLModelEndpointVersion {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$VersionName,

        [Parameter(Mandatory = $false)]
        [ValidateSet('AlwaysOn', 'AllowScaleToZero')]
        [string]$ScaleRule,

        [Parameter(Mandatory = $false)]
        [hashtable]$Properties,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $segments = @('workspaces', $WorkspaceId, 'mlmodels', $MLModelId, 'endpoint', 'versions', $VersionName)
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build the body from supplied fields; -Properties passes through any extra keys.
            $body = @{}
            if ($ScaleRule) { $body.scaleRule = $ScaleRule }
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

            if ($PSCmdlet.ShouldProcess($VersionName, "Update Fabric ML Model endpoint version")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if (-not $response) {
                    Write-FabricLog -Message "No response returned after updating endpoint version '$VersionName' for ML Model '$MLModelId'." -Level Warning
                    return $null
                }

                if ($Raw) {
                    return $response
                }

                $response | Add-FabricTypeName -TypeName 'MicrosoftFabric.MLModelEndpointVersion'
                Write-FabricLog -Message "Endpoint version '$VersionName' for ML Model '$MLModelId' updated successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to update endpoint version '$VersionName' for ML Model '$MLModelId'. Error: $errorDetails" -Level Error
        }
    }
}
