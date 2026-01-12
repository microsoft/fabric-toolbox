<#
.SYNOPSIS
Creates a new notebook in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new notebook
in the specified workspace. It supports optional parameters for notebook description
and path definitions for the notebook content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the notebook will be created.

.PARAMETER NotebookName
The name of the notebook to be created.

.PARAMETER NotebookDescription
An optional description for the notebook.

.PARAMETER NotebookPathDefinition
An optional path to the notebook definition file (e.g., .ipynb file) to upload.

.PARAMETER NotebookPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricNotebook -WorkspaceId "workspace-12345" -NotebookName "New Notebook" -NotebookPathDefinition "C:\notebooks\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricNotebookNEW {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$NotebookName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathDefinition
    )

    try {
        # Step 1: Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/notebooks" -f $script:FabricAuthContext.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $NotebookName
        }

        if ($NotebookDescription) {
            $body.description = $NotebookDescription
        }

        if ($NotebookPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    format = "ipynb"
                    parts  = @()
                }
            }
            $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $NotebookPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }
        # Check if any path is .platform
        foreach ($part in $jsonObjectParts.parts) {
            if ($part.path -eq ".platform") {
                $hasPlatformFile = $true
                Write-FabricLog -Message "Platform File: $hasPlatformFile" -Level Debug
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create Notebook '$NotebookName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $response = Invoke-RestMethod `
                -Headers $script:FabricAuthContext.FabricHeaders `
                -Uri $apiEndpointUrl `
                -Method Post `
                -Body $bodyJson `
                -ContentType "application/json" `
                -ErrorAction Stop `
                -SkipHttpErrorCheck `
                -ResponseHeadersVariable "responseHeader" `
                -StatusCodeVariable "statusCode"
        }

        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-FabricLog -Message "Notebook '$NotebookName' created successfully!" -Level Host
                return $response
            }
            202 {
                Write-FabricLog -Message "Notebook '$NotebookName' creation accepted. Provisioning in progress!" -Level Host

                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                [string]$retryAfter = $responseHeader["Retry-After"]

                Write-FabricLog -Message "Operation ID: '$operationId'" -Level Debug
                Write-FabricLog -Message "Location: '$location'" -Level Debug
                Write-FabricLog -Message "Retry-After: '$retryAfter'" -Level Debug
                Write-FabricLog -Message "Getting Long Running Operation status" -Level Debug

                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId
                Write-FabricLog -Message "Long Running Operation status: $operationStatus" -Level Debug
                # Handle operation result
                if ($operationStatus.status -eq "Succeeded") {
                    Write-FabricLog -Message "Operation Succeeded" -Level Debug
                    Write-FabricLog -Message "Getting Long Running Operation result" -Level Debug

                    $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                    Write-FabricLog -Message "Long Running Operation status: $operationResult" -Level Debug

                    return $operationResult
                }
                else {
                    Write-FabricLog -Message "Operation failed. Status: $($operationStatus)" -Level Debug
                    Write-FabricLog -Message "Operation failed. Status: $($operationStatus)" -Level Error
                    return $operationStatus
                }
            }
            default {
                Write-FabricLog -Message "Unexpected response code: $statusCode" -Level Error
                Write-FabricLog -Message "Error details: $($response.message)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create notebook. Error: $errorDetails" -Level Error
    }
}
