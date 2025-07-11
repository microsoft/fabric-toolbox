<#
.SYNOPSIS
    Updates an existing SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing SemanticModel 
    in the specified workspace. It supports optional parameters for SemanticModel description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is optional.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be updated. This parameter is mandatory.

.PARAMETER SemanticModelName
    The new name of the SemanticModel. This parameter is mandatory.

.PARAMETER SemanticModelDescription
    An optional new description for the SemanticModel.

.EXAMPLE
    Update-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelName "Updated SemanticModel" -SemanticModelDescription "Updated description"
    This example updates the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Update-FabricSemanticModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,   
        
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelDescription
    )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/semanticModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $SemanticModelName
        }

        if ($SemanticModelDescription) {
            $body.description = $SemanticModelDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Patch `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"

        # Step 5: Validate the response code
        if ($statusCode -ne 200) {
            Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
            Write-Message -Message "Error: $($response.message)" -Level Error
            Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
            Write-Message "Error Code: $($response.errorCode)" -Level Error
            return $null
        }

        # Step 6: Handle results
        Write-Message -Message "SemanticModel '$SemanticModelName' updated successfully!" -Level Info
        return $response
    }
    catch {
        # Step 7: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to update SemanticModel. Error: $errorDetails" -Level Error
    }
}
