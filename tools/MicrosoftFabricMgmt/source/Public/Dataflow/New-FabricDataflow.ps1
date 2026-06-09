<#
.SYNOPSIS
    Creates a new Dataflow in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Dataflow
    in the specified workspace. This is a long-running operation (LRO).

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Dataflow will be created.

.PARAMETER DataflowName
    The name of the Dataflow to be created.

.PARAMETER DataflowDescription
    An optional description for the Dataflow.

.PARAMETER Definition
    Optional. The definition of the Dataflow as a hashtable containing the parts.
    Each part should have format, partPath, and payload properties.

.EXAMPLE
    New-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowName "SalesDataflow"

    Creates a new Dataflow named "SalesDataflow" in the specified workspace.

.EXAMPLE
    New-FabricDataflow -WorkspaceId "12345678-1234-1234-1234-123456789012" -DataflowName "SalesDataflow" -DataflowDescription "Sales data transformation"

    Creates a new Dataflow with a description.

.NOTES
    - This operation is a long-running operation (LRO).
    - Requires `$FabricAuthContext` global configuration.
    - Calls `Invoke-FabricAuthCheck` to ensure token validity.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell

#>
function New-FabricDataflow {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataflowName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataflowDescription,

        [Parameter(Mandatory = $false)]
        [hashtable]$Definition
    )

    try {
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'dataflows'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DataflowName
        }

        if ($DataflowDescription) {
            $body.description = $DataflowDescription
        }

        if ($Definition) {
            $body.definition = $Definition
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $script:FabricAuthContext.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess($DataflowName, "Create Dataflow in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Dataflow '$DataflowName' created successfully!" -Level Host
            return $response
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Dataflow. Error: $errorDetails" -Level Error
    }
}
