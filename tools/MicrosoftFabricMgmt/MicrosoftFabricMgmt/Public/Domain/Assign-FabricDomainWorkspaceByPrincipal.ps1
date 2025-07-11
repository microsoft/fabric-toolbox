<#
.SYNOPSIS
Assigns workspaces to a domain based on principal IDs in Microsoft Fabric.

.DESCRIPTION
The `Assign-FabricDomainWorkspaceByPrincipal` function sends a request to assign workspaces to a specified domain using a JSON object of principal IDs and types.

.PARAMETER DomainId
The ID of the domain to which workspaces will be assigned. This parameter is mandatory.

.PARAMETER PrincipalIds
An array representing the principals with their `id` and `type` properties. Must contain a `principals` key with an array of objects.

.EXAMPLE
$PrincipalIds = @( 
    @{id = "813abb4a-414c-4ac0-9c2c-bd17036fd58c";  type = "User"},
    @{id = "b5b9495c-685a-447a-b4d3-2d8e963e6288"; type = "User"}
    )

Assign-FabricDomainWorkspaceByPrincipal -DomainId "12345" -PrincipalIds $principals

Assigns the workspaces based on the provided principal IDs and types.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Assign-FabricDomainWorkspaceByPrincipal {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        #[hashtable]$PrincipalIds # Must contain a JSON array of principals with 'id' and 'type' properties
        [System.Object]$PrincipalIds
    )

    try {
        # Step 1: Ensure each principal contains 'id' and 'type'
        foreach ($principal in $PrincipalIds) {
            if (-not ($principal.ContainsKey('id') -and $principal.ContainsKey('type'))) {
                throw "Each principal object must contain 'id' and 'type' properties."
            }
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 3: Construct the API URL
        $apiEndpointUrl = "{0}/admin/domains/{1}/assignWorkspacesByPrincipals" -f $FabricConfig.BaseUrl, $DomainId
        Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Message

        # Step 4: Construct the request body
        $body = @{
            principals = $PrincipalIds
        }

        # Convert the PrincipalIds to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-Message -Message "Request Body: $bodyJson" -Level Debug

        # Step 5: Make the API request
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

        # Step 6: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-Message -Message "Assigning domain workspaces by principal completed successfully!" -Level Info
                return $response
            }
            202 {
                Write-Message -Message "Assigning domain workspaces by principal is in progress for domain '$DomainId'." -Level Info
                [string]$operationId = $responseHeader["x-ms-operation-id"]
                Write-Message -Message "Operation ID: '$operationId'" -Level Debug
                Write-Message -Message "Getting Long Running Operation status" -Level Debug
               
                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId
                Write-Message -Message "Long Running Operation status: $operationStatus" -Level Debug
                # Handle operation result
                if ($operationStatus.status -eq "Succeeded") {
                    Write-Message -Message "Operation Succeeded" -Level Debug
                    return $operationStatus
                }
                else {
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Debug
                    Write-Message -Message "Operation failed. Status: $($operationStatus)" -Level Error
                    return operationStatus
                }
            }
            default {
                Write-Message -Message "Unexpected response code: $statusCode" -Level Error
                Write-Message -Message "Error details: $($response.message)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 7: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to assign domain workspaces by principals. Error: $errorDetails" -Level Error
    }
}
