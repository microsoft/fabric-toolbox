<#
.SYNOPSIS
    Creates a new Apache Airflow Job in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function creates a new Apache Airflow Job within a given Microsoft Fabric workspace by sending a POST request to the Fabric API.
    You can optionally provide a description, a job definition file, and a platform definition file. The function ensures authentication and handles file encoding as required by the API.

.PARAMETER WorkspaceId
    The unique identifier of the Microsoft Fabric workspace where the Apache Airflow Job will be created. This parameter is mandatory.

.PARAMETER ApacheAirflowJobName
    The display name for the new Apache Airflow Job. This parameter is mandatory.

.PARAMETER ApacheAirflowJobDescription
    An optional description for the Apache Airflow Job.

.PARAMETER ApacheAirflowJobPathDefinition
    Optional. Path to the Apache Airflow Job definition JSON file. The file will be read and encoded as Base64.

.PARAMETER ApacheAirflowJobPathPlatformDefinition
    Optional. Path to the platform definition file. The file will be read and encoded as Base64.

.EXAMPLE
    New-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobName "My Airflow Job" -ApacheAirflowJobDescription "ETL pipeline job" -ApacheAirflowJobPathDefinition "C:\jobs\definition.json"

.EXAMPLE
    New-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobName "My Airflow Job" -ApacheAirflowJobPathPlatformDefinition "C:\jobs\.platform"

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders` properties.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricApacheAirflowJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ApacheAirflowJobName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobPathPlatformDefinition
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URL
        $apiEndpointURI = New-FabricAPIUri -Resource 'workspaces' -WorkspaceId $WorkspaceId -Subresource 'ApacheAirflowJobs'

        # Construct the request body
        $body = @{
            displayName = $ApacheAirflowJobName
        }

        if ($ApacheAirflowJobDescription) {
            $body.description = $ApacheAirflowJobDescription
        }

        # Add Apache Airflow Job definition file content if provided
        if ($ApacheAirflowJobPathDefinition) {
            $ApacheAirflowJobEncodedContent = Convert-ToBase64 -filePath $ApacheAirflowJobPathDefinition

            if (-not [string]::IsNullOrEmpty($ApacheAirflowJobEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

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
        # Add platform definition file content if provided
        if ($ApacheAirflowJobPathPlatformDefinition) {
            $ApacheAirflowJobEncodedPlatformContent = Convert-ToBase64 -filePath $ApacheAirflowJobPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($ApacheAirflowJobEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

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

        if ($PSCmdlet.ShouldProcess("workspace '$WorkspaceId'", "Create Apache Airflow Job '$ApacheAirflowJobName'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Apache Airflow Job created successfully!" -Level Host
            $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}
