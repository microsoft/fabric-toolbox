<#
.SYNOPSIS
    Retrieves Reflex details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Reflex details from a specified workspace using either the provided ReflexId or ReflexName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is mandatory.

.PARAMETER ReflexId
    The unique identifier of the Reflex to retrieve. This parameter is optional.

.PARAMETER ReflexName
    The name of the Reflex to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricReflex -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890"
    This example retrieves the Reflex details for the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReflex -WorkspaceId "workspace-12345" -ReflexName "My Reflex"
    This example retrieves the Reflex details for the Reflex named "My Reflex" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricReflex {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReflexName
    )
    try {

        # Step 1: Handle ambiguous input
        if ($ReflexId -and $ReflexName) {
            Write-Message -Message "Both 'ReflexId' and 'ReflexName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        
        # Step 3: Initialize variables
        $continuationToken = $null
        $Reflexes = @()
  
        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/reflexes" -f $FabricConfig.BaseUrl, $WorkspaceId
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
                $Reflexes += $response.value
    
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
        $Reflex = if ($ReflexId) {
            $Reflexes | Where-Object { $_.Id -eq $ReflexId }
        }
        elseif ($ReflexName) {
            $Reflexes | Where-Object { $_.DisplayName -eq $ReflexName }
        }
        else {
            # Return all Reflexes if no filter is provided
            Write-Message -Message "No filter provided. Returning all Reflexes." -Level Debug
            $Reflexes
        }

        # Step 9: Handle results
        if ($Reflex) {
            Write-Message -Message "Reflex found in the Workspace '$WorkspaceId'." -Level Debug
            return $Reflex
        }
        else {
            Write-Message -Message "No Reflex found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to retrieve Reflex. Error: $errorDetails" -Level Error
    } 
 
}
