<#
.SYNOPSIS
    Starts an on-demand job on a Microsoft Fabric item.

.DESCRIPTION
    The Start-FabricItemJob function triggers an on-demand job run for a specific job type
    on a Fabric item via POST to
    /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/instances.

    Optional execution data can be supplied as a hashtable and is passed through verbatim
    in the request body. When no execution data is provided, no body is sent.

    This is a long-running operation: the API responds with a 202 and an operation/location
    header used to track the job instance. The response is returned as-is (no enrichment);
    -Raw is accepted for interface uniformity.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item to run the job on. Mandatory.

.PARAMETER JobType
    The job type to run on demand (e.g. 'RunNotebook', 'Pipeline', 'sparkjob'). Mandatory.

.PARAMETER ExecutionData
    Optional. A hashtable of execution data passed through verbatim in the request body,
    e.g. @{ parameters = @{ param1 = 'value1' }; configuration = @{ ... } }.

.PARAMETER Raw
    Accepted for interface uniformity. The response is returned as-is regardless.

.EXAMPLE
    Start-FabricItemJob -WorkspaceId "12345678-1234-1234-1234-123456789012" -ItemId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType 'RunNotebook'

    Starts a notebook run job with no execution data.

.EXAMPLE
    $exec = @{ parameters = @{ parameterName = @{ value = '1'; type = 'int' } } }
    Start-FabricItemJob -WorkspaceId $ws -ItemId $item -JobType 'RunNotebook' -ExecutionData $exec

    Starts a notebook run job passing execution parameters.

.OUTPUTS
    System.Object
    The API response for the started job instance (long-running operation tracking data).

.NOTES
    - API Endpoint: POST /workspaces/{workspaceId}/items/{itemId}/jobs/{jobType}/instances
    - Requires: authentication via Set-FabricApiHeaders / Connect-FabricAccount.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
#>
function Start-FabricItemJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$JobType,

        [Parameter(Mandatory = $false)]
        [hashtable]$ExecutionData,

        [Parameter()]
        [switch]$Raw
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $apiEndpointURI = New-FabricAPIUri -Segments @('workspaces', $WorkspaceId, 'items', $ItemId, 'jobs', $JobType, 'instances')
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            # Only send a body when execution data is provided.
            if ($ExecutionData) {
                $body = @{ executionData = $ExecutionData }
                $bodyJson = $body | ConvertTo-Json -Depth 10
                Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug
                $apiParams.Body = $bodyJson
            }

            if ($PSCmdlet.ShouldProcess($ItemId, "Start Fabric item job '$JobType'")) {
                $response = Invoke-FabricAPIRequest @apiParams

                if ($Raw) {
                    return $response
                }

                Write-FabricLog -Message "Job '$JobType' started for item '$ItemId'." -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to start job '$JobType' for item '$ItemId'. Error: $errorDetails" -Level Error
        }
    }
}
