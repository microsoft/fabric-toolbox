<#
.SYNOPSIS
    Retrieves ML Experiment details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves ML Experiment details from a specified workspace using either the provided MLExperimentId or MLExperimentName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Experiment exists. This parameter is mandatory.

.PARAMETER MLExperimentId
    The unique identifier of the ML Experiment to retrieve. This parameter is optional.

.PARAMETER MLExperimentName
    The name of the ML Experiment to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentId "experiment-67890"
    This example retrieves the ML Experiment details for the experiment with ID "experiment-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentName "My ML Experiment"
    This example retrieves the ML Experiment details for the experiment named "My ML Experiment" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricMLExperiment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MLExperimentName
    )

    try {
        # Step 1: Handle ambiguous input
        if ($MLExperimentId -and $MLExperimentName) {
            Write-Message -Message "Both 'MLExperimentId' and 'MLExperimentName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        # Step 3: Initialize variables
        $continuationToken = $null
        $MLExperiments = @()
        
        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/mlExperiments" -f $FabricConfig.BaseUrl, $WorkspaceId
        

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
                $MLExperiments += $response.value
                 
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
        $MLExperiment = if ($MLExperimentId) {
            $MLExperiments | Where-Object { $_.Id -eq $MLExperimentId }
        }
        elseif ($MLExperimentName) {
            $MLExperiments | Where-Object { $_.DisplayName -eq $MLExperimentName }
        }
        else {
            # Return all MLExperiments if no filter is provided
            Write-Message -Message "No filter provided. Returning all MLExperiments." -Level Debug
            $MLExperiments
        }

        # Step 9: Handle results
        if ($MLExperiment) {
            Write-Message -Message "ML Experiment found matching the specified criteria." -Level Debug
            return $MLExperiment
        }
        else {
            Write-Message -Message "No ML Experiment found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve ML Experiment. Error: $errorDetails" -Level Error
    } 
 
}
