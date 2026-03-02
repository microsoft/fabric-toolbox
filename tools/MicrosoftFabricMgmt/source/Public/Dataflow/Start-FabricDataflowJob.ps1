<#
.SYNOPSIS
    Starts an on-demand job for a Dataflow in a Microsoft Fabric workspace.

.DESCRIPTION
    This function triggers an on-demand execution or apply changes job for a Dataflow.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Dataflow.

.PARAMETER DataflowId
    The unique identifier of the Dataflow.

.PARAMETER JobType
    The type of job to run. Valid values are 'Execute' or 'ApplyChanges'.

.PARAMETER ExecutionData
    Optional. Additional execution data for the job as a hashtable.
    Only applicable for 'Execute' job type.

.EXAMPLE
    Start-FabricDataflowJob -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType Execute

    Starts an Execute job for the specified Dataflow.

.EXAMPLE
    Start-FabricDataflowJob -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" -JobType ApplyChanges

    Starts an ApplyChanges job for the specified Dataflow.

.NOTES
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function Start-FabricDataflowJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataflowId,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Execute', 'ApplyChanges')]
        [string]$JobType,

        [Parameter(Mandatory = $false)]
        [hashtable]$ExecutionData
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows' -ItemId "$DataflowId/jobs/$JobType/instances"
            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            # Build request parameters
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
            }

            # Add body for Execute job type if execution data provided
            if ($JobType -eq 'Execute' -and $ExecutionData) {
                $body = @{
                    executionData = $ExecutionData
                }
                $apiParams.Body = $body | ConvertTo-Json -Depth 10
                Write-FabricLog -Message "Request Body: $($apiParams.Body)" -Level Debug
            }

            if ($PSCmdlet.ShouldProcess($DataflowId, "Start $JobType job for Dataflow in workspace '$WorkspaceId'")) {
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Dataflow $JobType job started successfully!" -Level Host
                return $response
            }
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to start Dataflow job. Error: $errorDetails" -Level Error
        }
    }
}
