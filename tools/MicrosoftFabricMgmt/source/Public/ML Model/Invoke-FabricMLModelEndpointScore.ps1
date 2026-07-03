<#
.SYNOPSIS
    Scores input data against the default version of a Microsoft Fabric ML Model endpoint.

.DESCRIPTION
    The Invoke-FabricMLModelEndpointScore function submits input data to the default version
    of a machine learning model's serving endpoint and returns the scoring results, via POST
    to /workspaces/{workspaceId}/mlModels/{modelId}/endpoint/score.

    Note: this operation uses the 'mlModels' (capital M) path casing per the Fabric API
    specification, unlike the other endpoint operations which use lowercase 'mlmodels'.

    The scoring request body (ScoreDataRequest: inputs, and optionally formatType and
    orientation) is supplied via the -InputData hashtable and passed through verbatim. This
    is a long-running operation; the score response is returned as-is.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the ML Model. Mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model to score against. Mandatory.

.PARAMETER InputData
    A hashtable representing the ScoreDataRequest body, passed through verbatim, e.g.
    @{ inputs = @(@(1, 2, 3)); formatType = 'dataframe'; orientation = 'split' }. Mandatory.

.PARAMETER Raw
    If specified, returns the untouched API response. The score response is returned as-is regardless.

.EXAMPLE
    $data = @{ inputs = @(@(5.1, 3.5, 1.4, 0.2)) }
    Invoke-FabricMLModelEndpointScore -WorkspaceId $ws -MLModelId $model -InputData $data

    Scores a single input row against the default endpoint version.

.OUTPUTS
    System.Object
    The score response (ScoreDataResponse) containing predictions.

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/mlModels/{modelId}/endpoint/score
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Invoke-FabricMLModelEndpointScore {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$InputData,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # NOTE: 'mlModels' capital M here per the Fabric API spec for the default-version score path.
            $segments = @('workspaces', $WorkspaceId, 'mlModels', $MLModelId, 'endpoint', 'score')
            $apiEndpointURI = New-FabricAPIUri -Segments $segments
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # The score request body is passed through verbatim.
            $bodyJson = $InputData | ConvertTo-Json -Depth 10
            Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($Raw) {
                return $response
            }

            Write-FabricLog -Message "Scoring request completed for ML Model '$MLModelId'." -Level Host
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to score against endpoint for ML Model '$MLModelId'. Error: $errorDetails" -Level Error
        }
    }
}
