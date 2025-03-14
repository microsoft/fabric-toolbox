<#
.SYNOPSIS
    Retrieves paginated report details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves paginated report details from a specified workspace using either the provided PaginatedReportId or PaginatedReportName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the paginated reports exist. This parameter is mandatory.

.PARAMETER PaginatedReportId
    The unique identifier of the paginated report to retrieve. This parameter is optional.

.PARAMETER PaginatedReportName
    The name of the paginated report to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricPaginatedReports -WorkspaceId "workspace-12345" -PaginatedReportId "report-67890"
    This example retrieves the paginated report details for the report with ID "report-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricPaginatedReports -WorkspaceId "workspace-12345" -PaginatedReportName "My Paginated Report"
    This example retrieves the paginated report details for the report named "My Paginated Report" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
    
#>
function Get-FabricPaginatedReport {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$PaginatedReportId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$PaginatedReportName
    )

    try {
        # Step 1: Handle ambiguous input
        if ($PaginatedReportId -and $PaginatedReportName) {
            Write-Message -Message "Both 'PaginatedReportId' and 'PaginatedReportName' were provided. Please specify only one." -Level Error
            return $null
        }

        # Step 2: Ensure token validity
        Write-Message -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Token validation completed." -Level Debug
        # Step 3: Initialize variables
        $continuationToken = $null
        $PaginatedReports = @()
        
        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }
 
        # Step 4: Loop to retrieve all capacities with continuation token
        Write-Message -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/paginatedReports" -f $FabricConfig.BaseUrl, $WorkspaceId
        

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
                $PaginatedReports += $response.value
                 
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
        $PaginatedReport = if ($PaginatedReportId) {
            $PaginatedReports | Where-Object { $_.Id -eq $PaginatedReportId }
        }
        elseif ($PaginatedReportName) {
            $PaginatedReports | Where-Object { $_.DisplayName -eq $PaginatedReportName }
        }
        else {
            # Return all PaginatedReports if no filter is provided
            Write-Message -Message "No filter provided. Returning all Paginated Reports." -Level Debug
            $PaginatedReports
        }

        # Step 9: Handle results
        if ($PaginatedReport) {
            Write-Message -Message "Paginated Report found matching the specified criteria." -Level Debug
            return $PaginatedReport
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
