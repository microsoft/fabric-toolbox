<#
.SYNOPSIS
Retrieves an MirroredDatabase or a list of MirroredDatabases from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricMirroredDatabase` function sends a GET request to the Fabric API to retrieve MirroredDatabase details for a given workspace. It can filter the results by `MirroredDatabaseName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query MirroredDatabases.

.PARAMETER MirroredDatabaseName
(Optional) The name of the specific MirroredDatabase to retrieve.

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseName "Development"

Retrieves the "Development" MirroredDatabase from workspace "12345".

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345"

Retrieves all MirroredDatabases in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch  

#>

function Get-FabricMirroredDatabase {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredDatabaseName
    )

    try {
        # Step 1: Handle ambiguous input
        if ($MirroredDatabaseId -and $MirroredDatabaseName) {
            Write-Message -Message "Both 'MirroredDatabaseId' and 'MirroredDatabaseName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        $continuationToken = $null
        $MirroredDatabases = @()

        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/mirroredDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        
        # Step 3:  Loop to retrieve data with continuation token
        
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
                $MirroredDatabases += $response.value
                 
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
        $MirroredDatabase = if ($MirroredDatabaseId) {
            $MirroredDatabases | Where-Object { $_.Id -eq $MirroredDatabaseId }
        }
        elseif ($MirroredDatabaseName) {
            $MirroredDatabases | Where-Object { $_.DisplayName -eq $MirroredDatabaseName }
        }
        else {
            # Return all MirroredDatabases if no filter is provided
            Write-Message -Message "No filter provided. Returning all MirroredDatabases." -Level Debug
            $MirroredDatabases
        }

        # Step 9: Handle results
        if ($MirroredDatabase) {
            Write-Message -Message "MirroredDatabase found matching the specified criteria." -Level Debug
            return $MirroredDatabase
        }
        else {
            Write-Message -Message "No MirroredDatabase found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
    } 
 
}
