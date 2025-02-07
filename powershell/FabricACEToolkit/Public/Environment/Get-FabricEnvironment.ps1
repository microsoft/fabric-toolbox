<#
.SYNOPSIS
Retrieves an environment or a list of environments from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricEnvironment` function sends a GET request to the Fabric API to retrieve environment details for a given workspace. It can filter the results by `EnvironmentName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query environments.

.PARAMETER EnvironmentName
(Optional) The name of the specific environment to retrieve.

.EXAMPLE
Get-FabricEnvironment -WorkspaceId "12345" -EnvironmentName "Development"

Retrieves the "Development" environment from workspace "12345".

.EXAMPLE
Get-FabricEnvironment -WorkspaceId "12345"

Retrieves all environments in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Returns the matching environment details or all environments if no filter is provided.

Author: Tiago Balabuch  

#>

function Get-FabricEnvironment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EnvironmentName
    )

    try {
        # Step 1: Handle ambiguous input
        if ($EnvironmentId -and $EnvironmentName) {
            Write-Message -Message "Both 'EnvironmentId' and 'EnvironmentName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug

        # Step 3: Initialize variables
        $continuationToken = $null
        $environments = @()

        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }

        $baseApiEndpointUrl = "{0}/workspaces/{1}/environments" -f $FabricConfig.BaseUrl, $WorkspaceId
        
        # Step 4:  Loop to retrieve data with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug

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
                $environments += $response.value

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
        $environment = if ($EnvironmentId) {
            $environments | Where-Object { $_.Id -eq $EnvironmentId }
        }
        elseif ($EnvironmentName) {
            $environments | Where-Object { $_.DisplayName -eq $EnvironmentName }
        }
        else {
            # Return all workspaces if no filter is provided
            Write-Message -Message "No filter provided. Returning all environments." -Level Debug
            $environments
        }

        # Step 9: Handle results
        if ($environment) {
            Write-Message -Message "Environment found in the Workspace '$WorkspaceId'." -Level Debug
            return $environment
        }
        else {
            Write-Message -Message "No environment found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve environment. Error: $errorDetails" -Level Error
    } 
 
}
