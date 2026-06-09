<#
.SYNOPSIS
    Deletes a connection from Microsoft Fabric.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a connection by its ConnectionId.

.PARAMETER ConnectionId
    The unique identifier of the connection to delete.

.EXAMPLE
    Remove-FabricConnection -ConnectionId "Connection-67890"
    Removes the connection with ID "Connection-67890".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Validates authentication token before API call.

    Author: Tiago Balabuch
#>
function Remove-FabricConnection {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipeline = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$ConnectionId
    )

    process {
        try {
            # Validate authentication
            Invoke-FabricAuthCheck -ThrowOnFailure

            # Construct the API endpoint URI
            $apiEndpointURI = New-FabricAPIUri -Resource 'connections' -ItemId $ConnectionId

            if ($PSCmdlet.ShouldProcess("Connection '$ConnectionId'", "Delete")) {
                # Make the API request
                $apiParams = @{
                    Headers = $script:FabricAuthContext.FabricHeaders
                    BaseURI = $apiEndpointURI
                    Method = 'Delete'
                }
                $response = Invoke-FabricAPIRequest @apiParams
                Write-FabricLog -Message "Connection '$ConnectionId' deleted successfully." -Level Host
                $response
            }

        }
        catch {
            # Capture and log error details
            $errorDetails = $_.Exception.Message
            Write-FabricLog -Message "Failed to delete Connection '$ConnectionId'. Error: $errorDetails" -Level Error
        }
    }
}
