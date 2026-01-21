<#
.SYNOPSIS
    Removes an SparkJobDefinition from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an SparkJobDefinition
    from the specified workspace using the provided WorkspaceId and SparkJobDefinitionId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the SparkJobDefinition will be removed.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to be removed.

.EXAMPLE
    Remove-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890"
    This example removes the SparkJobDefinition with ID "SparkJobDefinition-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricSparkJobDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$SparkJobDefinitionId
    )
    process {
        try {
        Invoke-FabricAuthCheck -ThrowOnFailure


        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions/{2}" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        ## Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Job Definition '$SparkJobDefinitionId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $script:FabricAuthContext.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Job Definition '$SparkJobDefinitionId' deleted successfully from workspace '$WorkspaceId'." -Level Host
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete SparkJobDefinition '$SparkJobDefinitionId'. Error: $errorDetails" -Level Error
        }
    }
}
