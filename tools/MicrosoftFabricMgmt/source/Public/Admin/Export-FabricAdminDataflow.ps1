<#
.SYNOPSIS
    Exports a dataflow using the Power BI admin API.

.DESCRIPTION
    The Export-FabricAdminDataflow cmdlet exports a dataflow as a file using the admin API.

.PARAMETER DataflowId
    Required. The dataflow ID to export.

.PARAMETER OutFile
    Optional. The output file path. If not provided, returns the binary content.

.EXAMPLE
    Export-FabricAdminDataflow -DataflowId "dataflow123"

    Exports the dataflow and returns binary content.

.EXAMPLE
    Export-FabricAdminDataflow -DataflowId "dataflow123" -OutFile "C:\export\dataflow.pbix"

    Exports the dataflow to a file.

.NOTES
    - Uses the Power BI Admin API: https://api.powerbi.com/v1.0/myorg/admin/dataflows/{dataflowId}/export
    - Requires Fabric Administrator permissions.

    Author: Claude AI
#>
function Export-FabricAdminDataflow {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$DataflowId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$OutFile
    )

    process {
        try {
            Invoke-FabricAuthCheck -ThrowOnFailure

            $powerBIAdminBaseUrl = "https://api.powerbi.com/v1.0/myorg"
            $apiEndpointURI = "$powerBIAdminBaseUrl/admin/dataflows/$DataflowId/export"

            Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Get'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($OutFile) {
                [System.IO.File]::WriteAllBytes($OutFile, $response)
                Write-FabricLog -Message "Dataflow exported to '$OutFile'." -Level Debug
                return $OutFile
            }

            Write-FabricLog -Message "Dataflow exported successfully." -Level Debug
            return $response
        }
        catch {
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to export dataflow. Error: $errorDetails" -Level Error
        }
    }
}
