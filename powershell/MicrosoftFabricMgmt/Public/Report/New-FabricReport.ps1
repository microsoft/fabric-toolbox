<#
.SYNOPSIS
    Creates a new Report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Report 
    in the specified workspace. It supports optional parameters for Report description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report will be created. This parameter is mandatory.

.PARAMETER ReportName
    The name of the Report to be created. This parameter is mandatory.

.PARAMETER ReportDescription
    An optional description for the Report.

.PARAMETER ReportPathDefinition
    A mandatory path to the folder that contains Report definition files to upload.


.EXAMPLE
    New-FabricReport -WorkspaceId "workspace-12345" -ReportName "New Report" -ReportDescription "Description of the new Report"
    This example creates a new Report named "New Report" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function New-FabricReport {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReportName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportDescription,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportPathDefinition
            )
    try {
        # Step 1: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/reports" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $ReportName
        }

        if ($ReportDescription) {
            $body.description = $ReportDescription
        }
        if ($ReportPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    parts  = @()
                }
            }
            $jsonObjectParts = Get-FileDefinitionParts -sourceDirectory $ReportPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }
       
        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        $response = Invoke-RestMethod `
            -Headers $FabricConfig.FabricHeaders `
            -Uri $apiEndpointUrl `
            -Method Post `
            -Body $bodyJson `
            -ContentType "application/json" `
            -ErrorAction Stop `
            -SkipHttpErrorCheck `
            -ResponseHeadersVariable "responseHeader" `
            -StatusCodeVariable "statusCode"
        
        Write-Message -Message "Response Code: $statusCode" -Level Debug
  
        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-Message -Message "Report '$ReportName' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Report '$ReportName' creation accepted. Provisioning in progress!" -Level Info
                
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                [string]$retryAfter = $responseHeader["Retry-After"] 

                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Location: '$location'" -Level Debug
                Write-Message -Message "Retry-After: '$retryAfter'" -Level Debug
                Write-Message -Message "Getting Long Running Operation status" -Level Debug
               
                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location
                Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug
                # Handle operation result
                if ($operationStatus.status -eq "Succeeded") {
                    Write-Message -Message "Operation Succeeded" -Level Debug
                    Write-Message -Message "Getting Long Running Operation result" -Level Debug
                
                    $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                    Write-Message -Message "Long Running Operation status: $operationResult" -Level Debug
                
                    return $operationResult
                } 
                else {
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Debug
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Error
                    return $operationStatus
                }  
            }
            default {
                Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-Message -Message "Error: $($response.message)" -Level Error
                Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-Message "Error Code: $($response.errorCode)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to create Report. Error: $errorDetails" -Level Error
    }
}
