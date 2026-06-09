<#
.SYNOPSIS
    Creates a new DataPipeline in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new DataPipeline
    in the specified workspace. It supports optional parameters for DataPipeline description
    and path definitions for the DataPipeline content.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the DataPipeline will be created.

.PARAMETER DataPipelineName
    The name of the DataPipeline to be created.

.PARAMETER DataPipelineDescription
    An optional description for the DataPipeline.

.EXAMPLE
     New-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineName "New DataPipeline"
    This example creates a new DataPipeline named "New DataPipeline" in the workspace with ID "workspace-12345" and uploads the definition file from the specified path.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>

function New-FabricDataPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ValueFromPipelineByPropertyName = $true)]
        [ValidateNotNullOrEmpty()]
        [Alias('id')]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataPipelineName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineDescription
    )

    process {
    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataPipelines'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DataPipelineName
        }

        if ($DataPipelineDescription) {
            $body.description = $DataPipelineDescription
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("workspace '$WorkspaceId'", "Create Data Pipeline '$DataPipelineName'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Data Pipeline created successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create DataPipeline. Error: $errorDetails" -Level Error
    }
    }
}
