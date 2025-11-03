<#
.SYNOPSIS
Triggers a refresh of materialized lake views for a specified Lakehouse in Microsoft Fabric.

.DESCRIPTION
Start-FabricLakehouseRefreshMaterializedLakeView initiates a refresh job for materialized lake views within a given Lakehouse. The function validates authentication, constructs the appropriate API request, and can optionally wait for the job to complete. It returns the job details or logs errors if the operation fails.

.PARAMETER WorkspaceId
[string] (Mandatory) The ID of the workspace containing the Lakehouse.

.PARAMETER LakehouseId
[string] (Mandatory) The ID of the Lakehouse whose materialized lake views will be refreshed.

.PARAMETER JobType
[string] (Optional) The type of job to run. Default is "RefreshMaterializedLakeViews".

.PARAMETER WaitForCompletion
[switch] (Optional) If specified, waits for the refresh job to complete before returning.

.EXAMPLE
Start-FabricLakehouseRefreshMaterializedLakeView -WorkspaceId "12345" -LakehouseId "67890" -WaitForCompletion

.OUTPUTS
Returns the API response object with job details, or $null if the operation fails.

.NOTES
- Requires $FabricConfig with BaseUrl and FabricHeaders.
- Validates authentication using Test-TokenExpired.
- Logs errors and returns $null on failure.

Author: Tiago Balabuch
#>
function Start-FabricLakehouseRefreshMaterializedLakeView {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('RefreshMaterializedLakeViews')]
        [string]$JobType = "RefreshMaterializedLakeViews",

        [Parameter(Mandatory = $false)]
        [switch]$WaitForCompletion        
    )
    try {
        # Validate authentication token before proceeding.
        Write-Message -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-Message -Message "Authentication token is valid." -Level Debug

        # Validate input parameters
        #$lakehouse = Get-FabricLakehouse -WorkspaceId $WorkspaceId -LakehouseId $LakehouseId   
        #if ($lakehouse.properties.PSObject.Properties['defaultSchema'] -and -not $SchemaName) {
        #    Write-Error "The Lakehouse '$lakehouse.displayName' has schema enabled, but no schema name was provided. Please specify the 'SchemaName' parameter to proceed."
        #    return $null
        #}
        
        # Construct the API endpoint URI 
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $LakehouseId, $JobType
        Write-Message -Message "API Endpoint: $apiEndpointURI" -Level Debug

          # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        
        if ($WaitForCompletion.IsPresent) {
            $apiParams.WaitForCompletion = $true
        }
        $response = Invoke-FabricAPIRequest @apiParams  
      
        if ($WaitForCompletion) {
            Write-Message -Message "Refresh MLV job for Lakehouse '$($lakehouse.displayName)' has completed." -Level Info
            Write-Message -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
        }
        else {
            Write-Message -Message "Refresh MLV job for Lakehouse '$($lakehouse.displayName)' has been started and is running asynchronously." -Level Info
            Write-Message -Message "You can monitor the job status using the job ID from the response." -Level Debug
        }
        # Return the API response
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-Message -Message "Failed to start refresh MLV job. Error: $errorDetails" -Level Error
    }
}
