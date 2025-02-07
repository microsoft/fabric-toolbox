<#
.SYNOPSIS
Retrieves an KQLDatabase or a list of KQLDatabases from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricKQLDatabase` function sends a GET request to the Fabric API to retrieve KQLDatabase details for a given workspace. It can filter the results by `KQLDatabaseName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query KQLDatabases.

.PARAMETER KQLDatabaseName
(Optional) The name of the specific KQLDatabase to retrieve.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId "12345" -KQLDatabaseName "Development"

Retrieves the "Development" KQLDatabase from workspace "12345".

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId "12345"

Retrieves all KQLDatabases in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>
function Get-FabricKQLDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName
    )

    try {
        # Step 1: Handle ambiguous input
        if ($KQLDatabaseId -and $KQLDatabaseName) {
            Write-Message -Message "Both 'KQLDatabaseId' and 'KQLDatabaseName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        # Step 3: Initialize variables
        $continuationToken = $null
        $KQLDatabases = @()
        
        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId

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
                $KQLDatabases += $response.value
                 
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
        $KQLDatabase = if ($KQLDatabaseId) {
            $KQLDatabases | Where-Object { $_.Id -eq $KQLDatabaseId }
        }
        elseif ($KQLDatabaseName) {
            $KQLDatabases | Where-Object { $_.DisplayName -eq $KQLDatabaseName }
        }
        else {
            # Return all KQLDatabases if no filter is provided
            Write-Message -Message "No filter provided. Returning all KQLDatabases." -Level Debug
            $KQLDatabases
        }

        # Step 9: Handle results
        if ($KQLDatabase) {
            Write-Message -Message "KQLDatabase found matching the specified criteria." -Level Debug
            return $KQLDatabase
        }
        else {
            Write-Message -Message "No KQLDatabase found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve KQLDatabase. Error: $errorDetails" -Level Error
    } 
 
}
