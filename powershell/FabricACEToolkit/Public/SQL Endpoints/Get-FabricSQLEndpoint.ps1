<#
.SYNOPSIS
Retrieves SQL Endpoints from a specified workspace in Fabric.

.DESCRIPTION
The Get-FabricSQLEndpoint function retrieves SQL Endpoints from a specified workspace in Fabric. 
It supports filtering by SQL Endpoint ID or SQL Endpoint Name. If both filters are provided, 
an error message is returned. The function handles token validation, API requests with continuation 
tokens, and processes the response to return the desired SQL Endpoint(s).

.PARAMETER WorkspaceId
The ID of the workspace from which to retrieve SQL Endpoints. This parameter is mandatory.

.PARAMETER SQLEndpointId
The ID of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointName.

.PARAMETER SQLEndpointName
The name of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointId.

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointName "MySQLEndpoint"

.NOTES
- This function requires the FabricConfig object to be properly configured with BaseUrl and FabricHeaders.
- The function uses continuation tokens to handle paginated API responses.
- If no filter parameters are provided, all SQL Endpoints in the specified workspace are returned.

#>
function Get-FabricSQLEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SQLEndpointName
    )

    try {
        # Step 1: Handle ambiguous input
        if ($SQLEndpointId -and $SQLEndpointName) {
            Write-Message -Message "Both 'SQLEndpointId' and 'SQLEndpointName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        # Step 3: Initialize variables
        $continuationToken = $null
        $SQLEndpoints = @()
        
        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/SQLEndpoints" -f $FabricConfig.BaseUrl, $WorkspaceId
        

        do {
            # Step 5: Construct the API URL
            $apiEndpointUrl = $baseApiEndpointUrl
        
            if ($null -ne $continuationToken) {
                # URL-encode the continuation token
                $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)
                $apiEndpointUrl = "{0}?continuationToken={1}" -f $apiEndpointUrl, $encodedToken
            }
            Write-Message -Message "API Endpoint: $apiEndpointUrl" -Level Debug
         
            # Step 6: Make the API request
            $response = Invoke-RestMethod `
                -Headers $FabricConfig.FabricHeaders `
                -Uri $apiEndpointUrl `
                -Method Get `
                -ErrorAction Stop `
                -SkipHttpErrorCheck `
                -ResponseHeadersVariable "responseHeader" `
                -StatusCodeVariable "statusCode"
         
            # Step 7: Validate the response code
            if ($statusCode -ne 200) {
                Write-Message -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-Message -Message "Error: $($response.message)" -Level Error
                Write-Message -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-Message "Error Code: $($response.errorCode)" -Level Error
                return $null
            }
         
            # Step 8: Add data to the list
            if ($null -ne $response) {
                Write-Message -Message "Adding data to the list" -Level Debug
                $SQLEndpoints += $response.value
                 
                # Update the continuation token if present
                if ($response.PSObject.Properties.Match("continuationToken")) {
                    Write-Message -Message "Updating the continuation token" -Level Debug
                    $continuationToken = $response.continuationToken
                    Write-Message -Message "Continuation token: $continuationToken" -Level Debug
                }
                else {
                    Write-Message -Message "Updating the continuation token to null" -Level Debug
                    $continuationToken = $null
                }
            }
            else {
                Write-Message -Message "No data received from the API." -Level Warning
                break
            }
        } while ($null -ne $continuationToken)
        Write-Message -Message "Loop finished and all data added to the list" -Level Debug
       
        # Step 8: Filter results based on provided parameters
        $SQLEndpoint = if ($SQLEndpointId) {
            $SQLEndpoints | Where-Object { $_.Id -eq $SQLEndpointId }
        }
        elseif ($SQLEndpointName) {
            $SQLEndpoints | Where-Object { $_.DisplayName -eq $SQLEndpointName }
        }
        else {
            # Return all SQLEndpoints if no filter is provided
            Write-Message -Message "No filter provided. Returning all Paginated Reports." -Level Debug
            $SQLEndpoints
        }

        # Step 9: Handle results
        if ($SQLEndpoint) {
            Write-Message -Message "Paginated Report found matching the specified criteria." -Level Debug
            return $SQLEndpoint
        }
        else {
            Write-Message -Message "No Paginated Report found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Paginated Report. Error: $errorDetails" -Level Error
    } 
}
