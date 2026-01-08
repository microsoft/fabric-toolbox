<#
.SYNOPSIS
Updates the definition or metadata of an Apache Airflow Job in a Microsoft Fabric workspace.

.DESCRIPTION
Updates the content and/or platform-specific metadata of an Apache Airflow Job within a Microsoft Fabric workspace.
Accepts file paths for the job definition and optional platform definition, encodes their contents as Base64, and submits them to the Fabric API.

.PARAMETER WorkspaceId
The unique identifier of the workspace containing the Apache Airflow Job.

.PARAMETER ApacheAirflowJobId
The unique identifier of the Apache Airflow Job to update.

.PARAMETER ApacheAirflowJobPathDefinition
The file path to the Apache Airflow Job definition (e.g., DAG or configuration). The file will be encoded as Base64.

.PARAMETER ApacheAirflowJobPathPlatformDefinition
(Optional) The file path to the platform-specific definition for the Apache Airflow Job. The file will be encoded as Base64.

.EXAMPLE
Update-FabricApacheAirflowJobDefinition -WorkspaceId "12345" -ApacheAirflowJobId "67890" -ApacheAirflowJobPathDefinition "C:\AirflowJobs\JobDef.json"

Updates the Apache Airflow Job with ID 67890 in workspace 12345 using the specified job definition file.

.EXAMPLE
Update-FabricApacheAirflowJobDefinition -WorkspaceId "12345" -ApacheAirflowJobId "67890" -ApacheAirflowJobPathDefinition "C:\AirflowJobs\JobDef.json" -ApacheAirflowJobPathPlatformDefinition "C:\AirflowJobs\Platform.json"

Updates both the job definition and platform-specific metadata for the specified Apache Airflow Job.

.NOTES
- Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
- Validates authentication using `Test-TokenExpired`.
- Encodes file contents as Base64 before sending to the API.
- Provides verbose logging for debugging and error handling.

Author: Tiago Balabuch
#>

function Update-FabricApacheAirflowJobDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobPathPlatformDefinition
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API URL
        $queryParams = if ($ApacheAirflowJobPathPlatformDefinition) {
            @{ updateMetadata = 'true' }
        } else {
            $null
        }

        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ApacheAirflowJobs' -ItemId $ApacheAirflowJobId
        $apiEndpointURI = "$apiEndpointURI/updateDefinition"

        if ($queryParams) {
            $queryString = ($queryParams.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join '&'
            $apiEndpointURI = "$apiEndpointURI`?$queryString"
        }

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($ApacheAirflowJobPathDefinition) {
            $ApacheAirflowJobEncodedContent = Convert-ToBase64 -filePath $ApacheAirflowJobPathDefinition

            if (-not [string]::IsNullOrEmpty($ApacheAirflowJobEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "ApacheAirflowJobV1.json"
                    payload     = $ApacheAirflowJobEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Apache Airflow Job definition." -Level Error
                return $null
            }
        }

        if ($ApacheAirflowJobPathPlatformDefinition) {
            $ApacheAirflowJobEncodedPlatformContent = Convert-ToBase64 -filePath $ApacheAirflowJobPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($ApacheAirflowJobEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $ApacheAirflowJobEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body

        if ($PSCmdlet.ShouldProcess("Apache Airflow Job '$ApacheAirflowJobId' in workspace '$WorkspaceId'", "Update definition/metadata")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Successfully updated the definition for Apache Airflow Job with ID '$ApacheAirflowJobId' in workspace '$WorkspaceId'." -Level Info
            $response
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}
