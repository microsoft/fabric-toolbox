<#
.SYNOPSIS
Creates a new Fabric domain.

.DESCRIPTION
The `Add-FabricDomain` function creates a new domain in Microsoft Fabric by making a POST request to the relevant API endpoint.

.PARAMETER DomainName
The name of the domain to be created. Must only contain alphanumeric characters, underscores, and spaces.

.PARAMETER DomainDescription
A description of the domain to be created.

.PARAMETER ParentDomainId
(Optional) The ID of the parent domain, if applicable.

.EXAMPLE
Add-FabricDomain -DomainName "Finance" -DomainDescription "Finance data domain" -ParentDomainId "12345"

Creates a "Finance" domain under the parent domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricDomain {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DomainName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentDomainId
    )

    try {
        # Validate authentication token before proceeding
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = New-FabricAPIUri -Segments @('admin', 'domains')
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DomainName
        }

        if ($DomainDescription) {
            $body.description = $DomainDescription
        }

        if ($ParentDomainId) {
            $body.parentDomainId = $ParentDomainId
        }

        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainName, 'Create Fabric domain')) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $script:FabricAuthContext.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Domain created successfully!" -Level Host
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create domain. Error: $errorDetails" -Level Error
    }
}
