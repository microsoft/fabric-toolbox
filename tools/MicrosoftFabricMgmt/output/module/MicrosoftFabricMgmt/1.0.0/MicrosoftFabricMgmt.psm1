#Region '.\prefix.ps1' -1

# ============================================================================
# Module Initialization
# ============================================================================

# Remove conflicting modules from the session
Write-Verbose "Removing conflicting modules from session"
if (Get-Module -Name FabricTools -ErrorAction SilentlyContinue) {
    Remove-Module -Name FabricTools -Force -ErrorAction SilentlyContinue
}

# ============================================================================
# PSFramework Configuration Initialization
# ============================================================================

# API Configuration
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.BaseUrl' `
    -Value 'https://api.fabric.microsoft.com/v1' `
    -Initialize -Validation string `
    -Description 'Base URL for Microsoft Fabric API endpoints'

Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.ResourceUrl' `
    -Value 'https://analysis.windows.net/powerbi/api' `
    -Initialize -Validation string `
    -Description 'Azure resource URL for token acquisition'

Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.TimeoutSeconds' `
    -Value 30 `
    -Initialize -Validation integerpositive `
    -Description 'Default timeout for API requests in seconds'

Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.RetryMaxAttempts' `
    -Value 3 `
    -Initialize -Validation integerpositive `
    -Description 'Maximum retry attempts for transient API failures'

Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.RetryBackoffMultiplier' `
    -Value 2 `
    -Initialize -Validation integerpositive `
    -Description 'Exponential backoff multiplier for retry attempts'

# Authentication Configuration
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Auth.TokenRefreshThresholdSeconds' `
    -Value 300 `
    -Initialize -Validation integerpositive `
    -Description 'Seconds before token expiry to trigger automatic refresh (5 minutes default)'

# JSON Configuration
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Json.DefaultDepth' `
    -Value 10 `
    -Initialize -Validation integerpositive `
    -Description 'Default depth for ConvertTo-Json operations'

# ============================================================================
# Module-Scoped Authentication Context
# ============================================================================

# Initialize module-scoped authentication state
# This replaces the global $FabricConfig variable (BREAKING CHANGE)
$script:FabricAuthContext = @{
    BaseUrl         = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.BaseUrl'
    ResourceUrl     = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.ResourceUrl'
    FabricHeaders   = $null
    TokenExpiresOn  = $null
    TenantId        = $null
    AuthMethod      = $null  # 'UserPrincipal', 'ServicePrincipal', 'ManagedIdentity'
    ClientId        = $null  # For user-assigned managed identity
}

Write-PSFMessage -Level Verbose -Message "MicrosoftFabricMgmt module initialized with PSFramework configuration"
Write-PSFMessage -Level Debug -Message "Base URL: $($script:FabricAuthContext.BaseUrl)"

# ============================================================================
# Module Cleanup Handler
# ============================================================================

# Register cleanup handler to remove sensitive data when module is unloaded
$ExecutionContext.SessionState.Module.OnRemove = {
    Write-PSFMessage -Level Verbose -Message "Cleaning up MicrosoftFabricMgmt module state"

    # Clear sensitive authentication data
    if ($script:FabricAuthContext.FabricHeaders) {
        $script:FabricAuthContext.FabricHeaders.Clear()
    }
    $script:FabricAuthContext = $null

    # Force garbage collection for security
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()

    Write-PSFMessage -Level Debug -Message "MicrosoftFabricMgmt module cleanup completed"
}

# ============================================================================
# Breaking Change Notice
# ============================================================================

Write-PSFMessage -Level Important -Message @"
MicrosoftFabricMgmt v1.0.0 - BREAKING CHANGES:
- The global `$FabricConfig variable has been removed
- Module now uses internal state management via PSFramework
- Authentication still works via Set-FabricApiHeaders
- See BREAKING-CHANGES.md for migration guide
"@
#EndRegion '.\prefix.ps1' 104
#Region '.\Private\Build-FabricAPIUri.ps1' -1

<#
.SYNOPSIS
    Constructs a properly formatted Fabric API endpoint URI.

.DESCRIPTION
    This helper function standardizes URI construction across all 244 public functions.
    It handles workspace IDs, item IDs, subresources, and query parameters consistently.

.PARAMETER Resource
    The base resource type (e.g., 'workspaces', 'capacities', 'items').

.PARAMETER WorkspaceId
    Optional workspace GUID. If provided, will be included in the URI path.

.PARAMETER ItemId
    Optional item GUID. If provided, will be included in the URI path after workspace.

.PARAMETER Subresource
    Optional subresource path (e.g., 'users', 'roleAssignments', 'definition').

.PARAMETER QueryParameters
    Optional hashtable of query parameters to append to the URI.

.OUTPUTS
    System.String
    Returns the fully constructed API endpoint URI.

.EXAMPLE
    Build-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -Subresource 'lakehouses'

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}/lakehouses

.EXAMPLE
    Build-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -Subresource 'items' -ItemId $itemId

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}/items/{itemId}

.EXAMPLE
    $query = @{ updateMetadata = 'true'; force = 'false' }
    Build-FabricAPIUri -Resource 'workspaces' -WorkspaceId $wsId -QueryParameters $query

    Returns: https://api.fabric.microsoft.com/v1/workspaces/{wsId}?updateMetadata=true&force=false

.NOTES
    Uses PSFramework configuration for the base URL.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Build-FabricAPIUri {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Resource,

        [Parameter()]
        [string]$WorkspaceId,

        [Parameter()]
        [string]$ItemId,

        [Parameter()]
        [string]$Subresource,

        [Parameter()]
        [hashtable]$QueryParameters
    )

    # Get base URL from module-scoped auth context
    $baseUrl = $script:FabricAuthContext.BaseUrl

    # Start building the URI
    $uriParts = [System.Collections.Generic.List[string]]::new()
    $uriParts.Add($baseUrl)
    $uriParts.Add($Resource)

    # Add workspace ID if provided
    if ($WorkspaceId) {
        $uriParts.Add($WorkspaceId)
    }

    # Add subresource if provided
    if ($Subresource) {
        $uriParts.Add($Subresource)
    }

    # Add item ID if provided (typically comes after subresource)
    if ($ItemId) {
        $uriParts.Add($ItemId)
    }

    # Join parts with forward slashes
    $uri = $uriParts -join '/'

    # Add query parameters if provided
    if ($QueryParameters -and $QueryParameters.Count -gt 0) {
        $queryString = ($QueryParameters.GetEnumerator() | ForEach-Object {
            $key = [System.Uri]::EscapeDataString($_.Key)
            $value = [System.Uri]::EscapeDataString($_.Value.ToString())
            "$key=$value"
        }) -join '&'

        $uri = "$uri`?$queryString"
    }

    Write-FabricLog -Message "Constructed API URI: $uri" -Level Debug
    return $uri
}
#EndRegion '.\Private\Build-FabricAPIUri.ps1' 112
#Region '.\Private\Convert-FabricRequestBody.ps1' -1

<#
.SYNOPSIS
    Converts an object to JSON with consistent depth settings.

.DESCRIPTION
    This helper function standardizes JSON conversion across all public functions
    that send request bodies to the Fabric API. It uses the module's configured
    default depth to ensure consistent serialization.

.PARAMETER InputObject
    The object to convert to JSON.

.PARAMETER Depth
    Optional depth for JSON conversion. If not specified, uses the module's
    configured default depth from PSFramework configuration.

.OUTPUTS
    System.String
    Returns the JSON string representation of the input object.

.EXAMPLE
    $body = @{ displayName = "My Lakehouse"; description = "Test" }
    Convert-FabricRequestBody -InputObject $body

    Converts the hashtable to JSON with the default depth.

.EXAMPLE
    Convert-FabricRequestBody -InputObject $complexObject -Depth 15

    Converts the object to JSON with a custom depth of 15.

.NOTES
    This function eliminates inconsistent ConvertTo-Json depth usage across functions
    (which currently ranges from none specified to 10).

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Convert-FabricRequestBody {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory = $true)]
        [object]$InputObject,

        [Parameter()]
        [int]$Depth
    )

    # Use provided depth or get from PSFramework configuration
    if (-not $Depth) {
        $Depth = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Json.DefaultDepth' -Fallback 10
    }

    Write-FabricLog -Message "Converting request body to JSON with depth: $Depth" -Level Debug

    try {
        $json = $InputObject | ConvertTo-Json -Depth $Depth -Compress

        # Log the JSON for debugging (truncate if very long)
        $logJson = if ($json.Length -gt 500) {
            "$($json.Substring(0, 500))... (truncated, length: $($json.Length))"
        } else {
            $json
        }
        Write-FabricLog -Message "Request body JSON: $logJson" -Level Debug

        return $json
    }
    catch {
        Write-FabricLog -Message "Failed to convert request body to JSON" -Level Error -ErrorRecord $_
        throw
    }
}
#EndRegion '.\Private\Convert-FabricRequestBody.ps1' 76
#Region '.\Private\Get-FileDefinitionPart.ps1' -1

<#
.SYNOPSIS
    Retrieves all files from a specified directory recursively, encodes their contents to Base64, and returns a structured object containing relative paths and encoded payloads.

.DESCRIPTION
    This function scans a given source directory recursively, encodes each file's content into Base64 format, and constructs an array of objects. Each object includes the relative file path, the encoded payload, and a payload type indicator. The resulting structured object is suitable for JSON serialization or further processing.

.PARAMETER sourceDirectory
    The path to the directory containing files to process. This parameter is mandatory and cannot be null or empty.

.OUTPUTS
    Hashtable containing a single key 'parts', which holds an array of objects. Each object includes:
        - path: Relative path of the file.
        - payload: Base64 encoded content of the file.
        - payloadType: Indicates the type of payload, set as "InlineBase64".

.EXAMPLE
    Get-FileDefinitionPart -sourceDirectory "C:\MyFiles"

    Retrieves all files from "C:\MyFiles", encodes their contents to Base64, and returns the structured result.

.NOTES
    Requires the Convert-ToBase64 helper function to be available in the session.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Get-FileDefinitionPart {
    [CmdletBinding()]
    [OutputType([hashtable])]
    [Alias("Get-FileDefinitionParts")]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$sourceDirectory
    )

    try {
        # Validate if the provided directory exists
        if (-Not (Test-Path $sourceDirectory)) {
            Write-FabricLog -Message "The specified source directory does not exist: $sourceDirectory" -Level Error
            throw
        }

        Write-FabricLog -Message "Get all files from the directory recursively" -Level Debug
        # Retrieve all files recursively from the source directory
        $fileList = Get-ChildItem -Path $sourceDirectory -File -Recurse

        # Initialize a generic list for better performance when adding multiple items
        $partsList = [System.Collections.Generic.List[object]]::new()

        Write-FabricLog -Message "Loop through the files to create parts dynamically" -Level Debug
        foreach ($file in $fileList) {
            # Calculate the relative path efficiently and normalize path separators
            $relativePath = $file.FullName.Substring($sourceDirectory.Length + 1).Replace('\', '/')
            Write-FabricLog -Message "File found: $relativePath" -Level Debug

            Write-FabricLog -Message "Starting encode to base64" -Level Debug
            # Encode file content to Base64 using the helper function
            $base64Content = Convert-ToBase64 -filePath $file.FullName

            Write-FabricLog -Message "Adding part to json object" -Level Debug
            # Add the file details to the parts list
            $partsList.Add(@{
                path        = $relativePath
                payload     = $base64Content
                payloadType = "InlineBase64"
            })
        }

        Write-FabricLog -Message "Loop through the files finished" -Level Debug
        # Return the structured result as a hashtable with an array of parts
        return @{ parts = $partsList.ToArray() }
    }
    catch {
        # Capture and log detailed error information
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "An error occurred while getting file definition parts: $errorDetails" -Level Error -ErrorRecord $_
        throw "An error occurred while encoding to Base64: $_"
    }
}
#EndRegion '.\Private\Get-FileDefinitionPart.ps1' 83
#Region '.\Private\Invoke-FabricAuthCheck.ps1' -1

<#
.SYNOPSIS
    Validates authentication token and optionally triggers automatic refresh.

.DESCRIPTION
    This helper function eliminates the repetitive 3-line authentication validation pattern
    used across all 244 public functions. It checks if the authentication token is valid
    and can optionally attempt automatic refresh for Managed Identity authentication.

.PARAMETER ThrowOnFailure
    If specified, throws an UnauthorizedAccessException when the token is expired.
    If not specified, returns $false when the token is expired.

.OUTPUTS
    System.Boolean
    Returns $true if authentication is valid, $false if expired (when -ThrowOnFailure is not used).

.EXAMPLE
    Invoke-FabricAuthCheck -ThrowOnFailure

    Validates authentication and throws an exception if the token is expired.

.EXAMPLE
    if (-not (Invoke-FabricAuthCheck)) {
        Write-Warning "Authentication expired"
        return
    }

    Validates authentication and handles expiration gracefully.

.NOTES
    This function wraps Test-TokenExpired and provides consistent error handling
    across all module functions.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Invoke-FabricAuthCheck {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter()]
        [switch]$ThrowOnFailure
    )

    Write-FabricLog -Message "Validating authentication token" -Level Debug

    # Test-TokenExpired with AutoRefresh will attempt to refresh if < 5 minutes remaining
    $isExpired = Test-TokenExpired -AutoRefresh

    if ($isExpired) {
        $message = "Authentication token has expired. Please run Set-FabricApiHeaders to authenticate."
        Write-FabricLog -Message $message -Level Error

        if ($ThrowOnFailure) {
            # Use New-Object for PowerShell 5.1 compatibility
            throw (New-Object System.UnauthorizedAccessException $message)
        }

        return $false
    }

    Write-FabricLog -Message "Authentication token is valid" -Level Debug
    return $true
}
#EndRegion '.\Private\Invoke-FabricAuthCheck.ps1' 67
#Region '.\Private\Invoke-TokenRefresh.ps1' -1

<#
.SYNOPSIS
Automatically refreshes the Fabric API authentication token.

.DESCRIPTION
The `Invoke-TokenRefresh` function attempts to refresh the authentication token using the stored authentication method and credentials. Supports Service Principal and Managed Identity authentication methods. User Principal authentication requires interactive login and cannot be automatically refreshed.

.EXAMPLE
Invoke-TokenRefresh

Attempts to refresh the token using the stored authentication context.

.OUTPUTS
System.Boolean
Returns $true if refresh succeeded, $false if refresh failed.

.NOTES
API Endpoint: N/A (Authentication only)
Permissions Required: Appropriate Azure AD permissions for chosen auth method
Authentication: This IS the authentication function

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07

BREAKING CHANGE: Uses internal $script:FabricAuthContext instead of global $FabricConfig.
#>
function Invoke-TokenRefresh {
    [CmdletBinding()]
    [OutputType([System.Boolean])]
    param ()

    try {
        Write-PSFMessage -Level Verbose -Message "Attempting automatic token refresh"

        # Validate that we have authentication context
        if (-not $script:FabricAuthContext.AuthMethod) {
            Write-PSFMessage -Level Warning -Message "No authentication method stored. Cannot refresh token automatically."
            return $false
        }

        $authMethod = $script:FabricAuthContext.AuthMethod

        # User Principal requires interactive login - cannot auto-refresh
        if ($authMethod -eq 'UserPrincipal') {
            Write-PSFMessage -Level Warning -Message "User Principal authentication requires interactive login. Please run Set-FabricApiHeaders with -TenantId parameter."
            return $false
        }

        Write-PSFMessage -Level Debug -Message "Refreshing token using $authMethod method"

        # Refresh based on authentication method
        switch ($authMethod) {
            'ServicePrincipal' {
                # Service Principal requires stored credentials - cannot auto-refresh
                # This would require storing the AppSecret which is a security risk
                Write-PSFMessage -Level Warning -Message "Service Principal authentication cannot be automatically refreshed. Please run Set-FabricApiHeaders again with credentials."
                return $false
            }
            'ManagedIdentity' {
                Write-PSFMessage -Level Debug -Message "Refreshing Managed Identity token"

                # Retrieve the access token
                $resourceUrl = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.ResourceUrl'

                $fabricToken = Get-AzAccessToken -AsSecureString -ResourceUrl $resourceUrl -ErrorAction Stop -WarningAction SilentlyContinue

                # Convert secure token to plain text (PS 5.1 compatible)
                Write-PSFMessage -Level Debug -Message "Extracting token from SecureString"
                $plainTokenPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($fabricToken.Token)
                try {
                    $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($plainTokenPtr)

                    # Update module-scoped authentication context
                    Write-PSFMessage -Level Debug -Message "Updating module authentication context with refreshed token"

                    $script:FabricAuthContext.FabricHeaders = @{
                        'Content-Type'  = 'application/json; charset=utf-8'
                        'Authorization' = "Bearer $plainToken"
                    }
                    $script:FabricAuthContext.TokenExpiresOn = $fabricToken.ExpiresOn.ToString('o')  # ISO 8601 format

                    # Calculate time until expiration
                    $expiresIn = ($fabricToken.ExpiresOn - [DateTimeOffset]::Now).TotalMinutes
                    Write-PSFMessage -Level Verbose -Message "Token refreshed successfully. New token expires in $([Math]::Round($expiresIn, 1)) minutes."
                    Write-PSFMessage -Level Debug -Message "Token expiration: $($fabricToken.ExpiresOn.ToString('u'))"

                    return $true
                }
                finally {
                    # Ensure secure memory cleanup
                    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($plainTokenPtr)
                }
            }
        }

        return $false
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-PSFMessage -Level Error -Message "Failed to refresh authentication token: $errorDetails" -ErrorRecord $_
        return $false
    }
}
#EndRegion '.\Private\Invoke-TokenRefresh.ps1' 105
#Region '.\Private\Select-FabricResource.ps1' -1

<#
.SYNOPSIS
    Filters Fabric API resources by ID, DisplayName, or returns all items.

.DESCRIPTION
    This helper function eliminates duplicate filtering logic across all Get-* functions.
    It handles mutual exclusivity of ID vs DisplayName filtering and provides consistent
    warning messages when resources are not found.

.PARAMETER InputObject
    The collection of resources to filter (typically from an API response).

.PARAMETER Id
    Optional resource ID (GUID) to filter by. Mutually exclusive with DisplayName.

.PARAMETER DisplayName
    Optional display name to filter by. Mutually exclusive with Id.

.PARAMETER ResourceType
    The type of resource being filtered (e.g., 'Lakehouse', 'Workspace').
    Used for consistent warning messages.

.OUTPUTS
    System.Object[]
    Returns filtered resources or all resources if no filter is specified.

.EXAMPLE
    Select-FabricResource -InputObject $items -Id $lakehouseId -ResourceType 'Lakehouse'

    Returns the lakehouse with the specified ID, or shows a warning if not found.

.EXAMPLE
    Select-FabricResource -InputObject $items -DisplayName 'MyLakehouse' -ResourceType 'Lakehouse'

    Returns lakehouse(s) matching the display name, or shows a warning if not found.

.EXAMPLE
    Select-FabricResource -InputObject $items -ResourceType 'Lakehouse'

    Returns all lakehouses (no filtering).

.NOTES
    This function saves approximately 20 lines per Get-* function × ~50 functions = ~1,000 lines.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 1.0.0
    Last Updated: 2026-01-07
#>
function Select-FabricResource {
    [CmdletBinding()]
    [OutputType([object[]])]
    param(
        [Parameter(Mandatory = $true)]
        [AllowEmptyCollection()]
        [object[]]$InputObject,

        [Parameter()]
        [string]$Id,

        [Parameter()]
        [string]$DisplayName,

        [Parameter(Mandatory = $true)]
        [string]$ResourceType
    )

    # If no input, return empty
    if (-not $InputObject -or $InputObject.Count -eq 0) {
        Write-FabricLog -Message "No $ResourceType resources found in input" -Level Debug
        return @()
    }

    # No filters - return all
    if (-not $Id -and -not $DisplayName) {
        Write-FabricLog -Message "Returning all $($InputObject.Count) $ResourceType resource(s)" -Level Debug
        return $InputObject
    }

    # Filter by ID
    if ($Id) {
        Write-FabricLog -Message "Filtering $ResourceType by ID: $Id" -Level Debug

        $filtered = $InputObject | Where-Object { $_.id -eq $Id }

        if (-not $filtered) {
            Write-FabricLog -Message "$ResourceType with ID '$Id' not found" -Level Warning
        } else {
            Write-FabricLog -Message "Found $ResourceType with ID: $Id" -Level Debug
        }

        return $filtered
    }

    # Filter by DisplayName
    if ($DisplayName) {
        Write-FabricLog -Message "Filtering $ResourceType by DisplayName: $DisplayName" -Level Debug

        $filtered = $InputObject | Where-Object { $_.displayName -eq $DisplayName }

        if (-not $filtered) {
            Write-FabricLog -Message "$ResourceType with DisplayName '$DisplayName' not found" -Level Warning
        } else {
            Write-FabricLog -Message "Found $($filtered.Count) $ResourceType resource(s) with DisplayName: $DisplayName" -Level Debug
        }

        return $filtered
    }

    # Fallback (should not reach here)
    return $InputObject
}
#EndRegion '.\Private\Select-FabricResource.ps1' 112
#Region '.\Private\Test-TokenExpired.ps1' -1

<#
.SYNOPSIS
Checks if the Fabric authentication token is expired or nearing expiration.

.DESCRIPTION
The `Test-TokenExpired` function checks the expiration status of the Fabric authentication token stored in the module-scoped `$script:FabricAuthContext` variable. Optionally attempts automatic token refresh when the token is expired or nearing expiration (< 5 minutes remaining).

.PARAMETER AutoRefresh
If specified, attempts to automatically refresh the token when it is expired or nearing expiration. Only works for Managed Identity authentication.

.EXAMPLE
Test-TokenExpired

Checks if the token is expired and returns $true if expired, $false if valid.

.EXAMPLE
Test-TokenExpired -AutoRefresh

Checks if the token is expired and attempts automatic refresh if needed.

.OUTPUTS
System.Boolean
Returns $true if the token is expired or missing, $false if valid.

.NOTES
API Endpoint: N/A (Authentication validation only)
Permissions Required: None (validation only)
Authentication: Validates existing authentication

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07

BREAKING CHANGE: Uses internal $script:FabricAuthContext instead of global $FabricConfig.
Now returns boolean instead of throwing exceptions for better error handling.
#>
function Test-TokenExpired {
    [CmdletBinding()]
    [OutputType([System.Boolean])]
    param (
        [Parameter(Mandatory = $false)]
        [switch]$AutoRefresh
    )

    try {
        Write-PSFMessage -Level Debug -Message "Checking authentication token expiration status"

        # Check if authentication context exists
        if (-not $script:FabricAuthContext) {
            Write-PSFMessage -Level Warning -Message "Authentication context not initialized. Please run Set-FabricApiHeaders to authenticate."
            return $true  # Token is effectively expired/missing
        }

        # Ensure required properties have valid values
        if ([string]::IsNullOrWhiteSpace($script:FabricAuthContext.TenantId) -or
            [string]::IsNullOrWhiteSpace($script:FabricAuthContext.TokenExpiresOn)) {
            Write-PSFMessage -Level Warning -Message "Token details are missing. Please run Set-FabricApiHeaders to configure authentication."
            return $true  # Token is effectively expired/missing
        }

        # Convert the TokenExpiresOn value to a DateTimeOffset object
        $tokenExpiryDate = [DateTimeOffset]::Parse($script:FabricAuthContext.TokenExpiresOn)

        # Get the token refresh threshold from configuration (default 5 minutes)
        $refreshThresholdSeconds = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Auth.TokenRefreshThresholdSeconds'
        $refreshThreshold = [DateTimeOffset]::Now.AddSeconds($refreshThresholdSeconds)

        # Check if the token is expired
        if ($tokenExpiryDate -le [DateTimeOffset]::Now) {
            Write-PSFMessage -Level Warning -Message "Authentication token has expired. Please run Set-FabricApiHeaders to refresh your session."

            # Attempt auto-refresh if requested
            if ($AutoRefresh.IsPresent) {
                Write-PSFMessage -Level Verbose -Message "Attempting automatic token refresh"
                $refreshed = Invoke-TokenRefresh
                if ($refreshed) {
                    Write-PSFMessage -Level Host -Message "Token automatically refreshed successfully"
                    return $false  # Token is now valid
                }
                else {
                    Write-PSFMessage -Level Warning -Message "Automatic token refresh failed. Please run Set-FabricApiHeaders to re-authenticate."
                    return $true  # Token is still expired
                }
            }

            return $true  # Token is expired
        }

        # Check if token is nearing expiration (proactive refresh)
        if ($tokenExpiryDate -le $refreshThreshold) {
            $minutesRemaining = ($tokenExpiryDate - [DateTimeOffset]::Now).TotalMinutes
            Write-PSFMessage -Level Verbose -Message "Token expires in $([Math]::Round($minutesRemaining, 1)) minutes. Consider refreshing soon."

            # Attempt proactive auto-refresh if requested
            if ($AutoRefresh.IsPresent) {
                Write-PSFMessage -Level Verbose -Message "Token nearing expiration. Attempting proactive refresh."
                $refreshed = Invoke-TokenRefresh
                if ($refreshed) {
                    Write-PSFMessage -Level Debug -Message "Token proactively refreshed successfully"
                    return $false  # Token is now valid
                }
                else {
                    Write-PSFMessage -Level Debug -Message "Proactive token refresh not available. Token still valid for $([Math]::Round($minutesRemaining, 1)) minutes."
                    return $false  # Token is still valid even though refresh failed
                }
            }
        }

        # Token is valid
        $minutesRemaining = ($tokenExpiryDate - [DateTimeOffset]::Now).TotalMinutes
        Write-PSFMessage -Level Debug -Message "Token is valid. Expires in $([Math]::Round($minutesRemaining, 1)) minutes at $($tokenExpiryDate.ToString('u'))"
        return $false  # Token is valid
    }
    catch [System.FormatException] {
        Write-PSFMessage -Level Error -Message "Invalid TokenExpiresOn format in authentication context. Expected ISO 8601 datetime string." -ErrorRecord $_
        return $true  # Treat as expired due to invalid format
    }
    catch {
        # Capture and log error details
        Write-PSFMessage -Level Error -Message "Unexpected error checking token expiration: $($_.Exception.Message)" -ErrorRecord $_
        return $true  # Treat as expired due to error
    }
}
#EndRegion '.\Private\Test-TokenExpired.ps1' 124
#Region '.\Private\Write-FabricLog.ps1' -1

<#
.SYNOPSIS
Module-specific logging wrapper around PSFramework's Write-PSFMessage.

.DESCRIPTION
The `Write-FabricLog` function provides a simplified logging interface for the MicrosoftFabricMgmt module.
It wraps PSFramework's Write-PSFMessage with sensible defaults and automatic function name detection.

.PARAMETER Message
The message to log.

.PARAMETER Level
The log level. Maps to PSFramework levels:
- Host: Informational messages (default)
- Debug: Debug information
- Verbose: Verbose details
- Warning: Warning messages
- Error: Error messages
- Critical: Critical errors

.PARAMETER ErrorRecord
Optional error record to attach (automatically attached for Error level).

.PARAMETER Data
Optional structured data to include with the log message.

.PARAMETER Tag
Optional tags for filtering log messages.

.EXAMPLE
Write-FabricLog -Message "Processing workspace" -Level Host

Logs an informational message.

.EXAMPLE
Write-FabricLog -Message "API call failed" -Level Error -ErrorRecord $_

Logs an error with the error record attached.

.EXAMPLE
Write-FabricLog -Message "Workspace created" -Level Host -Data @{ WorkspaceId = $id }

Logs a message with structured data.

.OUTPUTS
None. Writes to PSFramework logging system.

.NOTES
This is an internal helper function for consistent logging throughout the module.

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07
#>
function Write-FabricLog {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [Parameter(Mandatory = $false)]
        [ValidateSet('Host', 'Debug', 'Verbose', 'Warning', 'Error', 'Critical')]
        [string]$Level = 'Host',

        [Parameter(Mandatory = $false)]
        [System.Management.Automation.ErrorRecord]$ErrorRecord,

        [Parameter(Mandatory = $false)]
        [hashtable]$Data,

        [Parameter(Mandatory = $false)]
        [string[]]$Tag
    )

    # Get calling function name for context (2 levels up: Write-FabricLog -> caller)
    $callerInfo = (Get-PSCallStack)[1]
    $functionName = if ($callerInfo.Command) { $callerInfo.Command } else { '<ScriptBlock>' }

    # Build PSFramework message parameters
    $psfParams = @{
        Message      = $Message
        Level        = $Level
        FunctionName = $functionName
        ModuleName   = 'MicrosoftFabricMgmt'
    }

    # Add error record if provided or if level is Error
    if ($ErrorRecord) {
        $psfParams.ErrorRecord = $ErrorRecord
    }

    # Add structured data if provided
    if ($Data) {
        $psfParams.Data = $Data
    }

    # Add tags if provided
    if ($Tag) {
        $psfParams.Tag = $Tag
    }

    # Write to PSFramework logging system
    Write-PSFMessage @psfParams
}
#EndRegion '.\Private\Write-FabricLog.ps1' 105
#Region '.\Public\Apache Airflow Job\Get-FabricApacheAirflowJob.ps1' -1

<#
.SYNOPSIS
    Retrieves Apache Airflow Job details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets one or more Apache Airflow Job resources from a Microsoft Fabric workspace.
    You can filter by job ID or job name. Handles authentication, constructs the API endpoint,
    sends the request, and returns the matching job(s).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Apache Airflow Job(s). This parameter is mandatory.

.PARAMETER ApacheAirflowJobId
    (Optional) The unique identifier of the Apache Airflow Job to retrieve.

.PARAMETER ApacheAirflowJobName
    (Optional) The display name of the Apache Airflow Job to retrieve.

.EXAMPLE
    Get-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobId "job-67890"
    Retrieves the Apache Airflow Job with ID "job-67890" from the specified workspace.

.EXAMPLE
    Get-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobName "My Airflow Job"
    Retrieves the Apache Airflow Job named "My Airflow Job" from the specified workspace.

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.
    - Returns the matching job(s) or $null if not found.

    Author: Tiago Balabuch
#>
function Get-FabricApacheAirflowJob {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ApacheAirflowJobName
    )
    try {
        # Validate input parameters
        if ($ApacheAirflowJobId -and $ApacheAirflowJobName) {
            Write-FabricLog -Message "Specify only one parameter: either 'ApacheAirflowJobId' or 'ApacheAirflowJobName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ApacheAirflowJobId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ApacheAirflowJobId }, 'First')
        }
        elseif ($ApacheAirflowJobName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ApacheAirflowJobName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Apache Airflow Job\Get-FabricApacheAirflowJob.ps1' 108
#Region '.\Public\Apache Airflow Job\Get-FabricApacheAirflowJobDefinition.ps1' -1

<#
.SYNOPSIS
Retrieves the definition of a Apache Airflow Job from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the Apache Airflow Job's content or metadata from a workspace.
It supports both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the Apache Airflow Job definition is to be retrieved.

.PARAMETER ApacheAirflowJobId
(Mandatory) The unique identifier of the Apache Airflow Job whose definition needs to be retrieved.

.PARAMETER ApacheAirflowJobFormat
(Optional) Specifies the format of the Apache Airflow Job definition. For example, 'json' or 'xml'.

.EXAMPLE
Get-FabricApacheAirflowJobDefinition -WorkspaceId "12345" -ApacheAirflowJobId "67890"

Retrieves the definition of the Apache Airflow Job with ID `67890` from the workspace with ID `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
- Logs detailed information for debugging purposes.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricApacheAirflowJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ApacheAirflowJobId

        # Append the format query parameter if specified by the user.
        if ($ApacheAirflowJobFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $ApacheAirflowJobFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Apache Airflow Job definition. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Apache Airflow Job\Get-FabricApacheAirflowJobDefinition.ps1' 78
#Region '.\Public\Apache Airflow Job\New-FabricApacheAirflowJob.ps1' -1

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
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

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

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("workspace '$WorkspaceId'", "Create Apache Airflow Job '$ApacheAirflowJobName'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Apache Airflow Job created successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Apache Airflow Job\New-FabricApacheAirflowJob.ps1' 153
#Region '.\Public\Apache Airflow Job\Remove-FabricApacheAirflowJob.ps1' -1

<#
.SYNOPSIS
    Removes an Apache Airflow Job from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function deletes an Apache Airflow Job from a Microsoft Fabric workspace by performing a DELETE request
    to the Fabric API. It requires the workspace and job identifiers, validates authentication, and handles errors.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Apache Airflow Job to be removed.

.PARAMETER ApacheAirflowJobId
    The unique identifier of the Apache Airflow Job to remove.

.EXAMPLE
    Remove-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobId "airflowjob-67890"
    Removes the Apache Airflow Job with ID "airflowjob-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the `$FabricConfig` global variable, which must include `BaseUrl` and `FabricHeaders`.
    - Validates authentication by calling `Test-TokenExpired` before making the API request.
    - Author: Tiago Balabuch
#>
function Remove-FabricApacheAirflowJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ApacheAirflowJobId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("Apache Airflow Job '$ApacheAirflowJobId' in workspace '$WorkspaceId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Apache Airflow Job '$ApacheAirflowJobId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Apache Airflow Job '$ApacheAirflowJobId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Apache Airflow Job\Remove-FabricApacheAirflowJob.ps1' 66
#Region '.\Public\Apache Airflow Job\Update-FabricApacheAirflowJob.ps1' -1

<#
.SYNOPSIS
    Updates an existing Apache Airflow Job in a Microsoft Fabric workspace.

.DESCRIPTION
    Updates the display name and optionally the description of an Apache Airflow Job within a specified Microsoft Fabric workspace.
    This function sends a PATCH request to the Microsoft Fabric API and requires a valid authentication token.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Apache Airflow Job.

.PARAMETER ApacheAirflowJobId
    The unique identifier of the Apache Airflow Job to update.

.PARAMETER ApacheAirflowJobName
    The new display name for the Apache Airflow Job.

.PARAMETER ApacheAirflowJobDescription
    An optional new description for the Apache Airflow Job.

.EXAMPLE
    Update-FabricApacheAirflowJob -WorkspaceId "workspace-12345" -ApacheAirflowJobId "airflowjob-67890" -ApacheAirflowJobName "Updated Job Name" -ApacheAirflowJobDescription "Updated description"
    Updates the specified Apache Airflow Job with a new name and description.

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders` properties.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.
    - Author: Tiago Balabuch
#>
function Update-FabricApacheAirflowJob {
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
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ApacheAirflowJobName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ApacheAirflowJobDescription
    )
    try {
        # Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ApacheAirflowJobId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $ApacheAirflowJobName
        }

        if ($ApacheAirflowJobDescription) {
            $body.description = $ApacheAirflowJobDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Apache Airflow Job '$ApacheAirflowJobId' in workspace '$WorkspaceId'", "Update properties")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Apache Airflow Job '$ApacheAirflowJobName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Apache Airflow Job\Update-FabricApacheAirflowJob.ps1' 94
#Region '.\Public\Apache Airflow Job\Update-FabricApacheAirflowJobDefinition.ps1' -1

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
        # Step 1: Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointURI = "{0}/workspaces/{1}/ApacheAirflowJobs/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ApacheAirflowJobId

        if ($ApacheAirflowJobPathPlatformDefinition) {
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

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

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Apache Airflow Job '$ApacheAirflowJobId' in workspace '$WorkspaceId'", "Update definition/metadata")) {
            # Step 4: Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Successfully updated the definition for Apache Airflow Job with ID '$ApacheAirflowJobId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Apache Airflow Job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Apache Airflow Job\Update-FabricApacheAirflowJobDefinition.ps1' 136
#Region '.\Public\Capacity\Get-FabricCapacity.ps1' -1


<#
.SYNOPSIS
    Retrieves capacity details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves capacity details from a specified workspace using either the provided CapacityId or CapacityName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER CapacityId
    The unique identifier of the capacity to retrieve. This parameter is optional.

.PARAMETER CapacityName
    The name of the capacity to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricCapacity -CapacityId "capacity-12345"
    This example retrieves the capacity details for the capacity with ID "capacity-12345".

.EXAMPLE
     Get-FabricCapacity -CapacityName "MyCapacity"
    This example retrieves the capacity details for the capacity named "MyCapacity".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricCapacity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityName
    )
    try {
        # Validate input parameters
        if ($CapacityId -and $CapacityName) {
            Write-FabricLog -Message "Specify only one parameter: either 'CapacityId' or 'CapacityName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/capacities" -f $FabricConfig.BaseUrl
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($CapacityId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $CapacityId }, 'First')
        }
        elseif ($CapacityName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $CapacityName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve capacity. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Capacity\Get-FabricCapacity.ps1' 98
#Region '.\Public\Connections\Add-FabricConnectionRoleAssignment.ps1' -1

<#
.SYNOPSIS
Assigns a specified role to a principal for a Fabric Connection.

.DESCRIPTION
The Add-FabricConnectionRoleAssignment function assigns a role (User, UserWithReshare, Owner) to a principal (User, Group, ServicePrincipal, ServicePrincipalProfile) in a Fabric Connection by sending a POST request to the Fabric API.

.PARAMETER ConnectionId
The unique identifier of the Fabric Connection.

.PARAMETER PrincipalId
The unique identifier of the principal to assign the role to.

.PARAMETER PrincipalType
The type of principal. Valid values: Group, ServicePrincipal, ServicePrincipalProfile, User.

.PARAMETER ConnectionRole
The role to assign. Valid values: User, UserWithReshare, Owner.

.EXAMPLE
Add-FabricConnectionRoleAssignment -ConnectionId "abc123" -PrincipalId "user456" -PrincipalType "User" -ConnectionRole "Owner"

Assigns the Owner role to the user with ID "user456" in the connection "abc123".

.NOTES
- Requires $FabricConfig with BaseUrl and FabricHeaders.
- Validates authentication token using Test-TokenExpired before making the API call.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Add-FabricConnectionRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$PrincipalId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Group', 'ServicePrincipal', 'ServicePrincipalProfile', 'User')]
        [string]$PrincipalType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('User', 'UserWithReshare', 'Owner')]
        [string]$ConnectionRole
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}/roleAssignments" -f $FabricConfig.BaseUrl, $ConnectionId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            principal = @{
                id   = $PrincipalId
                type = $PrincipalType
            }
            role      = $ConnectionRole
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Role '$ConnectionRole' assigned to principal '$PrincipalId' successfully in connection '$ConnectionId'." -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to assign role. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Connections\Add-FabricConnectionRoleAssignment.ps1' 95
#Region '.\Public\Connections\Get-FabricConnection.ps1' -1

<#
.SYNOPSIS
    Retrieves connection details from a Microsoft Fabric workspace.

.DESCRIPTION
    Fetches connection information from a workspace, optionally filtered by ConnectionId or ConnectionName.
    Ensures authentication, constructs the API endpoint, performs the request, and returns the results.

.PARAMETER ConnectionId
    Optional. The unique identifier of the connection.

.PARAMETER ConnectionName
    Optional. The display name of the connection.

.EXAMPLE
    Get-FabricConnection -ConnectionId "Connection-67890"
    Returns details for the connection with ID "Connection-67890".

.EXAMPLE
    Get-FabricConnection -ConnectionName "My Connection"
    Returns details for the connection named "My Connection".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` for authentication validation.

    Author: Tiago Balabuch
#>
function Get-FabricConnection {
    [CmdletBinding(DefaultParameterSetName = 'Id')]
    param (
        [Parameter(Mandatory = $false, ParameterSetName = 'Id')]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $false, ParameterSetName = 'Name')]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ConnectionName
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections" -f $FabricConfig.BaseUrl

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ConnectionId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ConnectionId }, 'First')
        }
        elseif ($ConnectionName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ConnectionName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Connection. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Connections\Get-FabricConnection.ps1' 93
#Region '.\Public\Connections\Get-FabricConnectionSupportedType.ps1' -1

<#
.SYNOPSIS
    Retrieves connection details from a Microsoft Fabric workspace.

.DESCRIPTION
    Fetches connection information from a workspace, optionally filtered by GatewayId or ConnectionName.
    Ensures authentication, constructs the API endpoint, performs the request, and returns the results.

.PARAMETER GatewayId
    Optional. The unique identifier of the connection.

.PARAMETER ConnectionName
    Optional. The display name of the connection.

.PARAMETER ShowAllCreationMethods
    Optional. When set, includes all available creation methods for each supported connection type in the response. This is useful to discover which connection types can be created programmatically or through the UI.

.EXAMPLE
    Get-FabricConnection -GatewayId "Connection-67890"
    Returns details for the connection with ID "Connection-67890".

.EXAMPLE
    Get-FabricConnection -ConnectionName "My Connection"
    Returns details for the connection named "My Connection".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` for authentication validation.

    Author: Tiago Balabuch
#>
function Get-FabricConnectionSupportedType {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GatewayId,

        [Parameter(Mandatory = $false)]
        [switch]$ShowAllCreationMethods
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/supportedConnectionTypes" -f $FabricConfig.BaseUrl

        # Build query parameters dynamically
        $queryParams = @()
        if ($GatewayId) {
            Write-FabricLog -Message "Filtering by GatewayId: $GatewayId" -Level Debug
            $queryParams += "gatewayId=$GatewayId"
        }
        if ($ShowAllCreationMethods) {
            Write-FabricLog -Message "Including all creation methods." -Level Debug
            $queryParams += "showAllCreationMethods=true"
        }
        if ($queryParams.Count -gt 0) {
            $apiEndpointURI = "{0}/connections/supportedConnectionTypes?{1}" -f $FabricConfig.BaseUrl, ($queryParams -join '&')
        }

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Connection. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Connections\Get-FabricConnectionSupportedType.ps1' 90
#Region '.\Public\Connections\Remove-FabricConnection.ps1' -1

<#
.SYNOPSIS
    Deletes a connection from Microsoft Fabric.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a connection by its ConnectionId.

.PARAMETER ConnectionId
    The unique identifier of the connection to delete.

.EXAMPLE
    Remove-FabricConnection -ConnectionId "Connection-67890"
    Removes the connection with ID "Connection-67890".

.NOTES
    - Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    - Validates authentication token before API call.

    Author: Tiago Balabuch
#>
function Remove-FabricConnection {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}" -f $FabricConfig.BaseUrl, $ConnectionId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("Connection '$ConnectionId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Connection '$ConnectionId' deleted successfully." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Connection '$ConnectionId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Connections\Remove-FabricConnection.ps1' 59
#Region '.\Public\Connections\Remove-FabricConnectionRoleAssignment.ps1' -1

<#
.SYNOPSIS
Deletes a role assignment from a specified Fabric Connection.

.DESCRIPTION
Removes a role assignment from a Fabric Connection by sending a DELETE request to the Fabric API.

.PARAMETER ConnectionId
Specifies the unique identifier of the Fabric Connection.

.PARAMETER ConnectionRoleAssignmentId
Specifies the unique identifier of the role assignment to remove.

.EXAMPLE
Remove-FabricConnectionRoleAssignment -ConnectionId "Connection123" -ConnectionRoleAssignmentId "role123"

Removes the role assignment "role123" from the connection "Connection123".

.NOTES
Requires the global `$FabricConfig` object with `BaseUrl` and `FabricHeaders`.
Validates authentication using `Test-TokenExpired` before making the API call.

Author: Tiago Balabuch
#>

function Remove-FabricConnectionRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionRoleAssignmentId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}/roleAssignments/{2}" -f $FabricConfig.BaseUrl, $ConnectionId, $ConnectionRoleAssignmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("Role assignment '$ConnectionRoleAssignmentId' on Connection '$ConnectionId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Role assignment '$ConnectionRoleAssignmentId' successfully removed from Connection '$ConnectionId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to remove role assignments for ConnectionId '$ConnectionId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Connections\Remove-FabricConnectionRoleAssignment.ps1' 68
#Region '.\Public\Connections\Update-FabricConnectionRoleAssignment.ps1' -1

<#
.SYNOPSIS
Updates the role assignment for a principal in a Fabric Connection.

.DESCRIPTION
Updates the assigned role for a specific principal in a Fabric Connection using a PATCH API request.

.PARAMETER ConnectionId
Specifies the Connection identifier.

.PARAMETER ConnectionRoleAssignmentId
Specifies the role assignment identifier to update.

.PARAMETER ConnectionRole
Specifies the new role to assign. Valid values: User, UserWithReshare, Owner.

.EXAMPLE
Update-FabricConnectionRoleAssignment -ConnectionId "Connection123" -ConnectionRoleAssignmentId "assignment456" -ConnectionRole "Owner"

.NOTES
Requires global $FabricConfig with BaseUrl and FabricHeaders.
Validates authentication token before request.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Update-FabricConnectionRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionRoleAssignmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('User', 'UserWithReshare', 'Owner')]
        [string]$ConnectionRole
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/connections/{1}/roleAssignments/{2}" -f $FabricConfig.BaseUrl, $ConnectionId, $ConnectionRoleAssignmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            role = $ConnectionRole
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4 -Compress
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Role assignment '$ConnectionRoleAssignmentId' on Connection '$ConnectionId'", "Update role to '$ConnectionRole'")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Role assignment $ConnectionRoleAssignmentId updated successfully in Connection '$ConnectionId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update role assignment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Connections\Update-FabricConnectionRoleAssignment.ps1' 82
#Region '.\Public\Copy Job\Get-FabricCopyJob.ps1' -1

<#
.SYNOPSIS
    Retrieves details of one or more CopyJobs from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets CopyJob information from a Microsoft Fabric workspace by CopyJobId or CopyJobName.
    Validates authentication, constructs the API endpoint, sends the request, and returns matching CopyJob(s).
    If neither CopyJobId nor CopyJobName is specified, returns all CopyJobs in the workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the CopyJob(s). This parameter is required.

.PARAMETER CopyJobId
    The unique identifier of the CopyJob to retrieve. Optional; specify either CopyJobId or CopyJobName, not both.

.PARAMETER CopyJobName
    The display name of the CopyJob to retrieve. Optional; specify either CopyJobId or CopyJobName, not both.

.EXAMPLE
    Get-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobId "CopyJob-67890"
    Retrieves the CopyJob with ID "CopyJob-67890" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobName "My CopyJob"
    Retrieves the CopyJob named "My CopyJob" from workspace "workspace-12345".

.EXAMPLE
    Get-FabricCopyJob -WorkspaceId "workspace-12345"
    Retrieves all CopyJobs from workspace "workspace-12345".

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders` properties.
    Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricCopyJob {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CopyJobName
    )
    try {
        # Validate input parameters
        if ($CopyJobId -and $CopyJobName) {
            Write-FabricLog -Message "Specify only one parameter: either 'CopyJobId' or 'CopyJobName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($CopyJobId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $CopyJobId }, 'First')
        }
        elseif ($CopyJobName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $CopyJobName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve CopyJob. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Copy Job\Get-FabricCopyJob.ps1' 111
#Region '.\Public\Copy Job\Get-FabricCopyJobDefinition.ps1' -1

<#
.SYNOPSIS
Retrieves the definition of a Copy Job from a specific workspace in Microsoft Fabric.
Author: Updated by Jess Pomfret and Rob Sewell November 2026

.DESCRIPTION
This function fetches the Copy Job's content or metadata from a workspace.
It supports both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the Copy Job definition is to be retrieved.

.PARAMETER CopyJobId
(Mandatory) The unique identifier of the Copy Job whose definition needs to be retrieved.

.PARAMETER CopyJobFormat
(Optional) Specifies the format of the Copy Job definition. For example, 'json' or 'xml'.

.EXAMPLE
Get-FabricCopyJobDefinition -WorkspaceId "12345" -CopyJobId "67890"

Retrieves the definition of the Copy Job with ID `67890` from the workspace with ID `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
- Logs detailed information for debugging purposes.

#>
function Get-FabricCopyJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $CopyJobId

        # Append the format query parameter if specified by the user.
        if ($CopyJobFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $CopyJobFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Copy Job definition. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Copy Job\Get-FabricCopyJobDefinition.ps1' 78
#Region '.\Public\Copy Job\New-FabricCopyJob.ps1' -1

<#
.SYNOPSIS
    Creates a new copy job in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new copy job in the specified workspace.
    Supports optional parameters for description and definition files.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the copy job will be created. Mandatory.

.PARAMETER CopyJobName
    The name of the copy job to be created. Mandatory.

.PARAMETER CopyJobDescription
    Optional description for the copy job.

.PARAMETER CopyJobPathDefinition
    Optional file path to the copy job definition JSON file.

.PARAMETER CopyJobPathPlatformDefinition
    Optional file path to the platform definition file.

.EXAMPLE
    New-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobName "New Copy Job" -CopyJobDescription "Description of the new copy job"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricCopyJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CopyJobName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $CopyJobName
        }

        if ($CopyJobDescription) {
            $body.description = $CopyJobDescription
        }

        # Add copy job definition file content if provided
        if ($CopyJobPathDefinition) {
            $CopyJobEncodedContent = Convert-ToBase64 -filePath $CopyJobPathDefinition

            if (-not [string]::IsNullOrEmpty($CopyJobEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "copyjob-content.json"
                    payload     = $CopyJobEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Copy Job definition." -Level Error
                return $null
            }
        }
        # Add platform definition file content if provided
        if ($CopyJobPathPlatformDefinition) {
            $CopyJobEncodedPlatformContent = Convert-ToBase64 -filePath $CopyJobPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($CopyJobEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $CopyJobEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("workspace '$WorkspaceId'", "Create Copy Job '$CopyJobName'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Copy Job created successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Copy Job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Copy Job\New-FabricCopyJob.ps1' 150
#Region '.\Public\Copy Job\Remove-FabricCopyJob.ps1' -1

<#
.SYNOPSIS
    Deletes a Copy Job from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function performs a DELETE operation on the Microsoft Fabric API to remove a Copy Job
    from the specified workspace using the provided WorkspaceId and CopyJobId parameters.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Copy Job to be deleted.

.PARAMETER CopyJobId
    The unique identifier of the Copy Job to delete.

.EXAMPLE
    Remove-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobId "copyjob-67890"
    Deletes the Copy Job with ID "copyjob-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires the `$FabricConfig` global configuration, which must include `BaseUrl` and `FabricHeaders`.
    - Ensures token validity by invoking `Test-TokenExpired` before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricCopyJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $CopyJobId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("Copy Job '$CopyJobId' in workspace '$WorkspaceId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Copy Job '$CopyJobId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Log and handle errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Copy Job '$CopyJobId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Copy Job\Remove-FabricCopyJob.ps1' 66
#Region '.\Public\Copy Job\Update-FabricCopyJob.ps1' -1

<#
.SYNOPSIS
    Updates an existing Copy Job in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update an existing Copy Job
    in the specified workspace. Allows updating the Copy Job's name and optionally its description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Copy Job. This parameter is mandatory.

.PARAMETER CopyJobId
    The unique identifier of the Copy Job to be updated. This parameter is mandatory.

.PARAMETER CopyJobName
    The new name for the Copy Job. This parameter is mandatory.

.PARAMETER CopyJobDescription
    An optional new description for the Copy Job.

.EXAMPLE
    Update-FabricCopyJob -WorkspaceId "workspace-12345" -CopyJobId "copyjob-67890" -CopyJobName "Updated Copy Job" -CopyJobDescription "Updated description"
    Updates the Copy Job with ID "copyjob-67890" in the workspace "workspace-12345" with a new name and description.

.NOTES
    - Requires the `$FabricConfig` global configuration, which includes `BaseUrl` and `FabricHeaders`.
    - Ensures token validity by calling `Test-TokenExpired` before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricCopyJob {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$CopyJobName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobDescription
    )
    try {
        # Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $CopyJobId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $CopyJobName
        }

        if ($CopyJobDescription) {
            $body.description = $CopyJobDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Copy Job '$CopyJobId' in workspace '$WorkspaceId'", "Update properties")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Copy Job '$CopyJobName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Copy Job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Copy Job\Update-FabricCopyJob.ps1' 94
#Region '.\Public\Copy Job\Update-FabricCopyJobDefinition.ps1' -1

<#
.SYNOPSIS
Updates the definition of a Copy Job in a Microsoft Fabric workspace.

.DESCRIPTION
This function updates the content or metadata of a Copy Job within a Microsoft Fabric workspace.
The Copy Job content and platform-specific definitions can be provided as file paths, which will be encoded as Base64 and sent in the request.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace containing the Copy Job.

.PARAMETER CopyJobId
(Mandatory) The unique identifier of the Copy Job to be updated.

.PARAMETER CopyJobPathDefinition
(Mandatory) The file path to the Copy Job content definition file. The file content will be encoded as Base64.

.PARAMETER CopyJobPathPlatformDefinition
(Optional) The file path to the platform-specific definition file for the Copy Job. The file content will be encoded as Base64.

.EXAMPLE
Update-FabricCopyJobDefinition -WorkspaceId "12345" -CopyJobId "67890" -CopyJobPathDefinition "C:\CopyJobs\CopyJob.ipynb"

Updates the content of the Copy Job with ID `67890` in the workspace `12345` using the specified Copy Job file.

.EXAMPLE
Update-FabricCopyJobDefinition -WorkspaceId "12345" -CopyJobId "67890" -CopyJobPathDefinition "C:\CopyJobs\CopyJob.ipynb" -CopyJobPathPlatformDefinition "C:\CopyJobs\Platform.json"

Updates both the content and platform-specific definition of the Copy Job with ID `67890` in the workspace `12345`.

.NOTES
- Requires the `$FabricConfig` global configuration, which must include `BaseUrl` and `FabricHeaders`.
- Validates token expiration using `Test-TokenExpired` before making the API request.
- Encodes file content as Base64 before sending it to the Fabric API.
- Logs detailed messages for debugging and error handling.

Author: Tiago Balabuch
#>

function Update-FabricCopyJobDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CopyJobPathPlatformDefinition
    )
    try {
        # Step 1: Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointURI = "{0}/workspaces/{1}/copyJobs/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $CopyJobId

        if ($CopyJobPathPlatformDefinition) {
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($CopyJobPathDefinition) {
            $CopyJobEncodedContent = Convert-ToBase64 -filePath $CopyJobPathDefinition

            if (-not [string]::IsNullOrEmpty($CopyJobEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "copyjob-content.json"
                    payload     = $CopyJobEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Copy Job definition." -Level Error
                return $null
            }
        }

        if ($CopyJobPathPlatformDefinition) {
            $CopyJobEncodedPlatformContent = Convert-ToBase64 -filePath $CopyJobPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($CopyJobEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $CopyJobEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Copy Job '$CopyJobId' in workspace '$WorkspaceId'", "Update definition/metadata")) {
            # Step 4: Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            Write-FabricLog -Message "Successfully updated the definition for Copy Job with ID '$CopyJobId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Copy Job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Copy Job\Update-FabricCopyJobDefinition.ps1' 136
#Region '.\Public\Dashboard\Get-FabricDashboard.ps1' -1

<#
.SYNOPSIS
    Retrieves dashboards from a specified workspace.

.DESCRIPTION
    This function retrieves all dashboards from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve dashboards. This parameter is mandatory.

.EXAMPLE
     Get-FabricDashboard -WorkspaceId "12345"
    This example retrieves all dashboards from the workspace with ID "12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>

function Get-FabricDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {
        # Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URL
        $apiEndpointURI = "{0}/workspaces/{1}/dashboards" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Invoke the Fabric API to retrieve capacity details
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $Dashboards = Invoke-FabricAPIRequest @apiParams

        return $Dashboards

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Dashboard. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Dashboard\Get-FabricDashboard.ps1' 57
#Region '.\Public\Data Pipeline\Get-FabricDataPipeline.ps1' -1

<#
.SYNOPSIS
    Retrieves data pipelines from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves all data pipelines from a specified workspace using either the provided Data PipelineId or Data PipelineName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Data Pipeline exists. This parameter is mandatory.

.PARAMETER DataPipelineId
    The unique identifier of the Data Pipeline to retrieve. This parameter is optional and filters the results to a single pipeline when provided.

.PARAMETER DataPipelineName
    The display name of the Data Pipeline to retrieve. This parameter is optional and filters the results by name.

.EXAMPLE
     Get-FabricData Pipeline -WorkspaceId "workspace-12345" -Data PipelineId "Data Pipeline-67890"
    This example retrieves the Data Pipeline details for the Data Pipeline with ID "Data Pipeline-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricData Pipeline -WorkspaceId "workspace-12345" -Data PipelineName "My Data Pipeline"
    This example retrieves the Data Pipeline details for the Data Pipeline named "My Data Pipeline" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricDataPipeline {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataPipelineName
    )
    try {
        # Validate input parameters
        if ($DataPipelineId -and $DataPipelineName) {
            Write-FabricLog -Message "Specify only one parameter: either 'DataPipelineId' or 'DataPipelineName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/dataPipelines" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($DataPipelineId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $DataPipelineId }, 'First')
        }
        elseif ($DataPipelineName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $DataPipelineName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve DataPipeline. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Data Pipeline\Get-FabricDataPipeline.ps1' 105
#Region '.\Public\Data Pipeline\New-FabricDataPipeline.ps1' -1

<#
.SYNOPSIS
    Creates a new DataPipeline in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new DataPipeline
    in the specified workspace. It supports optional parameters for DataPipeline description
    and path definitions for the DataPipeline content.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the DataPipeline will be created.

.PARAMETER DataPipelineName
    The name of the DataPipeline to be created.

.PARAMETER DataPipelineDescription
    An optional description for the DataPipeline.

.EXAMPLE
     New-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineName "New DataPipeline"
    This example creates a new DataPipeline named "New DataPipeline" in the workspace with ID "workspace-12345" and uploads the definition file from the specified path.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>

function New-FabricDataPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataPipelineName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineDescription
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/dataPipelines" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DataPipelineName
        }

        if ($DataPipelineDescription) {
            $body.description = $DataPipelineDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("workspace '$WorkspaceId'", "Create Data Pipeline '$DataPipelineName'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Data Pipeline created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create DataPipeline. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Data Pipeline\New-FabricDataPipeline.ps1' 91
#Region '.\Public\Data Pipeline\Remove-FabricDataPipeline.ps1' -1

<#
.SYNOPSIS
    Removes a DataPipeline from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a DataPipeline
    from the specified workspace using the provided WorkspaceId and DataPipelineId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the DataPipeline will be removed.

.PARAMETER DataPipelineId
    The unique identifier of the DataPipeline to be removed.

.EXAMPLE
     Remove-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "pipeline-67890"
    This example removes the DataPipeline with ID "pipeline-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>

function Remove-FabricDataPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/dataPipelines/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $DataPipelineId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("DataPipeline '$DataPipelineId' in workspace '$WorkspaceId'", "Delete")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "DataPipeline '$DataPipelineId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete DataPipeline '$DataPipelineId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Data Pipeline\Remove-FabricDataPipeline.ps1' 67
#Region '.\Public\Data Pipeline\Update-FabricDataPipeline.ps1' -1

<#
.SYNOPSIS
    Updates an existing DataPipeline in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing DataPipeline
    in the specified workspace. It supports optional parameters for DataPipeline description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the DataPipeline exists. This parameter is optional.

.PARAMETER DataPipelineId
    The unique identifier of the DataPipeline to be updated. This parameter is mandatory.

.PARAMETER DataPipelineName
    The new name of the DataPipeline. This parameter is mandatory.

.PARAMETER DataPipelineDescription
    An optional new description for the DataPipeline.

.EXAMPLE
     Update-FabricDataPipeline -WorkspaceId "workspace-12345" -DataPipelineId "pipeline-67890" -DataPipelineName "Updated DataPipeline" -DataPipelineDescription "Updated description"
    This example updates the DataPipeline with ID "pipeline-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricDataPipeline {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DataPipelineName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DataPipelineDescription
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/dataPipelines/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $DataPipelineId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DataPipelineName
        }

        if ($DataPipelineDescription) {
            $body.description = $DataPipelineDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("DataPipeline '$DataPipelineId' in workspace '$WorkspaceId'", "Update properties")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Data Pipeline '$DataPipelineName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update DataPipeline. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Data Pipeline\Update-FabricDataPipeline.ps1' 96
#Region '.\Public\Datamart\Get-FabricDatamart.ps1' -1

<#
.SYNOPSIS
    Retrieves datamarts from a specified workspace.

.DESCRIPTION
    This function retrieves all datamarts from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve datamarts. This parameter is mandatory.

.PARAMETER DatamartId
    Optional. The GUID of the datamart to retrieve. Provide this when you want to fetch a single, specific datamart by its identifier.

.PARAMETER DatamartName
    Optional. The display name of the datamart to retrieve. Use this to fetch a single datamart by name when the Id is not known.

.EXAMPLE
     Get-FabricDatamart -WorkspaceId "12345"
    This example retrieves all datamarts from the workspace with ID "12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricDatamart {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DatamartId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DatamartName
    )

    try {
        # Validate input parameters
        if ($DatamartId -and $DatamartName) {
            Write-FabricLog -Message "Specify only one parameter: either 'DatamartId' or 'DatamartName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/datamarts" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($DatamartId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $DatamartId }, 'First')
        }
        elseif ($DatamartName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $DatamartName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Datamart. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Datamart\Get-FabricDatamart.ps1' 101
#Region '.\Public\Domain\Add-FabricDomainWorkspaceByCapacity.ps1' -1

<#
.SYNOPSIS
Assigns workspaces to a Fabric domain based on specified capacities.

.DESCRIPTION
The `Add-FabricDomainWorkspaceByCapacity` function assigns workspaces to a Fabric domain using a list of capacity IDs by making a POST request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the Fabric domain to which the workspaces will be assigned.

.PARAMETER CapacitiesIds
An array of capacity IDs used to assign workspaces to the domain.

.EXAMPLE
Add-FabricDomainWorkspaceByCapacity -DomainId "12345" -CapacitiesIds @("capacity1", "capacity2")

Assigns workspaces to the domain with ID "12345" based on the specified capacities.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricDomainWorkspaceByCapacity {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Assign-FabricDomainWorkspaceByCapacity')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [array]$CapacitiesIds
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/assignWorkspacesByCapacities" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            capacitiesIds = $CapacitiesIds
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, 'Assign workspaces to domain by capacities')) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Assigning domain workspaces by capacity completed successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error occurred while assigning workspaces by capacity for domain '$DomainId'. Details: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Add-FabricDomainWorkspaceByCapacity.ps1' 79
#Region '.\Public\Domain\Add-FabricDomainWorkspaceById.ps1' -1

<#
.SYNOPSIS
Assigns workspaces to a specified domain in Microsoft Fabric by their IDs.

.DESCRIPTION
The `Add-FabricDomainWorkspaceById` function sends a request to assign multiple workspaces to a specified domain using the provided domain ID and an array of workspace IDs.

.PARAMETER DomainId
The ID of the domain to which workspaces will be assigned. This parameter is mandatory.

.PARAMETER WorkspaceIds
An array of workspace IDs to be assigned to the domain. This parameter is mandatory.

.EXAMPLE
Add-FabricDomainWorkspaceById -DomainId "12345" -WorkspaceIds @("ws1", "ws2", "ws3")

Assigns the workspaces with IDs "ws1", "ws2", and "ws3" to the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricDomainWorkspaceById {

    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [array]$WorkspaceIds
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/assignWorkspaces" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            workspacesIds = $WorkspaceIds
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        #  Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, 'Assign workspaces to domain by IDs')) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully assigned workspaces to the domain with ID '$DomainId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to assign workspaces to the domain with ID '$DomainId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Add-FabricDomainWorkspaceById.ps1' 79
#Region '.\Public\Domain\Add-FabricDomainWorkspaceByPrincipal.ps1' -1

<#
.SYNOPSIS
Assigns workspaces to a domain based on principal IDs in Microsoft Fabric.

.DESCRIPTION
The `Add-FabricDomainWorkspaceByPrincipal` function sends a request to assign workspaces to a specified domain using a JSON object of principal IDs and types.

.PARAMETER DomainId
The ID of the domain to which workspaces will be assigned. This parameter is mandatory.

.PARAMETER PrincipalIds
An array representing the principals with their `id` and `type` properties. Must contain a `principals` key with an array of objects.

.EXAMPLE
$PrincipalIds = @(
    @{id = "813abb4a-414c-4ac0-9c2c-bd17036fd58c";  type = "User"},
    @{id = "b5b9495c-685a-447a-b4d3-2d8e963e6288"; type = "User"}
    )

Add-FabricDomainWorkspaceByPrincipal -DomainId "12345" -PrincipalIds $principals

Assigns the workspaces based on the provided principal IDs and types.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricDomainWorkspaceByPrincipal {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$PrincipalIds # Must contain 'id' and 'type' properties
    )

    try {
        # Validate PrincipalIds structure
        foreach ($principal in $PrincipalIds) {
            if (-not ($principal.ContainsKey('id') -and $principal.ContainsKey('type'))) {
                throw "Each principal object must contain 'id' and 'type' properties."
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/assignWorkspacesByPrincipals" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            principals = $PrincipalIds
        }

        # Convert the PrincipalIds to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, 'Assign workspaces to domain by principals')) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $null = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Assigning domain workspaces by principal completed successfully!" -Level Info
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to assign domain workspaces by principals. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Add-FabricDomainWorkspaceByPrincipal.ps1' 89
#Region '.\Public\Domain\Add-FabricDomainWorkspaceByRoleAssignment.ps1' -1

<#
.SYNOPSIS
Bulk assigns roles to principals for workspaces in a Fabric domain.

.DESCRIPTION
The `Add-FabricDomainWorkspaceByRoleAssignment` function performs bulk role assignments for principals in a specific Fabric domain. It sends a POST request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the Fabric domain where roles will be assigned.

.PARAMETER DomainRole
The role to assign to the principals. Must be one of the following:
- `Admins`
- `Contributors`

.PARAMETER PrincipalIds
An array of principals to assign roles to. Each principal must include:
- `id`: The identifier of the principal.
- `type`: The type of the principal (e.g., `User`, `Group`).

.EXAMPLE
Add-FabricDomainWorkspaceByRoleAssignment -DomainId "12345" -DomainRole "Admins" -PrincipalIds @(@{id="user1"; type="User"}, @{id="group1"; type="Group"})

Assigns the `Admins` role to the specified principals in the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricDomainWorkspaceByRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Assign-FabricDomainWorkspaceByRoleAssignment')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admins', 'Contributors')]
        [string]$DomainRole,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$PrincipalIds # Array with 'id' and 'type'
    )

    try {
        # Validate PrincipalIds structure
        foreach ($principal in $PrincipalIds) {
            if (-not ($principal.id -and $principal.type)) {
                throw "Each Principal must contain 'id' and 'type' properties. Found: $principal"
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/roleAssignments/bulkAssign" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            type       = $DomainRole
            principals = $PrincipalIds
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, "Assign role '$DomainRole' to principals")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Bulk role assignment for domain '$DomainId' completed successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to bulk assign roles in domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Add-FabricDomainWorkspaceByRoleAssignment.ps1' 99
#Region '.\Public\Domain\Get-FabricDomain.ps1' -1

<#
.SYNOPSIS
Retrieves domain information from Microsoft Fabric, optionally filtering by domain ID, domain name, or only non-empty domains.

.DESCRIPTION
The `Get-FabricDomain` function allows retrieval of domains in Microsoft Fabric, with optional filtering by domain ID or name. Additionally, it can filter to return only non-empty domains.

.PARAMETER DomainId
(Optional) The ID of the domain to retrieve.

.PARAMETER DomainName
(Optional) The display name of the domain to retrieve.

.PARAMETER NonEmptyDomainsOnly
(Optional) If set to `$true`, only domains containing workspaces will be returned.

.EXAMPLE
Get-FabricDomain -DomainId "12345"

Fetches the domain with ID "12345".

.EXAMPLE
Get-FabricDomain -DomainName "Finance"

Fetches the domain with the display name "Finance".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricDomain {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$NonEmptyDomainsOnly = $false
    )
    try {
        # Validate input parameters
        if ($DomainId -and $DomainName) {
            Write-FabricLog -Message "Specify only one parameter: either 'DomainId' or 'DomainName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/admin/domains" -f $FabricConfig.BaseUrl
        if ($NonEmptyDomainsOnly) {
            $apiEndpointURI = "{0}?nonEmptyOnly=true" -f $apiEndpointURI
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($DomainId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $DomainId }, 'First')
        }
        elseif ($DomainName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $DomainName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Get-FabricDomain.ps1' 110
#Region '.\Public\Domain\Get-FabricDomainWorkspace.ps1' -1

<#
.SYNOPSIS
Retrieves the workspaces associated with a specific domain in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricDomainWorkspace` function fetches the workspaces for the given domain ID.

.PARAMETER DomainId
The ID of the domain for which to retrieve workspaces.

.EXAMPLE
Get-FabricDomainWorkspace -DomainId "12345"

Fetches workspaces for the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Get-FabricDomainWorkspace {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/workspaces" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        # Handle results
        if ($dataItems) {
            return $dataItems
        }
        else {
            Write-FabricLog -Message "No workspace found for the '$DomainId'." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = Get-ErrorResponse($_.Exception)
        Write-FabricLog -Message "Failed to retrieve domain workspaces. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Get-FabricDomainWorkspace.ps1' 70
#Region '.\Public\Domain\New-FabricDomain.ps1' -1

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
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains" -f $FabricConfig.BaseUrl
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

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainName, 'Create Fabric domain')) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Domain created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create domain. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\New-FabricDomain.ps1' 95
#Region '.\Public\Domain\Remove-FabricDomain.ps1' -1

<#
.SYNOPSIS
Deletes a Fabric domain by its ID.

.DESCRIPTION
The `Remove-FabricDomain` function removes a specified domain from Microsoft Fabric by making a DELETE request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the domain to be deleted.

.EXAMPLE
Remove-FabricDomain -DomainId "12345"

Deletes the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Remove-FabricDomain {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, 'Delete Fabric domain')) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Domain '$DomainId' deleted successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Remove-FabricDomain.ps1' 62
#Region '.\Public\Domain\Remove-FabricDomainWorkspace.ps1' -1


<#
.SYNOPSIS
Unassign workspaces from a specified Fabric domain.

.DESCRIPTION
The `Unassign -FabricDomainWorkspace` function allows you to Unassign  specific workspaces from a given Fabric domain or unassign all workspaces if no workspace IDs are specified.
It makes a POST request to the relevant API endpoint for this operation.

.PARAMETER DomainId
The unique identifier of the Fabric domain.

.PARAMETER WorkspaceIds
(Optional) An array of workspace IDs to unassign. If not provided, all workspaces will be unassigned.

.EXAMPLE
Remove-FabricDomainWorkspace -DomainId "12345"

Unassigns all workspaces from the domain with ID "12345".

.EXAMPLE
Remove-FabricDomainWorkspace -DomainId "12345" -WorkspaceIds @("workspace1", "workspace2")

Unassigns the specified workspaces from the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.


Author: Tiago Balabuch

#>
function Remove-FabricDomainWorkspace {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Unassign-FabricDomainWorkspace')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [array]$WorkspaceIds
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI based on the presence of WorkspaceIds
        # Construct the request body
        if ($WorkspaceIds -and $WorkspaceIds.Count -gt 0) {
            $endpointSuffix = "unassignWorkspaces"
            $body = @{
                workspacesIds = $WorkspaceIds
            }

            $bodyJson = $body | ConvertTo-Json -Depth 2
        }
        else {
            $endpointSuffix = "unassignAllWorkspaces"
            $bodyJson = $null
        }
        $apiEndpointURI = "{0}/admin/domains/{1}/{2}" -f $FabricConfig.BaseUrl, $DomainId, $endpointSuffix
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, 'Unassign workspaces from domain')) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully unassigned workspaces to the domain with ID '$DomainId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to unassign workspaces to the domain with ID '$DomainId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Remove-FabricDomainWorkspace.ps1' 92
#Region '.\Public\Domain\Remove-FabricDomainWorkspaceRoleAssignment.ps1' -1

<#
.SYNOPSIS
Bulk unUnassign roles to principals for workspaces in a Fabric domain.

.DESCRIPTION
The `AssignFabricDomainWorkspaceRoleAssignment` function performs bulk role assignments for principals in a specific Fabric domain. It sends a POST request to the relevant API endpoint.

.PARAMETER DomainId
The unique identifier of the Fabric domain where roles will be assigned.

.PARAMETER DomainRole
The role to assign to the principals. Must be one of the following:
- `Admins`
- `Contributors`

.PARAMETER PrincipalIds
An array of principals to assign roles to. Each principal must include:
- `id`: The identifier of the principal.
- `type`: The type of the principal (e.g., `User`, `Group`).

.EXAMPLE
AssignFabricDomainWorkspaceRoleAssignment -DomainId "12345" -DomainRole "Admins" -PrincipalIds @(@{id="user1"; type="User"}, @{id="group1"; type="Group"})

Unassign the `Admins` role to the specified principals in the domain with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Remove-FabricDomainWorkspaceRoleAssignment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias('Unassign-FabricDomainWorkspaceByRoleAssignment')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admins', 'Contributors')]
        [string]$DomainRole,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$PrincipalIds #Must contain a JSON array of principals with 'id' and 'type' properties
    )

    try {
        # Validate PrincipalIds structure
        # This uses a .NET HashSet to accelerate lookup even more, especially useful in large collections.
        foreach ($principal in $PrincipalIds) {
            if (-not ($principal.id -and $principal.type)) {
                throw "Each Principal must contain 'id' and 'type' properties. Found: $principal"
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}/roleAssignments/bulkUnassign" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            type       = $DomainRole
            principals = $PrincipalIds
        }
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, "Unassign role '$DomainRole' from principals")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Bulk role unassignment for domain '$DomainId' completed successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to bulk assign roles in domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Remove-FabricDomainWorkspaceRoleAssignment.ps1' 99
#Region '.\Public\Domain\Update-FabricDomain.ps1' -1

<#
.SYNOPSIS
Updates a Fabric domain by its ID.

.DESCRIPTION
The `Update-FabricDomain` function modifies a specified domain in Microsoft Fabric using the provided parameters.

.PARAMETER DomainId
The unique identifier of the domain to be updated.

.PARAMETER DomainName
The new name for the domain. Must be alphanumeric.

.PARAMETER DomainDescription
(Optional) A new description for the domain.

.PARAMETER DomainContributorsScope
(Optional) The contributors' scope for the domain. Accepted values: 'AdminsOnly', 'AllTenant', 'SpecificUsersAndGroups'.

.EXAMPLE
Update-FabricDomain -DomainId "12345" -DomainName "NewDomain" -DomainDescription "Updated description" -DomainContributorsScope "AdminsOnly"

Updates the domain with ID "12345" with a new name, description, and contributors' scope.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Update-FabricDomain {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$DomainName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DomainDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('AdminsOnly', 'AllTenant', 'SpecificUsersAndGroups')]
        [string]$DomainContributorsScope
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/{1}" -f $FabricConfig.BaseUrl, $DomainId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $DomainName
        }

        if ($DomainDescription) {
            $body.description = $DomainDescription
        }

        if ($DomainContributorsScope) {
            $body.contributorsScope = $DomainContributorsScope
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($DomainId, "Update Fabric domain '$DomainName'")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Domain '$DomainName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update domain '$DomainId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Domain\Update-FabricDomain.ps1' 103
#Region '.\Public\Environment\Get-FabricEnvironment.ps1' -1

<#
.SYNOPSIS
Retrieves an environment or a list of environments from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Get-FabricEnvironment` function sends a GET request to the Fabric API to retrieve environment details for a given workspace. It can filter the results by `EnvironmentName`.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace to query environments.

.PARAMETER EnvironmentId
(Optional) The unique identifier of the Environment to retrieve. Use this to fetch a single environment by its ID.

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
        # Validate input parameters
        if ($EnvironmentId -and $EnvironmentName) {
            Write-FabricLog -Message "Specify only one parameter: either 'EnvironmentId' or 'EnvironmentName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($EnvironmentId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $EnvironmentId }, 'First')
        }
        elseif ($EnvironmentName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $EnvironmentName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Environment\Get-FabricEnvironment.ps1' 111
#Region '.\Public\Environment\Get-FabricEnvironmentLibrary.ps1' -1

<#
.SYNOPSIS
Retrieves the list of libraries associated with a specific environment in a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricEnvironmentLibrary function fetches library information for a given workspace and environment
using the Microsoft Fabric API. It ensures the authentication token is valid and validates the response
to handle errors gracefully.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the environment is located.

.PARAMETER EnvironmentId
The unique identifier of the environment whose libraries are being queried.

.EXAMPLE
Get-FabricEnvironmentLibrary -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Retrieves the libraries associated with the specified environment in the given workspace.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Get-FabricEnvironmentLibrary {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/libraries" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment libraries. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Environment\Get-FabricEnvironmentLibrary.ps1' 66
#Region '.\Public\Environment\Get-FabricEnvironmentSparkCompute.ps1' -1

<#
.SYNOPSIS
Retrieves the Spark compute details for a specific environment in a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricEnvironmentSparkCompute function communicates with the Microsoft Fabric API to fetch information
about Spark compute resources associated with a specified environment. It ensures that the API token is valid
and gracefully handles errors during the API call.

.PARAMETER WorkspaceId
The unique identifier of the workspace containing the target environment.

.PARAMETER EnvironmentId
The unique identifier of the environment whose Spark compute details are being retrieved.

.EXAMPLE
Get-FabricEnvironmentSparkCompute -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Retrieves Spark compute details for the specified environment in the given workspace.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Get-FabricEnvironmentSparkCompute {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/sparkcompute" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment Spark compute. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Environment\Get-FabricEnvironmentSparkCompute.ps1' 67
#Region '.\Public\Environment\Get-FabricEnvironmentStagingLibrary.ps1' -1

<#
.SYNOPSIS
Retrieves the staging library details for a specific environment in a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricEnvironmentStagingLibrary function interacts with the Microsoft Fabric API to fetch information
about staging libraries associated with a specified environment. It ensures token validity and handles API errors gracefully.

.PARAMETER WorkspaceId
The unique identifier of the workspace containing the target environment.

.PARAMETER EnvironmentId
The unique identifier of the environment for which staging library details are being retrieved.

.EXAMPLE
 Get-FabricEnvironmentStagingLibrary -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Retrieves the staging libraries for the specified environment in the given workspace.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Get-FabricEnvironmentStagingLibrary {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/libraries" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment spark compute. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Environment\Get-FabricEnvironmentStagingLibrary.ps1' 65
#Region '.\Public\Environment\Get-FabricEnvironmentStagingSparkCompute.ps1' -1

<#
.SYNOPSIS
Retrieves staging Spark compute details for a specific environment in a Microsoft Fabric workspace.

.DESCRIPTION
The Get-FabricEnvironmentStagingSparkCompute function interacts with the Microsoft Fabric API to fetch information
about staging Spark compute configurations for a specified environment. It ensures token validity and handles API errors gracefully.

.PARAMETER WorkspaceId
The unique identifier of the workspace containing the target environment.

.PARAMETER EnvironmentId
The unique identifier of the environment for which staging Spark compute details are being retrieved.

.EXAMPLE
Get-FabricEnvironmentStagingSparkCompute -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Retrieves the staging Spark compute configurations for the specified environment in the given workspace.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Get-FabricEnvironmentStagingSparkCompute {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/sparkcompute" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        return $dataItems
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve environment spark compute. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Environment\Get-FabricEnvironmentStagingSparkCompute.ps1' 65
#Region '.\Public\Environment\Import-FabricEnvironmentStagingLibrary.ps1' -1

<#
.SYNOPSIS
Uploads a library to the staging environment in a Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to upload a library to the specified
environment staging area for the given workspace.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the environment exists.

.PARAMETER EnvironmentId
The unique identifier of the environment where the library will be uploaded.

.EXAMPLE
Import-FabricEnvironmentStagingLibrary -WorkspaceId "workspace-12345" -EnvironmentId "env-67890"

.NOTES
- This is not working code. It is a placeholder for future development. Fabric documentation is missing some important details on how to upload libraries.
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Import-FabricEnvironmentStagingLibrary {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/libraries" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body (not yet implemented in Fabric docs)

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Upload staging library placeholder in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment staging library uploaded successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to upload environment staging library. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\Import-FabricEnvironmentStagingLibrary.ps1' 69
#Region '.\Public\Environment\New-FabricEnvironment.ps1' -1

<#
.SYNOPSIS
Creates a new environment in a specified workspace.

.DESCRIPTION
The `Add-FabricEnvironment` function creates a new environment within a given workspace by making a POST request to the Fabric API. The environment can optionally include a description.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace where the environment will be created.

.PARAMETER EnvironmentName
(Mandatory) The name of the environment to be created. Only alphanumeric characters, spaces, and underscores are allowed.

.PARAMETER EnvironmentDescription
(Optional) A description of the environment.

.EXAMPLE
Add-FabricEnvironment -WorkspaceId "12345" -EnvironmentName "DevEnv" -EnvironmentDescription "Development Environment"

Creates an environment named "DevEnv" in workspace "12345" with the specified description.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricEnvironment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EnvironmentName
        }

        if ($EnvironmentDescription) {
            $body.description = $EnvironmentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentName, "Create Fabric environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment '$EnvironmentName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create environment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\New-FabricEnvironment.ps1' 90
#Region '.\Public\Environment\Publish-FabricEnvironment.ps1' -1

<#
.SYNOPSIS
Publishes a staging environment in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function interacts with the Microsoft Fabric API to initiate the publishing process for a staging environment.
It validates the authentication token, constructs the API request, and handles both immediate and long-running operations.


.PARAMETER WorkspaceId
The unique identifier of the workspace containing the staging environment.

.PARAMETER EnvironmentId
The unique identifier of the staging environment to be published.

.EXAMPLE
Publish-FabricEnvironment -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Initiates the publishing process for the specified staging environment.

.NOTES
- Requires the `$FabricConfig` global object, including `BaseUrl` and `FabricHeaders`.
- Uses `Test-TokenExpired` to validate the token before making API calls.

Author: Tiago Balabuch
#>
function Publish-FabricEnvironment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/publish" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        #  Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Publish staging environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Publish operation request has been submitted successfully for the environment '$EnvironmentId'!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create environment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\Publish-FabricEnvironment.ps1' 68
#Region '.\Public\Environment\Remove-FabricEnvironment.ps1' -1

<#
.SYNOPSIS
Deletes an environment from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricEnvironment` function sends a DELETE request to the Fabric API to remove a specified environment from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the environment to delete.

.PARAMETER EnvironmentId
(Mandatory) The ID of the environment to be deleted.

.EXAMPLE
Remove-FabricEnvironment -WorkspaceId "12345" -EnvironmentId "67890"

Deletes the environment with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricEnvironment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Delete Fabric environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment '$EnvironmentId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\Remove-FabricEnvironment.ps1' 67
#Region '.\Public\Environment\Remove-FabricEnvironmentStagingLibrary.ps1' -1


<#
.SYNOPSIS
Deletes a specified library from the staging environment in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows for the deletion of a library from the staging environment, one file at a time.
It ensures token validity, constructs the appropriate API request, and handles both success and failure responses.

.PARAMETER WorkspaceId
The unique identifier of the workspace from which the library is to be deleted.

.PARAMETER EnvironmentId
The unique identifier of the staging environment containing the library.

.PARAMETER LibraryName
The name of the library to be deleted from the environment.

.EXAMPLE
Remove-FabricEnvironmentStagingLibrary -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890" -LibraryName "library-to-delete"

Deletes the specified library from the staging environment in the specified workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.
- This function currently supports deleting one library at a time.
Author: Tiago Balabuch

#>
function Remove-FabricEnvironmentStagingLibrary {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LibraryName
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/libraries?libraryToDelete={3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId, $LibraryName
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($LibraryName, "Delete environment staging library in workspace '$WorkspaceId' for environment '$EnvironmentId'")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Staging library $LibraryName for the Environment '$EnvironmentId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\Remove-FabricEnvironmentStagingLibrary.ps1' 76
#Region '.\Public\Environment\Stop-FabricEnvironmentPublish.ps1' -1

<#
.SYNOPSIS
Cancels the publish operation for a specified environment in Microsoft Fabric.

.DESCRIPTION
This function sends a cancel publish request to the Microsoft Fabric API for a given environment.
It ensures that the token is valid before making the request and handles both successful and error responses.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the environment exists.

.PARAMETER EnvironmentId
The unique identifier of the environment for which the publish operation is to be canceled.

.EXAMPLE
Stop-FabricEnvironmentPublish -WorkspaceId "workspace-12345" -EnvironmentId "environment-67890"

Cancels the publish operation for the specified environment.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Stop-FabricEnvironmentPublish {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/cancelPublish" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        #  Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Cancel publish for staging environment in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Publication for environment '$EnvironmentId' has been successfully canceled." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to cancel publication for environment '$EnvironmentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\Stop-FabricEnvironmentPublish.ps1' 68
#Region '.\Public\Environment\Update-FabricEnvironment.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric Environment.

.DESCRIPTION
The `Update-FabricEnvironment` function updates the name and/or description of a specified Fabric Environment by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Environment to update. Required to scope the API request.

.PARAMETER EnvironmentId
The unique identifier of the Environment to be updated.

.PARAMETER EnvironmentName
The new name for the Environment.

.PARAMETER EnvironmentDescription
(Optional) The new description for the Environment.

.EXAMPLE
Update-FabricEnvironment -EnvironmentId "Environment123" -EnvironmentName "NewEnvironmentName"

Updates the name of the Environment with the ID "Environment123" to "NewEnvironmentName".

.EXAMPLE
Update-FabricEnvironment -EnvironmentId "Environment123" -EnvironmentName "NewName" -EnvironmentDescription "Updated description"

Updates both the name and description of the Environment "Environment123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricEnvironment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EnvironmentName
        }

        if ($EnvironmentDescription) {
            $body.description = $EnvironmentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Update Fabric environment '$EnvironmentName' in workspace '$WorkspaceId'")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment '$EnvironmentName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Environment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\Update-FabricEnvironment.ps1' 101
#Region '.\Public\Environment\Update-FabricEnvironmentStagingSparkCompute.ps1' -1

<#
.SYNOPSIS
Updates the Spark compute configuration in the staging environment for a given workspace.

.DESCRIPTION
This function sends a PATCH request to the Microsoft Fabric API to update the Spark compute settings
for a specified environment, including instance pool, driver and executor configurations, and dynamic allocation settings.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the environment exists.

.PARAMETER EnvironmentId
The unique identifier of the environment where the Spark compute settings will be updated.

.PARAMETER InstancePoolName
The name of the instance pool to be used for Spark compute.

.PARAMETER InstancePoolType
The type of instance pool (either 'Workspace' or 'Capacity').

.PARAMETER DriverCores
The number of cores to allocate to the driver.

.PARAMETER DriverMemory
The amount of memory to allocate to the driver.

.PARAMETER ExecutorCores
The number of cores to allocate to each executor.

.PARAMETER ExecutorMemory
The amount of memory to allocate to each executor.

.PARAMETER DynamicExecutorAllocationEnabled
Boolean flag to enable or disable dynamic executor allocation.

.PARAMETER DynamicExecutorAllocationMinExecutors
The minimum number of executors when dynamic allocation is enabled.

.PARAMETER DynamicExecutorAllocationMaxExecutors
The maximum number of executors when dynamic allocation is enabled.

.PARAMETER RuntimeVersion
The Spark runtime version to use.

.PARAMETER SparkProperties
A hashtable of additional Spark properties to configure.

.EXAMPLE
Update-FabricEnvironmentStagingSparkCompute -WorkspaceId "workspace-12345" -EnvironmentId "env-67890" -InstancePoolName "pool1" -InstancePoolType "Workspace" -DriverCores 4 -DriverMemory "16GB" -ExecutorCores 8 -ExecutorMemory "32GB" -DynamicExecutorAllocationEnabled $true -DynamicExecutorAllocationMinExecutors 2 -DynamicExecutorAllocationMaxExecutors 10 -RuntimeVersion "3.1" -SparkProperties @{ "spark.executor.memoryOverhead"="4GB" }

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricEnvironmentStagingSparkCompute {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$InstancePoolName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Workspace', 'Capacity')]
        [string]$InstancePoolType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$DriverCores,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DriverMemory,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$ExecutorCores,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ExecutorMemory,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$DynamicExecutorAllocationEnabled,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMinExecutors,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMaxExecutors,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$RuntimeVersion,

        [Parameter(Mandatory = $true)]
        [System.Object]$SparkProperties
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/environments/{2}/staging/sparkcompute" -f $FabricConfig.BaseUrl, $WorkspaceId, $EnvironmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            instancePool              = @{
                name = $InstancePoolName
                type = $InstancePoolType
            }
            driverCores               = $DriverCores
            driverMemory              = $DriverMemory
            executorCores             = $ExecutorCores
            executorMemory            = $ExecutorMemory
            dynamicExecutorAllocation = @{
                enabled      = $DynamicExecutorAllocationEnabled
                minExecutors = $DynamicExecutorAllocationMinExecutors
                maxExecutors = $DynamicExecutorAllocationMaxExecutors
            }
            runtimeVersion            = $RuntimeVersion
            sparkProperties           = $SparkProperties
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EnvironmentId, "Update staging Spark compute in workspace '$WorkspaceId'")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Environment staging Spark compute updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update environment staging Spark compute. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Environment\Update-FabricEnvironmentStagingSparkCompute.ps1' 168
#Region '.\Public\Eventhouse\Get-FabricEventhouse.ps1' -1

<#
.SYNOPSIS
    Retrieves Eventhouse details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Eventhouse details from a specified workspace using either the provided EventhouseId or EventhouseName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is mandatory.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to retrieve. This parameter is optional.

.PARAMETER EventhouseName
    The name of the Eventhouse to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example retrieves the Eventhouse details for the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseName "My Eventhouse"
    This example retrieves the Eventhouse details for the Eventhouse named "My Eventhouse" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricEventhouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventhouseName
    )
    try {
        # Validate input parameters
        if ($EventhouseId -and $EventhouseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'EventhouseId' or 'EventhouseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventhouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($EventhouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $EventhouseId }, 'First')
        }
        elseif ($EventhouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $EventhouseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventhouse. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Eventhouse\Get-FabricEventhouse.ps1' 108
#Region '.\Public\Eventhouse\Get-FabricEventhouseDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of an Eventhouse from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an Eventhouse from a specified workspace using the provided EventhouseId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is mandatory.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to retrieve the definition for. This parameter is optional.

.PARAMETER EventhouseFormat
    The format in which to retrieve the Eventhouse definition. This parameter is optional.

.EXAMPLE
     Get-FabricEventhouseDefinition -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example retrieves the definition of the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricEventhouseDefinition -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890" -EventhouseFormat "json"
    This example retrieves the definition of the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricEventhouseDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/eventhouses/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventhouseId
        if ($EventhouseFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $EventhouseFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Eventhouse '$EventhouseId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventhouse. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Eventhouse\Get-FabricEventhouseDefinition.ps1' 80
#Region '.\Public\Eventhouse\New-FabricEventhouse.ps1' -1

<#
.SYNOPSIS
    Creates a new Eventhouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Eventhouse
    in the specified workspace. It supports optional parameters for Eventhouse description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse will be created. This parameter is mandatory.

.PARAMETER EventhouseName
    The name of the Eventhouse to be created. This parameter is mandatory.

.PARAMETER EventhouseDescription
    An optional description for the Eventhouse.

.PARAMETER EventhousePathDefinition
    An optional path to the Eventhouse definition file to upload.

.PARAMETER EventhousePathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
     New-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseName "New Eventhouse" -EventhouseDescription "Description of the new Eventhouse"
    This example creates a new Eventhouse named "New Eventhouse" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricEventhouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventhouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventhouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EventhouseName
        }

        if ($EventhouseDescription) {
            $body.description = $EventhouseDescription
        }
        if ($EventhousePathDefinition) {
            $eventhouseEncodedContent = Convert-ToBase64 -filePath $EventhousePathDefinition

            if (-not [string]::IsNullOrEmpty($eventhouseEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "EventhouseProperties.json"
                    payload     = $eventhouseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Eventhouse definition." -Level Error
                return $null
            }
        }

        if ($EventhousePathPlatformDefinition) {
            $eventhouseEncodedPlatformContent = Convert-ToBase64 -filePath $EventhousePathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($eventhouseEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $eventhouseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventhouseName, "Create Eventhouse in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventhouse '$EventhouseName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Eventhouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventhouse\New-FabricEventhouse.ps1' 149
#Region '.\Public\Eventhouse\Remove-FabricEventhouse.ps1' -1

<#
.SYNOPSIS
    Removes an Eventhouse from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an Eventhouse
    from the specified workspace using the provided WorkspaceId and EventhouseId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Eventhouse will be removed.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to be removed.

.EXAMPLE
     Remove-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890"
    This example removes the Eventhouse with ID "eventhouse-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricEventhouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventhouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventhouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventhouseId, "Delete Eventhouse in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventhouse '$EventhouseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Eventhouse '$EventhouseId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventhouse\Remove-FabricEventhouse.ps1' 68
#Region '.\Public\Eventhouse\Update-FabricEventhouse.ps1' -1

<#
.SYNOPSIS
    Updates an existing Eventhouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Eventhouse
    in the specified workspace. It supports optional parameters for Eventhouse description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is optional.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to be updated. This parameter is mandatory.

.PARAMETER EventhouseName
    The new name of the Eventhouse. This parameter is mandatory.

.PARAMETER EventhouseDescription
    An optional new description for the Eventhouse.

.EXAMPLE
     Update-FabricEventhouse -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890" -EventhouseName "Updated Eventhouse" -EventhouseDescription "Updated description"
    This example updates the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricEventhouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventhouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventhouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventhouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EventhouseName
        }

        if ($EventhouseDescription) {
            $body.description = $EventhouseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventhouseId, "Update Eventhouse '$EventhouseName' in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventhouse '$EventhouseName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Eventhouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventhouse\Update-FabricEventhouse.ps1' 96
#Region '.\Public\Eventhouse\Update-FabricEventhouseDefinition.ps1' -1

<#
.SYNOPSIS
    Updates the definition of an existing Eventhouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Eventhouse
    in the specified workspace. It supports optional parameters for Eventhouse definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Eventhouse exists. This parameter is mandatory.

.PARAMETER EventhouseId
    The unique identifier of the Eventhouse to be updated. This parameter is mandatory.

.PARAMETER EventhousePathDefinition
    An optional path to the Eventhouse definition file to upload.

.PARAMETER EventhousePathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
     Update-FabricEventhouseDefinition -WorkspaceId "workspace-12345" -EventhouseId "eventhouse-67890" -EventhousePathDefinition "C:\Path\To\EventhouseDefinition.json"
    This example updates the definition of the Eventhouse with ID "eventhouse-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricEventhouseDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventhousePathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/eventhouses/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventhouseId
        if ($EventhousePathPlatformDefinition) {
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($EventhousePathDefinition) {
            $EventhouseEncodedContent = Convert-ToBase64 -filePath $EventhousePathDefinition

            if (-not [string]::IsNullOrEmpty($EventhouseEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "EventhouseProperties.json"
                    payload     = $EventhouseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Eventhouse definition." -Level Error
                return $null
            }
        }

        if ($EventhousePathPlatformDefinition) {
            $EventhouseEncodedPlatformContent = Convert-ToBase64 -filePath $EventhousePathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($EventhouseEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventhouseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventhouseId, "Update Eventhouse definition in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Eventhouse with ID '$EventhouseId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Eventhouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventhouse\Update-FabricEventhouseDefinition.ps1' 129
#Region '.\Public\Eventstream\Get-FabricEventstream.ps1' -1

<#
.SYNOPSIS
Retrieves a specific Eventstream or all Eventstreams from a workspace in Microsoft Fabric.

.DESCRIPTION
Queries the Fabric API for Eventstream resources in a given workspace. You can filter by EventstreamId (GUID) or EventstreamName.
If neither filter is supplied, all Eventstreams in the workspace are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace that contains the Eventstream(s) to retrieve.

.PARAMETER EventstreamId
Optional. The GUID of a single Eventstream to return. Use this when you already know the identifier and want a direct lookup.

.PARAMETER EventstreamName
Optional. The display name of the Eventstream to retrieve. Use this when you prefer to match by its friendly name instead of the GUID.

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345" -EventstreamName "Development"

Returns the Eventstream named "Development" from workspace "12345" if it exists.

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345" -EventstreamId "b7c1e7de-1111-2222-3333-444455556666"

Returns the Eventstream whose Id matches the provided GUID from workspace "12345".

.EXAMPLE
Get-FabricEventstream -WorkspaceId "12345"

Returns all Eventstreams that currently exist in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Only one of EventstreamId or EventstreamName can be specified; not both simultaneously.

Author: Tiago Balabuch

#>

function Get-FabricEventstream {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName
    )

    try {
        # Validate input parameters
        if ($EventstreamId -and $EventstreamName) {
            Write-FabricLog -Message "Specify only one parameter: either 'EventstreamId' or 'EventstreamName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($EventstreamId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $EventstreamId }, 'First')
        }
        elseif ($EventstreamName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $EventstreamName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Eventstream\Get-FabricEventstream.ps1' 119
#Region '.\Public\Eventstream\Get-FabricEventstreamDefinition.ps1' -1


<#
.SYNOPSIS
Retrieves the definition of a Eventstream from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the Eventstream's content or metadata from a workspace.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the Eventstream definition is to be retrieved.

.PARAMETER EventstreamId
(Optional)The unique identifier of the Eventstream whose definition needs to be retrieved.

.PARAMETER EventstreamFormat
Specifies the format of the Eventstream definition. Currently, only 'ipynb' is supported.
Default: 'ipynb'.

.EXAMPLE
Get-FabricEventstreamDefinition -WorkspaceId "12345" -EventstreamId "67890"

Retrieves the definition of the Eventstream with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricEventstreamDefinition -WorkspaceId "12345"

Retrieves the definitions of all Eventstreams in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricEventstreamDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/Eventstreams/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        if ($EventstreamFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $EventstreamFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Eventstream '$EventstreamId' definition retrieved successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Eventstream\Get-FabricEventstreamDefinition.ps1' 84
#Region '.\Public\Eventstream\Get-FabricEventstreamDestination.ps1' -1

<#
.SYNOPSIS
Retrieves a specific Eventstream destination from a workspace in Microsoft Fabric.

.DESCRIPTION
Get-FabricEventstreamDestination issues a GET request to the Fabric API to fetch details for a specific destination belonging to an Eventstream in a workspace. All three IDs (workspace, eventstream, destination) are required to identify the resource.

.PARAMETER WorkspaceId
(Mandatory) The workspace ID containing the eventstream.

.PARAMETER EventstreamId
(Mandatory) The eventstream ID that contains the destination.

.PARAMETER DestinationId
(Mandatory) The ID of the destination to retrieve.

.EXAMPLE
Get-FabricEventstreamDestination -WorkspaceId "12345" -EventstreamId "67890" -DestinationId "abcd"

Retrieves the destination with ID "abcd" from eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before making the API call.

Author: Tiago Balabuch
#>

function Get-FabricEventstreamDestination {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DestinationId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/destinations/{3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $DestinationId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream Destination. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Get-FabricEventstreamDestination.ps1' 78
#Region '.\Public\Eventstream\Get-FabricEventstreamDestinationConnection.ps1' -1

<#
.SYNOPSIS
Retrieves the connection details for a specific Eventstream destination in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamDestinationConnection issues a GET request to the Fabric API to fetch the connection information for a destination associated with an Eventstream. All three IDs are required to locate the resource.

.PARAMETER WorkspaceId
[string] (Mandatory) The workspace ID that contains the Eventstream.

.PARAMETER EventstreamId
[string] (Mandatory) The Eventstream ID that contains the destination.

.PARAMETER DestinationId
[string] (Mandatory) The destination ID whose connection details will be retrieved.

.EXAMPLE
Get-FabricEventstreamDestinationConnection -WorkspaceId "12345" -EventstreamId "67890" -DestinationId "abcd"
# Retrieves the connection details for destination "abcd" under eventstream "67890" in workspace "12345".

.OUTPUTS
Typically returns a PSCustomObject with the destination connection details, or $null if no data is returned.

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before making the API call.
- Errors are caught and logged; the function returns $null on failure.

Author: Tiago Balabuch
#>

function Get-FabricEventstreamDestinationConnection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DestinationId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/destinations/{3}/connection" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $DestinationId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream Destination Connection. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Get-FabricEventstreamDestinationConnection.ps1' 81
#Region '.\Public\Eventstream\Get-FabricEventstreamSource.ps1' -1

<#
.SYNOPSIS
Retrieve a specific Eventstream source from a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamSource sends a GET request to the Fabric API to fetch details for a single source belonging to an Eventstream in a workspace. All three identifiers (WorkspaceId, EventstreamId, SourceId) are required to locate the resource.

.PARAMETER WorkspaceId
The workspace ID that contains the Eventstream. (Required)

.PARAMETER EventstreamId
The Eventstream ID that contains the source. (Required)

.PARAMETER SourceId
The ID of the source to retrieve. (Required)

.EXAMPLE
Get-FabricEventstreamSource -WorkspaceId "12345" -EventstreamId "67890" -SourceId "abcd"
Retrieves source "abcd" from eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before making the API call.
Author: Tiago Balabuch
#>

function Get-FabricEventstreamSource {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SourceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/sources/{3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $SourceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream Source. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Get-FabricEventstreamSource.ps1' 76
#Region '.\Public\Eventstream\Get-FabricEventstreamSourceConnection.ps1' -1

<#
.SYNOPSIS
Retrieves connection details for a specific Eventstream source in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamSourceConnection sends a GET request to the Fabric management API to fetch the connection information
for a specified Eventstream source. All three identifiers (WorkspaceId, EventstreamId, SourceId) are required to locate the resource.

.PARAMETER WorkspaceId
The workspace identifier that contains the Eventstream. (Mandatory)

.PARAMETER EventstreamId
The identifier of the Eventstream that contains the source. (Mandatory)

.PARAMETER SourceId
The identifier of the source whose connection details will be retrieved. (Mandatory)

.OUTPUTS
System.Object
Returns the API response as a PowerShell object (commonly a hashtable or PSCustomObject) representing the source connection.

.EXAMPLE
Get-FabricEventstreamSourceConnection -WorkspaceId '12345' -EventstreamId '67890' -SourceId 'abcd'
Retrieves connection details for source 'abcd' of Eventstream '67890' in workspace '12345'.

.NOTES
- Requires a global $FabricConfig variable containing BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token before issuing the request.
- Author: Tiago Balabuch
#>

function Get-FabricEventstreamSourceConnection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SourceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/sources/{3}/connection" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $SourceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream Source Connection. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Get-FabricEventstreamSourceConnection.ps1' 81
#Region '.\Public\Eventstream\Get-FabricEventstreamTopology.ps1' -1

<#
.SYNOPSIS
Retrieve the topology for an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Get-FabricEventstreamTopology sends a GET request to the Fabric API to obtain the topology for a specified Eventstream within a workspace. The function validates the authentication token before making the API call and returns the topology object or $null if no data is returned.

.PARAMETER WorkspaceId
The workspace ID that contains the Eventstream. (Required)

.PARAMETER EventstreamId
The Eventstream ID whose topology will be retrieved. (Required)

.EXAMPLE
Get-FabricEventstreamTopology -WorkspaceId "12345" -EventstreamId "67890"
Retrieves the topology for eventstream "67890" in workspace "12345".

.NOTES
- Requires the global $FabricConfig with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate the authentication token prior to the API request.
Author: Tiago Balabuch
#>

function Get-FabricEventstreamTopology {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/topology" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Eventstream Topology. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Get-FabricEventstreamTopology.ps1' 69
#Region '.\Public\Eventstream\New-FabricEventstream.ps1' -1

<#
.SYNOPSIS
Creates a new Eventstream in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new Eventstream
in the specified workspace. It supports optional parameters for Eventstream description
and path definitions for the Eventstream content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the Eventstream will be created.

.PARAMETER EventstreamName
The name of the Eventstream to be created.

.PARAMETER EventstreamDescription
An optional description for the Eventstream.

.PARAMETER EventstreamPathDefinition
An optional path to the Eventstream definition file (e.g., .ipynb file) to upload.

.PARAMETER EventstreamPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricEventstream -WorkspaceId "workspace-12345" -EventstreamName "New Eventstream" -EventstreamPathDefinition "C:\Eventstreams\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $EventstreamName
        }

        if ($EventstreamDescription) {
            $body.description = $EventstreamDescription
        }

        if ($EventstreamPathDefinition) {
            $EventstreamEncodedContent = Convert-ToBase64 -filePath $EventstreamPathDefinition

            if (-not [string]::IsNullOrEmpty($EventstreamEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "eventstream"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "eventstream.json"
                    payload     = $EventstreamEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Eventstream definition." -Level Error
                return $null
            }
        }

        if ($EventstreamPathPlatformDefinition) {
            $EventstreamEncodedPlatformContent = Convert-ToBase64 -filePath $EventstreamPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($EventstreamEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "eventstream"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventstreamEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($EventstreamName, "Create Eventstream in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Eventstream. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\New-FabricEventstream.ps1' 154
#Region '.\Public\Eventstream\Remove-FabricEventstream.ps1' -1

<#
.SYNOPSIS
Deletes an Eventstream from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricEventstream` function sends a DELETE request to the Fabric API to remove a specified Eventstream from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Eventstream to delete.

.PARAMETER EventstreamId
(Mandatory) The ID of the Eventstream to be deleted.

.EXAMPLE
Remove-FabricEventstream -WorkspaceId "12345" -EventstreamId "67890"

Deletes the Eventstream with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>

function Remove-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Delete Eventstream in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Eventstream '$EventstreamId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Remove-FabricEventstream.ps1' 69
#Region '.\Public\Eventstream\Resume-FabricEventstream.ps1' -1

<#
.SYNOPSIS
Resumes a paused Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to resume a specified Eventstream within a given workspace.
Ensures the authentication token is valid before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace containing the Eventstream.

.PARAMETER EventstreamId
The unique identifier of the Eventstream to resume.

.EXAMPLE
Resume-FabricEventstream -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.
         AUTHOR: - Tiago Balabuch
         Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Resume-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/resume" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Resume Eventstream in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' resumed successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to resume Eventstream. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Resume-FabricEventstream.ps1' 66
#Region '.\Public\Eventstream\Resume-FabricEventstreamDestination.ps1' -1

<#
.SYNOPSIS
Resumes a destination of an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to resume a specific destination of an Eventstream within a workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace.

.PARAMETER EventstreamId
The ID of the Eventstream containing the destination.

.PARAMETER DestinationId
The ID of the destination to resume.

.EXAMPLE
Resume-FabricEventstreamDestination -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890" -DestinationId "destination-abcde"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.
    :     AUTHOR: - Tiago Balabuch
         Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Resume-FabricEventstreamDestination {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DestinationId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/destinations/{3}/resume" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $DestinationId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($DestinationId, "Resume Eventstream destination in workspace '$WorkspaceId' (Eventstream '$EventstreamId')")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' destination '$DestinationId' resumed successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to resume Eventstream Destination '$DestinationId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Resume-FabricEventstreamDestination.ps1' 73
#Region '.\Public\Eventstream\Resume-FabricEventstreamSource.ps1' -1

<#
.SYNOPSIS
Resumes a source of an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to resume a specific source of an Eventstream within a workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace.

.PARAMETER EventstreamId
The ID of the Eventstream containing the source.

.PARAMETER SourceId
The ID of the source to resume.

.EXAMPLE
Resume-FabricEventstreamSource -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890" -SourceId "source-abcde"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
Tiago Balabuch
#>

function Resume-FabricEventstreamSource {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SourceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/sources/{3}/resume" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $SourceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($SourceId, "Resume Eventstream source in workspace '$WorkspaceId' (Eventstream '$EventstreamId')")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' Source '$SourceId' resumed successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to resume Eventstream Source '$SourceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Resume-FabricEventstreamSource.ps1' 74
#Region '.\Public\Eventstream\Suspend-FabricEventstream.ps1' -1

<#
.SYNOPSIS
Suspends (pauses) an existing Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to pause a specified Eventstream within a given workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace containing the Eventstream.

.PARAMETER EventstreamId
The unique identifier of the Eventstream to suspend.

.EXAMPLE
Suspend-FabricEventstream -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890"

.NOTES

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Suspend-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/pause" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Pause Eventstream in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' paused successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to pause Eventstream. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Suspend-FabricEventstream.ps1' 64
#Region '.\Public\Eventstream\Suspend-FabricEventstreamDestination.ps1' -1

<#
.SYNOPSIS
Pauses (suspends) a destination of an Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to pause a specific destination of an Eventstream within a workspace.
Validates the authentication token before making the API call.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace.

.PARAMETER EventstreamId
The ID of the Eventstream containing the destination.

.PARAMETER DestinationId
The ID of the destination to pause.

.EXAMPLE
Suspend-FabricEventstreamDestination -WorkspaceId "workspace-12345" -EventstreamId "eventstream-67890" -DestinationId "destination-abcde"

.NOTES
Requires the global $FabricConfig (BaseUrl and FabricHeaders).
Calls Test-TokenExpired to ensure the authentication token is valid before making the request.
    :     AUTHOR: - Tiago Balabuch
     Updated by Jess Pomfret and Rob Sewell November 2026
#>

function Suspend-FabricEventstreamDestination {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$DestinationId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/destinations/{3}/pause" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $DestinationId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($DestinationId, "Pause Eventstream destination in workspace '$WorkspaceId' (Eventstream '$EventstreamId')")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' destination '$DestinationId' paused successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to pause Eventstream Destination '$DestinationId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Suspend-FabricEventstreamDestination.ps1' 73
#Region '.\Public\Eventstream\Suspend-FabricEventstreamSource.ps1' -1

<#
.SYNOPSIS
Suspends (pauses) a source of an Eventstream in a Microsoft Fabric workspace.
.DESCRIPTION
Sends a POST request to the Microsoft Fabric API to pause a specific source of an Eventstream within a workspace.
Ensures the authentication token is valid before making the API call.
.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace containing the Eventstream.
.PARAMETER EventstreamId
The unique identifier of the Eventstream whose source is to be paused.
.PARAMETER SourceId
The unique identifier of the source within the Eventstream to be paused.
.EXAMPLE
Suspend-FabricEventstreamSource -WorkspaceId "Workspace123" -EventstreamId "Eventstream123" -SourceId "Source123"
Pauses the source with ID "Source123" of the Eventstream "Eventstream123"

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
Author: Tiago Balabuch
Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Suspend-FabricEventstreamSource {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SourceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/sources/{3}/pause" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId, $SourceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($SourceId, "Pause Eventstream source in workspace '$WorkspaceId' (Eventstream '$EventstreamId')")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamId' Source '$SourceId' paused successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to pause Eventstream Source '$SourceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Suspend-FabricEventstreamSource.ps1' 69
#Region '.\Public\Eventstream\Update-FabricEventstream.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric Eventstream.

.DESCRIPTION
The `Update-FabricEventstream` function updates the name and/or description of a specified Fabric Eventstream by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Eventstream to update. Required to scope the API request.

.PARAMETER EventstreamId
The unique identifier of the Eventstream to be updated.

.PARAMETER EventstreamName
The new name for the Eventstream.

.PARAMETER EventstreamDescription
(Optional) The new description for the Eventstream.

.EXAMPLE
Update-FabricEventstream -EventstreamId "Eventstream123" -EventstreamName "NewEventstreamName"

Updates the name of the Eventstream with the ID "Eventstream123" to "NewEventstreamName".

.EXAMPLE
Update-FabricEventstream -EventstreamId "Eventstream123" -EventstreamName "NewName" -EventstreamDescription "Updated description"

Updates both the name and description of the Eventstream "Eventstream123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricEventstream {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$EventstreamName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamDescription
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $EventstreamName
        }

        if ($EventstreamDescription) {
            $body.description = $EventstreamDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Update Eventstream '$EventstreamName' in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Eventstream '$EventstreamName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Eventstream. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Update-FabricEventstream.ps1' 102
#Region '.\Public\Eventstream\Update-FabricEventstreamDefinition.ps1' -1

<#
.SYNOPSIS
Updates the definition of a Eventstream in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a Eventstream in a Microsoft Fabric workspace.
The Eventstream content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the Eventstream resides.

.PARAMETER EventstreamId
(Mandatory) The unique identifier of the Eventstream to be updated.

.PARAMETER EventstreamPathDefinition
(Mandatory) The file path to the Eventstream content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER EventstreamPathPlatformDefinition
(Optional) The file path to the Eventstream's platform-specific definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER UpdateMetadata
(Optional)A boolean flag indicating whether to update the Eventstream's metadata.
Default: `$false`.

.EXAMPLE
Update-FabricEventstreamDefinition -WorkspaceId "12345" -EventstreamId "67890" -EventstreamPathDefinition "C:\Eventstreams\Eventstream.ipynb"

Updates the content of the Eventstream with ID `67890` in the workspace `12345` using the specified Eventstream file.

.EXAMPLE
Update-FabricEventstreamDefinition -WorkspaceId "12345" -EventstreamId "67890" -EventstreamPathDefinition "C:\Eventstreams\Eventstream.ipynb" -UpdateMetadata $true

Updates both the content and metadata of the Eventstream with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The Eventstream content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>
function Update-FabricEventstreamDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EventstreamPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/eventstreams/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $EventstreamId
        if ($EventstreamPathPlatformDefinition) {
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($EventstreamPathDefinition) {
            $EventstreamEncodedContent = Convert-ToBase64 -filePath $EventstreamPathDefinition

            if (-not [string]::IsNullOrEmpty($EventstreamEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "eventstream.json"
                    payload     = $EventstreamEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Eventstream definition." -Level Error
                return $null
            }
        }

        if ($EventstreamPathPlatformDefinition) {
            $EventstreamEncodedPlatformContent = Convert-ToBase64 -filePath $EventstreamPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($EventstreamEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $EventstreamEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess($EventstreamId, "Update Eventstream definition in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Eventstream with ID '$EventstreamId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Eventstream. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Eventstream\Update-FabricEventstreamDefinition.ps1' 142
#Region '.\Public\External Data Share\Get-FabricExternalDataShare.ps1' -1

<#
.SYNOPSIS
    Retrieves External Data Shares details from a specified Microsoft Fabric.

.DESCRIPTION
    This function retrieves External Data Shares details.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER ExternalDataShareId
    (Optional) The ID of the External Data Share to retrieve. If not provided, all External Data Shares will be returned.

.EXAMPLE
    Get-FabricExternalDataShares -ExternalDataShareId "12345"
    This example retrieves the External Data Share with ID "12345".
.EXAMPLE
    Get-FabricExternalDataShares
    This example retrieves the External Data Shares details.
.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricExternalDataShare {
    [CmdletBinding()]
    [Alias("Get-FabricExternalDataShares")]
    param (
        [Parameter(Mandatory = $False)]
        [ValidateNotNullOrEmpty()]
        [string]$ExternalDataShareId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/items/externalDataShares" -f $FabricConfig.BaseUrl
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic
        if ($ExternalDataShareId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ExternalDataShareId }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve External Data Shares. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\External Data Share\Get-FabricExternalDataShare.ps1' 80
#Region '.\Public\External Data Share\Revoke-FabricExternalDataShare.ps1' -1

<#
.SYNOPSIS
    Revokes an external data share from a specified Microsoft Fabric workspace item.

.DESCRIPTION
    This function revokes an external data share by calling the Microsoft Fabric API.
    It validates the authentication token, constructs the appropriate API endpoint, and sends a revoke request.
    The function requires workspace, item, and external data share IDs.

.PARAMETER WorkspaceId
    The ID of the Microsoft Fabric workspace containing the item.

.PARAMETER ItemId
    The ID of the item within the workspace.

.PARAMETER ExternalDataShareId
    The ID of the external data share to revoke.

.EXAMPLE
    Revoke-FabricExternalDataShare -WorkspaceId "abc123" -ItemId "def456" -ExternalDataShareId "ghi789"
    Revokes the specified external data share from the given workspace item.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Author: Tiago Balabuch
#>
function Revoke-FabricExternalDataShare {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ExternalDataShareId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        Write-FabricLog -Message "Constructing API endpoint URI..." -Level Debug
        $apiEndpointURI = "{0}/admin/workspaces/{1}/items/{2}/externalDataShares/{3}/revoke" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId, $ExternalDataShareId

        if ($PSCmdlet.ShouldProcess($ExternalDataShareId, "Revoke external data share for item '$ItemId' in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $dataItems = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "External data share with ID '$ExternalDataShareId' successfully revoked in workspace '$WorkspaceId', item '$ItemId'." -Level Info
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve External Data Shares. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\External Data Share\Revoke-FabricExternalDataShare.ps1' 73
#Region '.\Public\Folder\Get-FabricFolder.ps1' -1

<#
.SYNOPSIS
    Retrieves folder details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets folder information from a workspace by folder name or root folder ID.
    Validates parameters, checks authentication, constructs the API request, and returns matching folder(s).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the folder. Mandatory.

.PARAMETER FolderName
    The name of the folder to retrieve. Optional.

.PARAMETER RootFolderId
    The unique identifier of the root folder to retrieve. Optional.

.PARAMETER Recursive
    If specified, retrieves folders recursively. Optional.

.EXAMPLE
    Get-FabricFolder -WorkspaceId "workspace-12345" -FolderName "MyFolder"
    Retrieves details for the folder named "MyFolder" in the specified workspace.

.EXAMPLE
    Get-FabricFolder -WorkspaceId "workspace-12345" -RootFolderId "folder-67890" -Recursive
    Retrieves details for the folder with the given ID and its subfolders.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricFolder {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^(?!\s)(?!.*\s$)(?!.*[~"#.&*:<>?\/{|}])(?!\$recycle\.bin$|^recycled$|^recycler$)[^\x00-\x1F]{1,255}$')]
        [string]$FolderName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RootFolderId,

        [Parameter(Mandatory = $false)]
        [switch]$Recursive
    )

    try {
        # Validate input parameters
        if ($RootFolderId -and $FolderName) {
            Write-FabricLog -Message "Specify only one parameter: either 'RootFolderId' or 'FolderName'." -Level Error
            return $null
        }

        # Additional FolderName validation
        if ($FolderName) {
            if ($FolderName.Length -gt 255) {
                Write-FabricLog -Message "Folder name exceeds 255 characters." -Level Error
                return $null
            }
            if ($FolderName -match '^[\s]|\s$') {
                Write-FabricLog -Message "Folder name cannot have leading or trailing spaces." -Level Error
                return $null
            }
            if ($FolderName -match '[~"#.&*:<>?\/{|}]') {
                Write-FabricLog -Message "Folder name contains invalid characters: ~ # . & * : < > ? / { | }\" -Level Error
                return $null
            }
            if ($FolderName -match '^\$recycle\.bin$|^recycled$|^recycler$') {
                Write-FabricLog -Message "Folder name cannot be a system-reserved name." -Level Error
                return $null
            }
            if ($FolderName -match '[\x00-\x1F]') {
                Write-FabricLog -Message "Folder name contains control characters." -Level Error
                return $null
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $queryParams = @()
        if ($RootFolderId) {
            $queryParams += "rootFolderId=$RootFolderId"
        }
        $recursiveValue = if ($Recursive.IsPresent -and $Recursive) { 'True' } else { 'False' }
        $queryParams += "recursive=$recursiveValue"
        $apiEndpointURI = "{0}/workspaces/{1}/folders?{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, ($queryParams -join '&')
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($FolderName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $FolderName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Warehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Folder\Get-FabricFolder.ps1' 140
#Region '.\Public\Folder\Move-FabricFolder.ps1' -1

<#
.SYNOPSIS
    Moves a folder to a new location within a Microsoft Fabric workspace.

.DESCRIPTION
    This function moves an existing folder to a different location within the specified workspace
    by sending a POST request to the Microsoft Fabric API. You can optionally specify a target folder
    to move the folder under, or leave it empty to move to the root.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the folder to move. This parameter is required.

.PARAMETER FolderId
    The unique identifier of the folder to be moved. This parameter is required.

.PARAMETER TargetFolderId
    (Optional) The unique identifier of the destination folder. If not specified, the folder is moved to the root.

.EXAMPLE
    Move-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890"
    Moves the folder with ID "folder-67890" to the root of workspace "workspace-12345".

.EXAMPLE
    Move-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890" -TargetFolderId "folder-11111"
    Moves the folder with ID "folder-67890" under the folder with ID "folder-11111" in the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Move-FabricFolder {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetFolderId
    )
    try {

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/folders/{2}/move" -f $FabricConfig.BaseUrl, $WorkspaceId, $FolderId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body only if TargetFolderId is provided
        if ($TargetFolderId) {
            $body = @{
                targetFolderId = $TargetFolderId
            }
        }
        else {
            $body = @{}
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess($FolderId, "Move folder in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Folder moved successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to move Folder. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Folder\Move-FabricFolder.ps1' 95
#Region '.\Public\Folder\New-FabricFolder.ps1' -1

<#
.SYNOPSIS
    Creates a new folder in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new folder
    within the specified workspace. Optionally, a parent folder can be specified to nest the new folder.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the folder will be created. This parameter is mandatory.

.PARAMETER FolderName
    The name of the folder to be created. Must be 1-255 characters and not contain invalid or reserved names.

.PARAMETER ParentFolderId
    (Optional) The unique identifier of the parent folder under which the new folder will be created.

.EXAMPLE
    New-FabricFolderps1 -WorkspaceId "workspace-12345" -FolderName "Reports"
    Creates a new folder named "Reports" in the workspace with ID "workspace-12345".

.EXAMPLE
    New-FabricFolderps1 -WorkspaceId "workspace-12345" -FolderName "2024" -ParentFolderId "folder-67890"
    Creates a new folder named "2024" under the parent folder with ID "folder-67890" in the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricFolder {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^(?!\s)(?!.*\s$)(?!.*[~"#.&*:<>?\/{|}])(?!\$recycle\.bin$|^recycled$|^recycler$)[^\x00-\x1F]{1,255}$')]
        [string]$FolderName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentFolderId
    )
    try {
        # Additional FolderName validation
        if ($FolderName) {
            if ($FolderName.Length -gt 255) {
                Write-FabricLog -Message "Folder name exceeds 255 characters." -Level Error
                return $null
            }
            if ($FolderName -match '^[\s]|\s$') {
                Write-FabricLog -Message "Folder name cannot have leading or trailing spaces." -Level Error
                return $null
            }
            if ($FolderName -match '[~"#.&*:<>?\/{|}]') {
                Write-FabricLog -Message "Folder name contains invalid characters: ~ # . & * : < > ? / { | }\" -Level Error
                return $null
            }
            if ($FolderName -match '^\$recycle\.bin$|^recycled$|^recycler$') {
                Write-FabricLog -Message "Folder name cannot be a system-reserved name." -Level Error
                return $null
            }
            if ($FolderName -match '[\x00-\x1F]') {
                Write-FabricLog -Message "Folder name contains control characters." -Level Error
                return $null
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/folders" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $FolderName
        }

        if ($ParentFolderId) {
            $body.parentFolderId = $ParentFolderId
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request (guarded by ShouldProcess)
        if ($PSCmdlet.ShouldProcess($FolderName, "Create folder in workspace '$WorkspaceId'")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Folder created successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Folder. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Folder\New-FabricFolder.ps1' 117
#Region '.\Public\Folder\Remove-FabricFolder.ps1' -1

<#
.SYNOPSIS
    Deletes a folder from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a folder identified by FolderId from the workspace identified by WorkspaceId.

.PARAMETER WorkspaceId
    The ID of the workspace containing the folder to delete.

.PARAMETER FolderId
    The ID of the folder to delete.

.EXAMPLE
    Remove-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890"
    Removes the folder with ID "folder-67890" from the workspace "workspace-12345".
    This example removes the Folder with ID "Folder-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricFolder {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/folders/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $FolderId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess($FolderId, "Delete folder in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Folder '$FolderId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Folder '$FolderId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Folder\Remove-FabricFolder.ps1' 67
#Region '.\Public\Folder\Update-FabricFolder.ps1' -1

<#
.SYNOPSIS
    Updates the name and optionally the description of a folder in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update an existing folder's name and/or description within a specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the folder.

.PARAMETER FolderId
    The unique identifier of the folder to update.

.PARAMETER FolderName
    The new name for the folder.

.PARAMETER FolderDescription
    (Optional) The new description for the folder.

.EXAMPLE
    Update-FabricFolder -WorkspaceId "workspace-12345" -FolderId "folder-67890" -FolderName "New Name" -FolderDescription "Optional description"
    Updates the folder's name and description in the specified workspace.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function Update-FabricFolder {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^(?!\s)(?!.*\s$)(?!.*[~"#.&*:<>?\/{|}])(?!\$recycle\.bin$|^recycled$|^recycler$)[^\x00-\x1F]{1,255}$')]
        [string]$FolderName
    )
    try {
        # Additional FolderName validation
        if ($FolderName) {
            if ($FolderName.Length -gt 255) {
                Write-FabricLog -Message "Folder name exceeds 255 characters." -Level Error
                return $null
            }
            if ($FolderName -match '^[\s]|\s$') {
                Write-FabricLog -Message "Folder name cannot have leading or trailing spaces." -Level Error
                return $null
            }
            if ($FolderName -match '[~"#.&*:<>?\/{|}]') {
                Write-FabricLog -Message "Folder name contains invalid characters: ~ # . & * : < > ? / { | }\" -Level Error
                return $null
            }
            if ($FolderName -match '^\$recycle\.bin$|^recycled$|^recycler$') {
                Write-FabricLog -Message "Folder name cannot be a system-reserved name." -Level Error
                return $null
            }
            if ($FolderName -match '[\x00-\x1F]') {
                Write-FabricLog -Message "Folder name contains control characters." -Level Error
                return $null
            }
        }
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/folders/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $FolderId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $FolderName
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess($FolderId, "Update folder '$FolderName' in workspace '$WorkspaceId'")) {
            # Make the API request
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams
            # Return the API response
            Write-FabricLog -Message "Folder '$FolderName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Folder. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Folder\Update-FabricFolder.ps1' 108
#Region '.\Public\GraphQLApi\Get-FabricGraphQLApi.ps1' -1

<#
.SYNOPSIS
    Retrieves GraphQL API details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets information about GraphQL APIs in a given workspace. You can filter the results by specifying either the GraphQLApiId or the GraphQLApiName.
    The function validates authentication, constructs the API endpoint, sends the request, and returns the matching API details.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the GraphQL API. This parameter is required.

.PARAMETER GraphQLApiId
    The unique identifier of the GraphQL API to retrieve. Optional.

.PARAMETER GraphQLApiName
    The display name of the GraphQL API to retrieve. Optional.

.EXAMPLE
    Get-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiId "graphqlapi-67890"
    Retrieves the GraphQL API with ID "graphqlapi-67890" from the specified workspace.

.EXAMPLE
    Get-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiName "My GraphQL API"
    Retrieves the GraphQL API named "My GraphQL API" from the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricGraphQLApi {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQLApiName
    )
    try {
        # Validate input parameters
        if ($GraphQLApiId -and $GraphQLApiName) {
            Write-FabricLog -Message "Specify only one parameter: either 'GraphQLApiId' or 'GraphQLApiName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($GraphQLApiId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $GraphQLApiId }, 'First')
        }
        elseif ($GraphQLApiName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $GraphQLApiName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve GraphQL API. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\GraphQLApi\Get-FabricGraphQLApi.ps1' 106
#Region '.\Public\GraphQLApi\Get-FabricGraphQLApiDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of a GraphQL API from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Fetches the definition of a GraphQL API in a given workspace using its ID. Handles authentication, constructs the API endpoint, and returns the API response.

.PARAMETER WorkspaceId
    The ID of the workspace containing the GraphQL API. Mandatory.

.PARAMETER GraphQLApiId
    The ID of the GraphQL API to retrieve. Optional.

.PARAMETER GraphQLApiFormat
    The desired format for the API definition (e.g., 'json'). Optional.

.EXAMPLE
    Get-FabricGraphQLApiDefinition -WorkspaceId "workspace-12345" -GraphQLApiId "GraphQLApi-67890"
    Retrieves the definition for the specified GraphQL API in the given workspace.

.EXAMPLE
    Get-FabricGraphQLApiDefinition -WorkspaceId "workspace-12345" -GraphQLApiId "GraphQLApi-67890" -GraphQLApiFormat "json"
    Retrieves the GraphQL API definition in JSON format.

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Uses `Test-TokenExpired` to validate authentication before the request.

    Author: Tiago Balabuch
#>
function Get-FabricGraphQLApiDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $GraphQLApiId
        if ($GraphQLApiFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $GraphQLApiFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "GraphQLApi '$GraphQLApiId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve GraphQLApi. Error: $errorDetails" -Level Error
    }
 }
#EndRegion '.\Public\GraphQLApi\Get-FabricGraphQLApiDefinition.ps1' 77
#Region '.\Public\GraphQLApi\New-FabricGraphQLApi.ps1' -1

<#
.SYNOPSIS
    Creates a new GraphQL API resource in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to provision a new GraphQL API in the given workspace.
    Supports optional parameters for description, definition file, and platform-specific definition file.

.PARAMETER WorkspaceId
    The ID of the workspace where the GraphQL API will be created. Required.

.PARAMETER GraphQLApiName
    The display name for the new GraphQL API. Required.

.PARAMETER GraphQLApiDescription
    Optional. A description for the GraphQL API.

.PARAMETER GraphQLApiPathDefinition
    Optional. Path to the GraphQL API definition file to include.

.PARAMETER GraphQLApiPathPlatformDefinition
    Optional. Path to the platform-specific definition file to include.

.PARAMETER FolderId
    Optional. The folder ID where the GraphQL API will be placed.

.EXAMPLE
    New-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiName "MyApi" -GraphQLApiDescription "Sample API"
    Creates a new GraphQL API named "MyApi" in the specified workspace with a description.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function New-FabricGraphQLApi {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQLApiName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $GraphQLApiName
        }

        if ($FolderId) {
            $body.folderId = $FolderId
        }

        if ($GraphQLApiDescription) {
            $body.description = $GraphQLApiDescription
        }
        if ($GraphQLApiPathDefinition) {
            $GraphQLApiEncodedContent = Convert-ToBase64 -filePath $GraphQLApiPathDefinition

            if (-not [string]::IsNullOrEmpty($GraphQLApiEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "GraphQLApiV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "graphql-definition.json"
                    payload     = $GraphQLApiEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in GraphQLApi definition." -Level Error
                return $null
            }
        }

        if ($GraphQLApiPathPlatformDefinition) {
            $GraphQLApiEncodedPlatformContent = Convert-ToBase64 -filePath $GraphQLApiPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($GraphQLApiEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "GraphQLApiV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $GraphQLApiEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess("GraphQL API '$GraphQLApiName' in workspace '$WorkspaceId'", "Create")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "GraphQLApi '$GraphQLApiName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create GraphQLApi. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\GraphQLApi\New-FabricGraphQLApi.ps1' 161
#Region '.\Public\GraphQLApi\Remove-FabricGraphQLApi.ps1' -1

<#
.SYNOPSIS
    Removes a GraphQL API from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a GraphQL API
    from the specified workspace using the provided WorkspaceId and GraphQLApiId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the GraphQL API.

.PARAMETER GraphQLApiId
    The unique identifier of the GraphQL API to be removed.

.EXAMPLE
    Remove-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiId "graphqlapi-67890"
    Removes the GraphQL API with ID "graphqlapi-67890" from the workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricGraphQLApi {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $GraphQLApiId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($GraphQLApiId, "Delete GraphQL API in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "GraphQLApi '$GraphQLApiId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete GraphQLApi '$GraphQLApiId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\GraphQLApi\Remove-FabricGraphQLApi.ps1' 67
#Region '.\Public\GraphQLApi\Update-FabricGraphQLApi.ps1' -1

<#
.SYNOPSIS
    Updates an existing GraphQL API in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update the specified GraphQL API's name and optionally its description within a workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the GraphQL API.

.PARAMETER GraphQLApiId
    The unique identifier of the GraphQL API to update.

.PARAMETER GraphQLApiName
    The new display name for the GraphQL API.

.PARAMETER GraphQLApiDescription
    An optional new description for the GraphQL API.

.EXAMPLE
    Update-FabricGraphQLApi -WorkspaceId "workspace-12345" -GraphQLApiId "graphqlapi-67890" -GraphQLApiName "Updated API" -GraphQLApiDescription "Updated description"
    Updates the GraphQL API with the specified ID in the given workspace with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricGraphQLApi {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$GraphQLApiName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $GraphQLApiId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $GraphQLApiName
        }

        if ($GraphQLApiDescription) {
            $body.description = $GraphQLApiDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Patch'
            Body    = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess("GraphQL API '$GraphQLApiId' in workspace '$WorkspaceId'", "Update")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "GraphQL API '$GraphQLApiName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update GraphQL API. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\GraphQLApi\Update-FabricGraphQLApi.ps1' 94
#Region '.\Public\GraphQLApi\Update-FabricGraphQLApiDefinition.ps1' -1

<#
.SYNOPSIS
    Updates the definition of a GraphQLApi in a Microsoft Fabric workspace.

.DESCRIPTION
    Updates an existing GraphQLApi's definition by sending a request to the Microsoft Fabric API.
    Supports updating both the main definition and an optional platform-specific definition file.

.PARAMETER WorkspaceId
    The ID of the workspace containing the GraphQLApi.

.PARAMETER GraphQLApiId
    The ID of the GraphQLApi to update.

.PARAMETER GraphQLApiPathDefinition
    Path to the GraphQLApi definition file (required).

.PARAMETER GraphQLApiPathPlatformDefinition
    Path to an optional platform-specific definition file.

.EXAMPLE
    Update-FabricGraphQLApiDefinition -WorkspaceId "workspace-12345" -GraphQLApiId "GraphQLApi-67890" -GraphQLApiPathDefinition "C:\Path\To\GraphQLApiDefinition.json"

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before proceeding.
    Author: Tiago Balabuch
#>
function Update-FabricGraphQLApiDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GraphQLApiPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/GraphQLApis/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $GraphQLApiId
        if ($GraphQLApiPathPlatformDefinition) {
            # Append query parameter correctly instead of replacing the endpoint
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                format = "GraphQLApiV1"
                parts  = @()
            }
        }

        if ($GraphQLApiPathDefinition) {
            $GraphQLApiEncodedContent = Convert-ToBase64 -filePath $GraphQLApiPathDefinition

            if (-not [string]::IsNullOrEmpty($GraphQLApiEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "GraphQLApiProperties.json"
                    payload     = $GraphQLApiEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in GraphQLApi definition." -Level Error
                return $null
            }
        }

        if ($GraphQLApiPathPlatformDefinition) {
            $GraphQLApiEncodedPlatformContent = Convert-ToBase64 -filePath $GraphQLApiPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($GraphQLApiEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $GraphQLApiEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($GraphQLApiId, "Update GraphQL API definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for GraphQLApi with ID '$GraphQLApiId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update GraphQLApi. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\GraphQLApi\Update-FabricGraphQLApiDefinition.ps1' 128
#Region '.\Public\KQL Dashboard\Get-FabricKQLDashboard.ps1' -1

<#
.SYNOPSIS
Retrieves a specific KQL Dashboard or all KQL Dashboards from a workspace.

.DESCRIPTION
Calls the Fabric API to list KQL Dashboards in the target workspace. You can filter by either the dashboard GUID (KQLDashboardId) or the display name (KQLDashboardName). If neither filter is provided all dashboards are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace containing the KQL Dashboards.

.PARAMETER KQLDashboardId
Optional. The GUID of a single KQL Dashboard to retrieve directly. Use this when you already know its identifier.

.PARAMETER KQLDashboardName
Optional. The display name of a KQL Dashboard to retrieve. Provide this when the Id is unknown and you want to match by name.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId -KQLDashboardId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the dashboard whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId -KQLDashboardName 'Operations Overview'

Returns the single dashboard named 'Operations Overview' if it exists.

.EXAMPLE
Get-FabricKQLDashboard -WorkspaceId $wId

Returns all dashboards in the specified workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLDashboardId or KQLDashboardName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

#>

function Get-FabricKQLDashboard {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDashboardName
    )
    try {
        # Validate input parameters
        if ($KQLDashboardId -and $KQLDashboardName) {
            Write-FabricLog -Message "Specify only one parameter: either 'KQLDashboardId' or 'KQLDashboardName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($KQLDashboardId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLDashboardId }, 'First')
        }
        elseif ($KQLDashboardName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLDashboardName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve KQLDashboard. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\KQL Dashboard\Get-FabricKQLDashboard.ps1' 116
#Region '.\Public\KQL Dashboard\Get-FabricKQLDashboardDefinition.ps1' -1


<#
.SYNOPSIS
Retrieves the definition of a KQLDashboard from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the KQLDashboard's content or metadata from a workspace.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the KQLDashboard definition is to be retrieved.

.PARAMETER KQLDashboardId
(Optional)The unique identifier of the KQLDashboard whose definition needs to be retrieved.

.PARAMETER KQLDashboardFormat
Specifies the format of the KQLDashboard definition.

.EXAMPLE
Get-FabricKQLDashboardDefinition -WorkspaceId "12345" -KQLDashboardId "67890"

Retrieves the definition of the KQLDashboard with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricKQLDashboardDefinition -WorkspaceId "12345"

Retrieves the definitions of all KQLDashboards in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricKQLDashboardDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        if ($KQLDashboardFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $KQLDashboardFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "KQLDashboard '$KQLDashboardId' definition retrieved successfully!" -Level Info
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve KQLDashboard. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\KQL Dashboard\Get-FabricKQLDashboardDefinition.ps1' 82
#Region '.\Public\KQL Dashboard\New-FabricKQLDashboard.ps1' -1

<#
.SYNOPSIS
Creates a new KQLDashboard in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new KQLDashboard
in the specified workspace. It supports optional parameters for KQLDashboard description
and path definitions for the KQLDashboard content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the KQLDashboard will be created.

.PARAMETER KQLDashboardName
The name of the KQLDashboard to be created.

.PARAMETER KQLDashboardDescription
An optional description for the KQLDashboard.

.PARAMETER KQLDashboardPathDefinition
An optional path to the KQLDashboard definition file (e.g., .ipynb file) to upload.

.PARAMETER KQLDashboardPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricKQLDashboard -WorkspaceId "workspace-12345" -KQLDashboardName "New KQLDashboard" -KQLDashboardPathDefinition "C:\KQLDashboards\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function New-FabricKQLDashboard {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDashboardName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLDashboardName
        }

        if ($KQLDashboardDescription) {
            $body.description = $KQLDashboardDescription
        }

        if ($KQLDashboardPathDefinition) {
            $KQLDashboardEncodedContent = Convert-ToBase64 -filePath $KQLDashboardPathDefinition

            if (-not [string]::IsNullOrEmpty($KQLDashboardEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "KQLDashboard"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "RealTimeDashboard.json"
                    payload     = $KQLDashboardEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in KQLDashboard definition." -Level Error
                return $null
            }
        }

        if ($KQLDashboardPathPlatformDefinition) {
            $KQLDashboardEncodedPlatformContent = Convert-ToBase64 -filePath $KQLDashboardPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($KQLDashboardEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $null
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLDashboardEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDashboardName, "Create KQL Dashboard in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDashboard '$KQLDashboardName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create KQLDashboard. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Dashboard\New-FabricKQLDashboard.ps1' 153
#Region '.\Public\KQL Dashboard\Remove-FabricKQLDashboard.ps1' -1

<#
.SYNOPSIS
Deletes an KQLDashboard from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLDashboard` function sends a DELETE request to the Fabric API to remove a specified KQLDashboard from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLDashboard to delete.

.PARAMETER KQLDashboardId
(Mandatory) The ID of the KQLDashboard to be deleted.

.EXAMPLE
Remove-FabricKQLDashboard -WorkspaceId "12345" -KQLDashboardId "67890"

Deletes the KQLDashboard with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricKQLDashboard {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($KQLDashboardId, "Delete KQL Dashboard in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDashboard '$KQLDashboardId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete KQLDashboard '$KQLDashboardId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Dashboard\Remove-FabricKQLDashboard.ps1' 67
#Region '.\Public\KQL Dashboard\Update-FabricKQLDashboard.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric KQLDashboard.

.DESCRIPTION
The `Update-FabricKQLDashboard` function updates the name and/or description of a specified Fabric KQLDashboard by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the KQL Dashboard to update. Required to scope the API request.

.PARAMETER KQLDashboardId
The unique identifier of the KQLDashboard to be updated.

.PARAMETER KQLDashboardName
The new name for the KQLDashboard.

.PARAMETER KQLDashboardDescription
(Optional) The new description for the KQLDashboard.

.EXAMPLE
Update-FabricKQLDashboard -KQLDashboardId "KQLDashboard123" -KQLDashboardName "NewKQLDashboardName"

Updates the name of the KQLDashboard with the ID "KQLDashboard123" to "NewKQLDashboardName".

.EXAMPLE
Update-FabricKQLDashboard -KQLDashboardId "KQLDashboard123" -KQLDashboardName "NewName" -KQLDashboardDescription "Updated description"

Updates both the name and description of the KQLDashboard "KQLDashboard123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricKQLDashboard {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDashboardName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDashboards/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLDashboardName
        }

        if ($KQLDashboardDescription) {
            $body.description = $KQLDashboardDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDashboardId, "Update KQL Dashboard in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDashboard '$KQLDashboardName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update KQLDashboard. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Dashboard\Update-FabricKQLDashboard.ps1' 101
#Region '.\Public\KQL Dashboard\Update-FabricKQLDashboardDefinition.ps1' -1

<#
.SYNOPSIS
Updates the definition of a KQLDashboard in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a KQLDashboard in a Microsoft Fabric workspace.
The KQLDashboard content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the KQLDashboard resides.

.PARAMETER KQLDashboardId
(Mandatory) The unique identifier of the KQLDashboard to be updated.

.PARAMETER KQLDashboardPathDefinition
(Mandatory) The file path to the KQLDashboard content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER KQLDashboardPathPlatformDefinition
(Optional) The file path to the KQLDashboard's platform-specific definition file. The content will be encoded as Base64 and sent in the request.


.EXAMPLE
Update-FabricKQLDashboardDefinition -WorkspaceId "12345" -KQLDashboardId "67890" -KQLDashboardPathDefinition "C:\KQLDashboards\KQLDashboard.ipynb"

Updates the content of the KQLDashboard with ID `67890` in the workspace `12345` using the specified KQLDashboard file.

.EXAMPLE
Update-FabricKQLDashboardDefinition -WorkspaceId "12345" -KQLDashboardId "67890" -KQLDashboardPathDefinition "C:\KQLDashboards\KQLDashboard.ipynb"

Updates both the content and metadata of the KQLDashboard with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The KQLDashboard content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>
function Update-FabricKQLDashboardDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDashboardPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/KQLDashboards/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDashboardId
        if ($KQLDashboardPathPlatformDefinition) {
            # Append the query parameter correctly
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                format = $null
                parts  = @()
            }
        }

        if ($KQLDashboardPathDefinition) {
            $KQLDashboardEncodedContent = Convert-ToBase64 -filePath $KQLDashboardPathDefinition

            if (-not [string]::IsNullOrEmpty($KQLDashboardEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "RealTimeDashboard.json"
                    payload     = $KQLDashboardEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in KQLDashboard definition." -Level Error
                return $null
            }
        }

        if ($KQLDashboardPathPlatformDefinition) {
            $KQLDashboardEncodedPlatformContent = Convert-ToBase64 -filePath $KQLDashboardPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($KQLDashboardEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLDashboardEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDashboardId, "Update KQL Dashboard definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for KQL Dashboard with ID '$KQLDashboardId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update KQLDashboard. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Dashboard\Update-FabricKQLDashboardDefinition.ps1' 140
#Region '.\Public\KQL Database\Get-FabricKQLDatabase.ps1' -1

<#
.SYNOPSIS
Retrieves a specific KQL Database or all KQL Databases from a workspace.

.DESCRIPTION
Calls the Fabric API to list KQL Databases in the target workspace. You can filter by either the database GUID (KQLDatabaseId) or the display name (KQLDatabaseName). If neither filter is provided all databases are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace containing the KQL Databases.

.PARAMETER KQLDatabaseId
Optional. The GUID of a single KQL Database to retrieve directly. Use this when you already know its identifier.

.PARAMETER KQLDatabaseName
Optional. The display name of a KQL Database to retrieve. Provide this when the Id is unknown and you want to match by name.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId -KQLDatabaseId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the database whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId -KQLDatabaseName 'Telemetry'

Returns the single database named 'Telemetry' if it exists.

.EXAMPLE
Get-FabricKQLDatabase -WorkspaceId $wId

Returns all databases in the specified workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLDatabaseId or KQLDatabaseName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

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
        # Validate input parameters
        if ($KQLDatabaseId -and $KQLDatabaseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'KQLDatabaseId' or 'KQLDatabaseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($KQLDatabaseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLDatabaseId }, 'First')
        }
        elseif ($KQLDatabaseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLDatabaseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve KQLDatabase. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\KQL Database\Get-FabricKQLDatabase.ps1' 115
#Region '.\Public\KQL Database\Get-FabricKQLDatabaseDefinition.ps1' -1


<#
.SYNOPSIS
Retrieves the definition of a KQLDatabase from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the KQLDatabase's content or metadata from a workspace.
It supports retrieving KQLDatabase definitions in the Jupyter KQLDatabase (`ipynb`) format.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the KQLDatabase definition is to be retrieved.

.PARAMETER KQLDatabaseId
(Optional)The unique identifier of the KQLDatabase whose definition needs to be retrieved.

.PARAMETER KQLDatabaseFormat
Specifies the format of the KQLDatabase definition. Currently, only 'ipynb' is supported.


.EXAMPLE
Get-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890"

Retrieves the definition of the KQLDatabase with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricKQLDatabaseDefinition -WorkspaceId "12345"

Retrieves the definitions of all KQLDatabases in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricKQLDatabaseDefinition {
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
        [string]$KQLDatabaseFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/KQLDatabases/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId
        if ($KQLDatabaseFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $KQLDatabaseFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "KQLDatabase '$KQLDatabaseId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve KQLDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Database\Get-FabricKQLDatabaseDefinition.ps1' 84
#Region '.\Public\KQL Database\New-FabricKQLDatabase.ps1' -1

<#
.SYNOPSIS
Creates a new KQL Database in a workspace.

.DESCRIPTION
The New-FabricKQLDatabase cmdlet provisions a new KQL Database resource inside a specified Fabric workspace. You can
create either a ReadWrite database or a Shortcut database that points to an existing Kusto source via invitation token
or cluster/database references. If definition files are supplied they take precedence and are sent as multi-part inline
Base64 payloads. For Shortcut or ReadWrite types, parentEventhouseId is required to associate the database with its
Eventhouse container.

.PARAMETER WorkspaceId
The GUID of the workspace in which the KQL Database will be created. Required for all calls.

.PARAMETER KQLDatabaseName
The display name of the KQL Database. Must use only letters, numbers, spaces, and underscores. Choose a name that
clearly reflects analytical purpose.

.PARAMETER KQLDatabaseDescription
Optional descriptive text to explain the database’s contents, data domain, or usage patterns for discoverability.

.PARAMETER parentEventhouseId
The GUID of the parent Eventhouse. Required for both ReadWrite and Shortcut types so the service can link the database
to its logical container.

.PARAMETER KQLDatabaseType
Specifies the database type. Use ReadWrite for a standard editable database or Shortcut when referencing an external
Kusto database via invitation token or cluster/database pair.

.PARAMETER KQLInvitationToken
Optional invitation token granting access to an external Kusto database. When provided it overrides SourceClusterUri
and SourceDatabaseName parameters.

.PARAMETER KQLSourceClusterUri
Optional source cluster URI for Shortcut creation when an invitation token is not used. Must be combined with
KQLSourceDatabaseName.

.PARAMETER KQLSourceDatabaseName
Optional source database name for Shortcut creation when using cluster URI instead of invitation token. Required if
KQLSourceClusterUri is specified.

.PARAMETER KQLDatabasePathDefinition
Optional path to a database properties definition file. When provided, the file content is Base64 encoded and sent as a
definition part named DatabaseProperties.json.

.PARAMETER KQLDatabasePathPlatformDefinition
Optional path to a .platform file providing platform-specific configuration. Added as a Base64 encoded part when present.

.PARAMETER KQLDatabasePathSchemaDefinition
Optional path to a KQL schema definition file (e.g. DatabaseSchema.kql). Added as a Base64 encoded part when present.

.EXAMPLE
New-FabricKQLDatabase -WorkspaceId "workspace-12345" -KQLDatabaseName "SalesOps" -parentEventhouseId "eventhouse-1111" -KQLDatabaseType ReadWrite -KQLDatabaseDescription "Sales operational metrics and usage logs"

Creates a standard ReadWrite KQL Database associated with an Eventhouse and adds a descriptive summary.

.EXAMPLE
New-FabricKQLDatabase -WorkspaceId "workspace-12345" -KQLDatabaseName "ExternalRef" -parentEventhouseId "eventhouse-1111" -KQLDatabaseType Shortcut -KQLInvitationToken "invitation-token-value"

Creates a Shortcut KQL Database pointing to an external Kusto source using an invitation token.

.EXAMPLE
New-FabricKQLDatabase -WorkspaceId "workspace-12345" -KQLDatabaseName "Marketing" -parentEventhouseId "eventhouse-1111" -KQLDatabaseType ReadWrite -KQLDatabasePathDefinition "C:\defs\DatabaseProperties.json" -KQLDatabasePathSchemaDefinition "C:\defs\DatabaseSchema.kql"

Creates a ReadWrite KQL Database using provided definition and schema file parts.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.
- Definition file parts take precedence over creation payload shortcuts. Invitation token overrides source cluster info.

Author: Tiago Balabuch

#>

function New-FabricKQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$parentEventhouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet("ReadWrite", "Shortcut")]
        [string]$KQLDatabaseType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLInvitationToken,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLSourceClusterUri,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLSourceDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathSchemaDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLDatabaseName
        }

        if ($KQLDatabaseDescription) {
            $body.description = $KQLDatabaseDescription
        }

        if ($KQLDatabasePathDefinition) {
            $KQLDatabaseEncodedContent = Convert-ToBase64 -filePath $KQLDatabasePathDefinition

            $body.definition = @{
                parts = @()
            }

            if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedContent)) {


                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "DatabaseProperties.json"
                    payload     = $KQLDatabaseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in KQLDatabase definition." -Level Error
                return $null
            }

            if ($KQLDatabasePathPlatformDefinition) {
                $KQLDatabaseEncodedPlatformContent = Convert-ToBase64 -filePath $KQLDatabasePathPlatformDefinition

                if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedPlatformContent)) {

                    # Add new part to the parts array
                    $body.definition.parts += @{
                        path        = ".platform"
                        payload     = $KQLDatabaseEncodedPlatformContent
                        payloadType = "InlineBase64"
                    }
                }
                else {
                    Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                    return $null
                }

            }
            if ($KQLDatabasePathSchemaDefinition) {
                $KQLDatabaseEncodedSchemaContent = Convert-ToBase64 -filePath $KQLDatabasePathSchemaDefinition

                if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedSchemaContent)) {

                    # Add new part to the parts array
                    $body.definition.parts += @{
                        path        = "DatabaseSchema.kql"
                        payload     = $KQLDatabaseEncodedSchemaContent
                        payloadType = "InlineBase64"
                    }
                }
                else {
                    Write-FabricLog -Message "Invalid or empty content in schema definition." -Level Error
                    return $null
                }
            }

        }
        else {
            if ($KQLDatabaseType -eq "Shortcut") {
                if (-not $parentEventhouseId) {
                    Write-FabricLog -Message "Error: 'parentEventhouseId' is required for Shortcut type." -Level Error
                    return $null
                }
                if (-not ($KQLInvitationToken -or $KQLSourceClusterUri -or $KQLSourceDatabaseName)) {
                    Write-FabricLog -Message "Error: Provide either 'KQLInvitationToken', 'KQLSourceClusterUri', or 'KQLSourceDatabaseName'." -Level Error
                    return $null
                }
                if ($KQLInvitationToken) {
                    Write-FabricLog -Message "Info: 'KQLInvitationToken' is provided." -Level Warning

                    if ($KQLSourceClusterUri) {
                        Write-FabricLog -Message "Warning: 'KQLSourceClusterUri' is ignored when 'KQLInvitationToken' is provided." -Level Warning
                        #$KQLSourceClusterUri = $null
                    }
                    if ($KQLSourceDatabaseName) {
                        Write-FabricLog -Message "Warning: 'KQLSourceDatabaseName' is ignored when 'KQLInvitationToken' is provided." -Level Warning
                        #$KQLSourceDatabaseName = $null
                    }
                }
                if ($KQLSourceClusterUri -and -not $KQLSourceDatabaseName) {
                    Write-FabricLog -Message "Error: 'KQLSourceDatabaseName' is required when 'KQLSourceClusterUri' is provided." -Level Error
                    return $null
                }
            }

            # Validate ReadWrite type database
            if ($KQLDatabaseType -eq "ReadWrite" -and -not $parentEventhouseId) {
                Write-FabricLog -Message "Error: 'parentEventhouseId' is required for ReadWrite type." -Level Error
                return $null
            }

            $body.creationPayload = @{
                databaseType           = $KQLDatabaseType
                parentEventhouseItemId = $parentEventhouseId
            }

            if ($KQLDatabaseType -eq "Shortcut") {
                if ($KQLInvitationToken) {

                    $body.creationPayload.invitationToken = $KQLInvitationToken
                }
                if ($KQLSourceClusterUri -and -not $KQLInvitationToken) {
                    $body.creationPayload.sourceClusterUri = $KQLSourceClusterUri
                }
                if ($KQLSourceDatabaseName -and -not $KQLInvitationToken) {
                    $body.creationPayload.sourceDatabaseName = $KQLSourceDatabaseName
                }
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDatabaseName, "Create KQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDatabase '$KQLDatabaseName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create KQLDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Database\New-FabricKQLDatabase.ps1' 281
#Region '.\Public\KQL Database\Remove-FabricKQLDatabase.ps1' -1

<#
.SYNOPSIS
Deletes an KQLDatabase from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLDatabase` function sends a DELETE request to the Fabric API to remove a specified KQLDatabase from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLDatabase to delete.

.PARAMETER KQLDatabaseId
(Mandatory) The ID of the KQLDatabase to be deleted.

.EXAMPLE
Remove-FabricKQLDatabase -WorkspaceId "12345" -KQLDatabaseId "67890"

Deletes the KQLDatabase with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricKQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($KQLDatabaseId, "Delete KQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDatabase '$KQLDatabaseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete KQLDatabase '$KQLDatabaseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Database\Remove-FabricKQLDatabase.ps1' 68
#Region '.\Public\KQL Database\Update-FabricKQLDatabase.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric KQLDatabase.

.DESCRIPTION
The `Update-FabricKQLDatabase` function updates the name and/or description of a specified Fabric KQLDatabase by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the KQL Database to update. Required to scope the API request.

.PARAMETER KQLDatabaseId
The unique identifier of the KQLDatabase to be updated.

.PARAMETER KQLDatabaseName
The new name for the KQLDatabase.

.PARAMETER KQLDatabaseDescription
(Optional) The new description for the KQLDatabase.

.EXAMPLE
Update-FabricKQLDatabase -KQLDatabaseId "KQLDatabase123" -KQLDatabaseName "NewKQLDatabaseName"

Updates the name of the KQLDatabase with the ID "KQLDatabase123" to "NewKQLDatabaseName".

.EXAMPLE
Update-FabricKQLDatabase -KQLDatabaseId "KQLDatabase123" -KQLDatabaseName "NewName" -KQLDatabaseDescription "Updated description"

Updates both the name and description of the KQLDatabase "KQLDatabase123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricKQLDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseDescription
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLDatabaseName
        }

        if ($KQLDatabaseDescription) {
            $body.description = $KQLDatabaseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDatabaseId, "Update KQL Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLDatabase '$KQLDatabaseName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update KQLDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Database\Update-FabricKQLDatabase.ps1' 102
#Region '.\Public\KQL Database\Update-FabricKQLDatabaseDefinition.ps1' -1

<#
.SYNOPSIS
Updates the definition of a KQLDatabase in a Microsoft Fabric workspace.

.DESCRIPTION
Updates the definition of a KQLDatabase by sending one or more definition parts to the Fabric API.
You can provide the primary database properties, an optional platform definition, and an optional schema definition.
Each file path you provide is read, encoded as Base64, and included in the request payload.

.PARAMETER WorkspaceId
Mandatory. The unique identifier of the workspace that contains the KQL Database. Use the workspace GUID, not the display name.

.PARAMETER KQLDatabaseId
Mandatory. The unique identifier (GUID) of the KQL Database whose definition should be updated.

.PARAMETER KQLDatabasePathDefinition
Mandatory. Full path to the primary definition file for the database (for example, DatabaseProperties.json). The file is read and Base64-encoded before being sent.

.PARAMETER KQLDatabasePathPlatformDefinition
Optional. Full path to a platform-specific definition file (for example, .platform). When provided, the file content is encoded and submitted as an additional definition part.

.PARAMETER KQLDatabasePathSchemaDefinition
Optional. Full path to a schema definition file (for example, DatabaseSchema.kql). When provided, the schema is included as another definition part in the update request.

.EXAMPLE
Update-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890" -KQLDatabasePathDefinition "C:\\KQL\DatabaseProperties.json"

Updates the KQL Database definition using only the primary definition file. This replaces properties using the provided JSON file.

.EXAMPLE
Update-FabricKQLDatabaseDefinition -WorkspaceId "12345" -KQLDatabaseId "67890" -KQLDatabasePathDefinition "C:\\KQL\DatabaseProperties.json" -KQLDatabasePathSchemaDefinition "C:\\KQL\DatabaseSchema.kql"

Updates the KQL Database and includes an updated schema definition by attaching both the properties and schema files to the request.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Each provided file is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>

function Update-FabricKQLDatabaseDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLDatabasePathSchemaDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/kqlDatabases/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLDatabaseId
        if ($KQLDatabasePathPlatformDefinition) {
            # Append query parameter correctly
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($KQLDatabasePathDefinition) {
            $KQLDatabaseEncodedContent = Convert-ToBase64 -filePath $KQLDatabasePathDefinition

            if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "DatabaseProperties.json"
                    payload     = $KQLDatabaseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in KQLDatabase definition." -Level Error
                return $null
            }
        }

        if ($KQLDatabasePathPlatformDefinition) {
            $KQLDatabaseEncodedPlatformContent = Convert-ToBase64 -filePath $KQLDatabasePathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLDatabaseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        if ($KQLDatabasePathSchemaDefinition) {
            $KQLDatabaseEncodedSchemaContent = Convert-ToBase64 -filePath $KQLDatabasePathSchemaDefinition

            if (-not [string]::IsNullOrEmpty($KQLDatabaseEncodedSchemaContent)) {

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "DatabaseSchema.kql"
                    payload     = $KQLDatabaseEncodedSchemaContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in schema definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLDatabaseId, "Update KQL Database definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for KQL Database with ID '$KQLDatabaseId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update KQLDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Database\Update-FabricKQLDatabaseDefinition.ps1' 165
#Region '.\Public\KQL Queryset\Get-FabricKQLQueryset.ps1' -1

<#
.SYNOPSIS
Retrieves a specific KQL Queryset or all KQL Querysets from a workspace.

.DESCRIPTION
Calls the Fabric API to list KQL Querysets in the target workspace. You can filter by either the queryset GUID (KQLQuerysetId) or the display name (KQLQuerysetName). If neither filter is provided all querysets are returned. Supplying both filters is not allowed.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace containing the KQL Querysets.

.PARAMETER KQLQuerysetId
Optional. The GUID of a single KQL Queryset to retrieve directly. Use this for direct lookup when you know the identifier.

.PARAMETER KQLQuerysetName
Optional. The display name of a KQL Queryset to retrieve. Provide this when the Id is unknown and you want to match by name.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId $wId -KQLQuerysetId '1a2b3c4d-5555-6666-7777-88889999aaaa'

Returns only the queryset whose Id matches the given GUID.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId $wId -KQLQuerysetName 'User Activity'

Returns the single queryset named 'User Activity' if it exists.

.EXAMPLE
Get-FabricKQLQueryset -WorkspaceId $wId

Returns all querysets in the specified workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Validates token freshness via `Test-TokenExpired` before request.
- Only one of KQLQuerysetId or KQLQuerysetName can be specified.

Author: Tiago Balabuch; Help extended by Copilot.

#>
function Get-FabricKQLQueryset {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLQuerysetName
    )
    try {
        # Validate input parameters
        if ($KQLQuerysetId -and $KQLQuerysetName) {
            Write-FabricLog -Message "Specify only one parameter: either 'KQLQuerysetId' or 'KQLQuerysetName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($KQLQuerysetId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $KQLQuerysetId }, 'First')
        }
        elseif ($KQLQuerysetName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $KQLQuerysetName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve KQLQueryset. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\KQL Queryset\Get-FabricKQLQueryset.ps1' 115
#Region '.\Public\KQL Queryset\Get-FabricKQLQuerysetDefinition.ps1' -1


<#
.SYNOPSIS
Retrieves the definition of a KQLQueryset from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the KQLQueryset's content or metadata from a workspace.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the KQLQueryset definition is to be retrieved.

.PARAMETER KQLQuerysetId
(Optional)The unique identifier of the KQLQueryset whose definition needs to be retrieved.

.PARAMETER KQLQuerysetFormat
Specifies the format of the KQLQueryset definition.

.EXAMPLE
Get-FabricKQLQuerysetDefinition -WorkspaceId "12345" -KQLQuerysetId "67890"

Retrieves the definition of the KQLQueryset with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricKQLQuerysetDefinition -WorkspaceId "12345"

Retrieves the definitions of all KQLQuerysets in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricKQLQuerysetDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId
        if ($KQLQuerysetFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $KQLQuerysetFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        Write-FabricLog -Message "KQLQueryset '$KQLQuerysetId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve KQLQueryset. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\KQL Queryset\Get-FabricKQLQuerysetDefinition.ps1' 81
#Region '.\Public\KQL Queryset\New-FabricKQLQueryset.ps1' -1

<#
.SYNOPSIS
Creates a new KQLQueryset in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new KQLQueryset
in the specified workspace. It supports optional parameters for KQLQueryset description
and path definitions for the KQLQueryset content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the KQLQueryset will be created.

.PARAMETER KQLQuerysetName
The name of the KQLQueryset to be created.

.PARAMETER KQLQuerysetDescription
An optional description for the KQLQueryset.

.PARAMETER KQLQuerysetPathDefinition
An optional path to the KQLQueryset definition file (e.g., .ipynb file) to upload.

.PARAMETER KQLQuerysetPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricKQLQueryset -WorkspaceId "workspace-12345" -KQLQuerysetName "New KQLQueryset" -KQLQuerysetPathDefinition "C:\KQLQuerysets\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function New-FabricKQLQueryset {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLQuerysetName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLQuerysetName
        }

        if ($KQLQuerysetDescription) {
            $body.description = $KQLQuerysetDescription
        }

        if ($KQLQuerysetPathDefinition) {
            $KQLQuerysetEncodedContent = Convert-ToBase64 -filePath $KQLQuerysetPathDefinition

            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $null
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "RealTimeQueryset.json"
                    payload     = $KQLQuerysetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in KQLQueryset definition." -Level Error
                return $null
            }
        }

        if ($KQLQuerysetPathPlatformDefinition) {
            $KQLQuerysetEncodedPlatformContent = Convert-ToBase64 -filePath $KQLQuerysetPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $null
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLQuerysetEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLQuerysetName, "Create KQL Queryset in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLQueryset '$KQLQuerysetName' created successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create KQLQueryset. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Queryset\New-FabricKQLQueryset.ps1' 154
#Region '.\Public\KQL Queryset\Remove-FabricKQLQueryset.ps1' -1

<#
.SYNOPSIS
Deletes an KQLQueryset from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricKQLQueryset` function sends a DELETE request to the Fabric API to remove a specified KQLQueryset from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the KQLQueryset to delete.

.PARAMETER KQLQuerysetId
(Mandatory) The ID of the KQLQueryset to be deleted.

.EXAMPLE
Remove-FabricKQLQueryset -WorkspaceId "12345" -KQLQuerysetId "67890"

Deletes the KQLQueryset with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricKQLQueryset {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($KQLQuerysetId, "Delete KQL Queryset in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLQueryset '$KQLQuerysetId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete KQLQueryset '$KQLQuerysetId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Queryset\Remove-FabricKQLQueryset.ps1' 67
#Region '.\Public\KQL Queryset\Update-FabricKQLQueryset.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric KQLQueryset.

.DESCRIPTION
The `Update-FabricKQLQueryset` function updates the name and/or description of a specified Fabric KQLQueryset by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the KQL Queryset to update. Required to scope the API request.

.PARAMETER KQLQuerysetId
The unique identifier of the KQLQueryset to be updated.

.PARAMETER KQLQuerysetName
The new name for the KQLQueryset.

.PARAMETER KQLQuerysetDescription
(Optional) The new description for the KQLQueryset.

.EXAMPLE
Update-FabricKQLQueryset -KQLQuerysetId "KQLQueryset123" -KQLQuerysetName "NewKQLQuerysetName"

Updates the name of the KQLQueryset with the ID "KQLQueryset123" to "NewKQLQuerysetName".

.EXAMPLE
Update-FabricKQLQueryset -KQLQuerysetId "KQLQueryset123" -KQLQuerysetName "NewName" -KQLQuerysetDescription "Updated description"

Updates both the name and description of the KQLQueryset "KQLQueryset123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricKQLQueryset {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$KQLQuerysetName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $KQLQuerysetName
        }

        if ($KQLQuerysetDescription) {
            $body.description = $KQLQuerysetDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLQuerysetId, "Update KQL Queryset in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "KQLQueryset '$KQLQuerysetName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update KQLQueryset. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Queryset\Update-FabricKQLQueryset.ps1' 101
#Region '.\Public\KQL Queryset\Update-FabricKQLQuerysetDefinition.ps1' -1

<#
.SYNOPSIS
Updates the definition of a KQLQueryset in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a KQLQueryset in a Microsoft Fabric workspace.
The KQLQueryset content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the KQLQueryset resides.

.PARAMETER KQLQuerysetId
(Mandatory) The unique identifier of the KQLQueryset to be updated.

.PARAMETER KQLQuerysetPathDefinition
(Mandatory) The file path to the KQLQueryset content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER KQLQuerysetPathPlatformDefinition
(Optional) The file path to the KQLQueryset's platform-specific definition file. The content will be encoded as Base64 and sent in the request.


.EXAMPLE
Update-FabricKQLQuerysetDefinition -WorkspaceId "12345" -KQLQuerysetId "67890" -KQLQuerysetPathDefinition "C:\KQLQuerysets\KQLQueryset.ipynb"

Updates the content of the KQLQueryset with ID `67890` in the workspace `12345` using the specified KQLQueryset file.

.EXAMPLE
Update-FabricKQLQuerysetDefinition -WorkspaceId "12345" -KQLQuerysetId "67890" -KQLQuerysetPathDefinition "C:\KQLQuerysets\KQLQueryset.ipynb"

Updates both the content and metadata of the KQLQueryset with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The KQLQueryset content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>
function Update-FabricKQLQuerysetDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$KQLQuerysetPathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/kqlQuerysets/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $KQLQuerysetId
        if ($KQLQuerysetPathPlatformDefinition) {
            # Append query parameter correctly
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                format = $null
                parts  = @()
            }
        }

        if ($KQLQuerysetPathDefinition) {
            $KQLQuerysetEncodedContent = Convert-ToBase64 -filePath $KQLQuerysetPathDefinition

            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "RealTimeQueryset.json"
                    payload     = $KQLQuerysetEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in KQLQueryset definition." -Level Error
                return $null
            }
        }

        if ($KQLQuerysetPathPlatformDefinition) {
            $KQLQuerysetEncodedPlatformContent = Convert-ToBase64 -filePath $KQLQuerysetPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($KQLQuerysetEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $KQLQuerysetEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($KQLQuerysetId, "Update KQL Queryset definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for KQL Queryset with ID '$KQLQuerysetId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update KQLQueryset. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\KQL Queryset\Update-FabricKQLQuerysetDefinition.ps1' 141
#Region '.\Public\Labels\Remove-FabricLabel.ps1' -1

<#
.SYNOPSIS
Removes labels in bulk from items in Microsoft Fabric.

.DESCRIPTION
Removes labels from multiple items (such as datasets, reports, etc.) in a Microsoft Fabric workspace by sending a bulk removal request to the Fabric API. Each item must include 'id' and 'type' properties.

.PARAMETER Items
An array of objects, each containing 'id' and 'type' properties, representing the items from which labels will be removed.

.EXAMPLE
    Remove-FabricLabel -Items @(@{id="item1"; type="dataset"}, @{id="item2"; type="report"})

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Remove-FabricLabel {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Items # Array with 'id' and 'type'
    )
    try {
        # Validate Items structure
        foreach ($item in $Items) {
            if (-not ($item.id -and $item.type)) {
                throw "Each Item must contain 'id' and 'type' properties. Found: $item"
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/items/bulkRemoveLabels" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            items = $Items
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess("Bulk label removal", "Remove labels from $($Items.Count) item(s)")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Bulk label removal completed successfully." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to remove labels in bulk. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Labels\Remove-FabricLabel.ps1' 74
#Region '.\Public\Labels\Set-FabricLabel.ps1' -1

<#
.SYNOPSIS
Assigns a label in bulk to multiple items in Microsoft Fabric.

.DESCRIPTION
The Set-FabricLabel function assigns a specified label to an array of items (such as datasets, reports, or other supported types) in Microsoft Fabric using a single API call. It supports optional assignment methods and delegated principal scenarios.

.PARAMETER Items
An array of objects, each containing 'id' and 'type' properties, representing the items to which the label will be assigned.

.PARAMETER LabelId
The unique identifier of the label to assign.

.PARAMETER AssignmentMethod
(Optional) The method of label assignment. Valid values are 'Priviledged' or 'Standard'. Defaults to 'Standard'.

.PARAMETER DelegatedPrincipal
(Optional) An object specifying the delegated principal for the label assignment.

.EXAMPLE
Set-FabricLabel -Items @(@{id='item1';type='dataset'}, @{id='item2';type='report'}) -LabelId 'label-123'

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Set-FabricLabel {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Items, # Array with 'id' and 'type'

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LabelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Priviledged', 'Standard')]
        [string]$AssignmentMethod = 'Standard',

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$DelegatedPrincipal
    )
    try {
        # Validate Items structure
        foreach ($item in $Items) {
            if (-not ($item.id -and $item.type)) {
                throw "Each Item must contain 'id' and 'type' properties. Found: $item"
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/items/bulkSetLabels" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            items   = $Items
            labelId = $LabelId
        }

        if ($AssignmentMethod) {
            $body.assignmentMethod = $AssignmentMethod
        }

        if ($DelegatedPrincipal) {
            $body.delegatedPrincipal = $DelegatedPrincipal
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 5
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess("Bulk label assignment", "Assign label '$LabelId' to $($Items.Count) item(s)")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Bulk label assignment completed successfully for $($Items.Count) item(s) with LabelId '$LabelId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Bulk label assignment failed for LabelId '$LabelId'. Error details: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Labels\Set-FabricLabel.ps1' 105
#Region '.\Public\Lakehouse\Get-FabricLakehouse.ps1' -1

<#
.SYNOPSIS
Gets a Lakehouse or lists all Lakehouses in a workspace.

.DESCRIPTION
The Get-FabricLakehouse cmdlet retrieves Lakehouse items from a specified Microsoft Fabric workspace. You can list all
Lakehouses or filter by a specific lakehouse Id or display name. Only one of LakehouseId or LakehouseName can be used.

.PARAMETER WorkspaceId
The GUID of the workspace containing the Lakehouse resources you wish to enumerate. This is required for every call.

.PARAMETER LakehouseId
Optional. Returns only the Lakehouse matching this resource Id. Use this when you previously captured the Id from a
listing and want a direct lookup without client filtering.

.PARAMETER LakehouseName
Optional. Returns only the Lakehouse whose display name exactly matches this value. Provide this when the Id is not
known. Do not combine with LakehouseId.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -LakehouseId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the single Lakehouse with the specified Id.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345" -LakehouseName "Development"

Retrieves the Lakehouse named Development from workspace 12345.

.EXAMPLE
Get-FabricLakehouse -WorkspaceId "12345"

Lists all Lakehouses available in the workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricLakehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$LakehouseName
    )
    try {
        # Validate input parameters
        if ($LakehouseId -and $LakehouseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'LakehouseId' or 'LakehouseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LakehouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $LakehouseId }, 'First')
        }
        elseif ($LakehouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $LakehouseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Lakehouse. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Lakehouse\Get-FabricLakehouse.ps1' 117
#Region '.\Public\Lakehouse\Get-FabricLakehouseLivySession.ps1' -1

<#
.SYNOPSIS
Retrieves one or more Livy sessions for a specified Lakehouse in Microsoft Fabric.

.DESCRIPTION
The Get-FabricLakehouseLivySession function queries the Fabric API to obtain Livy session details for a given workspace and Lakehouse. Optionally, it can filter results by a specific Livy session ID.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Lakehouse.

.PARAMETER LakehouseId
(Mandatory) The ID of the Lakehouse for which to retrieve Livy sessions.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricLakehouseLivySession -WorkspaceId "12345" -LakehouseId "67890"

Retrieves all Livy sessions for the specified Lakehouse.

.EXAMPLE
Get-FabricLakehouseLivySession -WorkspaceId "12345" -LakehouseId "67890" -LivyId "abcde"

Retrieves the Livy session with ID "abcde" for the specified Lakehouse.

.NOTES
- Requires the global $FabricConfig object with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricLakehouseLivySession {
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
        [string]$LivyId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/livySessions" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Lakehouse Livy Session. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Lakehouse\Get-FabricLakehouseLivySession.ps1' 97
#Region '.\Public\Lakehouse\Get-FabricLakehouseTable.ps1' -1

<#
.SYNOPSIS
Gets table metadata for a Lakehouse.

.DESCRIPTION
The Get-FabricLakehouseTable cmdlet retrieves table metadata for a specified Lakehouse within a workspace. Use this to
inspect available tables or validate that ingestion has produced expected table objects.

.PARAMETER WorkspaceId
The GUID of the workspace hosting the Lakehouse. Required so the API can locate the Lakehouse resource scope.

.PARAMETER LakehouseId
The Id of the Lakehouse whose tables you want to enumerate. Required for the request URL. Provide the Lakehouse Id
returned from a prior Get-FabricLakehouse call.

.EXAMPLE
Get-FabricLakehouseTable -WorkspaceId 11111111-2222-3333-4444-555555555555 -LakehouseId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Returns one or more table metadata objects for the specified Lakehouse.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricLakehouseTable {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Initialize variables
        $maxResults = 1

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/tables?maxResults={3}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId, $maxResults
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Handle results
        if ($dataItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
        else {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Lakehouse. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Lakehouse\Get-FabricLakehouseTable.ps1' 72
#Region '.\Public\Lakehouse\New-FabricLakehouse.ps1' -1

<#
.SYNOPSIS
Creates a new Lakehouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new Lakehouse
in the specified workspace. It supports optional parameters for Lakehouse description
and path definitions for the Lakehouse content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the Lakehouse will be created.

.PARAMETER LakehouseName
The name of the Lakehouse to be created.

.PARAMETER LakehouseDescription
An optional description for the Lakehouse.

.PARAMETER LakehouseEnableSchemas
An optional path to enable schemas in the Lakehouse

.EXAMPLE
 Add-FabricLakehouse -WorkspaceId "workspace-12345" -LakehouseName "New Lakehouse" -LakehouseEnableSchemas $true

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricLakehouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$LakehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$LakehouseEnableSchemas = $false
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $LakehouseName
        }

        if ($LakehouseDescription) {
            $body.description = $LakehouseDescription
        }

        if ($true -eq $LakehouseEnableSchemas) {
            $body.creationPayload = @{
                enableSchemas = $LakehouseEnableSchemas
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($LakehouseName, "Create Lakehouse in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Lakehouse '$LakehouseName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Lakehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Lakehouse\New-FabricLakehouse.ps1' 103
#Region '.\Public\Lakehouse\Remove-FabricLakehouse.ps1' -1

<#
.SYNOPSIS
Deletes an Lakehouse from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricLakehouse` function sends a DELETE request to the Fabric API to remove a specified Lakehouse from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Lakehouse to delete.

.PARAMETER LakehouseId
(Mandatory) The ID of the Lakehouse to be deleted.

.EXAMPLE
Remove-FabricLakehouse -WorkspaceId "12345" -LakehouseId "67890"

Deletes the Lakehouse with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricLakehouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($LakehouseId, "Delete Lakehouse in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Lakehouse '$LakehouseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }


    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Lakehouse '$LakehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Lakehouse\Remove-FabricLakehouse.ps1' 69
#Region '.\Public\Lakehouse\Start-FabricLakehouseRefreshMaterializedLakeView.ps1' -1

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
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
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
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Validate input parameters
        #$lakehouse = Get-FabricLakehouse -WorkspaceId $WorkspaceId -LakehouseId $LakehouseId
        #if ($lakehouse.properties.PSObject.Properties['defaultSchema'] -and -not $SchemaName) {
        #    Write-Error "The Lakehouse '$lakehouse.displayName' has schema enabled, but no schema name was provided. Please specify the 'SchemaName' parameter to proceed."
        #    return $null
        #}

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $LakehouseId, $JobType
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

          # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }

        if ($WaitForCompletion.IsPresent) {
            $apiParams.WaitForCompletion = $true
        }
        if ($PSCmdlet.ShouldProcess($LakehouseId, "Start refresh materialized lake views job in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            if ($WaitForCompletion) {
                Write-FabricLog -Message "Refresh MLV job for Lakehouse '$LakehouseId' has completed." -Level Info
                Write-FabricLog -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
            }
            else {
                Write-FabricLog -Message "Refresh MLV job for Lakehouse '$LakehouseId' has been started and is running asynchronously." -Level Info
                Write-FabricLog -Message "You can monitor the job status using the job ID from the response." -Level Debug
            }
            # Return the API response
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to start refresh MLV job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Lakehouse\Start-FabricLakehouseRefreshMaterializedLakeView.ps1' 100
#Region '.\Public\Lakehouse\Start-FabricLakehouseTableMaintenance.ps1' -1

<#
.SYNOPSIS
Starts a table maintenance job for a specified Lakehouse table in Microsoft Fabric.

.DESCRIPTION
Start-FabricLakehouseTableMaintenance initiates a table maintenance operation (such as optimization or vacuum) on a table within a Lakehouse. You can specify options like schema, table name, optimization settings (vOrder, zOrderBy), and retention period for vacuuming. The function validates authentication, constructs the API request, and optionally waits for job completion.

.PARAMETER WorkspaceId
[string] (Mandatory) The ID of the workspace containing the Lakehouse.

.PARAMETER LakehouseId
[string] (Mandatory) The ID of the Lakehouse where the table resides.

.PARAMETER JobType
[string] (Optional) The type of maintenance job. Default is "TableMaintenance".

.PARAMETER SchemaName
[string] (Optional) The schema name if the Lakehouse uses schemas.

.PARAMETER TableName
[string] (Optional) The name of the table to maintain.

.PARAMETER IsVOrder
[bool] (Optional) Enables vOrder optimization if set to $true.

.PARAMETER ColumnsZOrderBy
[string[]] (Optional) Columns to use for zOrder optimization. Accepts a comma-separated string or array.

.PARAMETER retentionPeriod
[string] (Optional) Retention period for vacuum operation (format: HH:mm:ss).

.PARAMETER WaitForCompletion
[switch] (Optional) If specified, waits for the maintenance job to complete before returning.

.EXAMPLE
Start-FabricLakehouseTableMaintenance -WorkspaceId "12345" -LakehouseId "67890" -TableName "Sales" -IsVOrder $true -ColumnsZOrderBy "ProductId,Date"

.OUTPUTS
Returns the API response object with job details, or $null if the operation fails.

.NOTES
- Requires $FabricConfig with BaseUrl and FabricHeaders.
- Validates authentication using Test-TokenExpired.
- Logs errors and returns $null on failure.

Author: Tiago Balabuch
#>
function Start-FabricLakehouseTableMaintenance {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('TableMaintenance')]
        [string]$JobType = "TableMaintenance",

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SchemaName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TableName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$IsVOrder,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string[]]$ColumnsZOrderBy,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern("^\d+:[0-1][0-9]|2[0-3]:[0-5][0-9]:[0-5][0-9]$")]
        [string]$retentionPeriod,

        [Parameter(Mandatory = $false)]
        [switch]$WaitForCompletion
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Validate input parameters
        $lakehouse = Get-FabricLakehouse -WorkspaceId $WorkspaceId -LakehouseId $LakehouseId
        if ($lakehouse.properties.PSObject.Properties['defaultSchema'] -and -not $SchemaName) {
            Write-Error "The Lakehouse '$lakehouse.displayName' has schema enabled, but no schema name was provided. Please specify the 'SchemaName' parameter to proceed."
            return $null
        }

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $LakehouseId, $JobType
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            executionData = @{
                tableName        = $TableName
                optimizeSettings = @{}
            }
        }
        if ($lakehouse.properties.PSObject.Properties['defaultSchema'] -and $SchemaName) {
            $body.executionData.schemaName = $SchemaName
        }
        if ($IsVOrder) {
            $body.executionData.optimizeSettings.vOrder = $IsVOrder
        }


        if ($ColumnsZOrderBy) {
            Write-FabricLog -Message "Original ColumnsZOrderBy input: $ColumnsZOrderBy" -Level Debug

            # If it's a single string like "id,nome", split it into array
            if ($ColumnsZOrderBy.Count -eq 1 -and $ColumnsZOrderBy[0] -is [string] -and $ColumnsZOrderBy[0] -match ",") {
                Write-FabricLog -Message "Detected comma-separated string in ColumnsZOrderBy. Splitting it..." -Level Debug
                $ColumnsZOrderBy = $ColumnsZOrderBy[0] -split "\s*,\s*"
            }

            # Ensure values are trimmed and valid
            $ColumnsZOrderBy = $ColumnsZOrderBy | ForEach-Object { $_.ToString().Trim() } | Where-Object { $_ }

            if ($ColumnsZOrderBy.Count -gt 0) {
                $body.executionData.optimizeSettings.zOrderBy = $ColumnsZOrderBy
                Write-FabricLog -Message "Final ColumnsZOrderBy: $($ColumnsZOrderBy -join ', ')" -Level Debug
            }
            else {
                Write-FabricLog -Message "ColumnsZOrderBy was provided but resulted in an empty array after processing." -Level Warning
            }
        }


        if ($retentionPeriod) {
            if (-not $body.executionData.PSObject.Properties['vacuumSettings']) {
                $body.executionData.vacuumSettings = @{
                    retentionPeriod = @()
                }
            }
            $body.executionData.vacuumSettings.retentionPeriod = $retentionPeriod

        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }

        if ($WaitForCompletion.IsPresent) {
            $apiParams.WaitForCompletion = $true
        }
        if ($PSCmdlet.ShouldProcess($LakehouseId, "Start lakehouse table maintenance job in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            if ($WaitForCompletion) {
                Write-FabricLog -Message "Table maintenance job for Lakehouse '$LakehouseId' has completed." -Level Info
                Write-FabricLog -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
            }
            else {
                Write-FabricLog -Message "Table maintenance job for Lakehouse '$LakehouseId' has been started and is running asynchronously." -Level Info
                Write-FabricLog -Message "You can monitor the job status using the job ID from the response." -Level Debug
            }
            # Return the API response
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to start table maintenance job. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Lakehouse\Start-FabricLakehouseTableMaintenance.ps1' 188
#Region '.\Public\Lakehouse\Update-FabricLakehouse.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric Lakehouse.

.DESCRIPTION
The `Update-FabricLakehouse` function updates the name and/or description of a specified Fabric Lakehouse by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Lakehouse to update. Required to scope the API request.

.PARAMETER LakehouseId
The unique identifier of the Lakehouse to be updated.

.PARAMETER LakehouseName
The new name for the Lakehouse.

.PARAMETER LakehouseDescription
(Optional) The new description for the Lakehouse.

.EXAMPLE
Update-FabricLakehouse -LakehouseId "Lakehouse123" -LakehouseName "NewLakehouseName"

Updates the name of the Lakehouse with the ID "Lakehouse123" to "NewLakehouseName".

.EXAMPLE
Update-FabricLakehouse -LakehouseId "Lakehouse123" -LakehouseName "NewName" -LakehouseDescription "Updated description"

Updates both the name and description of the Lakehouse "Lakehouse123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricLakehouse {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$LakehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseDescription
    )
    try {
       # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $LakehouseName
        }

        if ($LakehouseDescription) {
            $body.description = $LakehouseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($LakehouseId, "Update Lakehouse in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Lakehouse '$LakehouseName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Lakehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Lakehouse\Update-FabricLakehouse.ps1' 101
#Region '.\Public\Lakehouse\Write-FabricLakehouseTableData.ps1' -1

<#
.SYNOPSIS
Loads one or more data files (or all files in a folder) into a Lakehouse table within a Microsoft Fabric workspace.

.DESCRIPTION
Triggers a load operation against a Lakehouse table. You specify the workspace and Lakehouse identifiers, the target table name, and the source path within the Lakehouse Files area. The source can be a single file or a folder. CSV and Parquet formats are supported. Mode "append" adds new data; mode "overwrite" replaces existing table data.
Additional CSV parsing options allow providing a custom delimiter and indicating if the first line contains headers. Recursive folder traversal can be enabled to load nested files.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace that contains the Lakehouse.

.PARAMETER LakehouseId
Mandatory. The GUID of the Lakehouse hosting the target table.

.PARAMETER TableName
Mandatory. The name of the Lakehouse table to load data into. Must contain only alphanumeric characters and underscores.

.PARAMETER PathType
Mandatory. Indicates whether the RelativePath points to a single File or a Folder. Use 'File' to load one file; use 'Folder' to load all files (recursively if -Recursive is specified).

.PARAMETER RelativePath
Mandatory. The relative path inside the Lakehouse Files area to the source file or folder. Example: 'Files/data/2024/file.csv'.

.PARAMETER FileFormat
Mandatory. The format of the source data. Allowed values are 'Csv' or 'Parquet'. Determines parsing behavior.

.PARAMETER CsvDelimiter
Optional. The delimiter character for CSV files. Defaults to a comma (,). Only used when FileFormat is 'Csv'.

.PARAMETER CsvHeader
Optional. Indicates whether the first row of the CSV file contains column headers. Default is $false. Only used for CSV loads.

.PARAMETER Mode
Mandatory. Specifies load behavior: 'append' adds rows to the existing table; 'overwrite' replaces the entire table contents with the new data.

.PARAMETER Recursive
Optional. When PathType is 'Folder', setting this to $true loads files from all subfolders beneath RelativePath.

.EXAMPLE
Write-FabricLakehouseTableData -WorkspaceId $wId -LakehouseId $lId -TableName Sales -PathType File -RelativePath 'Files/landing/sales_2024_01.csv' -FileFormat Csv -CsvDelimiter ';' -CsvHeader $true -Mode append

Loads a single semicolon-delimited CSV file with headers into the Sales table, appending rows to existing data.

.EXAMPLE
Write-FabricLakehouseTableData -WorkspaceId $wId -LakehouseId $lId -TableName Inventory -PathType Folder -RelativePath 'Files/raw/inventory' -FileFormat Parquet -Mode overwrite -Recursive $true

Overwrites the Inventory table with all Parquet files found recursively under the specified folder.

.NOTES
- Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` before invoking the API.
- Operation may run asynchronously in the Fabric service; monitor with subsequent status queries if needed.
- Use ShouldProcess support for confirmation in interactive sessions.

Author: Updated by Jess Pomfret and Rob Sewell November 2026; Help extended by Copilot.
#>
function Write-FabricLakehouseTableData {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Alias("Load-FabricLakehouseTable")]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$LakehouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$TableName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('File', 'Folder')]
        [string]$PathType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$RelativePath,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Csv', 'Parquet')]
        [string]$FileFormat,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CsvDelimiter = ",",

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$CsvHeader = $false,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('append', 'overwrite')]
        [string]$Mode = "append",

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$Recursive = $false
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/lakehouses/{2}/tables/{3}/load" -f $FabricConfig.BaseUrl, $WorkspaceId, $LakehouseId, $TableName
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            relativePath  = $RelativePath
            pathType      = $PathType
            mode          = $Mode
            recursive     = $Recursive
            formatOptions = @{
                format = $FileFormat
            }
        }

        if ($FileFormat -eq "Csv") {
            $body.formatOptions.delimiter = $CsvDelimiter
            $body.formatOptions.header = $CsvHeader
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
            #HasResults = $false
        }
        if ($PSCmdlet.ShouldProcess($TableName, "Load data into table in Lakehouse '$LakehouseId' (workspace '$WorkspaceId')")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Table '$TableName' loaded successfully into Lakehouse '$LakehouseId' in Workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Lakehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Lakehouse\Write-FabricLakehouseTableData.ps1' 157
#Region '.\Public\Managed Private Endpoint\Get-FabricManagedPrivateEndpoint.ps1' -1

<#
.SYNOPSIS
    Retrieves Managed Private Endpoint details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets Managed Private Endpoint information from a workspace using either the ManagedPrivateEndpointId or ManagedPrivateEndpointName.
    Validates authentication, builds the API endpoint, sends the request, and processes the results.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Managed Private Endpoint. Mandatory.

.PARAMETER ManagedPrivateEndpointId
    The unique identifier of the Managed Private Endpoint to retrieve. Optional.

.PARAMETER ManagedPrivateEndpointName
    The name of the Managed Private Endpoint to retrieve. Optional.

.EXAMPLE
    Get-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointId "endpoint-67890"
    Retrieves details for the Managed Private Endpoint with ID "endpoint-67890" in workspace "workspace-12345".

.EXAMPLE
    Get-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointName "MyEndpoint"
    Retrieves details for the Managed Private Endpoint named "MyEndpoint" in workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricManagedPrivateEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointName
    )

    try {
        # Validate input parameters
        if ($ManagedPrivateEndpointId -and $ManagedPrivateEndpointName) {
            Write-FabricLog -Message "Specify only one parameter: either 'ManagedPrivateEndpointId' or 'ManagedPrivateEndpointName'." -Level Error
            return $null
        }

        if ($ManagedPrivateEndpointName.Length -gt 64) {
            Write-FabricLog -Message "Managed Private Endpoint name exceeds 64 characters." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/managedPrivateEndpoints" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ManagedPrivateEndpointId) {
            $matchedItems = $dataItems.Where({ $_.id -eq $ManagedPrivateEndpointId }, 'First')
        }
        elseif ($ManagedPrivateEndpointName) {
            $matchedItems = $dataItems.Where({ $_.name -eq $ManagedPrivateEndpointName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Managed Private Endpoints. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Managed Private Endpoint\Get-FabricManagedPrivateEndpoint.ps1' 110
#Region '.\Public\Managed Private Endpoint\New-FabricManagedPrivateEndpoint.ps1' -1

<#
.SYNOPSIS
    Creates a new Managed Private Endpoint in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a Managed Private Endpoint (MPE)
    within the specified workspace. You must provide the workspace ID, the name for the MPE, the target private link resource ID,
    and the target subresource type. Optionally, you can include a request message.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Managed Private Endpoint will be created. Mandatory.

.PARAMETER ManagedPrivateEndpointName
    The name of the Managed Private Endpoint to create. Must not exceed 64 characters. Mandatory.

.PARAMETER TargetPrivateLinkResourceId
    The resource ID of the target private link. Mandatory.

.PARAMETER TargetSubresourceType
    The subresource type of the target private link. Mandatory.

.PARAMETER RequestMessage
    (Optional) A message to include with the request. Must not exceed 140 characters.

.EXAMPLE
    New-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointName "myMPE" -TargetPrivateLinkResourceId "/subscriptions/..." -TargetSubresourceType "sqlServer"

.EXAMPLE
    New-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointName "myMPE" -TargetPrivateLinkResourceId "/subscriptions/..." -TargetSubresourceType "sqlServer" -RequestMessage "Please approve"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricManagedPrivateEndpoint {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetPrivateLinkResourceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetSubresourceType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$RequestMessage
    )
    try {
        # Additional ManagedPrivateEndpointName validation

        if ($ManagedPrivateEndpointName.Length -gt 64) {
            Write-FabricLog -Message "Managed Private Endpoint name exceeds 64 characters." -Level Error
            return $null
        }
        if ($requestMessage) {
            if ($requestMessage.Length -gt 140) {
                Write-FabricLog -Message "Request message exceeds 140 characters." -Level Error
                return $null
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/managedPrivateEndpoints" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            name                        = $ManagedPrivateEndpointName
            targetPrivateLinkResourceId = $TargetPrivateLinkResourceId
            targetSubresourceType       = $TargetSubresourceType
        }

        if ($RequestMessage) {
            $body.requestMessage = $RequestMessage
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($ManagedPrivateEndpointName, "Create Managed Private Endpoint in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Managed Private Endpoint created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Managed Private Endpoint. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Managed Private Endpoint\New-FabricManagedPrivateEndpoint.ps1' 119
#Region '.\Public\Managed Private Endpoint\Remove-FabricManagedPrivateEndpoint.ps1' -1

<#
.SYNOPSIS
    Removes a managed private endpoint from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Deletes a managed private endpoint identified by ManagedPrivateEndpointId from the workspace specified by WorkspaceId using the Microsoft Fabric API.

.PARAMETER WorkspaceId
    The ID of the workspace containing the managed private endpoint.

.PARAMETER ManagedPrivateEndpointId
    The ID of the managed private endpoint to remove.

.EXAMPLE
    Remove-FabricManagedPrivateEndpoint -WorkspaceId "workspace-12345" -ManagedPrivateEndpointId "mpe-67890"
    Removes the managed private endpoint with ID "mpe-67890" from the workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricManagedPrivateEndpoint {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ManagedPrivateEndpointId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/managedPrivateEndpoints/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ManagedPrivateEndpointId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($ManagedPrivateEndpointId, "Delete Managed Private Endpoint in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Managed Private Endpoint '$ManagedPrivateEndpointId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Managed Private Endpoint '$ManagedPrivateEndpointId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Managed Private Endpoint\Remove-FabricManagedPrivateEndpoint.ps1' 66
#Region '.\Public\Mirrored Database\Get-FabricMirroredDatabase.ps1' -1

<#
.SYNOPSIS
Gets a Mirrored Database or lists all Mirrored Databases in a workspace.

.DESCRIPTION
The Get-FabricMirroredDatabase cmdlet retrieves Mirrored Database items from a specified Microsoft Fabric workspace.
You can return all mirrored databases in the workspace, or filter the results by an exact display name or a specific item Id.
Only one of MirroredDatabaseId or MirroredDatabaseName can be provided at a time.

.PARAMETER WorkspaceId
The GUID of the workspace to query for mirrored databases. This identifies the scope of the request and is required
for every call so the API can resolve which workspace’s mirrored resources to enumerate.

.PARAMETER MirroredDatabaseId
When supplied, returns only the mirrored database that matches the provided resource Id. Use this when you already
know the item’s Id and want to avoid an additional client-side name filter across all items.

.PARAMETER MirroredDatabaseName
When supplied, returns only the mirrored database whose display name exactly matches this value. This is useful when
you don’t have the Id available. Do not use with MirroredDatabaseId; only one filter may be specified.

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseId "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

Returns the single mirrored database with the specified Id from the workspace.

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseName "Development"

Retrieves the mirrored database named "Development" from workspace "12345".

.EXAMPLE
Get-FabricMirroredDatabase -WorkspaceId "12345"

Lists all mirrored databases available in workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

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
        # Validate input parameters
        if ($MirroredDatabaseId -and $MirroredDatabaseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'MirroredDatabaseId' or 'MirroredDatabaseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MirroredDatabaseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MirroredDatabaseId }, 'First')
        }
        elseif ($MirroredDatabaseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MirroredDatabaseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Mirrored Database. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Mirrored Database\Get-FabricMirroredDatabase.ps1' 119
#Region '.\Public\Mirrored Database\Get-FabricMirroredDatabaseDefinition.ps1' -1


<#
.SYNOPSIS
Retrieves the definition of a MirroredDatabase from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the MirroredDatabase's content or metadata from a workspace.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the MirroredDatabase definition is to be retrieved.

.PARAMETER MirroredDatabaseId
(Optional)The unique identifier of the MirroredDatabase whose definition needs to be retrieved.

.EXAMPLE
Get-FabricMirroredDatabaseDefinition -WorkspaceId "12345" -MirroredDatabaseId "67890"

Retrieves the definition of the MirroredDatabase with ID `67890` from the workspace with ID `12345`.

.EXAMPLE
Get-FabricMirroredDatabaseDefinition -WorkspaceId "12345"

Retrieves the definitions of all MirroredDatabases in the workspace with ID `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricMirroredDatabaseDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Mirrored Database\Get-FabricMirroredDatabaseDefinition.ps1' 72
#Region '.\Public\Mirrored Database\Get-FabricMirroredDatabaseStatus.ps1' -1

<#
.SYNOPSIS
Gets the current mirroring status for a specific Mirrored Database.

.DESCRIPTION
The Get-FabricMirroredDatabaseStatus cmdlet calls the Fabric API to return the current mirroring state for a mirrored
database in a given workspace. Use this to verify whether mirroring is healthy, lagging, or encountering errors.

.PARAMETER WorkspaceId
The GUID of the workspace that contains the mirrored database. This value scopes the request to the correct Fabric
workspace and is required.

.PARAMETER MirroredDatabaseId
The Id of the mirrored database to check. Provide the resource Id so the API can return status for that specific item.

.EXAMPLE
Get-FabricMirroredDatabaseStatus -WorkspaceId 11111111-2222-3333-4444-555555555555 -MirroredDatabaseId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Returns the current mirroring status for the specified mirrored database.

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricMirroredDatabaseStatus {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/getMirroringStatus" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseId' status retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Mirrored Database\Get-FabricMirroredDatabaseStatus.ps1' 63
#Region '.\Public\Mirrored Database\Get-FabricMirroredDatabaseTableStatus.ps1' -1

<#
.SYNOPSIS
Gets per-table mirroring status details for a mirrored database.

.DESCRIPTION
The Get-FabricMirroredDatabaseTableStatus cmdlet returns the table-level mirroring status for the specified mirrored
database. Use this command to identify which tables are healthy, delayed, or failing replication so you can target
remediation efforts precisely.

.PARAMETER WorkspaceId
The GUID of the workspace that contains the mirrored database. This is required to scope the API request.

.PARAMETER MirroredDatabaseId
The Id of the mirrored database whose table-level status you want to inspect. Provide the resource Id to retrieve the
status collection for all mirrored tables.

.EXAMPLE
Get-FabricMirroredDatabaseTableStatus -WorkspaceId 11111111-2222-3333-4444-555555555555 -MirroredDatabaseId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee

Returns a list of table status objects showing replication health, last sync times, or lag metrics (when exposed).

Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricMirroredDatabaseTableStatus {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/getTablesMirroringStatus" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "Item(s) found. Data retrieved successfully!" -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mirrored Database\Get-FabricMirroredDatabaseTableStatus.ps1' 68
#Region '.\Public\Mirrored Database\New-FabricMirroredDatabase.ps1' -1

<#
.SYNOPSIS
Creates a new MirroredDatabase in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new MirroredDatabase
in the specified workspace. It supports optional parameters for MirroredDatabase description
and path definitions for the MirroredDatabase content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the MirroredDatabase will be created.

.PARAMETER MirroredDatabaseName
The name of the MirroredDatabase to be created.

.PARAMETER MirroredDatabaseDescription
An optional description for the MirroredDatabase.

.PARAMETER MirroredDatabasePathDefinition
An optional path to the MirroredDatabase definition file to upload.

.PARAMETER MirroredDatabasePathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricMirroredDatabase -WorkspaceId "workspace-12345" -MirroredDatabaseName "New MirroredDatabase" -MirroredDatabasePathDefinition "C:\MirroredDatabases\example.json"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricMirroredDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MirroredDatabaseName
        }

        if ($MirroredDatabaseDescription) {
            $body.description = $MirroredDatabaseDescription
        }

        if ($MirroredDatabasePathDefinition) {
            $MirroredDatabaseEncodedContent = Convert-ToBase64 -filePath $MirroredDatabasePathDefinition

            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "mirroredDatabase.json"
                    payload     = $MirroredDatabaseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in MirroredDatabase definition." -Level Error
                return $null
            }
        }

        if ($MirroredDatabasePathPlatformDefinition) {
            $MirroredDatabaseEncodedPlatformContent = Convert-ToBase64 -filePath $MirroredDatabasePathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "MirroredDatabase"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MirroredDatabaseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseName, "Create Mirrored Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseName' created successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mirrored Database\New-FabricMirroredDatabase.ps1' 154
#Region '.\Public\Mirrored Database\Remove-FabricMirroredDatabase.ps1' -1

<#
.SYNOPSIS
Deletes an MirroredDatabase from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricMirroredDatabase` function sends a DELETE request to the Fabric API to remove a specified MirroredDatabase from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the MirroredDatabase to delete.

.PARAMETER MirroredDatabaseId
(Mandatory) The ID of the MirroredDatabase to be deleted.

.EXAMPLE
Remove-FabricMirroredDatabase -WorkspaceId "12345" -MirroredDatabaseId "67890"

Deletes the MirroredDatabase with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch
#>
function Remove-FabricMirroredDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseId, "Delete Mirrored Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete MirroredDatabase '$MirroredDatabaseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mirrored Database\Remove-FabricMirroredDatabase.ps1' 66
#Region '.\Public\Mirrored Database\Start-FabricMirroredDatabaseMirroring.ps1' -1

<#
.SYNOPSIS
Starts mirroring for a specified MirroredDatabase in a workspace.

.DESCRIPTION
Initiates mirroring on the MirroredDatabase via the Fabric API with proper authentication and confirmation support.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Mirrored Database to start mirroring for. This value is required to scope the API request.

.PARAMETER MirroredDatabaseId
The identifier of the Mirrored Database to start mirroring. Provide the resource ID of the target mirrored database within the specified workspace.

.EXAMPLE
Start-FabricMirroredDatabaseMirroring -WorkspaceId "workspace123" -MirroredDatabase
Starts mirroring for the Mirrored Database with the ID "MirroredDatabase123" in the workspace "workspace123".
.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Start-FabricMirroredDatabaseMirroring {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/startMirroring" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseId, "Start mirroring for mirrored database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Database mirroring started successfully for Mirrored DatabaseId: $MirroredDatabaseId" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to start MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Mirrored Database\Start-FabricMirroredDatabaseMirroring.ps1' 65
#Region '.\Public\Mirrored Database\Stop-FabricMirroredDatabaseMirroring.ps1' -1


<#
.SYNOPSIS
Stops mirroring for a specified MirroredDatabase in a workspace.

.DESCRIPTION
Stops mirroring on the MirroredDatabase via the Fabric API with proper authentication and confirmation support.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Mirrored Database to stop mirroring for. This parameter scopes the API request to the correct workspace.

.PARAMETER MirroredDatabaseId
The identifier of the Mirrored Database to stop mirroring. Provide the resource ID of the target mirrored database within the specified workspace.
.EXAMPLE
Stop-FabricMirroredDatabaseMirroring -WorkspaceId "workspace123" -MirroredDatabase
Stops mirroring for the Mirrored Database with the ID "MirroredDatabase123" in the workspace "workspace123".
.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Stop-FabricMirroredDatabaseMirroring {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/stopMirroring" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseId, "Stop mirroring for mirrored database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Database mirroring stopped successfully for MirroredDatabaseId: $MirroredDatabaseId" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to stop MirroredDatabase. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Mirrored Database\Stop-FabricMirroredDatabaseMirroring.ps1' 63
#Region '.\Public\Mirrored Database\Update-FabricMirroredDatabase.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric MirroredDatabase.

.DESCRIPTION
The `Update-FabricMirroredDatabase` function updates the name and/or description of a specified Fabric MirroredDatabase by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Mirrored Database to update. Required to scope the API request.

.PARAMETER MirroredDatabaseId
The unique identifier of the MirroredDatabase to be updated.

.PARAMETER MirroredDatabaseName
The new name for the MirroredDatabase.

.PARAMETER MirroredDatabaseDescription
(Optional) The new description for the MirroredDatabase.

.EXAMPLE
Update-FabricMirroredDatabase -MirroredDatabaseId "MirroredDatabase123" -MirroredDatabaseName "NewMirroredDatabaseName"

Updates the name of the MirroredDatabase with the ID "MirroredDatabase123" to "NewMirroredDatabaseName".

.EXAMPLE
Update-FabricMirroredDatabase -MirroredDatabaseId "MirroredDatabase123" -MirroredDatabaseName "NewName" -MirroredDatabaseDescription "Updated description"

Updates both the name and description of the MirroredDatabase "MirroredDatabase123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricMirroredDatabase {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredDatabaseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MirroredDatabaseName
        }

        if ($MirroredDatabaseDescription) {
            $body.description = $MirroredDatabaseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseId, "Update Mirrored Database in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mirrored Database '$MirroredDatabaseName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mirrored Database\Update-FabricMirroredDatabase.ps1' 101
#Region '.\Public\Mirrored Database\Update-FabricMirroredDatabaseDefinition.ps1' -1

<#
.SYNOPSIS
Updates the definition of a MirroredDatabase in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a MirroredDatabase in a Microsoft Fabric workspace.
The MirroredDatabase content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the MirroredDatabase resides.

.PARAMETER MirroredDatabaseId
(Mandatory) The unique identifier of the MirroredDatabase to be updated.

.PARAMETER MirroredDatabasePathDefinition
(Mandatory) The file path to the MirroredDatabase content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER MirroredDatabasePathPlatformDefinition
(Optional) The file path to the MirroredDatabase's platform-specific definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER UpdateMetadata
(Optional)A boolean flag indicating whether to update the MirroredDatabase's metadata.
Default: `$false`.

.EXAMPLE
Update-FabricMirroredDatabaseDefinition -WorkspaceId "12345" -MirroredDatabaseId "67890" -MirroredDatabasePathDefinition "C:\MirroredDatabases\MirroredDatabase.json"

Updates the content of the MirroredDatabase with ID `67890` in the workspace `12345` using the specified MirroredDatabase file.

.EXAMPLE
Update-FabricMirroredDatabaseDefinition -WorkspaceId "12345" -MirroredDatabaseId "67890" -MirroredDatabasePathDefinition "C:\MirroredDatabases\MirroredDatabase.json" -UpdateMetadata $true

Updates both the content and metadata of the MirroredDatabase with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The MirroredDatabase content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>
function Update-FabricMirroredDatabaseDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabaseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredDatabasePathPlatformDefinition
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/mirroredDatabases/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $MirroredDatabaseId
        if ($MirroredDatabasePathPlatformDefinition) {
            # Append query parameter correctly
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($MirroredDatabasePathDefinition) {
            $MirroredDatabaseEncodedContent = Convert-ToBase64 -filePath $MirroredDatabasePathDefinition

            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "MirroredDatabase.json"
                    payload     = $MirroredDatabaseEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in MirroredDatabase definition." -Level Error
                return $null
            }
        }

        if ($MirroredDatabasePathPlatformDefinition) {
            $MirroredDatabaseEncodedPlatformContent = Convert-ToBase64 -filePath $MirroredDatabasePathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($MirroredDatabaseEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MirroredDatabaseEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        if ($PSCmdlet.ShouldProcess($MirroredDatabaseId, "Update Mirrored Database definition in workspace '$WorkspaceId'")) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response

            Write-FabricLog -Message "Successfully updated the definition for Mirrored Database with ID '$MirroredDatabaseId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update MirroredDatabase. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mirrored Database\Update-FabricMirroredDatabaseDefinition.ps1' 144
#Region '.\Public\Mirrored Warehouse\Get-FabricMirroredWarehouse.ps1' -1

<#
.SYNOPSIS
Gets a Mirrored Warehouse or lists all Mirrored Warehouses in a workspace.

.DESCRIPTION
The Get-FabricMirroredWarehouse cmdlet retrieves Mirrored Warehouse items from a Microsoft Fabric workspace.
You can return every mirrored warehouse or filter by an exact display name or Id. Only one of MirroredWarehouseId or
MirroredWarehouseName may be provided; specifying both will result in a validation error.

.PARAMETER WorkspaceId
The GUID of the workspace to query. This is required for all calls and determines which Fabric workspace’s mirrored
warehouses will be returned.

.PARAMETER MirroredWarehouseId
Optional. When supplied, returns only the mirrored warehouse matching this resource Id. Prefer using the Id when you
already captured it from a prior listing operation for more precise retrieval.

.PARAMETER MirroredWarehouseName
Optional. When supplied, returns only the mirrored warehouse whose display name exactly matches this string. Use this
when the Id is not known. Do not combine with MirroredWarehouseId.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -MirroredWarehouseId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the single mirrored warehouse matching the provided Id.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345" -MirroredWarehouseName "Development"

Retrieves the mirrored warehouse named "Development" from workspace 12345.

.EXAMPLE
Get-FabricMirroredWarehouse -WorkspaceId "12345"

Lists all mirrored warehouses present in the specified workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricMirroredWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MirroredWarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MirroredWarehouseName
    )
    try {
        # Validate input parameters
        if ($MirroredWarehouseId -and $MirroredWarehouseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'MirroredWarehouseId' or 'MirroredWarehouseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/MirroredWarehouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MirroredWarehouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MirroredWarehouseId }, 'First')
        }
        elseif ($MirroredWarehouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MirroredWarehouseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve MirroredWarehouse. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Mirrored Warehouse\Get-FabricMirroredWarehouse.ps1' 119
#Region '.\Public\ML Experiment\Get-FabricMLExperiment.ps1' -1

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
        # Validate input parameters
        if ($MLExperimentId -and $MLExperimentName) {
            Write-FabricLog -Message "Specify only one parameter: either 'MLExperimentId' or 'MLExperimentName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlExperiments" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MLExperimentId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MLExperimentId }, 'First')
        }
        elseif ($MLExperimentName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MLExperimentName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve ML Experiment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\ML Experiment\Get-FabricMLExperiment.ps1' 107
#Region '.\Public\ML Experiment\New-FabricMLExperiment.ps1' -1

<#
.SYNOPSIS
    Creates a new ML Experiment in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new ML Experiment
    in the specified workspace. It supports optional parameters for ML Experiment description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Experiment will be created. This parameter is mandatory.

.PARAMETER MLExperimentName
    The name of the ML Experiment to be created. This parameter is mandatory.

.PARAMETER MLExperimentDescription
    An optional description for the ML Experiment.

.EXAMPLE
     New-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentName "New ML Experiment" -MLExperimentDescription "Description of the new ML Experiment"
    This example creates a new ML Experiment named "New ML Experiment" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricMLExperiment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$MLExperimentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlExperiments" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MLExperimentName
        }

        if ($MLExperimentDescription) {
            $body.description = $MLExperimentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create ML Experiment '$MLExperimentName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Experiment '$MLExperimentName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create ML Experiment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\ML Experiment\New-FabricMLExperiment.ps1' 91
#Region '.\Public\ML Experiment\Remove-FabricMLExperiment.ps1' -1

<#
.SYNOPSIS
    Removes an ML Experiment from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an ML Experiment
    from the specified workspace using the provided WorkspaceId and MLExperimentId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the MLExperiment will be removed.

.PARAMETER MLExperimentId
    The unique identifier of the MLExperiment to be removed.

.EXAMPLE
     Remove-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentId "experiment-67890"
    This example removes the MLExperiment with ID "experiment-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricMLExperiment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlExperiments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MLExperimentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "ML Experiment '$MLExperimentId' in workspace '$WorkspaceId'"
        $action = "Delete ML Experiment"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Experiment '$MLExperimentId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete ML Experiment '$MLExperimentId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\ML Experiment\Remove-FabricMLExperiment.ps1' 69
#Region '.\Public\ML Experiment\Update-FabricMLExperiment.ps1' -1

<#
.SYNOPSIS
    Updates an existing ML Experiment in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing ML Experiment
    in the specified workspace. It supports optional parameters for ML Experiment description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Experiment exists. This parameter is optional.

.PARAMETER MLExperimentId
    The unique identifier of the ML Experiment to be updated. This parameter is mandatory.

.PARAMETER MLExperimentName
    The new name of the ML Experiment. This parameter is mandatory.

.PARAMETER MLExperimentDescription
    An optional new description for the ML Experiment.

.EXAMPLE
     Update-FabricMLExperiment -WorkspaceId "workspace-12345" -MLExperimentId "experiment-67890" -MLExperimentName "Updated ML Experiment" -MLExperimentDescription "Updated description"
    This example updates the ML Experiment with ID "experiment-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricMLExperiment {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$MLExperimentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLExperimentDescription
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlExperiments/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MLExperimentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MLExperimentName
        }

        if ($MLExperimentDescription) {
            $body.description = $MLExperimentDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "ML Experiment '$MLExperimentId' in workspace '$WorkspaceId'"
        $action = "Update ML Experiment to name '$MLExperimentName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Experiment '$MLExperimentName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update ML Experiment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\ML Experiment\Update-FabricMLExperiment.ps1' 99
#Region '.\Public\ML Model\Get-FabricMLModel.ps1' -1

<#
.SYNOPSIS
    Retrieves ML Model details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves ML Model details from a specified workspace using either the provided MLModelId or MLModelName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Model exists. This parameter is mandatory.

.PARAMETER MLModelId
    The unique identifier of the ML Model to retrieve. This parameter is optional.

.PARAMETER MLModelName
    The name of the ML Model to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricMLModel -WorkspaceId "workspace-12345" -MLModelId "model-67890"
    This example retrieves the ML Model details for the model with ID "model-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricMLModel -WorkspaceId "workspace-12345" -MLModelName "My ML Model"
    This example retrieves the ML Model details for the model named "My ML Model" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricMLModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MLModelName
    )

    try {
        # Validate input parameters
        if ($MLModelId -and $MLModelName) {
            Write-FabricLog -Message "Specify only one parameter: either 'MLModelId' or 'MLModelName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlModels" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MLModelId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MLModelId }, 'First')
        }
        elseif ($MLModelName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MLModelName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve ML Model. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\ML Model\Get-FabricMLModel.ps1' 110
#Region '.\Public\ML Model\New-FabricMLModel.ps1' -1

<#
.SYNOPSIS
    Creates a new ML Model in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new ML Model
    in the specified workspace. It supports optional parameters for ML Model description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Model will be created. This parameter is mandatory.

.PARAMETER MLModelName
    The name of the ML Model to be created. This parameter is mandatory.

.PARAMETER MLModelDescription
    An optional description for the ML Model.

.EXAMPLE
    New-FabricMLModel -WorkspaceId "workspace-12345" -MLModelName "New ML Model" -MLModelDescription "Description of the new ML Model"
    This example creates a new ML Model named "New ML Model" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricMLModel {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_]*$')]
        [string]$MLModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlModels" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MLModelName
        }

        if ($MLModelDescription) {
            $body.description = $MLModelDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create ML Model '$MLModelName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Model '$MLModelName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create ML Model. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\ML Model\New-FabricMLModel.ps1' 91
#Region '.\Public\ML Model\Remove-FabricMLModel.ps1' -1

<#
.SYNOPSIS
    Removes an ML Model from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an ML Model
    from the specified workspace using the provided WorkspaceId and MLModelId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the ML Model will be removed.

.PARAMETER MLModelId
    The unique identifier of the ML Model to be removed.

.EXAMPLE
     Remove-FabricMLModel -WorkspaceId "workspace-12345" -MLModelId "model-67890"
    This example removes the ML Model with ID "model-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricMLModel {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MLModelId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "ML Model '$MLModelId' in workspace '$WorkspaceId'"
        $action = "Delete ML Model"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Model '$MLModelId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete ML Model '$MLModelId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\ML Model\Remove-FabricMLModel.ps1' 69
#Region '.\Public\ML Model\Update-FabricMLModel.ps1' -1

<#
.SYNOPSIS
    Updates an existing ML Model in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing ML Model
    in the specified workspace. It supports optional parameters for ML Model description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the ML Model exists. This parameter is optional.

.PARAMETER MLModelId
    The unique identifier of the ML Model to be updated. This parameter is mandatory.

.PARAMETER MLModelDescription
    New description for the ML Model.

.EXAMPLE
    Update-FabricMLModel -WorkspaceId "workspace-12345" -MLModelId "model-67890" -MLModelName "Updated ML Model" -MLModelDescription "Updated description"
    This example updates the ML Model with ID "model-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricMLModel {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MLModelDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mlModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MLModelId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            description = $MLModelDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "ML Model '$MLModelId' in workspace '$WorkspaceId'"
        $action = "Update ML Model description"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "ML Model '$MLModelId' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update ML Model. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\ML Model\Update-FabricMLModel.ps1' 86
#Region '.\Public\Mounted Data Factory\Get-FabricMountedDataFactory.ps1' -1

<#
.SYNOPSIS
    Retrieves mounted Data Factory details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Gets information about mounted Data Factories in a given workspace. You can filter the results by specifying either the MountedDataFactoryId or the MountedDataFactoryName.
    The function validates authentication, constructs the API endpoint, sends the request, and returns the matching Data Factory details.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the mounted Data Factory. This parameter is required.

.PARAMETER MountedDataFactoryId
    The unique identifier of the mounted Data Factory to retrieve. Optional.

.PARAMETER MountedDataFactoryName
    The display name of the mounted Data Factory to retrieve. Optional.

.EXAMPLE
    Get-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryId "MountedDataFactory-67890"
    Retrieves the mounted Data Factory with ID "MountedDataFactory-67890" from the specified workspace.

.EXAMPLE
    Get-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryName "My Data Factory"
    Retrieves the mounted Data Factory named "My Data Factory" from the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricMountedDataFactory {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MountedDataFactoryName
    )
    try {
        # Validate input parameters
        if ($MountedDataFactoryId -and $MountedDataFactoryName) {
            Write-FabricLog -Message "Specify only one parameter: either 'MountedDataFactoryId' or 'MountedDataFactoryName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($MountedDataFactoryId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $MountedDataFactoryId }, 'First')
        }
        elseif ($MountedDataFactoryName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $MountedDataFactoryName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mounted Data Factory\Get-FabricMountedDataFactory.ps1' 106
#Region '.\Public\Mounted Data Factory\Get-FabricMountedDataFactoryDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of a mounted Data Factory from a Microsoft Fabric workspace.

.DESCRIPTION
    Gets the definition of a mounted Data Factory in the specified workspace by its ID. Handles authentication, builds the API endpoint, and returns the response.

.PARAMETER WorkspaceId
    The ID of the workspace containing the mounted Data Factory. Required.

.PARAMETER MountedDataFactoryId
    The ID of the mounted Data Factory to retrieve. Optional.

.PARAMETER MountedDataFactoryFormat
    The format for the Data Factory definition (e.g., 'json'). Optional.

.EXAMPLE
    Get-FabricMountedDataFactoryDefinition -WorkspaceId "workspace-12345" -MountedDataFactoryId "factory-67890"
    Retrieves the definition for the specified mounted Data Factory.

.EXAMPLE
    Get-FabricMountedDataFactoryDefinition -WorkspaceId "workspace-12345" -MountedDataFactoryId "factory-67890" -MountedDataFactoryFormat "json"
    Retrieves the mounted Data Factory definition in JSON format.

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Uses `Test-TokenExpired` for authentication validation.

    Author: Tiago Balabuch
#>
function Get-FabricMountedDataFactoryDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        if ($MountedDataFactoryFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $MountedDataFactoryFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Mounted Data Factory '$MountedDataFactoryId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Mounted Data Factory. Error: $errorDetails" -Level Error
    }
 }
#EndRegion '.\Public\Mounted Data Factory\Get-FabricMountedDataFactoryDefinition.ps1' 77
#Region '.\Public\Mounted Data Factory\New-FabricMountedDataFactory.ps1' -1

<#
.SYNOPSIS
    Creates a new Mounted Data Factory resource in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Provisions a new Mounted Data Factory in the given workspace by sending a POST request to the Microsoft Fabric API.
    Allows optional parameters for description, definition file, platform-specific definition file, and folder placement.

.PARAMETER WorkspaceId
    The ID of the workspace where the Mounted Data Factory will be created. Required.

.PARAMETER MountedDataFactoryName
    The display name for the new Mounted Data Factory. Required.

.PARAMETER MountedDataFactoryDescription
    Optional. A description for the Mounted Data Factory.

.PARAMETER MountedDataFactoryPathDefinition
    Optional. Path to the Mounted Data Factory definition file.

.PARAMETER MountedDataFactoryPathPlatformDefinition
    Optional. Path to the platform-specific definition file.

.PARAMETER FolderId
    Optional. The folder ID where the Mounted Data Factory will be placed.

.EXAMPLE
    New-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryName "MyFactory" -MountedDataFactoryDescription "Sample factory"
    Creates a new Mounted Data Factory named "MyFactory" in the specified workspace with a description.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function New-FabricMountedDataFactory {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MountedDataFactoryName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MountedDataFactoryName
        }

        if ($FolderId) {
            $body.folderId = $FolderId
        }

        if ($MountedDataFactoryDescription) {
            $body.description = $MountedDataFactoryDescription
        }
        if ($MountedDataFactoryPathDefinition) {
            $MountedDataFactoryEncodedContent = Convert-ToBase64 -filePath $MountedDataFactoryPathDefinition

            if (-not [string]::IsNullOrEmpty($MountedDataFactoryEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "MountedDataFactoryV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "mountedDataFactory-content.json"
                    payload     = $MountedDataFactoryEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in MountedDataFactory definition." -Level Error
                return $null
            }
        }

        if ($MountedDataFactoryPathPlatformDefinition) {
            $MountedDataFactoryEncodedPlatformContent = Convert-ToBase64 -filePath $MountedDataFactoryPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($MountedDataFactoryEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "MountedDataFactoryV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MountedDataFactoryEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        $target = "Workspace '$WorkspaceId'"
        $action = "Create Mounted Data Factory '$MountedDataFactoryName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mounted Data Factory '$MountedDataFactoryName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mounted Data Factory\New-FabricMountedDataFactory.ps1' 163
#Region '.\Public\Mounted Data Factory\Remove-FabricMountedDataFactory.ps1' -1

<#
.SYNOPSIS
    Removes a mounted Data Factory from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Deletes a mounted Data Factory resource from the given workspace by sending a DELETE request to the Microsoft Fabric API.
    Requires valid authentication and configuration.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the mounted Data Factory.

.PARAMETER MountedDataFactoryId
    The unique identifier of the mounted Data Factory to remove.

.EXAMPLE
    Remove-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryId "mdf-67890"
    Removes the mounted Data Factory with ID "mdf-67890" from workspace "workspace-12345".

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to validate authentication before proceeding.

    Author: Tiago Balabuch
#>
function Remove-FabricMountedDataFactory {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "Mounted Data Factory '$MountedDataFactoryId' in workspace '$WorkspaceId'"
        $action = "Delete Mounted Data Factory"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mounted Data Factory '$MountedDataFactoryId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Mounted Data Factory '$MountedDataFactoryId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mounted Data Factory\Remove-FabricMountedDataFactory.ps1' 69
#Region '.\Public\Mounted Data Factory\Update-FabricMountedDataFactory.ps1' -1

<#
.SYNOPSIS
    Updates the name and optionally the description of a Mounted Data Factory in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the display name and, if provided, the description of a specified Mounted Data Factory within a workspace.

.PARAMETER WorkspaceId
    The ID of the workspace containing the Mounted Data Factory.

.PARAMETER MountedDataFactoryId
    The ID of the Mounted Data Factory to update.

.PARAMETER MountedDataFactoryName
    The new display name for the Mounted Data Factory.

.PARAMETER MountedDataFactoryDescription
    (Optional) The new description for the Mounted Data Factory.

.EXAMPLE
    Update-FabricMountedDataFactory -WorkspaceId "workspace-12345" -MountedDataFactoryId "mdf-67890" -MountedDataFactoryName "New Name" -MountedDataFactoryDescription "New description"
    Updates the specified Mounted Data Factory with a new name and description.

.NOTES
    - Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function Update-FabricMountedDataFactory {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$MountedDataFactoryName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $MountedDataFactoryName
        }

        if ($MountedDataFactoryDescription) {
            $body.description = $MountedDataFactoryDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Mounted Data Factory '$MountedDataFactoryId' in workspace '$WorkspaceId'"
        $action = "Update Mounted Data Factory display name/description"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Mounted Data Factory '$MountedDataFactoryName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mounted Data Factory\Update-FabricMountedDataFactory.ps1' 96
#Region '.\Public\Mounted Data Factory\Update-FabricMountedDataFactoryDefinition.ps1' -1

<#
.SYNOPSIS
    Updates the definition of a Mounted Data Factory in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends an update request to the Microsoft Fabric API to modify the definition of an existing Mounted Data Factory.
    Allows updating the main definition file and, optionally, a platform-specific definition file.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the Mounted Data Factory.

.PARAMETER MountedDataFactoryId
    The unique identifier of the Mounted Data Factory to update.

.PARAMETER MountedDataFactoryPathDefinition
    File path to the main Mounted Data Factory definition (required).

.PARAMETER MountedDataFactoryPathPlatformDefinition
    Optional file path to a platform-specific definition.

.EXAMPLE
    Update-FabricMountedDataFactoryDefinition -WorkspaceId "workspace-12345" -MountedDataFactoryId "mdf-67890" -MountedDataFactoryPathDefinition "C:\Definitions\MDF.json"

.NOTES
    Requires a configured `$FabricConfig` object with `BaseUrl` and `FabricHeaders`.
    Authentication is validated using `Test-TokenExpired`.
    Author: Tiago Balabuch
#>
function Update-FabricMountedDataFactoryDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$MountedDataFactoryPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/mountedDataFactories/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $MountedDataFactoryId
        if ($MountedDataFactoryPathPlatformDefinition) {
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                format = "MountedDataFactoryV1"
                parts  = @()
            }
        }

        if ($MountedDataFactoryPathDefinition) {
            $MountedDataFactoryEncodedContent = Convert-ToBase64 -filePath $MountedDataFactoryPathDefinition

            if (-not [string]::IsNullOrEmpty($MountedDataFactoryEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "MountedDataFactoryProperties.json"
                    payload     = $MountedDataFactoryEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in MountedDataFactory definition." -Level Error
                return $null
            }
        }

        if ($MountedDataFactoryPathPlatformDefinition) {
            $MountedDataFactoryEncodedPlatformContent = Convert-ToBase64 -filePath $MountedDataFactoryPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($MountedDataFactoryEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $MountedDataFactoryEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Mounted Data Factory '$MountedDataFactoryId' in workspace '$WorkspaceId'"
        $action = "Update Mounted Data Factory definition"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Mounted Data Factory with ID '$MountedDataFactoryId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Mounted Data Factory. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Mounted Data Factory\Update-FabricMountedDataFactoryDefinition.ps1' 129
#Region '.\Public\Notebook\Get-FabricNotebook.ps1' -1

<#
.SYNOPSIS
Gets a Notebook or lists all Notebooks in a workspace.

.DESCRIPTION
The Get-FabricNotebook cmdlet retrieves Notebook items for a specific Microsoft Fabric workspace. You can list all
notebooks or filter by an exact display name or resource Id. Only one of NotebookId or NotebookName can be specified.

.PARAMETER WorkspaceId
The GUID of the workspace to query for notebooks. This parameter is required to scope the API request.

.PARAMETER NotebookId
Optional. When supplied, returns only the notebook whose Id matches this value. Use this when you already know the
resource Id from a prior call.

.PARAMETER NotebookName
Optional. When supplied, returns only the notebook whose display name exactly matches this string. Do not combine with
NotebookId.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -NotebookId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Returns the notebook matching the provided Id.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345" -NotebookName "Development"

Retrieves the notebook named Development from workspace 12345.

.EXAMPLE
Get-FabricNotebook -WorkspaceId "12345"

Lists all notebooks in the workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Get-FabricNotebook {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$NotebookName
    )
    try {
        # Validate input parameters
        if ($NotebookId -and $NotebookName) {
            Write-FabricLog -Message "Specify only one parameter: either 'NotebookId' or 'NotebookName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($NotebookId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $NotebookId }, 'First')
        }
        elseif ($NotebookName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $NotebookName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Notebook. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\Get-FabricNotebook.ps1' 117
#Region '.\Public\Notebook\Get-FabricNotebookDefinition.ps1' -1


<#
.SYNOPSIS
Retrieves the definition of a notebook from a specific workspace in Microsoft Fabric.

.DESCRIPTION
This function fetches the notebook's content or metadata from a workspace.
It supports retrieving notebook definitions in the Jupyter Notebook (`ipynb`) format.
Handles both synchronous and asynchronous operations, with detailed logging and error handling.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace from which the notebook definition is to be retrieved.

.PARAMETER NotebookId
(Optional)The unique identifier of the notebook whose definition needs to be retrieved.

.PARAMETER NotebookFormat
Specifies the format of the notebook definition. Currently, only 'ipynb' is supported.
Default: 'ipynb'.

.EXAMPLE
Get-FabricNotebookDefinition -WorkspaceId "12345" -NotebookId "67890"

Retrieves the definition of the notebook with ID `67890` from the workspace with ID `12345` in the `ipynb` format.

.EXAMPLE
Get-FabricNotebookDefinition -WorkspaceId "12345"

Retrieves the definitions of all notebooks in the workspace with ID `12345` in the `ipynb` format.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Handles long-running operations asynchronously.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricNotebookDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('ipynb', 'fabricGitSource')]
        [string]$NotebookFormat = 'ipynb'
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
        if ($NotebookFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $NotebookFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Notebook '$NotebookId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Notebook. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\Get-FabricNotebookDefinition.ps1' 84
#Region '.\Public\Notebook\Get-FabricNotebookLivySession.ps1' -1

<#
.SYNOPSIS
Retrieves Livy session(s) for a specified notebook in Microsoft Fabric.

.DESCRIPTION
Get-FabricNotebookLivySession fetches Livy session details from the Fabric API for a given workspace and notebook. You can optionally filter by a specific Livy session ID.

.PARAMETER WorkspaceId
The ID of the workspace containing the notebook.

.PARAMETER NotebookId
The ID of the notebook for which to retrieve Livy sessions.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricNotebookLivySession -WorkspaceId "12345" -NotebookId "67890"

Returns all Livy sessions for the specified notebook.

.EXAMPLE
Get-FabricNotebookLivySession -WorkspaceId "12345" -NotebookId "67890" -LivyId "abcde"

Returns the Livy session with ID "abcde" for the specified notebook.

.NOTES
Requires the global $FabricConfig object with BaseUrl and FabricHeaders.
Calls Test-TokenExpired to validate authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricNotebookLivySession {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}/livySessions" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Notebook Livy Session. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\Get-FabricNotebookLivySession.ps1' 97
#Region '.\Public\Notebook\New-FabricNotebook.ps1' -1

<#
.SYNOPSIS
Creates a new notebook in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new notebook
in the specified workspace. It supports optional parameters for notebook description
and path definitions for the notebook content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the notebook will be created.

.PARAMETER NotebookName
The name of the notebook to be created.

.PARAMETER NotebookDescription
An optional description for the notebook.

.PARAMETER NotebookPathDefinition
An optional path to the notebook definition file (e.g., .ipynb file) to upload.

.PARAMETER NotebookPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.PARAMETER NotebookFormat
Optional. Specifies the format of the notebook definition being uploaded. Use 'ipynb' for standard Jupyter notebooks or 'fabricGitSource' when providing content from a Fabric Git source. Defaults to 'ipynb'.

.EXAMPLE
 Add-FabricNotebook -WorkspaceId "workspace-12345" -NotebookName "New Notebook" -NotebookPathDefinition "C:\notebooks\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function New-FabricNotebook {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$NotebookName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
    [ValidateSet('ipynb', 'fabricGitSource')]
        [string]$NotebookFormat = 'ipynb'
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $NotebookName
        }

        if ($NotebookDescription) {
            $body.description = $NotebookDescription
        }

        if ($NotebookPathDefinition) {
            $notebookEncodedContent = Convert-ToBase64 -filePath $NotebookPathDefinition

            if (-not [string]::IsNullOrEmpty($notebookEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $NotebookFormat
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "notebook-content.py"
                    payload     = $notebookEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in notebook definition." -Level Error
                return $null
            }
        }

        if ($NotebookPathPlatformDefinition) {
            $notebookEncodedPlatformContent = Convert-ToBase64 -filePath $NotebookPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($notebookEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = $NotebookFormat
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $notebookEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create Notebook '$NotebookName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Notebook '$NotebookName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create notebook. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\New-FabricNotebook.ps1' 164
#Region '.\Public\Notebook\New-FabricNotebookNEW.ps1' -1

<#
.SYNOPSIS
Creates a new notebook in a specified Microsoft Fabric workspace.

.DESCRIPTION
This function sends a POST request to the Microsoft Fabric API to create a new notebook
in the specified workspace. It supports optional parameters for notebook description
and path definitions for the notebook content.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the notebook will be created.

.PARAMETER NotebookName
The name of the notebook to be created.

.PARAMETER NotebookDescription
An optional description for the notebook.

.PARAMETER NotebookPathDefinition
An optional path to the notebook definition file (e.g., .ipynb file) to upload.

.PARAMETER NotebookPathPlatformDefinition
An optional path to the platform-specific definition (e.g., .platform file) to upload.

.EXAMPLE
 Add-FabricNotebook -WorkspaceId "workspace-12345" -NotebookName "New Notebook" -NotebookPathDefinition "C:\notebooks\example.ipynb"

 .NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function New-FabricNotebookNEW {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$NotebookName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathDefinition
    )

    try {
        # Step 1: Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/notebooks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            displayName = $NotebookName
        }

        if ($NotebookDescription) {
            $body.description = $NotebookDescription
        }

        if ($NotebookPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    format = "ipynb"
                    parts  = @()
                }
            }
            $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $NotebookPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }
        # Check if any path is .platform
        foreach ($part in $jsonObjectParts.parts) {
            if ($part.path -eq ".platform") {
                $hasPlatformFile = $true
                Write-FabricLog -Message "Platform File: $hasPlatformFile" -Level Debug
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Create Notebook '$NotebookName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $response = Invoke-RestMethod `
                -Headers $FabricConfig.FabricHeaders `
                -Uri $apiEndpointUrl `
                -Method Post `
                -Body $bodyJson `
                -ContentType "application/json" `
                -ErrorAction Stop `
                -SkipHttpErrorCheck `
                -ResponseHeadersVariable "responseHeader" `
                -StatusCodeVariable "statusCode"
        }

        # Step 5: Handle and log the response
        switch ($statusCode) {
            201 {
                Write-FabricLog -Message "Notebook '$NotebookName' created successfully!" -Level Info
                return $response
            }
            202 {
                Write-FabricLog -Message "Notebook '$NotebookName' creation accepted. Provisioning in progress!" -Level Info

                [string]$operationId = $responseHeader["x-ms-operation-id"]
                [string]$location = $responseHeader["Location"]
                [string]$retryAfter = $responseHeader["Retry-After"]

                Write-FabricLog -Message "Operation ID: '$operationId'" -Level Debug
                Write-FabricLog -Message "Location: '$location'" -Level Debug
                Write-FabricLog -Message "Retry-After: '$retryAfter'" -Level Debug
                Write-FabricLog -Message "Getting Long Running Operation status" -Level Debug

                $operationStatus = Get-FabricLongRunningOperation -operationId $operationId
                Write-FabricLog -Message "Long Running Operation status: $operationStatus" -Level Debug
                # Handle operation result
                if ($operationStatus.status -eq "Succeeded") {
                    Write-FabricLog -Message "Operation Succeeded" -Level Debug
                    Write-FabricLog -Message "Getting Long Running Operation result" -Level Debug

                    $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                    Write-FabricLog -Message "Long Running Operation status: $operationResult" -Level Debug

                    return $operationResult
                }
                else {
                    Write-FabricLog -Message "Operation failed. Status: $($operationStatus)" -Level Debug
                    Write-FabricLog -Message "Operation failed. Status: $($operationStatus)" -Level Error
                    return $operationStatus
                }
            }
            default {
                Write-FabricLog -Message "Unexpected response code: $statusCode" -Level Error
                Write-FabricLog -Message "Error details: $($response.message)" -Level Error
                throw "API request failed with status code $statusCode."
            }
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create notebook. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\New-FabricNotebookNEW.ps1' 163
#Region '.\Public\Notebook\Remove-FabricNotebook.ps1' -1

<#
.SYNOPSIS
Deletes an Notebook from a specified workspace in Microsoft Fabric.

.DESCRIPTION
The `Remove-FabricNotebook` function sends a DELETE request to the Fabric API to remove a specified Notebook from a given workspace.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Notebook to delete.

.PARAMETER NotebookId
(Mandatory) The ID of the Notebook to be deleted.

.EXAMPLE
Remove-FabricNotebook -WorkspaceId "12345" -NotebookId "67890"

Deletes the Notebook with ID "67890" from workspace "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Validates token expiration before making the API request.

Author: Tiago Balabuch

#>
function Remove-FabricNotebook {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "Notebook '$NotebookId' in workspace '$WorkspaceId'"
        $action = "Delete Notebook"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Notebook '$NotebookId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete notebook '$NotebookId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\Remove-FabricNotebook.ps1' 70
#Region '.\Public\Notebook\Update-FabricNotebook.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric Notebook.

.DESCRIPTION
The `Update-FabricNotebook` function updates the name and/or description of a specified Fabric Notebook by making a PATCH request to the API.

.PARAMETER WorkspaceId
The ID of the Microsoft Fabric workspace that contains the Notebook to update. Required to scope the API request.

.PARAMETER NotebookId
The unique identifier of the Notebook to be updated.

.PARAMETER NotebookName
The new name for the Notebook.

.PARAMETER NotebookDescription
(Optional) The new description for the Notebook.

.EXAMPLE
Update-FabricNotebook -NotebookId "Notebook123" -NotebookName "NewNotebookName"

Updates the name of the Notebook with the ID "Notebook123" to "NewNotebookName".

.EXAMPLE
Update-FabricNotebook -NotebookId "Notebook123" -NotebookName "NewName" -NotebookDescription "Updated description"

Updates both the name and description of the Notebook "Notebook123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricNotebook {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$NotebookName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $NotebookName
        }

        if ($NotebookDescription) {
            $body.description = $NotebookDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

       # Make the API request when confirmed
        $target = "Notebook '$NotebookId' in workspace '$WorkspaceId'"
        $action = "Update Notebook display name/description"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Notebook '$NotebookName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update notebook. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\Update-FabricNotebook.ps1' 103
#Region '.\Public\Notebook\Update-FabricNotebookDefinition.ps1' -1

<#
.SYNOPSIS
Updates the definition of a notebook in a Microsoft Fabric workspace.

.DESCRIPTION
This function allows updating the content or metadata of a notebook in a Microsoft Fabric workspace.
The notebook content can be provided as file paths, and metadata updates can optionally be enabled.

.PARAMETER WorkspaceId
(Mandatory) The unique identifier of the workspace where the notebook resides.

.PARAMETER NotebookId
(Mandatory) The unique identifier of the notebook to be updated.

.PARAMETER NotebookPathDefinition
(Mandatory) The file path to the notebook content definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER NotebookPathPlatformDefinition
(Optional) The file path to the notebook's platform-specific definition file. The content will be encoded as Base64 and sent in the request.

.PARAMETER NotebookFormat
Optional. Specifies the format of the notebook content being submitted in the definition. Use 'ipynb' for Jupyter notebooks or 'fabricGitSource' for Fabric Git-sourced content. Defaults to 'ipynb'.

.EXAMPLE
Update-FabricNotebookDefinition -WorkspaceId "12345" -NotebookId "67890" -NotebookPathDefinition "C:\Notebooks\Notebook.ipynb"

Updates the content of the notebook with ID `67890` in the workspace `12345` using the specified notebook file.

.EXAMPLE
Update-FabricNotebookDefinition -WorkspaceId "12345" -NotebookId "67890" -NotebookPathDefinition "C:\Notebooks\Notebook.ipynb" -NotebookPathPlatformDefinition "C:\Notebooks\.platform"

Updates both the content and metadata of the notebook with ID `67890` in the workspace `12345`.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- The notebook content is encoded as Base64 before being sent to the Fabric API.
- This function handles asynchronous operations and retrieves operation results if required.

Author: Tiago Balabuch

#>
function Update-FabricNotebookDefinition {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$NotebookPathPlatformDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('ipynb', 'fabricGitSource')]
        [string]$NotebookFormat = 'ipynb'
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/notebooks/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $NotebookId
        if ($NotebookPathPlatformDefinition) {
            $apiEndpointURI = "$apiEndpointURI?updateMetadata=true"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            definition = @{
                format = $NotebookFormat
                parts  = @()
            }
        }

        if ($NotebookPathDefinition) {
            $notebookEncodedContent = Convert-ToBase64 -filePath $NotebookPathDefinition

            if (-not [string]::IsNullOrEmpty($notebookEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "notebook-content.py"
                    payload     = $notebookEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in notebook definition." -Level Error
                return $null
            }
        }

        if ($NotebookPathPlatformDefinition) {
            $notebookEncodedPlatformContent = Convert-ToBase64 -filePath $NotebookPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($notebookEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $notebookEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Notebook '$NotebookId' in workspace '$WorkspaceId'"
        $action = "Update Notebook definition"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Notebook with ID '$NotebookId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update notebook. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Notebook\Update-FabricNotebookDefinition.ps1' 149
#Region '.\Public\OneLake\Get-FabricOneLakeDataAccessSecurity.ps1' -1

<#
.SYNOPSIS
    Sets data access security for OneLake items in a Microsoft Fabric workspace.

.DESCRIPTION
    Configures data access security by assigning roles, permissions, and members to a OneLake item in a Fabric workspace.
    Sends a PUT request to the Microsoft Fabric API to update security settings for the specified workspace and item.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the OneLake item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the OneLake item to secure. Mandatory.

.PARAMETER RoleName
    The name of the security role to assign. Mandatory.

.PARAMETER Paths
    The list of paths within the OneLake item to which the permissions apply. Mandatory.

.PARAMETER Actions
    The list of actions (e.g., Read, Write) to permit on the specified paths. Mandatory.

.PARAMETER ItemAccess
    (Optional) The access levels for fabric item members (e.g., Read, Write, Reshare, Explore, Execute, ReadAll).

.PARAMETER FabricSourcePath
    (Optional) The source path in the format workspaceId/itemId for fabric item members.

.PARAMETER ObjectType
    (Optional) The type of Microsoft Entra object (Group, User, ServicePrincipal, ManagedIdentity).

.PARAMETER ObjectId
    (Optional) The object ID of the Microsoft Entra member.

.PARAMETER TenantId
    (Optional) The tenant ID of the Microsoft Entra member.

.PARAMETER DryRun
    (Optional) If specified, performs a dry run without applying changes.

.EXAMPLE
    Set-FabricOneLakeDataAccessSecurity -WorkspaceId "workspace-12345" -ItemId "item-67890" -RoleName "DataReaders" -Paths "/data" -Actions "Read" -ObjectType "User" -ObjectId "user-guid" -TenantId "tenant-guid"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricOneLakeDataAccessSecurity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

    [Parameter(Mandatory = $false)]
    [string]$RoleName    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/dataAccessRoles" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Optionally filter by RoleName if provided
        if ($RoleName) {
            Write-FabricLog -Message "Filtering roles by name '$RoleName'." -Level Debug
            try {
                # Support both array and envelope shapes
                if ($response -is [System.Collections.IEnumerable]) {
                    return ($response | Where-Object { $_.name -eq $RoleName -or $_.RoleName -eq $RoleName })
                }
                elseif ($response.value) {
                    return ($response.value | Where-Object { $_.name -eq $RoleName -or $_.RoleName -eq $RoleName })
                }
            }
            catch {
                Write-FabricLog -Message "Unable to filter response by RoleName due to unexpected shape." -Level Debug
            }
        }

        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to get OneLake Data Access Security. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\OneLake\Get-FabricOneLakeDataAccessSecurity.ps1' 107
#Region '.\Public\OneLake\Get-FabricOneLakeShortcut.ps1' -1

<#
.SYNOPSIS
    Retrieves shortcut details from a specified Microsoft Fabric OneLake item.

.DESCRIPTION
    Fetches shortcut information from a OneLake item within a workspace. Supports filtering by shortcut name and parent path.
    Validates authentication, constructs the API endpoint, sends the request, and returns the matching shortcut(s).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the OneLake item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the OneLake item to query. Mandatory.

.PARAMETER ShortcutName
    The name of the shortcut to retrieve. Optional.

.PARAMETER ParentPath
    The parent path to filter shortcuts. Optional.

.EXAMPLE
    Get-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890"
    Retrieves all shortcuts for the specified OneLake item.

.EXAMPLE
    Get-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutName "MyShortcut"
    Retrieves the shortcut named "MyShortcut" for the specified OneLake item.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricOneLakeShortcut {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentPath
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/shortcuts" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        if ($ParentPath) {
            $apiEndpointURI += "?parentPath={0}" -f $ParentPath
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ShortcutName) {
            $matchedItems = $dataItems.Where({ $_.name -eq $ShortcutName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve OneLake Shortcut(s). Error details: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\OneLake\Get-FabricOneLakeShortcut.ps1' 106
#Region '.\Public\OneLake\New-FabricOneLakeShortcut.ps1' -1

<#
.SYNOPSIS
    Creates a new OneLake Shortcut in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a OneLake Shortcut (MPE) in the specified workspace.
    Requires workspace ID, item ID, target type, and connection ID. Additional parameters depend on the target type.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the OneLake Shortcut will be created. Mandatory.

.PARAMETER ItemId
    The unique identifier of the item (e.g., Lakehouse) where the shortcut will be created. Mandatory.

.PARAMETER ShortcutConflictPolicy
    (Optional) Policy for handling shortcut name conflicts. Valid values: Abort, GenerateUniqueName, CreateOrOverwrite, OverwriteOnly.

.PARAMETER ShortcutName
    Mandatory. Friendly name for the shortcut as it will appear under the Lakehouse 'Files' tree. Must be unique within the item unless a conflict policy allows overwrite or automatic renaming.

.PARAMETER Path
    Mandatory. The relative path inside the Lakehouse Files hierarchy where the shortcut will be mounted (e.g. 'Files/external/data'). This becomes the visible folder representing the external data source.

.PARAMETER Target
    The type of target for the shortcut (e.g., adlsGen2, amazonS3, azureBlobStorage, dataverse, googleCloudStorage, oneLake, s3Compatible). Mandatory.

.PARAMETER ConnectionId
    The connection ID to use for the shortcut. Mandatory.

.PARAMETER Location
    (Optional) The location or container for the shortcut, required for some targets.

.PARAMETER SubPath
    (Optional) The subpath within the location, required for some targets.

.PARAMETER DeltaLakeFolder
    (Optional) The Delta Lake folder, required for dataverse target.

.PARAMETER EnvironmentDomain
    (Optional) The environment domain, required for dataverse target.

.PARAMETER TableName
    (Optional) The table name, required for dataverse target.

.PARAMETER TargetItemId
    (Optional) The target item ID, required for onelake target.

.PARAMETER TargetPath
    (Optional) Path inside the target OneLake item when Target is 'oneLake'. Defines which subfolder of the remote Lakehouse is exposed via this shortcut.

.PARAMETER TargetWorkspaceId
    (Optional) The workspace ID of the target, required for onelake target.

.PARAMETER Bucket
    (Optional) The bucket name, required for s3Compatible target.

.EXAMPLE
    New-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutName "shortcut1" -Target "adlsGen2" -ConnectionId "conn-abc" -Location "container" -SubPath "folder"

.EXAMPLE
    New-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutName "shortcut2" -Target "dataverse" -ConnectionId "conn-xyz" -DeltaLakeFolder "folder" -EnvironmentDomain "domain" -TableName "table"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricOneLakeShortcut {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    [Diagnostics.CodeAnalysis.SuppressMessage('PSReviewUnusedParameter','', Justification='Parameters are dynamically consumed via Get-Variable based on Target selection')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Path,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet("Abort", "GenerateUniqueName", "CreateOrOverwrite", "OverwriteOnly")]
        [string]$ShortcutConflictPolicy,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet("adlsGen2", "amazonS3", "azureBlobStorage", "dataverse", "googleCloudStorage", "oneLake", "s3Compatible")]
        [string]$Target,

        # AdlsGen2, AmazonS3, AzureBlobStorage, GoogleCloudStorage
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ConnectionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Location,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SubPath,

        #dataverse
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$DeltaLakeFolder,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentDomain,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TableName,

        #onelake
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetItemId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetPath,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TargetWorkspaceId,

        #S3Compatible
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$Bucket
    )
    try {

        # Validate required parameters for specific targets using a hashtable for efficiency
        $requiredParamsByTarget = @{
            adlsGen2           = @("Location", "SubPath")
            amazonS3           = @("Location", "SubPath")
            azureBlobStorage   = @("Location", "SubPath")
            googleCloudStorage = @("Location", "SubPath")
            dataverse          = @("DeltaLakeFolder", "EnvironmentDomain", "TableName")
            onelake            = @("TargetItemId", "TargetPath", "TargetWorkspaceId")
            s3Compatible       = @("Bucket", "Location", "SubPath")
        }

        if ($requiredParamsByTarget.ContainsKey($Target)) {
            foreach ($param in $requiredParamsByTarget[$Target]) {
                if (-not (Get-Variable -Name $param -ValueOnly)) {
                    Write-FabricLog -Message "Parameter '$param' cannot be null or empty when Target is $Target." -Level Error
                    return $null
                }
            }
        }
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/shortcuts" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        if ($ShortcutConflictPolicy) {
            $apiEndpointURI = "$apiEndpointURI?shortcutConflictPolicy=$ShortcutConflictPolicy"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body in the required nested format
        $targetBody = @{}

        # Add required parameters for the selected target
        foreach ($param in $requiredParamsByTarget[$Target]) {
            if ($Target -eq "onelake") {
            switch ($param) {
                "TargetItemId"      { $targetBody["itemId"] = $TargetItemId }
                "TargetPath"        { $targetBody["path"] = $TargetPath }
                "TargetWorkspaceId" { $targetBody["workspaceId"] = $TargetWorkspaceId }
                default             { $targetBody[$param.Substring(0, 1).ToLower() + $param.Substring(1)] = Get-Variable -Name $param -ValueOnly }
            }
            } else {
            $targetBody[$param.Substring(0, 1).ToLower() + $param.Substring(1)] = Get-Variable -Name $param -ValueOnly
            }
        }

        # Always add connectionId for all targets
        $targetBody["connectionId"] = $ConnectionId

        $body = @{
            name = $ShortcutName
            path = $Path
            target = @{
                $Target = $targetBody
            }
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Item '$ItemId' in workspace '$WorkspaceId'"
        $action = "Create OneLake Shortcut '$ShortcutName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "OneLake Shortcut created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create OneLake Shortcut. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\OneLake\New-FabricOneLakeShortcut.ps1' 231
#Region '.\Public\OneLake\Remove-FabricOneLakeShortcut.ps1' -1

<#
.SYNOPSIS
    Removes a OneLake Shortcut from a specified item in a Microsoft Fabric workspace.

.DESCRIPTION
    Deletes a OneLake Shortcut identified by ShortcutName and ShortcutPath from the item specified by ItemId in the given WorkspaceId using the Microsoft Fabric API.

.PARAMETER WorkspaceId
    The ID of the workspace containing the item.

.PARAMETER ItemId
    The ID of the item from which the shortcut will be removed.

.PARAMETER ShortcutPath
    The path of the shortcut within the item.

.PARAMETER ShortcutName
    The name of the shortcut to remove.

.EXAMPLE
    Remove-FabricOneLakeShortcut -WorkspaceId "workspace-12345" -ItemId "item-67890" -ShortcutPath "folder/subfolder" -ShortcutName "shortcut1"
    Removes the shortcut named "shortcut1" from the specified path in the given item and workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricOneLakeShortcut {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutPath,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ShortcutName
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/shortcuts/{3}/{4}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId, $ShortcutPath, $ShortcutName
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request when confirmed
        $target = "Shortcut '$ShortcutName' at path '$ShortcutPath' on item '$ItemId' in workspace '$WorkspaceId'"
        $action = "Delete OneLake Shortcut"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "OneLake Shortcut '$ShortcutName' was successfully deleted from item '$ItemId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete OneLake Shortcut '$ShortcutName' from item '$ItemId' in workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\OneLake\Remove-FabricOneLakeShortcut.ps1' 82
#Region '.\Public\OneLake\Reset-FabricOneLakeShortcutCache.ps1' -1

<#
.SYNOPSIS
    Resets the OneLake shortcut cache for a specified Microsoft Fabric workspace.

.DESCRIPTION
    Triggers a reset of the shortcut cache for OneLake within the given workspace.
    Validates authentication, constructs the API endpoint, sends the reset request, and returns the API response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace whose OneLake shortcut cache will be reset. Mandatory.

.EXAMPLE
    Reset-FabricOneLakeShortcutCache -WorkspaceId "workspace-12345"
    Resets the OneLake shortcut cache for the specified workspace.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Reset-FabricOneLakeShortcutCache {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/onelake/resetShortcutCache" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug
        # Make the API request when confirmed
        $target = "Workspace '$WorkspaceId'"
        $action = "Reset OneLake shortcut cache"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully reset the OneLake shortcut cache for workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve OneLake Shortcut(s). Error details: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\OneLake\Reset-FabricOneLakeShortcutCache.ps1' 60
#Region '.\Public\OneLake\Set-FabricOneLakeDataAccessSecurity.ps1' -1

<#
.SYNOPSIS
    Sets data access security for OneLake items in a Microsoft Fabric workspace.

.DESCRIPTION
    Configures data access security by assigning roles, permissions, and members to a OneLake item in a Fabric workspace.
    Sends a PUT request to the Microsoft Fabric API to update security settings for the specified workspace and item.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the OneLake item. Mandatory.

.PARAMETER ItemId
    The unique identifier of the OneLake item to secure. Mandatory.

.PARAMETER RoleName
    The name of the security role to assign. Mandatory.

.PARAMETER Paths
    The list of paths within the OneLake item to which the permissions apply. Mandatory.

.PARAMETER Actions
    The list of actions (e.g., Read, Write) to permit on the specified paths. Mandatory.

.PARAMETER ItemAccess
    (Optional) The access levels for fabric item members (e.g., Read, Write, Reshare, Explore, Execute, ReadAll).

.PARAMETER FabricSourcePath
    (Optional) The source path in the format workspaceId/itemId for fabric item members.

.PARAMETER ObjectType
    (Optional) The type of Microsoft Entra object (Group, User, ServicePrincipal, ManagedIdentity).

.PARAMETER ObjectId
    (Optional) The object ID of the Microsoft Entra member.

.PARAMETER TenantId
    (Optional) The tenant ID of the Microsoft Entra member.

.PARAMETER DryRun
    (Optional) If specified, performs a dry run without applying changes.

.EXAMPLE
    Set-FabricOneLakeDataAccessSecurity -WorkspaceId "workspace-12345" -ItemId "item-67890" -RoleName "DataReaders" -Paths "/data" -Actions "Read" -ObjectType "User" -ObjectId "user-guid" -TenantId "tenant-guid"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Set-FabricOneLakeDataAccessSecurity {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ItemId,

        [Parameter(Mandatory = $true)]
        [string]$RoleName,

        [Parameter(Mandatory = $true)]
        [string[]]$Paths,

        [Parameter(Mandatory = $true)]
        [string[]]$Actions,

        [Parameter(Mandatory = $false)]
        [ValidateSet("Read", "Write", "Reshare", "Explore", "Execute", "ReadAll")]
        [string[]]$ItemAccess,

        [Parameter(Mandatory = $false)]
        [string]$FabricSourcePath,  # Format: workspaceId/itemId

        [Parameter(Mandatory = $false)]
        [ValidateSet("Group", "User", "ServicePrincipal", "ManagedIdentity")]
        [string]$ObjectType,

        [Parameter(Mandatory = $false)]
        [string]$ObjectId,

        [Parameter(Mandatory = $false)]
        [string]$TenantId,

        [Parameter(Mandatory = $false)]
        [switch]$DryRun
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/items/{2}/dataAccessRoles" -f $FabricConfig.BaseUrl, $WorkspaceId, $ItemId
        if ($DryRun.IsPresent) {
            $apiEndpointURI += "?dryRun=true"
        }

        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Build decision rule
        $decisionRule = @{
            effect     = "Permit"
            permission = @(
                @{
                    attributeName            = "Path"
                    attributeValueIncludedIn = $Paths
                },
                @{
                    attributeName            = "Action"
                    attributeValueIncludedIn = $Actions
                }
            )
        }

        # Build members object
        $members = @{}

        if ($ItemAccess -and $FabricSourcePath) {
            $members.fabricItemMembers = @(
                @{
                    itemAccess = $ItemAccess
                    sourcePath = $FabricSourcePath
                }
            )
        }

        if ($ObjectType -and $ObjectId -and $TenantId) {
            $members.microsoftEntraMembers = @(
                @{
                    objectId   = $ObjectId
                    objectType = $ObjectType
                    tenantId   = $TenantId
                }
            )
        }

        # Final role structure
        $roleDefinition = @{
            name          = $RoleName
            decisionRules = @($decisionRule)
            members       = $members
        }

        $body = @{
            value = @($roleDefinition)
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request when confirmed
        $target = "Item '$ItemId' in workspace '$WorkspaceId'"
        $action = "Set OneLake data access security role '$RoleName'"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Put'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            if ($DryRun.IsPresent) {
                Write-FabricLog -Message "Dry run completed. No changes were made." -Level Info
            }
            else {
                Write-FabricLog -Message "OneLake Data Access Security set up successfully!" -Level Info
            }

            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to set up OneLake Data Access Security. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\OneLake\Set-FabricOneLakeDataAccessSecurity.ps1' 186
#Region '.\Public\Paginated Reports\Get-FabricPaginatedReport.ps1' -1

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
        # Validate input parameters
        if ($PaginatedReportId -and $PaginatedReportName) {
            Write-FabricLog -Message "Specify only one parameter: either 'PaginatedReportId' or 'PaginatedReportName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/paginatedReports" -f $FabricConfig.BaseUrl, $WorkspaceId
          Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

         # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($PaginatedReportId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $PaginatedReportId }, 'First')
        }
        elseif ($PaginatedReportName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $PaginatedReportName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Paginated Report. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Paginated Reports\Get-FabricPaginatedReport.ps1' 107
#Region '.\Public\Paginated Reports\Update-FabricPaginatedReport.ps1' -1

<#
.SYNOPSIS
    Updates an existing paginated report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing paginated report
    in the specified workspace. It supports optional parameters for paginated report description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the paginated report exists. This parameter is optional.

.PARAMETER PaginatedReportId
    The unique identifier of the paginated report to be updated. This parameter is mandatory.

.PARAMETER PaginatedReportName
    The new name of the paginated report. This parameter is mandatory.

.PARAMETER PaginatedReportDescription
    An optional new description for the paginated report.

.EXAMPLE
    Update-FabricPaginatedReport -WorkspaceId "workspace-12345" -PaginatedReportId "report-67890" -PaginatedReportName "Updated Paginated Report" -PaginatedReportDescription "Updated description"
    This example updates the paginated report with ID "report-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricPaginatedReport {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$PaginatedReportId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$PaginatedReportName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$PaginatedReportDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

    # Construct the API endpoint URI
    $apiEndpointUrl = "{0}/workspaces/{1}/paginatedReports/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $PaginatedReportId
    Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $PaginatedReportName
        }

        if ($PaginatedReportDescription) {
            $body.description = $PaginatedReportDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

       # Make the API request when confirmed
        $target = "Paginated Report '$PaginatedReportId' in workspace '$WorkspaceId'"
        $action = "Update Paginated Report display name/description"
        if ($PSCmdlet.ShouldProcess($target, $action)) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointUrl
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Paginated Report '$PaginatedReportName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Paginated Report. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Paginated Reports\Update-FabricPaginatedReport.ps1' 98
#Region '.\Public\Reflex\Get-FabricReflex.ps1' -1

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
        # Validate input parameters
        if ($ReflexId -and $ReflexName) {
            Write-FabricLog -Message "Specify only one parameter: either 'ReflexId' or 'ReflexName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ReflexId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ReflexId }, 'First')
        }
        elseif ($ReflexName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ReflexName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Reflex. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Reflex\Get-FabricReflex.ps1' 108
#Region '.\Public\Reflex\Get-FabricReflexDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of an Reflex from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an Reflex from a specified workspace using the provided ReflexId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is mandatory.

.PARAMETER ReflexId
    The unique identifier of the Reflex to retrieve the definition for. This parameter is optional.

.PARAMETER ReflexFormat
    The format in which to retrieve the Reflex definition. This parameter is optional.

.EXAMPLE
    Get-FabricReflexDefinition -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890"
    This example retrieves the definition of the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReflexDefinition -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890" -ReflexFormat "json"
    This example retrieves the definition of the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricReflexDefinition {
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
        [string]$ReflexFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReflexId
        if ($ReflexFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $ReflexFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Reflex '$ReflexId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Reflex. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Reflex\Get-FabricReflexDefinition.ps1' 80
#Region '.\Public\Reflex\New-FabricReflex.ps1' -1

<#
.SYNOPSIS
    Creates a new Reflex in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Reflex
    in the specified workspace. It supports optional parameters for Reflex description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex will be created. This parameter is mandatory.

.PARAMETER ReflexName
    The name of the Reflex to be created. This parameter is mandatory.

.PARAMETER ReflexDescription
    An optional description for the Reflex.

.PARAMETER ReflexPathDefinition
    An optional path to the Reflex definition file to upload.

.PARAMETER ReflexPathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
    New-FabricReflex -WorkspaceId "workspace-12345" -ReflexName "New Reflex" -ReflexDescription "Description of the new Reflex"
    This example creates a new Reflex named "New Reflex" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricReflex {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReflexName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $ReflexName
        }

        if ($ReflexDescription) {
            $body.description = $ReflexDescription
        }
        if ($ReflexPathDefinition) {
            $ReflexEncodedContent = Convert-ToBase64 -filePath $ReflexPathDefinition

            if (-not [string]::IsNullOrEmpty($ReflexEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "ReflexEntities.json"
                    payload     = $ReflexEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Reflex definition." -Level Error
                return $null
            }
        }

        if ($ReflexPathPlatformDefinition) {
            $ReflexEncodedPlatformContent = Convert-ToBase64 -filePath $ReflexPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($ReflexEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        parts = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $ReflexEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Reflex '$ReflexName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Reflex '$ReflexName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Reflex. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Reflex\New-FabricReflex.ps1' 150
#Region '.\Public\Reflex\Remove-FabricReflex.ps1' -1

<#
.SYNOPSIS
    Removes an Reflex from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an Reflex
    from the specified workspace using the provided WorkspaceId and ReflexId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Reflex will be removed.

.PARAMETER ReflexId
    The unique identifier of the Reflex to be removed.

.EXAMPLE
    Remove-FabricReflex -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890"
    This example removes the Reflex with ID "Reflex-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricReflex {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReflexId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Reflex '$ReflexId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Reflex '$ReflexId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Reflex '$ReflexId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Reflex\Remove-FabricReflex.ps1' 67
#Region '.\Public\Reflex\Update-FabricReflex.ps1' -1

<#
.SYNOPSIS
    Updates an existing Reflex in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Reflex
    in the specified workspace. It supports optional parameters for Reflex description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is optional.

.PARAMETER ReflexId
    The unique identifier of the Reflex to be updated. This parameter is mandatory.

.PARAMETER ReflexName
    The new name of the Reflex. This parameter is mandatory.

.PARAMETER ReflexDescription
    An optional new description for the Reflex.

.EXAMPLE
    Update-FabricReflex -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890" -ReflexName "Updated Reflex" -ReflexDescription "Updated description"
    This example updates the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricReflex {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReflexName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReflexId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $ReflexName
        }

        if ($ReflexDescription) {
            $body.description = $ReflexDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Reflex '$ReflexName' (ID: $ReflexId) in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Reflex '$ReflexName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Reflex. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Reflex\Update-FabricReflex.ps1' 96
#Region '.\Public\Reflex\Update-FabricReflexDefinition.ps1' -1

<#
.SYNOPSIS
    Updates the definition of an existing Reflex in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Reflex
    in the specified workspace. It supports optional parameters for Reflex definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Reflex exists. This parameter is mandatory.

.PARAMETER ReflexId
    The unique identifier of the Reflex to be updated. This parameter is mandatory.

.PARAMETER ReflexPathDefinition
    An optional path to the Reflex definition file to upload.

.PARAMETER ReflexPathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
    Update-FabricReflexDefinition -WorkspaceId "workspace-12345" -ReflexId "Reflex-67890" -ReflexPathDefinition "C:\Path\To\ReflexDefinition.json"
    This example updates the definition of the Reflex with ID "Reflex-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricReflexDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReflexPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/reflexes/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReflexId
        if ($ReflexPathPlatformDefinition) {
            $apiEndpointURI = "?updateMetadata=true" -f $apiEndpointURI
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($ReflexPathDefinition) {
            $ReflexEncodedContent = Convert-ToBase64 -filePath $ReflexPathDefinition

            if (-not [string]::IsNullOrEmpty($ReflexEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "ReflexEntities.json"
                    payload     = $ReflexEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in Reflex definition." -Level Error
                return $null
            }
        }

        if ($ReflexPathPlatformDefinition) {
            $ReflexEncodedPlatformContent = Convert-ToBase64 -filePath $ReflexPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($ReflexEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $ReflexEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Reflex definition for Reflex ID '$ReflexId' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Reflex with ID '$ReflexId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Reflex. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Reflex\Update-FabricReflexDefinition.ps1' 129
#Region '.\Public\Report\Get-FabricReport.ps1' -1

<#
.SYNOPSIS
    Retrieves Report details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Report details from a specified workspace using either the provided ReportId or ReportName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is mandatory.

.PARAMETER ReportId
    The unique identifier of the Report to retrieve. This parameter is optional.

.PARAMETER ReportName
    The name of the Report to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricReport -WorkspaceId "workspace-12345" -ReportId "Report-67890"
    This example retrieves the Report details for the Report with ID "Report-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReport -WorkspaceId "workspace-12345" -ReportName "My Report"
    This example retrieves the Report details for the Report named "My Report" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricReport {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReportName
    )
    try {
        # Validate input parameters
        if ($ReportId -and $ReportName) {
            Write-FabricLog -Message "Specify only one parameter: either 'ReportId' or 'ReportName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reports" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($ReportId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $ReportId }, 'First')
        }
        elseif ($ReportName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $ReportName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Report. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Report\Get-FabricReport.ps1' 108
#Region '.\Public\Report\Get-FabricReportDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of an Report from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an Report from a specified workspace using the provided ReportId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is mandatory.

.PARAMETER ReportId
    The unique identifier of the Report to retrieve the definition for. This parameter is optional.

.PARAMETER ReportFormat
    The format in which to retrieve the Report definition. This parameter is optional.

.EXAMPLE
    Get-FabricReportDefinition -WorkspaceId "workspace-12345" -ReportId "Report-67890"
    This example retrieves the definition of the Report with ID "Report-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricReportDefinition -WorkspaceId "workspace-12345" -ReportId "Report-67890" -ReportFormat "json"
    This example retrieves the definition of the Report with ID "Report-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricReportDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/reports/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReportId
        if ($ReportFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $ReportFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Report '$ReportId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Report. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Report\Get-FabricReportDefinition.ps1' 80
#Region '.\Public\Report\New-FabricReport.ps1' -1

<#
.SYNOPSIS
    Creates a new Report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Report
    in the specified workspace. It supports optional parameters for Report description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report will be created. This parameter is mandatory.

.PARAMETER ReportName
    The name of the Report to be created. This parameter is mandatory.

.PARAMETER ReportDescription
    An optional description for the Report.

.PARAMETER ReportPathDefinition
    A mandatory path to the folder that contains Report definition files to upload.


.EXAMPLE
    New-FabricReport -WorkspaceId "workspace-12345" -ReportName "New Report" -ReportDescription "Description of the new Report"
    This example creates a new Report named "New Report" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricReport {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReportName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportDescription,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportPathDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reports" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $ReportName
        }

        if ($ReportDescription) {
            $body.description = $ReportDescription
        }
        if ($ReportPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    parts = @()
                }
            }

            # As Report has multiple parts, we need to get the definition parts
            $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $ReportPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Report '$ReportName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Report '$ReportName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Report. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Report\New-FabricReport.ps1' 109
#Region '.\Public\Report\Remove-FabricReport.ps1' -1

<#
.SYNOPSIS
    Removes an Report from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an Report
    from the specified workspace using the provided WorkspaceId and ReportId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Report will be removed.

.PARAMETER ReportId
    The unique identifier of the Report to be removed.

.EXAMPLE
    Remove-FabricReport -WorkspaceId "workspace-12345" -ReportId "Report-67890"
    This example removes the Report with ID "Report-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricReport {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reports/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReportId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        ## Make the API request
        if ($PSCmdlet.ShouldProcess("Report '$ReportId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Report '$ReportId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Report '$ReportId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Report\Remove-FabricReport.ps1' 67
#Region '.\Public\Report\Update-FabricReport.ps1' -1

<#
.SYNOPSIS
    Updates an existing Report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Report
    in the specified workspace. It supports optional parameters for Report description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is optional.

.PARAMETER ReportId
    The unique identifier of the Report to be updated. This parameter is mandatory.

.PARAMETER ReportName
    The new name of the Report. This parameter is mandatory.

.PARAMETER ReportDescription
    An optional new description for the Report.

.EXAMPLE
    Update-FabricReport -WorkspaceId "workspace-12345" -ReportId "Report-67890" -ReportName "Updated Report" -ReportDescription "Updated description"
    This example updates the Report with ID "Report-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricReport {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$ReportName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/reports/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReportId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $ReportName
        }

        if ($ReportDescription) {
            $body.description = $ReportDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Report '$ReportName' (ID: $ReportId) in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Report '$ReportName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Report. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Report\Update-FabricReport.ps1' 96
#Region '.\Public\Report\Update-FabricReportDefinition.ps1' -1

<#
.SYNOPSIS
    Updates the definition of an existing Report in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing Report
    in the specified workspace. It supports optional parameters for Report definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Report exists. This parameter is mandatory.

.PARAMETER ReportId
    The unique identifier of the Report to be updated. This parameter is mandatory.

.PARAMETER ReportPathDefinition
    A mandatory path to the Report definition file to upload.

.EXAMPLE
    Update-FabricReportDefinition -WorkspaceId "workspace-12345" -ReportId "Report-67890" -ReportPathDefinition "C:\Path\To\ReportDefinition.json"
    This example updates the definition of the Report with ID "Report-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricReportDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$ReportPathDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/Reports/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $ReportId

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        if ($ReportPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    parts = @()
                }
            }
            $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $ReportPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }
        # Check if any path is .platform
        foreach ($part in $jsonObjectParts.parts) {
            if ($part.path -eq ".platform") {
                $hasPlatformFile = $true
                Write-FabricLog -Message "Platform File: $hasPlatformFile" -Level Debug
            }
        }

        # If the platform file exists, append the query parameter to the URL
        if ($hasPlatformFile -eq $true) {
            $apiEndpointURI += "?updateMetadata=true" -f $apiEndpointURI
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Report definition for Report ID '$ReportId' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Report with ID '$ReportId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Report. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Report\Update-FabricReportDefinition.ps1' 109
#Region '.\Public\Semantic Model\Get-FabricSemanticModel.ps1' -1

<#
.SYNOPSIS
    Retrieves SemanticModel details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves SemanticModel details from a specified workspace using either the provided SemanticModelId or SemanticModelName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is mandatory.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to retrieve. This parameter is optional.

.PARAMETER SemanticModelName
    The name of the SemanticModel to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890"
    This example retrieves the SemanticModel details for the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelName "My SemanticModel"
    This example retrieves the SemanticModel details for the SemanticModel named "My SemanticModel" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSemanticModel {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName
    )
    try {
        # Validate input parameters
        if ($SemanticModelId -and $SemanticModelName) {
            Write-FabricLog -Message "Specify only one parameter: either 'SemanticModelId' or 'SemanticModelName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SemanticModelId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $SemanticModelId }, 'First')
        }
        elseif ($SemanticModelName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $SemanticModelName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SemanticModel. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Semantic Model\Get-FabricSemanticModel.ps1' 109
#Region '.\Public\Semantic Model\Get-FabricSemanticModelDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of an SemanticModel from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an SemanticModel from a specified workspace using the provided SemanticModelId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is mandatory.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to retrieve the definition for. This parameter is optional.

.PARAMETER SemanticModelFormat
    The format in which to retrieve the SemanticModel definition. This parameter is optional.

.EXAMPLE
    Get-FabricSemanticModelDefinition -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890"
    This example retrieves the definition of the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSemanticModelDefinition -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelFormat "json"
    This example retrieves the definition of the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSemanticModelDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('TMDL', 'TMSL')]
        [string]$SemanticModelFormat = "TMDL"
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId
        if ($SemanticModelFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $SemanticModelFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "SemanticModel '$SemanticModelId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SemanticModel. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Semantic Model\Get-FabricSemanticModelDefinition.ps1' 81
#Region '.\Public\Semantic Model\New-FabricSemanticModel.ps1' -1

<#
.SYNOPSIS
    Creates a new SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new SemanticModel
    in the specified workspace. It supports optional parameters for SemanticModel description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel will be created. This parameter is mandatory.

.PARAMETER SemanticModelName
    The name of the SemanticModel to be created. This parameter is mandatory.

.PARAMETER SemanticModelDescription
    An optional description for the SemanticModel.

.PARAMETER SemanticModelPathDefinition
    An optional path to the SemanticModel definition file to upload.

.EXAMPLE
    New-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelName "New SemanticModel" -SemanticModelDescription "Description of the new SemanticModel"
    This example creates a new SemanticModel named "New SemanticModel" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricSemanticModel {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelDescription,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelPathDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Construct the request body
        $body = @{
            displayName = $SemanticModelName
            definition  = @{
                parts = @()
            }
        }

        # As Report has multiple parts, we need to get the definition parts
        $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $SemanticModelPathDefinition
        # Add new part to the parts array
        $body.definition.parts = $jsonObjectParts.parts

        if ($SemanticModelDescription) {
            $body.description = $SemanticModelDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Semantic Model '$SemanticModelName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "SemanticModel '$SemanticModelName' created successfully!" -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create SemanticModel. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Semantic Model\New-FabricSemanticModel.ps1' 104
#Region '.\Public\Semantic Model\Remove-FabricSemanticModel.ps1' -1

<#
.SYNOPSIS
    Removes an SemanticModel from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an SemanticModel
    from the specified workspace using the provided WorkspaceId and SemanticModelId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the SemanticModel will be removed.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be removed.

.EXAMPLE
    Remove-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890"
    This example removes the SemanticModel with ID "SemanticModel-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricSemanticModel {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        ## Make the API request
        if ($PSCmdlet.ShouldProcess("Semantic Model '$SemanticModelId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "SemanticModel '$SemanticModelId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete SemanticModel '$SemanticModelId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Semantic Model\Remove-FabricSemanticModel.ps1' 67
#Region '.\Public\Semantic Model\Update-FabricSemanticModel.ps1' -1

<#
.SYNOPSIS
    Updates an existing SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing SemanticModel
    in the specified workspace. It supports optional parameters for SemanticModel description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is optional.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be updated. This parameter is mandatory.

.PARAMETER SemanticModelName
    The new name of the SemanticModel. This parameter is mandatory.

.PARAMETER SemanticModelDescription
    An optional new description for the SemanticModel.

.EXAMPLE
    Update-FabricSemanticModel -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelName "Updated SemanticModel" -SemanticModelDescription "Updated description"
    This example updates the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricSemanticModel {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SemanticModelName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/semanticModels/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $SemanticModelName
        }

        if ($SemanticModelDescription) {
            $body.description = $SemanticModelDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Semantic Model '$SemanticModelName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "SemanticModel '$SemanticModelName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SemanticModel. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Semantic Model\Update-FabricSemanticModel.ps1' 96
#Region '.\Public\Semantic Model\Update-FabricSemanticModelDefinition.ps1' -1

<#
.SYNOPSIS
    Updates the definition of an existing SemanticModel in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing SemanticModel
    in the specified workspace. It supports optional parameters for SemanticModel definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SemanticModel exists. This parameter is mandatory.

.PARAMETER SemanticModelId
    The unique identifier of the SemanticModel to be updated. This parameter is mandatory.

.PARAMETER SemanticModelPathDefinition
    An optional path to the SemanticModel definition file to upload.

.EXAMPLE
    Update-FabricSemanticModelDefinition -WorkspaceId "workspace-12345" -SemanticModelId "SemanticModel-67890" -SemanticModelPathDefinition "C:\Path\To\SemanticModelDefinition.json"
    This example updates the definition of the SemanticModel with ID "SemanticModel-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricSemanticModelDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SemanticModelPathDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/SemanticModels/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $SemanticModelId

        # Construct the request body
        $body = @{
            definition = @{
                parts = @()
            }
        }

        $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $SemanticModelPathDefinition
        # Add new part to the parts array
        $body.definition.parts = $jsonObjectParts.parts
        # Check if any path is .platform
        foreach ($part in $jsonObjectParts.parts) {
            if ($part.path -eq ".platform") {
                $hasPlatformFile = $true
                Write-FabricLog -Message "Platform File: $hasPlatformFile" -Level Debug
            }
        }

        # If the platform file exists, append the query parameter to the URL
        if ($hasPlatformFile -eq $true) {
            $apiEndpointURI = "?updateMetadata=true" -f $apiEndpointURI
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Semantic Model definition '$SemanticModelId' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Semantic Model with ID '$SemanticModelId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SemanticModel. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Semantic Model\Update-FabricSemanticModelDefinition.ps1' 102
#Region '.\Public\Sharing Links\Remove-FabricSharingLinks.ps1' -1

<#
.SYNOPSIS
Removes all sharing links in bulk from s        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Delete'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParamsied items in Microsoft Fabric.

.DESCRIPTION
Removes all sharing links of a specified type (e.g., 'OrgLink') from multiple items (such as datasets, reports, etc.) within a Microsoft Fabric workspace. Each item must include 'id' and 'type' properties. The function validates authentication and sends a bulk removal request to the Fabric API.

.PARAMETER sharingLinkType
Specifies the type of sharing link to remove. Default is 'OrgLink'. Only supported value is 'OrgLink'.

.EXAMPLE
    Remove-FabricSharingLinks -sharingLinkType 'OrgLink'

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Each item in `$Items` must have 'id' and 'type' properties.

Author: Tiago Balabuch
#>
function Remove-FabricSharingLinks {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('OrgLink')]
        $sharingLinkType = 'OrgLink'
    )
    try {
        # Validate Items structure
        foreach ($item in $Items) {
            if (-not ($item.id -and $item.type)) {
                throw "Each Item must contain 'id' and 'type' properties. Found: $item"
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/items/removeAllSharingLinks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            sharingLinkType = $sharingLinkType
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("all items with sharing link type '$sharingLinkType'", "Remove all sharing links")) {
            $response = Invoke-FabricAPIRequest `
                -BaseURI $apiEndpointURI `
                -Headers $FabricConfig.FabricHeaders `
                -Method Post `
                -Body $bodyJson

            # Return the API response
            Write-FabricLog -Message "All sharing links have been removed successfully from the specified items." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to remove all sharing links. Error details: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Sharing Links\Remove-FabricSharingLinks.ps1' 81
#Region '.\Public\Sharing Links\Remove-FabricSharingLinksBulk.ps1' -1

<#
.SYNOPSIS
Removes sharing links in bulk from items in Mic        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Delete'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParamst Fabric.

.DESCRIPTION
Removes sharing links of a specified type (e.g., 'OrgLink') from multiple items (such as datasets, reports, etc.) in a Microsoft Fabric workspace by sending a bulk removal request to the Fabric API. Each item must include 'id' and 'type' properties.

.PARAMETER Items
An array of objects, each containing 'id' and 'type' properties, representing the items from which sharing links will be removed.

.PARAMETER sharingLinkType
The type of sharing link to remove. Currently, only 'OrgLink' is supported. Default is 'OrgLink'.

.EXAMPLE
    Remove-FabricSharingLinksBulk -Items @(@{id="item1"; type="dataset"}, @{id="item2"; type="report"})

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Remove-FabricSharingLinksBulk {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Items, # Array with 'id' and 'type'

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('OrgLink')]
        $sharingLinkType = 'OrgLink'
    )
    try {
        # Validate Items structure
        foreach ($item in $Items) {
            if (-not ($item.id -and $item.type)) {
                throw "Each Item must contain 'id' and 'type' properties. Found: $item"
            }
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/items/bulkRemoveSharingLinks" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            items = $Items
            sharingLinkType = $sharingLinkType
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 2
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("$($Items.Count) item(s) with sharing link type '$sharingLinkType'", "Remove sharing links in bulk")) {
            $response = Invoke-FabricAPIRequest `
                -BaseURI $apiEndpointURI `
                -Headers $FabricConfig.FabricHeaders `
                -Method Post `
                -Body $bodyJson

            # Return the API response
            Write-FabricLog -Message "Bulk sharing link removal completed successfully for $($Items.Count) item(s)." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to remove sharing link removal in bulk. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Sharing Links\Remove-FabricSharingLinksBulk.ps1' 88
#Region '.\Public\Spark Job Definition\Get-FabricSparkJobDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves Spark Job Definition details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves SparkJobDefinition details from a specified workspace using either the provided SparkJobDefinitionId or SparkJobDefinitionName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition exists. This parameter is mandatory.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to retrieve. This parameter is optional.

.PARAMETER SparkJobDefinitionName
    The name of the SparkJobDefinition to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890"
    This example retrieves the SparkJobDefinition details for the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionName "My SparkJobDefinition"
    This example retrieves the SparkJobDefinition details for the SparkJobDefinition named "My SparkJobDefinition" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSparkJobDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkJobDefinitionName
    )
    try {
        # Validate input parameters
        if ($SparkJobDefinitionId -and $SparkJobDefinitionName) {
            Write-FabricLog -Message "Specify only one parameter: either 'SparkJobDefinitionId' or 'SparkJobDefinitionName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SparkJobDefinitionId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $SparkJobDefinitionId }, 'First')
        }
        elseif ($SparkJobDefinitionName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $SparkJobDefinitionName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SparkJobDefinition. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\Get-FabricSparkJobDefinition.ps1' 108
#Region '.\Public\Spark Job Definition\Get-FabricSparkJobDefinitionDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of an SparkJobDef        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $response = Invoke-FabricAPIRequest @apiParamsion from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves the definition of an SparkJobDefinition from a specified workspace using the provided SparkJobDefinitionId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition exists. This parameter is mandatory.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to retrieve the definition for. This parameter is optional.

.PARAMETER SparkJobDefinitionFormat
    The format in which to retrieve the SparkJobDefinition definition. This parameter is optional.

.EXAMPLE
    Get-FabricSparkJobDefinitionDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890"
    This example retrieves the definition of the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
    Get-FabricSparkJobDefinitionDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890" -SparkJobDefinitionFormat "json"
    This example retrieves the definition of the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345" in JSON format.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricSparkJobDefinitionDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('SparkJobDefinitionV1')]
        [string]$SparkJobDefinitionFormat = "SparkJobDefinitionV1"
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        if ($SparkJobDefinitionFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $SparkJobDefinitionFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post

        # Return the API response
        Write-FabricLog -Message "Spark Job Definition '$SparkJobDefinitionId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Spark Job Definition. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\Get-FabricSparkJobDefinitionDefinition.ps1' 83
#Region '.\Public\Spark Job Definition\Get-FabricSparkJobDefinitionLivySession.ps1' -1

<#
.SYNOPSIS
Retrieves Spark Job Definition Livy sessions for a specified workspace and job definition in Microsoft Fabric.

.DESCRIPTION
Get-FabricSparkJobDefinitionLivySession queries the Fabric API to return Livy session details for a given workspace and Spark Job Definition. You can optionally filter by a specific Livy session ID.

.PARAMETER WorkspaceId
The ID of the workspace containing the Spark Job Definition.

.PARAMETER SparkJobDefinitionId
The ID of the Spark Job Definition whose Livy sessions are to be retrieved.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricSparkJobDefinitionLivySession -WorkspaceId "12345" -SparkJobDefinitionId "jobdef-001"

Returns all Livy sessions for the specified Spark Job Definition in the workspace.

.EXAMPLE
Get-FabricSparkJobDefinitionLivySession -WorkspaceId "12345" -SparkJobDefinitionId "jobdef-001" -LivyId "livy-abc"

Returns the Livy session with ID "livy-abc" for the specified Spark Job Definition.

.NOTES
- Requires a global $FabricConfig object with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to validate authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricSparkJobDefinitionLivySession {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions/{2}/livySessions" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Spark Job Definition Livy Session. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\Get-FabricSparkJobDefinitionLivySession.ps1' 97
#Region '.\Public\Spark Job Definition\New-FabricSparkJobDefinition.ps1' -1

<#
.SYNOPSIS
    Creates a new SparkJobDefinition in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new SparkJobDefinition
    in the specified workspace. It supports optional parameters for SparkJobDefinition description and path definitions.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition will be created. This parameter is mandatory.

.PARAMETER SparkJobDefinitionName
    The name of the SparkJobDefinition to be created. This parameter is mandatory.

.PARAMETER SparkJobDefinitionDescription
    An optional description for the SparkJobDefinition.

.PARAMETER SparkJobDefinitionPathDefinition
    An optional path to the SparkJobDefinition definition file to upload.

.PARAMETER SparkJobDefinitionPathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
    New-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionName "New SparkJobDefinition" -SparkJobDefinitionDescription "Description of the new SparkJobDefinition"
    This example creates a new SparkJobDefinition named "New SparkJobDefinition" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricSparkJobDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkJobDefinitionName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $SparkJobDefinitionName
        }

        if ($SparkJobDefinitionDescription) {
            $body.description = $SparkJobDefinitionDescription
        }
        if ($SparkJobDefinitionPathDefinition) {
            $SparkJobDefinitionEncodedContent = Convert-ToBase64 -filePath $SparkJobDefinitionPathDefinition

            if (-not [string]::IsNullOrEmpty($SparkJobDefinitionEncodedContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "SparkJobDefinitionV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "SparkJobDefinitionProperties.json"
                    payload     = $SparkJobDefinitionEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in SparkJobDefinition definition." -Level Error
                return $null
            }
        }

        if ($SparkJobDefinitionPathPlatformDefinition) {
            $SparkJobDefinitionEncodedPlatformContent = Convert-ToBase64 -filePath $SparkJobDefinitionPathPlatformDefinition

            if (-not [string]::IsNullOrEmpty($SparkJobDefinitionEncodedPlatformContent)) {
                # Initialize definition if it doesn't exist
                if (-not $body.definition) {
                    $body.definition = @{
                        format = "SparkJobDefinitionV1"
                        parts  = @()
                    }
                }

                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $SparkJobDefinitionEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Job Definition '$SparkJobDefinitionName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Job Definition '$SparkJobDefinitionName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Spark Job Definition. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\New-FabricSparkJobDefinition.ps1' 151
#Region '.\Public\Spark Job Definition\Remove-FabricSparkJobDefinition.ps1' -1

<#
.SYNOPSIS
    Removes an SparkJobDefinition from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove an SparkJobDefinition
    from the specified workspace using the provided WorkspaceId and SparkJobDefinitionId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the SparkJobDefinition will be removed.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to be removed.

.EXAMPLE
    Remove-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890"
    This example removes the SparkJobDefinition with ID "SparkJobDefinition-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricSparkJobDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        ## Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Job Definition '$SparkJobDefinitionId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Job Definition '$SparkJobDefinitionId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete SparkJobDefinition '$SparkJobDefinitionId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\Remove-FabricSparkJobDefinition.ps1' 66
#Region '.\Public\Spark Job Definition\Start-FabricSparkJobDefinitionOnDemand.ps1' -1

<#
.SYNOPSIS
    Starts a Fabric Spark Job Definition on demand.

.DESCRIPTION
    This function initiates a Spark Job Definition on demand within a specified workspace.
    It constructs the appropriate API endpoint URL and makes a POST request to start the job.
    The function can optionally wait for the job to complete based on the 'waitForCompletion' parameter.

.PARAMETER WorkspaceId
    The ID of the workspace where the Spark Job Definition is located. This parameter is mandatory.

.PARAMETER SparkJobDefinitionId
    The ID of the Spark Job Definition to be started. This parameter is mandatory.

.PARAMETER JobType
    The type of job to be started. The default value is 'sparkjob'. This parameter is optional.

.PARAMETER waitForCompletion
    A boolean flag indicating whether to wait for the job to complete. The default value is $false. This parameter is optional.

.EXAMPLE
    Start-FabricSparkJobDefinitionOnDemand -WorkspaceId "workspace123" -SparkJobDefinitionId "jobdef456" -waitForCompletion $true

.NOTES
    Ensure that the necessary authentication tokens are valid before running this function.
    The function logs detailed messages for debugging and informational purposes.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Start-FabricSparkJobDefinitionOnDemand {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('sparkjob')]
        [string]$JobType = "sparkjob",

        [Parameter(Mandatory = $false)]
        [switch]$WaitForCompletion
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/SparkJobDefinitions/{2}/jobs/instances?jobType={3}" -f $FabricConfig.BaseUrl, $WorkspaceId , $SparkJobDefinitionId, $JobType
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 4: Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Job Definition '$SparkJobDefinitionId' in workspace '$WorkspaceId'", "Start")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            if ($WaitForCompletion.IsPresent) {
                $apiParams.WaitForCompletion = $true
            }
            $response = Invoke-FabricAPIRequest @apiParams

            if ($WaitForCompletion) {
                Write-FabricLog -Message "On-demand Spark Job Definition (ID: '$SparkJobDefinitionId') has completed." -Level Info
                Write-FabricLog -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
            }
            else {
                Write-FabricLog -Message "Successfully started on-demand Spark Job Definition (ID: '$SparkJobDefinitionId') in workspace '$WorkspaceId'. and is running asynchronously." -Level Info
                Write-FabricLog -Message "You can monitor the job status using the job ID from the response." -Level Debug
            }

            # Return the API response
            #Write-FabricLog -Message "Successfully started on-demand Spark Job Definition (ID: '$SparkJobDefinitionId') in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to start Spark Job Definition on demand. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\Start-FabricSparkJobDefinitionOnDemand.ps1' 93
#Region '.\Public\Spark Job Definition\Update-FabricSparkJobDefinition.ps1' -1

<#
.SYNOPSIS
    Updates an existing SparkJobDefinition in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing SparkJobDefinition
    in the specified workspace. It supports optional parameters for SparkJobDefinition description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition exists. This parameter is optional.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to be updated. This parameter is mandatory.

.PARAMETER SparkJobDefinitionName
    The new name of the SparkJobDefinition. This parameter is mandatory.

.PARAMETER SparkJobDefinitionDescription
    An optional new description for the SparkJobDefinition.

.EXAMPLE
    Update-FabricSparkJobDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890" -SparkJobDefinitionName "Updated SparkJobDefinition" -SparkJobDefinitionDescription "Updated description"
    This example updates the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricSparkJobDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkJobDefinitionName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sparkJobDefinitions/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $SparkJobDefinitionName
        }

        if ($SparkJobDefinitionDescription) {
            $body.description = $SparkJobDefinitionDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Job Definition '$SparkJobDefinitionName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Job Definition '$SparkJobDefinitionName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SparkJobDefinition. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\Update-FabricSparkJobDefinition.ps1' 95
#Region '.\Public\Spark Job Definition\Update-FabricSparkJobDefinitionDefinition.ps1' -1

<#
.SYNOPSIS
    Updates the definition of an existing SparkJobDefinition in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update the definition of an existing SparkJobDefinition
    in the specified workspace. It supports optional parameters for SparkJobDefinition definition and platform-specific definition.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the SparkJobDefinition exists. This parameter is mandatory.

.PARAMETER SparkJobDefinitionId
    The unique identifier of the SparkJobDefinition to be updated. This parameter is mandatory.

.PARAMETER SparkJobDefinitionPathDefinition
    An optional path to the SparkJobDefinition definition file to upload.

.PARAMETER SparkJobDefinitionPathPlatformDefinition
    An optional path to the platform-specific definition file to upload.

.EXAMPLE
    Update-FabricSparkJobDefinitionDefinition -WorkspaceId "workspace-12345" -SparkJobDefinitionId "SparkJobDefinition-67890" -SparkJobDefinitionPathDefinition "C:\Path\To\SparkJobDefinitionDefinition.json"
    This example updates the definition of the SparkJobDefinition with ID "SparkJobDefinition-67890" in the workspace with ID "workspace-12345" using the provided definition file.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricSparkJobDefinitionDefinition {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkJobDefinitionPathPlatformDefinition
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/SparkJobDefinitions/{2}/updateDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkJobDefinitionId
        if ($SparkJobDefinitionPathPlatformDefinition) {
            $apiEndpointURI = "?updateMetadata=true" -f $apiEndpointURI
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            definition = @{
                format = "SparkJobDefinitionV1"
                parts  = @()
            }
        }

        if ($SparkJobDefinitionPathDefinition) {
            $SparkJobDefinitionEncodedContent = Convert-ToBase64 -filePath $SparkJobDefinitionPathDefinition

            if (-not [string]::IsNullOrEmpty($SparkJobDefinitionEncodedContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = "SparkJobDefinitionV1.json"
                    payload     = $SparkJobDefinitionEncodedContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in SparkJobDefinition definition." -Level Error
                return $null
            }
        }

        if ($SparkJobDefinitionPathPlatformDefinition) {
            $SparkJobDefinitionEncodedPlatformContent = Convert-ToBase64 -filePath $SparkJobDefinitionPathPlatformDefinition
            if (-not [string]::IsNullOrEmpty($SparkJobDefinitionEncodedPlatformContent)) {
                # Add new part to the parts array
                $body.definition.parts += @{
                    path        = ".platform"
                    payload     = $SparkJobDefinitionEncodedPlatformContent
                    payloadType = "InlineBase64"
                }
            }
            else {
                Write-FabricLog -Message "Invalid or empty content in platform definition." -Level Error
                return $null
            }
        }

        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Job Definition definition '$SparkJobDefinitionId' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully updated the definition for Spark Job Definition with ID '$SparkJobDefinitionId' in workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Step 6: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Spark Job Definition. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark Job Definition\Update-FabricSparkJobDefinitionDefinition.ps1' 128
#Region '.\Public\Spark\Get-FabricSparkCustomPool.ps1' -1

<#
.SYNOPSIS
    Retrieves Spark custom pools from a specified workspace.

.DESCRIPTION
    This function retrieves all Spark custom pools from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.
    The function supports filtering by SparkCustomPoolId or SparkCustomPoolName, but not both simultaneously.

.PARAMETER WorkspaceId
    The ID of the workspace from which to retrieve Spark custom pools. This parameter is mandatory.

.PARAMETER SparkCustomPoolId
    The ID of the specific Spark custom pool to retrieve. This parameter is optional.

.PARAMETER SparkCustomPoolName
    The name of the specific Spark custom pool to retrieve. This parameter is optional.

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345"
    This example retrieves all Spark custom pools from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolId "pool1"
    This example retrieves the Spark custom pool with ID "pool1" from the workspace with ID "12345".

.EXAMPLE
    Get-FabricSparkCustomPool -WorkspaceId "12345" -SparkCustomPoolName "MyPool"
    This example retrieves the Spark custom pool with name "MyPool" from the workspace with ID "12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Handles continuation tokens to retrieve all Spark custom pools if there are multiple pages of results.

    Author: Tiago Balabuch
#>
function Get-FabricSparkCustomPool {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkCustomPoolId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkCustomPoolName
    )
    try {
        # Validate input parameters
        if ($SparkCustomPoolId -and $SparkCustomPoolName) {
            Write-FabricLog -Message "Specify only one parameter: either 'SparkCustomPoolId' or 'SparkCustomPoolName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/pools" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SparkCustomPoolId) {
            $matchedItems = $dataItems.Where({ $_.id -eq $SparkCustomPoolId }, 'First')
        }
        elseif ($SparkCustomPoolName) {
            $matchedItems = $dataItems.Where({ $_.name -eq $SparkCustomPoolName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SparkCustomPool. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Spark\Get-FabricSparkCustomPool.ps1' 114
#Region '.\Public\Spark\Get-FabricSparkLivySession.ps1' -1

<#
.SYNOPSIS
Retrieves one or more Spark Livy sessions for a specified workspace in Microsoft Fabric.

.DESCRIPTION
The Get-FabricSparkLivySession function queries the Fabric API to obtain Spark Livy session details for a given workspace. Optionally, it can filter results by a specific Livy session ID.

.PARAMETER WorkspaceId
(Mandatory) The ID of the workspace containing the Spark Livy sessions.

.PARAMETER LivyId
(Optional) The ID of a specific Livy session to retrieve.

.EXAMPLE
Get-FabricSparkLivySession -WorkspaceId "12345"

Retrieves all Spark Livy sessions for the specified workspace.

.EXAMPLE
Get-FabricSparkLivySession -WorkspaceId "12345" -LivyId "abcde"

Retrieves the Spark Livy session with ID "abcde" for the specified workspace.

.NOTES
- Requires the global $FabricConfig object with BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure authentication before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricSparkLivySession {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$LivyId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/livySessions" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($LivyId) {
            $matchedItems = $dataItems.Where({ $_.livyId -eq $LivyId }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Spark Livy Session. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark\Get-FabricSparkLivySession.ps1' 90
#Region '.\Public\Spark\Get-FabricSparkSettings.ps1' -1

<#
.SYNOPSIS
    Retrieves Spark settings from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Spark settings from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which to retrieve Spark settings. This parameter is mandatory.

.EXAMPLE
    Get-FabricSparkSettings -WorkspaceId "workspace-12345"
    This example retrieves the Spark settings for the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSparkSettings {
    [CmdletBinding()]
    [OutputType([object[]])]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {

        # Step 2: Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug
        # Step 3: Initialize variables
        $continuationToken = $null
        $SparkSettings = @()

        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }

        # Step 4: Loop to retrieve all capacities with continuation token
        Write-FabricLog -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/workspaces/{1}/spark/settings" -f $FabricConfig.BaseUrl, $WorkspaceId

        do {
            # Step 5: Construct the API URL
            $apiEndpointUrl = $baseApiEndpointUrl

            if ($null -ne $continuationToken) {
                # URL-encode the continuation token
                $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)
                $apiEndpointUrl = "{0}?continuationToken={1}" -f $apiEndpointUrl, $encodedToken
            }
            Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

            # Step 6: Make the API request
            $restParams = @{
                Headers = $FabricConfig.FabricHeaders
                Uri = $apiEndpointUrl
                Method = 'Get'
                ErrorAction = 'Stop'
                SkipHttpErrorCheck = $true
                ResponseHeadersVariable = 'responseHeader'
                StatusCodeVariable = 'statusCode'
            }
            $response = Invoke-RestMethod @restParams

            # Step 7: Validate the response code
            if ($statusCode -ne 200) {
                Write-FabricLog -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-FabricLog -Message "Error: $($response.message)" -Level Error
                Write-FabricLog -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-FabricLog "Error Code: $($response.errorCode)" -Level Error
                return $null
            }

            # Step 8: Add data to the list
            if ($null -ne $response) {
                Write-FabricLog -Message "Adding data to the list" -Level Debug
                $SparkSettings += $response

                # Update the continuation token if present
                if ($response.PSObject.Properties.Match("continuationToken")) {
                    Write-FabricLog -Message "Updating the continuation token" -Level Debug
                    $continuationToken = $response.continuationToken
                    Write-FabricLog -Message "Continuation token: $continuationToken" -Level Debug
                }
                else {
                    Write-FabricLog -Message "Updating the continuation token to null" -Level Debug
                    $continuationToken = $null
                }
            }
            else {
                Write-FabricLog -Message "No data received from the API." -Level Warning
                break
            }
        } while ($null -ne $continuationToken)
        Write-FabricLog -Message "Loop finished and all data added to the list" -Level Debug

        # Step 9: Handle results
        if ($SparkSettings) {
            Write-FabricLog -Message " Returning all Spark Settings." -Level Debug
            # Return all Spark Settings
            return $SparkSettings
        }
        else {
            Write-FabricLog -Message "No SparkSettings found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 10: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SparkSettings. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Spark\Get-FabricSparkSettings.ps1' 123
#Region '.\Public\Spark\Get-FabricSparkWorkspaceSettings.ps1' -1

<#
.SYNOPSIS
    Retrieves Spark settings from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves Spark settings from a specified workspace using the provided WorkspaceId.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which to retrieve Spark settings. This parameter is mandatory.

.EXAMPLE
    Get-FabricSparkSettings -WorkspaceId "workspace-12345"
    This example retrieves the Spark settings for the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Get-FabricSparkWorkspaceSettings {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/settings" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            # Return all Spark Settings
            Write-FabricLog -Message " Returning all Workspace Spark Settings." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SparkSettings. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark\Get-FabricSparkWorkspaceSettings.ps1' 66
#Region '.\Public\Spark\New-FabricSparkCustomPool.ps1' -1

<#
.SYNOPSIS
    Creates a new Spark custom pool in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new Spark custom pool
    in the specified workspace. It supports various parameters for Spark custom pool configuration.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Spark custom pool will be created. This parameter is mandatory.

.PARAMETER SparkCustomPoolName
    The name of the Spark custom pool to be created. This parameter is mandatory.

.PARAMETER NodeFamily
    The family of nodes to be used in the Spark custom pool. This parameter is mandatory and must be 'MemoryOptimized'.

.PARAMETER NodeSize
    The size of the nodes to be used in the Spark custom pool. This parameter is mandatory and must be one of 'Large', 'Medium', 'Small', 'XLarge', 'XXLarge'.

.PARAMETER AutoScaleEnabled
    Specifies whether auto-scaling is enabled for the Spark custom pool. This parameter is mandatory.

.PARAMETER AutoScaleMinNodeCount
    The minimum number of nodes for auto-scaling in the Spark custom pool. This parameter is mandatory.

.PARAMETER AutoScaleMaxNodeCount
    The maximum number of nodes for auto-scaling in the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationEnabled
    Specifies whether dynamic executor allocation is enabled for the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationMinExecutors
    The minimum number of executors for dynamic executor allocation in the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationMaxExecutors
    The maximum number of executors for dynamic executor allocation in the Spark custom pool. This parameter is mandatory.

.EXAMPLE
    New-FabricSparkCustomPool -WorkspaceId "workspace-12345" -SparkCustomPoolName "New Spark Pool" -NodeFamily "MemoryOptimized" -NodeSize "Large" -AutoScaleEnabled $true -AutoScaleMinNodeCount 1 -AutoScaleMaxNodeCount 10 -DynamicExecutorAllocationEnabled $true -DynamicExecutorAllocationMinExecutors 1 -DynamicExecutorAllocationMaxExecutors 10
    This example creates a new Spark custom pool named "New Spark Pool" in the workspace with ID "workspace-12345" with the specified configuration.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function New-FabricSparkCustomPool {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SparkCustomPoolName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('MemoryOptimized')]
        [string]$NodeFamily,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Large', 'Medium', 'Small', 'XLarge', 'XXLarge')]
        [string]$NodeSize,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$AutoScaleEnabled,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$AutoScaleMinNodeCount,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$AutoScaleMaxNodeCount,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$DynamicExecutorAllocationEnabled,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMinExecutors,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMaxExecutors
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/pools" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Step 3: Construct the request body
        $body = @{
            name                      = $SparkCustomPoolName
            nodeFamily                = $NodeFamily
            nodeSize                  = $NodeSize
            autoScale                 = @{
                enabled      = $AutoScaleEnabled
                minNodeCount = $AutoScaleMinNodeCount
                maxNodeCount = $AutoScaleMaxNodeCount
            }
            dynamicExecutorAllocation = @{
                enabled      = $DynamicExecutorAllocationEnabled
                minExecutors = $DynamicExecutorAllocationMinExecutors
                maxExecutors = $DynamicExecutorAllocationMaxExecutors
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Custom Pool '$SparkCustomPoolName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "SparkCustomPool '$SparkCustomPoolName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create SparkCustomPool. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark\New-FabricSparkCustomPool.ps1' 148
#Region '.\Public\Spark\Remove-FabricSparkCustomPool.ps1' -1

<#
.SYNOPSIS
    Removes a Spark custom pool from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a Spark custom pool
    from the specified workspace using the provided WorkspaceId and SparkCustomPoolId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the Spark custom pool will be removed.

.PARAMETER SparkCustomPoolId
    The unique identifier of the Spark custom pool to be removed.

.EXAMPLE
    Remove-FabricSparkCustomPool -WorkspaceId "workspace-12345" -SparkCustomPoolId "pool-67890"
    This example removes the Spark custom pool with ID "pool-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Remove-FabricSparkCustomPool {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkCustomPoolId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/pools/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkCustomPoolId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        ## Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Custom Pool '$SparkCustomPoolId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Custom Pool '$SparkCustomPoolId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete SparkCustomPool '$SparkCustomPoolId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark\Remove-FabricSparkCustomPool.ps1' 67
#Region '.\Public\Spark\Update-FabricSparkCustomPool.ps1' -1

<#
.SYNOPSIS
    Updates an existing Spark custom pool in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing Spark custom pool
    in the specified workspace. It supports various parameters for Spark custom pool configuration.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the Spark custom pool exists. This parameter is mandatory.

.PARAMETER SparkCustomPoolId
    The unique identifier of the Spark custom pool to be updated. This parameter is mandatory.

.PARAMETER InstancePoolName
    The new name of the Spark custom pool. This parameter is mandatory.

.PARAMETER NodeFamily
    The family of nodes to be used in the Spark custom pool. This parameter is mandatory and must be 'MemoryOptimized'.

.PARAMETER NodeSize
    The size of the nodes to be used in the Spark custom pool. This parameter is mandatory and must be one of 'Large', 'Medium', 'Small', 'XLarge', 'XXLarge'.

.PARAMETER AutoScaleEnabled
    Specifies whether auto-scaling is enabled for the Spark custom pool. This parameter is mandatory.

.PARAMETER AutoScaleMinNodeCount
    The minimum number of nodes for auto-scaling in the Spark custom pool. This parameter is mandatory.

.PARAMETER AutoScaleMaxNodeCount
    The maximum number of nodes for auto-scaling in the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationEnabled
    Specifies whether dynamic executor allocation is enabled for the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationMinExecutors
    The minimum number of executors for dynamic executor allocation in the Spark custom pool. This parameter is mandatory.

.PARAMETER DynamicExecutorAllocationMaxExecutors
    The maximum number of executors for dynamic executor allocation in the Spark custom pool. This parameter is mandatory.

.EXAMPLE
    Update-FabricSparkCustomPool -WorkspaceId "workspace-12345" -SparkCustomPoolId "pool-67890" -InstancePoolName "Updated Spark Pool" -NodeFamily "MemoryOptimized" -NodeSize "Large" -AutoScaleEnabled $true -AutoScaleMinNodeCount 1 -AutoScaleMaxNodeCount 10 -DynamicExecutorAllocationEnabled $true -DynamicExecutorAllocationMinExecutors 1 -DynamicExecutorAllocationMaxExecutors 10
    This example updates the Spark custom pool with ID "pool-67890" in the workspace with ID "workspace-12345" with a new name and configuration.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricSparkCustomPool {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SparkCustomPoolId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$InstancePoolName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('MemoryOptimized')]
        [string]$NodeFamily,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Large', 'Medium', 'Small', 'XLarge', 'XXLarge')]
        [string]$NodeSize,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$AutoScaleEnabled,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$AutoScaleMinNodeCount,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$AutoScaleMaxNodeCount,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$DynamicExecutorAllocationEnabled,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMinExecutors,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [int]$DynamicExecutorAllocationMaxExecutors
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/spark/pools/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkCustomPoolId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            name                      = $InstancePoolName
            nodeFamily                = $NodeFamily
            nodeSize                  = $NodeSize
            autoScale                 = @{
                enabled      = $AutoScaleEnabled
                minNodeCount = $AutoScaleMinNodeCount
                maxNodeCount = $AutoScaleMaxNodeCount
            }
            dynamicExecutorAllocation = @{
                enabled      = $DynamicExecutorAllocationEnabled
                minExecutors = $DynamicExecutorAllocationMinExecutors
                maxExecutors = $DynamicExecutorAllocationMaxExecutors
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Custom Pool '$InstancePoolName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Custom Pool '$SparkCustomPoolName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SparkCustomPool. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark\Update-FabricSparkCustomPool.ps1' 155
#Region '.\Public\Spark\Update-FabricSparkSettings.ps1' -1

<#
.SYNOPSIS
Updates Spark settings at the workspace scope.

.DESCRIPTION
Sends a PATCH request to the Fabric API to modify workspace-level Spark settings. You can enable automatic logging, configure high-concurrency notebook behavior, choose or customize a default compute pool, and set the default environment/runtime.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace whose Spark settings will be updated.

.PARAMETER automaticLogEnabled
Optional. When $true, enables automatic Spark session logging in the workspace. When $false, disables auto logging.

.PARAMETER notebookInteractiveRunEnabled
Optional. Enables high-concurrency interactive notebook runs when set to $true.

.PARAMETER customizeComputeEnabled
Optional. When $true, allows customizing the compute pool settings for Spark jobs in this workspace.

.PARAMETER defaultPoolName
Optional. The name of the default compute pool. Must be provided together with defaultPoolType.

.PARAMETER defaultPoolType
Optional. The scope of the default compute pool. Allowed values are 'Workspace' or 'Capacity'. Must be provided together with defaultPoolName.

.PARAMETER starterPoolMaxNode
Optional. Maximum node count for the starter pool configuration.

.PARAMETER starterPoolMaxExecutors
Optional. Maximum executors for the starter pool configuration.

.PARAMETER EnvironmentName
Optional. The display name of the default Spark environment to use.

.PARAMETER EnvironmentRuntimeVersion
Optional. The runtime version identifier for the default Spark environment.

.EXAMPLE
Update-FabricSparkSettings -WorkspaceId $wId -automaticLogEnabled $true -defaultPoolName 'StarterPool' -defaultPoolType Workspace

Enables automatic logging and sets the default pool to 'StarterPool' scoped at the workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Calls `Test-TokenExpired` before invoking the API.

Author: Tiago Balabuch; Help updated by Copilot.

#>
function Update-FabricSparkSettings {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,


        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$automaticLogEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$notebookInteractiveRunEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$customizeComputeEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$defaultPoolName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Workspace', 'Capacity')]
        [string]$defaultPoolType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$starterPoolMaxNode,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$starterPoolMaxExecutors,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentRuntimeVersion
    )

    try {
        # Step 1: Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Step 2: Construct the API URL
        $apiEndpointUrl = "{0}/workspaces/{1}/spark/settings" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkSettingsId
        Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

        # Step 3: Construct the request body
        # Construct the request body with optional properties

        $body = @{}

        if ($PSBoundParameters.ContainsKey('automaticLogEnabled')) {
            $body.automaticLog = @{
                enabled = $automaticLogEnabled
            }
        }

        if ($PSBoundParameters.ContainsKey('notebookInteractiveRunEnabled')) {
            $body.highConcurrency = @{
                notebookInteractiveRunEnabled = $notebookInteractiveRunEnabled
            }
        }

        if ($PSBoundParameters.ContainsKey('customizeComputeEnabled') ) {
            $body.pool = @{
                customizeComputeEnabled = $customizeComputeEnabled
            }
        }
        if ($PSBoundParameters.ContainsKey('defaultPoolName') -or $PSBoundParameters.ContainsKey('defaultPoolType')) {
            if ($PSBoundParameters.ContainsKey('defaultPoolName') -and $PSBoundParameters.ContainsKey('defaultPoolType')) {
            $body.pool = @{
                defaultPool = @{
                name = $defaultPoolName
                type = $defaultPoolType
                }
            }
            } else {
                Write-FabricLog -Message "Both 'defaultPoolName' and 'defaultPoolType' must be provided together." -Level Error
                throw
            }
        }

        if ($PSBoundParameters.ContainsKey('EnvironmentName') -or $PSBoundParameters.ContainsKey('EnvironmentRuntimeVersion')) {
            $body.environment = @{
                name = $EnvironmentName
            }
        }
        if ($PSBoundParameters.ContainsKey('EnvironmentRuntimeVersion')) {
            $body.environment = @{
                runtimeVersion = $EnvironmentRuntimeVersion
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Step 4: Make the API request
        if ($PSCmdlet.ShouldProcess("Spark settings '$SparkSettingsName' in workspace '$WorkspaceId'", "Update")) {
            $restParams = @{
                Headers = $FabricConfig.FabricHeaders
                Uri = $apiEndpointUrl
                Method = 'Patch'
                Body = $bodyJson
                ContentType = 'application/json'
                ErrorAction = 'Stop'
                SkipHttpErrorCheck = $true
                StatusCodeVariable = 'statusCode'
            }
            $response = Invoke-RestMethod @restParams

            # Step 5: Validate the response code
            if ($statusCode -ne 200) {
                Write-FabricLog -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-FabricLog -Message "Error: $($response.message)" -Level Error
                Write-FabricLog -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-FabricLog "Error Code: $($response.errorCode)" -Level Error
                return $null
            }

            # Step 6: Handle results
            Write-FabricLog -Message "Spark Custom Pool '$SparkSettingsName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Step 7: Handle and log errors
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SparkSettings. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark\Update-FabricSparkSettings.ps1' 191
#Region '.\Public\Spark\Update-FabricSparkWorkspaceSettings.ps1' -1

<#
.SYNOPSIS
Updates Spark settings for a workspace (workspace-scope variant).

.DESCRIPTION
Patches workspace-level Spark configuration including automatic logging, interactive notebook concurrency, default compute pool settings, and environment/runtime defaults.

.PARAMETER WorkspaceId
Mandatory. The GUID of the workspace whose Spark settings will be updated.

.PARAMETER automaticLogEnabled
Optional. When $true, enables automatic logging of Spark sessions.

.PARAMETER notebookInteractiveRunEnabled
Optional. Enables interactive high-concurrency notebook execution when set to $true.

.PARAMETER customizeComputeEnabled
Optional. Allows customization of compute pool behavior for Spark jobs.

.PARAMETER defaultPoolName
Optional. Name of the default compute pool, provided together with defaultPoolType.

.PARAMETER defaultPoolType
Optional. Scope of the default compute pool: 'Workspace' or 'Capacity'. Must accompany defaultPoolName.

.PARAMETER starterPoolMaxNode
Optional. Maximum node count for the starter pool.

.PARAMETER starterPoolMaxExecutors
Optional. Maximum executor count for the starter pool.

.PARAMETER EnvironmentName
Optional. Friendly name of the default Spark environment.

.PARAMETER EnvironmentRuntimeVersion
Optional. Runtime version identifier for the environment.

.EXAMPLE
Update-FabricSparkWorkspaceSettings -WorkspaceId $wId -automaticLogEnabled $true -notebookInteractiveRunEnabled $true

Enables automatic logging and interactive notebook concurrency for the workspace.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Calls `Test-TokenExpired` before invoking the API.

Author: Tiago Balabuch; Help updated by Copilot.

#>
function Update-FabricSparkWorkspaceSettings {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$automaticLogEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$notebookInteractiveRunEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$customizeComputeEnabled,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$defaultPoolName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Workspace', 'Capacity')]
        [string]$defaultPoolType,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$starterPoolMaxNode,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [int]$starterPoolMaxExecutors,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$EnvironmentRuntimeVersion
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/spark/settings" -f $FabricConfig.BaseUrl, $WorkspaceId, $SparkSettingsId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{}

        if ($PSBoundParameters.ContainsKey('automaticLogEnabled')) {
            $body.automaticLog = @{
                enabled = $automaticLogEnabled
            }
        }

        if ($PSBoundParameters.ContainsKey('notebookInteractiveRunEnabled')) {
            $body.highConcurrency = @{
                notebookInteractiveRunEnabled = $notebookInteractiveRunEnabled
            }
        }

        if ($PSBoundParameters.ContainsKey('customizeComputeEnabled') ) {
            $body.pool = @{
                customizeComputeEnabled = $customizeComputeEnabled
            }
        }
        if ($PSBoundParameters.ContainsKey('defaultPoolName') -or $PSBoundParameters.ContainsKey('defaultPoolType')) {
            if ($PSBoundParameters.ContainsKey('defaultPoolName') -and $PSBoundParameters.ContainsKey('defaultPoolType')) {
                $body.pool = @{
                    defaultPool = @{
                        name = $defaultPoolName
                        type = $defaultPoolType
                    }
                }
            }
            else {
                Write-FabricLog -Message "Both 'defaultPoolName' and 'defaultPoolType' must be provided together." -Level Error
                throw
            }
        }

        if ($PSBoundParameters.ContainsKey('EnvironmentName') -or $PSBoundParameters.ContainsKey('EnvironmentRuntimeVersion')) {
            $body.environment = @{
                name = $EnvironmentName
            }
        }
        if ($PSBoundParameters.ContainsKey('EnvironmentRuntimeVersion')) {
            $body.environment = @{
                runtimeVersion = $EnvironmentRuntimeVersion
            }
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Spark Workspace settings '$SparkSettingsName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Spark Workspace Pool '$SparkSettingsName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SparkSettings. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Spark\Update-FabricSparkWorkspaceSettings.ps1' 176
#Region '.\Public\SQL Endpoints\Get-FabricSQLEndpoint.ps1' -1

<#
.SYNOPSIS
Retrieves SQL Endpoints from a specified workspace in Fabric.

.DESCRIPTION
The Get-FabricSQLEndpoint function retrieves SQL Endpoints from a specified workspace in Fabric.
It supports filtering by SQL Endpoint ID or SQL Endpoint Name. If both filters are provided,
an error message is returned. The function handles token validation, API requests with continuation
tokens, and processes the response to return the desired SQL Endpoint(s).

.PARAMETER WorkspaceId
The ID of the workspace from which to retrieve SQL Endpoints. This parameter is mandatory.

.PARAMETER SQLEndpointId
The ID of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointName.

.PARAMETER SQLEndpointName
The name of the SQL Endpoint to retrieve. This parameter is optional but cannot be used together with SQLEndpointId.

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

.EXAMPLE
Get-FabricSQLEndpoint -WorkspaceId "workspace123" -SQLEndpointName "MySQLEndpoint"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026



#>
function Get-FabricSQLEndpoint {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$SQLEndpointName
    )
    try {
        # Validate input parameters
        if ($SQLEndpointId -and $SQLEndpointName) {
            Write-FabricLog -Message "Specify only one parameter: either 'SQLEndpointId' or 'SQLEndpointName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/SQLEndpoints" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SQLEndpointId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $SQLEndpointId }, 'First')
        }
        elseif ($SQLEndpointName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $SQLEndpointName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SQL Endpoint. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\SQL Endpoints\Get-FabricSQLEndpoint.ps1' 108
#Region '.\Public\SQL Endpoints\Get-FabricSQLEndpointConnectionString.ps1' -1

<#
.SYNOPSIS
Retrieves the connection string for a specific SQL Endpoint in a Fabric workspace.

.DESCRIPTION
The Get-FabricSQLEndpointConnectionString function retrieves the connection string for a given SQL Endpoint within a specified Fabric workspace.
It supports optional parameters for guest tenant access and private link type. The function validates authentication, constructs the appropriate API endpoint,
and returns the connection string or handles errors as needed.

.PARAMETER WorkspaceId
The ID of the workspace containing the SQL Endpoint. This parameter is mandatory.

.PARAMETER SQLEndpointId
The ID of the SQL Endpoint for which to retrieve the connection string. This parameter is mandatory.

.PARAMETER GuestTenantId
(Optional) The tenant ID for guest access, if applicable.

.PARAMETER PrivateLinkType
(Optional) The type of private link to use for the connection string. Valid values are 'None' or 'Workspace'.

.EXAMPLE
Get-FabricSQLEndpointConnectionString -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

.EXAMPLE
Get-FabricSQLEndpointConnectionString -WorkspaceId "workspace123" -SQLEndpointId "endpoint456" -GuestTenantId "guestTenant789" -PrivateLinkType "Workspace"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Get-FabricSQLEndpointConnectionString {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLEndpointId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GuestTenantId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('None', 'Workspace')]
        [string]$PrivateLinkType
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sqlEndpoints/{2}/connectionString" -f $FabricConfig.BaseUrl, $WorkspaceId, $SQLEndpointId
        # Append query parameters if GuestTenantId or PrivateLinkType are provided
        $queryParams = @()
        if ($GuestTenantId) {
            $queryParams += "guestTenantId=$GuestTenantId"
        }
        if ($PrivateLinkType) {
            $queryParams += "privateLinkType=$PrivateLinkType"
        }
        if ($queryParams.Count -gt 0) {
            $apiEndpointURI += "?" + ($queryParams -join "&")
        }

        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve SQL Endpoint connection string. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\SQL Endpoints\Get-FabricSQLEndpointConnectionString.ps1' 100
#Region '.\Public\SQL Endpoints\Update-FabricSQLEndpointMetadata.ps1' -1

<#
.SYNOPSIS
Refreshes metadata for a SQL Endpoint.

.DESCRIPTION
The Update-FabricSQLEndpointMetadata cmdlet triggers a metadata refresh for a SQL Endpoint in a specified Fabric
workspace. Use -WaitForCompletion to block until the server completes the refresh operation and returns final status.

.PARAMETER WorkspaceId
The GUID of the workspace hosting the SQL Endpoint. Required to construct the refresh endpoint URL.

.PARAMETER SQLEndpointId
The resource Id of the SQL Endpoint to refresh. Required so the service can identify which endpoint to process.

.PARAMETER WaitForCompletion
Switch parameter. When present, waits for the refresh job to complete and returns final details. If omitted, the cmdlet
starts the job and returns immediately with the async operation metadata.

.EXAMPLE
Update-FabricSQLEndpointMetadata -WorkspaceId "workspace123" -SQLEndpointId "endpoint456"

Starts an asynchronous metadata refresh and returns immediately.

.EXAMPLE
Update-FabricSQLEndpointMetadata -WorkspaceId "workspace123" -SQLEndpointId "endpoint456" -WaitForCompletion

Starts a refresh and waits until it completes before returning.

.NOTES
    - Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
    - Calls Test-TokenExpired to ensure token validity before making the API request.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026


#>
function Update-FabricSQLEndpointMetadata {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SQLEndpointId,
        [Parameter(Mandatory = $true)]
        [switch]$WaitForCompletion
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/sqlEndpoints/{2}/refreshMetadata" -f $FabricConfig.BaseUrl, $WorkspaceId, $SQLEndpointId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("SQL Endpoint '$SQLEndpointId' in workspace '$WorkspaceId'", "Update metadata")) {
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
                Write-FabricLog -Message "Refresh SQL Endpoint metadata for SQL Endpoint '$($SQLEndpointId)' has completed." -Level Info
                Write-FabricLog -Message "Job details: $($response | ConvertTo-Json -Depth 5)" -Level Debug
            }
            else {
                Write-FabricLog -Message "Refresh SQL Endpoint metadata for SQL Endpoint '$($SQLEndpointId)' has been started and is running asynchronously." -Level Info
                Write-FabricLog -Message "You can monitor the job status using the job ID from the response." -Level Debug
            }
            # Return the API response
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update SQL Endpoint metadata. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\SQL Endpoints\Update-FabricSQLEndpointMetadata.ps1' 89
#Region '.\Public\Tags\Get-FabricTag.ps1' -1

<#
.SYNOPSIS
    Retrieves tag details from Microsoft Fabric.

.DESCRIPTION
    Retrieves tag information from Microsoft Fabric using either the TagId or TagName parameter.
    Handles authentication, constructs the API endpoint, sends the request, and returns matching tag(s).

.PARAMETER TagId
    The unique identifier of the tag to retrieve. Optional; specify either TagId or TagName, not both.

.PARAMETER TagName
    The display name of the tag to retrieve. Optional; specify either TagId or TagName, not both.

.EXAMPLE
    Get-FabricTag -TagId "tag-12345"
    Retrieves the tag with the ID "tag-12345".

.EXAMPLE
    Get-FabricTag -TagName "Finance"
    Retrieves the tag with the display name "Finance".

.NOTES
    - Requires the `$FabricConfig` global configuration object with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure the authentication token is valid before making the API request.
    - Only one of TagId or TagName should be specified.

    Author: Tiago Balabuch
#>
function Get-FabricTag {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TagId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$TagName
    )

    try {
        # Validate input parameters
        if ($TagId -and $TagName) {
            Write-FabricLog -Message "Specify only one parameter: either 'TagId' or 'TagName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/tags" -f $FabricConfig.BaseUrl

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($TagId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $TagId }, 'First')
        }
        elseif ($TagName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $TagName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Tags. Error: $errorDetails" -Level Error
    }

}
#EndRegion '.\Public\Tags\Get-FabricTag.ps1' 102
#Region '.\Public\Tags\New-FabricTag.ps1' -1

<#
.SYNOPSIS
    Creates one or more tags in a Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create tags in bulk within a specified workspace.
    Each tag object must include a 'displayName' property. The function validates the authentication token before proceeding.

.PARAMETER Tags
    An array of tag objects, each containing at least a 'displayName' property. This parameter is mandatory.

.EXAMPLE
    $tags = @(
        @{ displayName = "Finance" },
        @{ displayName = "HR" }
    )
    New-FabricTag -Tags $tags
    This example creates two tags, "Finance" and "HR", in the target workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
    - Author: Tiago Balabuch
#>
function New-FabricTag {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Tags # Array with 'displayName'
    )
    try {
        # Validate Items structure
        foreach ($tag in $Tags) {
            if (-not ($tag.displayName)) {
                throw "Each Tag must contain 'displayName' property. Found: $tag"
            }
        }
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/tags/bulkCreateTags" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        # Convert the body to JSON format
        $bodyJson = $Tags | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Fabric tags", "Create tags in bulk")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Post'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Tags created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Tags. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tags\New-FabricTag.ps1' 74
#Region '.\Public\Tags\Remove-FabricTag.ps1' -1

<#
.SYNOPSIS
    Removes a tag from Microsoft Fabric.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a tag specified by TagId.
    Ensures authentication is valid before making the API call.

.PARAMETER TagId
    The unique identifier of the tag to remove.

.EXAMPLE
    Remove-FabricTag -TagId "tag-12345"
    Removes the tag with ID "tag-12345" from Microsoft Fabric.

.NOTES
    - Requires the global `$FabricConfig` object with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to validate authentication before the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricTag {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TagId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/v1/admin/tags/{1}" -f $FabricConfig.BaseUrl, $TagId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("tag '$TagId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Tag '$TagId' deleted successfully." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Warehouse '$WarehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tags\Remove-FabricTag.ps1' 60
#Region '.\Public\Tags\Update-FabricTag.ps1' -1

<#
.SYNOPSIS
    Updates an existing tag in Microsoft Fabric.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update the display name of a tag.
    Validates authentication before making the request.

.PARAMETER TagId
    The unique identifier of the tag to update.

.PARAMETER TagName
    The new display name for the tag.

.EXAMPLE
    Update-FabricTag -TagId "tag-12345" -TagName "Updated Tag Name"
    Updates the tag with ID "tag-12345" to have the display name "Updated Tag Name".

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Calls `Test-TokenExpired` to ensure the authentication token is valid.

    Author: Tiago Balabuch
#>
function Update-FabricTag {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$TagId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$TagName
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug
                PATCH https://api.fabric.microsoft.com/v1/admin/tags/{tagId}
        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/tags/{1}" -f $FabricConfig.BaseUrl, $TagId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $TagName
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("tag '$TagId' with name '$TagName'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method = 'Patch'
                Body = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Tag '$TagName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Tag. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tags\Update-FabricTag.ps1' 77
#Region '.\Public\Tenant\Get-FabricCapacityTenantSettingOverrides.ps1' -1

<#
.SYNOPSIS
Retrieves tenant setting overrides for a specific capacity or all capacities in the Fabric tenant.

.DESCRIPTION
The `Get-FabricCapacityTenantSettingOverrides` function retrieves tenant setting overrides for a specific capacity or all capacities in the Fabric tenant by making a GET request to the appropriate API endpoint. If a `capacityId` is provided, the function retrieves overrides for that specific capacity. Otherwise, it retrieves overrides for all capacities.

.PARAMETER capacityId
The ID of the capacity for which tenant setting overrides should be retrieved. If not provided, overrides for all capacities will be retrieved.

.EXAMPLE
Get-FabricCapacityTenantSettingOverrides

Returns all capacities tenant setting overrides.

.EXAMPLE
Get-FabricCapacityTenantSettingOverrides -capacityId "12345"

Returns tenant setting overrides for the capacity with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricCapacityTenantSettingOverrides {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$capacityId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        if ($capacityId) {
            $apiEndpointURI = "{0}/admin/capacities/{1}/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl, $capacityId
            $message = "Successfully retrieved tenant setting overrides for capacity ID: $capacityId."
        }
        else {
            $apiEndpointURI = "{0}/admin/capacities/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl
            $message = "Successfully retrieved capacity tenant setting overrides."
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            # Return all tenant setting overrides
            Write-FabricLog -Message $message -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error retrieving capacity tenant setting overrides: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Get-FabricCapacityTenantSettingOverrides.ps1' 77
#Region '.\Public\Tenant\Get-FabricDomainTenantSettingOverrides.ps1' -1

<#
.SYNOPSIS
Retrieves tenant setting overrides for a specific domain or all capacities in the Fabric tenant.

.DESCRIPTION
The `Get-FabricDomainTenantSettingOverrides` function retrieves tenant setting overrides for all domains in the Fabric tenant by making a GET request to the designated API endpoint. The function ensures token validity before making the request and handles the response appropriately.

.EXAMPLE
Get-FabricDomainTenantSettingOverrides

Fetches tenant setting overrides for all domains in the Fabric tenant.

.NOTES
- Requires the `$FabricConfig` global configuration, which must include `BaseUrl` and `FabricHeaders`.
- Ensures token validity by invoking `Test-TokenExpired` before making the API request.
- Logs detailed messages for debugging and error handling.

Author: Tiago Balabuch
#>
function Get-FabricDomainTenantSettingOverrides {
    [CmdletBinding()]
    param ( )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/domains/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "Successfully retrieved domain tenant setting overrides." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error retrieving domain tenant setting overrides: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Get-FabricDomainTenantSettingOverrides.ps1' 58
#Region '.\Public\Tenant\Get-FabricTenantSetting.ps1' -1

<#
.SYNOPSIS
Retrieves tenant settings from the Fabric environment.

.DESCRIPTION
The `Get-FabricTenantSetting` function retrieves tenant settings for a Fabric environment by making a GET request to the appropriate API endpoint. Optionally, it filters the results by the `SettingTitle` parameter.

.PARAMETER SettingTitle
(Optional) The title of a specific tenant setting to filter the results.

.EXAMPLE
Get-FabricTenantSetting

Returns all tenant settings.

.EXAMPLE
Get-FabricTenantSetting -SettingTitle "SomeSetting"

Returns the tenant setting with the title "SomeSetting".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Is-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Get-FabricTenantSetting {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$SettingTitle
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/tenantsettings" -f $FabricConfig.BaseUrl
        Write-FabricLog -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

         # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($SettingTitle) {
            $matchedItems = $dataItems.Where({ $_.title -eq $SettingTitle }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error retrieving tenant settings: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Get-FabricTenantSetting.ps1' 87
#Region '.\Public\Tenant\Get-FabricTenantSettingOverridesCapacity.ps1' -1

<#
.SYNOPSIS
Retrieves capacities tenant settings overrides from the Fabric tenant.

.DESCRIPTION
The `Get-FabricTenantSetting` function retrieves capacities tenant settings overrides for a Fabric tenant by making a GET request to the appropriate API endpoint.

.EXAMPLE
Get-FabricTenantSettingOverridesCapacity

Returns all capacities tenant settings overrides.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Is-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Get-FabricTenantSettingOverridesCapacity {
    [CmdletBinding()]
    [OutputType([object[]])]
    param ()
    try {
        # Step 1: Ensure token validity
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Step 3: Initialize variables
        $continuationToken = $null
        $capacitiesOverrides = @()

        if (-not ([AppDomain]::CurrentDomain.GetAssemblies() | Where-Object { $_.GetName().Name -eq "System.Web" })) {
            Add-Type -AssemblyName System.Web
        }

        # Step 4: Loop to retrieve all capacities with continuation token
        Write-FabricLog -Message "Loop started to get continuation token" -Level Debug
        $baseApiEndpointUrl = "{0}/admin/capacities/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl

        do {
            # Step 5: Construct the API URL
            $apiEndpointUrl = $baseApiEndpointUrl

            if ($null -ne $continuationToken) {
                # URL-encode the continuation token
                $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)
                $apiEndpointUrl = "{0}?continuationToken={1}" -f $apiEndpointUrl, $encodedToken
            }
            Write-FabricLog -Message "API Endpoint: $apiEndpointUrl" -Level Debug

            # Step 6: Make the API request
            $restParams = @{
                Headers = $FabricConfig.FabricHeaders
                Uri = $apiEndpointUrl
                Method = 'Get'
                ErrorAction = 'Stop'
                SkipHttpErrorCheck = $true
                ResponseHeadersVariable = 'responseHeader'
                StatusCodeVariable = 'statusCode'
            }
            $response = Invoke-RestMethod @restParams

            # Step 7: Validate the response code
            if ($statusCode -ne 200) {
                Write-FabricLog -Message "Unexpected response code: $statusCode from the API." -Level Error
                Write-FabricLog -Message "Error: $($response.message)" -Level Error
                Write-FabricLog -Message "Error Details: $($response.moreDetails)" -Level Error
                Write-FabricLog "Error Code: $($response.errorCode)" -Level Error
                return $null
            }

            # Step 8: Add data to the list
            if ($null -ne $response) {
                Write-FabricLog -Message "Adding data to the list" -Level Debug
                $capacitiesOverrides += $response.value

                # Update the continuation token if present
                if ($response.PSObject.Properties.Match("continuationToken")) {
                    Write-FabricLog -Message "Updating the continuation token" -Level Debug
                    $continuationToken = $response.continuationToken
                    Write-FabricLog -Message "Continuation token: $continuationToken" -Level Debug
                }
                else {
                    Write-FabricLog -Message "Updating the continuation token to null" -Level Debug
                    $continuationToken = $null
                }
            }
            else {
                Write-FabricLog -Message "No data received from the API." -Level Warning
                break
            }
        } while ($null -ne $continuationToken)
        Write-FabricLog -Message "Loop finished and all data added to the list" -Level Debug
        # Step 7: Handle results
        if ($capacitiesOverrides) {
            Write-FabricLog -Message "Capacities overrides found." -Level Debug
            return $capacitiesOverrides
        }
        else {
            Write-FabricLog -Message "No capacity capacities tenant settings overrides overrides found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Step 8: Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve capacities tenant settings overrides. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Get-FabricTenantSettingOverridesCapacity.ps1' 113
#Region '.\Public\Tenant\Get-FabricWorkspaceTenantSettingOverrides.ps1' -1

<#
.SYNOPSIS
Retrieves tenant setting overrides for all workspaces in the Fabric tenant.

.DESCRIPTION
The `Get-FabricWorkspaceTenantSettingOverrides` function retrieves tenant setting overrides for all workspaces in the Fabric tenant by making a GET request to the appropriate API endpoint. The function validates the authentication token before making the request and handles the response accordingly.

.EXAMPLE
Get-FabricWorkspaceTenantSettingOverrides

Returns all workspaces tenant setting overrides.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Get-FabricWorkspaceTenantSettingOverrides {
    [CmdletBinding()]
    param ( )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/workspaces/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl
        Write-FabricLog -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            # Return all workspace tenant setting overrides
            Write-FabricLog -Message "Successfully retrieved workspaces tenant setting overrides." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error retrieving workspaces tenant setting overrides: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Get-FabricWorkspaceTenantSettingOverrides.ps1' 58
#Region '.\Public\Tenant\Revoke-FabricCapacityTenantSettingOverrides.ps1' -1

<#
.SYNOPSIS
Removes a tenant setting override from a specific capacity in the Fabric tenant.

.DESCRIPTION
The `Revoke-FabricCapacityTenantSettingOverrides` function deletes a specific tenant setting override for a given capacity in the Fabric tenant by making a DELETE request to the appropriate API endpoint.

.PARAMETER capacityId
The unique identifier of the capacity from which the tenant setting override will be removed.

.PARAMETER tenantSettingName
The name of the tenant setting override to be removed.

.EXAMPLE
Revoke-FabricCapacityTenantSettingOverrides -capacityId "12345" -tenantSettingName "ExampleSetting"

Removes the tenant setting override named "ExampleSetting" from the capacity with ID "12345".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Revoke-FabricCapacityTenantSettingOverrides {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$capacityId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$tenantSettingName
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/admin/capacities/{1}/delegatedTenantSettingOverrides/{2}" -f $FabricConfig.BaseUrl, $capacityId, $tenantSettingName
        Write-FabricLog -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("tenant setting override '$tenantSettingName' on capacity '$capacityId'", "Revoke")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Successfully removed the tenant setting override '$tenantSettingName' from the capacity with ID '$capacityId'." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error retrieving capacity tenant setting overrides: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Revoke-FabricCapacityTenantSettingOverrides.ps1' 66
#Region '.\Public\Tenant\Update-FabricCapacityTenantSettingOverrides.ps1' -1

<#
.SYNOPSIS
Updates tenant setting overrides for a specified capacity ID.

.DESCRIPTION
Updates tenant setting overrides for a specified capacity ID.

.PARAMETER CapacityId
(Mandatory) The ID of the capacity for which the tenant setting overrides are being updated.

.PARAMETER SettingTitle
(Mandatory) The title of the tenant setting to be updated.

.PARAMETER EnableTenantSetting
(Mandatory) Indicates whether the tenant setting should be enabled.

.PARAMETER DelegateToWorkspace
(Optional) Specifies the workspace to which the setting should be delegated.

.PARAMETER EnabledSecurityGroups
(Optional) A JSON array of security groups to be enabled, each containing `graphId` and `name` properties.

.PARAMETER ExcludedSecurityGroups
(Optional) A JSON array of security groups to be excluded, each containing `graphId` and `name` properties.

.EXAMPLE
Update-FabricCapacityTenantSettingOverrides -CapacityId "12345" -SettingTitle "SomeSetting" -EnableTenantSetting "true"

Updates the tenant setting "SomeSetting" for the capacity with ID "12345" and enables it.

.EXAMPLE
Update-FabricCapacityTenantSettingOverrides -CapacityId "12345" -SettingTitle "SomeSetting" -EnableTenantSetting "true" -EnabledSecurityGroups @(@{graphId="1";name="Group1"},@{graphId="2";name="Group2"})

Updates the tenant setting "SomeSetting" for the capacity with ID "12345", enables it, and specifies security groups to include.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>
function Update-FabricCapacityTenantSettingOverrides {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$SettingTitle,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$EnableTenantSetting,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToWorkspace,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$EnabledSecurityGroups,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$ExcludedSecurityGroups
    )

    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Validate Security Groups if provided
        # This uses a .NET HashSet to accelerate lookup even more, especially useful in large collections.
        if ($EnabledSecurityGroups) {
            foreach ($enabledGroup in $EnabledSecurityGroups) {
                $propertySet = [HashSet[string]]::new($enabledGroup.PSObject.Properties.Name)
                if (-not ($propertySet.Contains('graphId') -and $propertySet.Contains('name'))) {
                    throw "Each enabled security group must contain 'graphId' and 'name' properties. Found: $($enabledGroup | Out-String)"
                }
            }
        }

        # Validate Security Groups if provided
        if ($ExcludedSecurityGroups) {
            foreach ($excludedGroup in $ExcludedSecurityGroups) {
                $propertySet = [HashSet[string]]::new($excludedGroup.PSObject.Properties.Name)
                if (-not ($propertySet.Contains('graphId') -and $propertySet.Contains('name'))) {
                    throw "Each enabled security group must contain 'graphId' and 'name' properties. Found: $($excludedGroup | Out-String)"
                }
            }
        }

        # Construct API endpoint URL
        $apiEndpointURI = "{0}/admin/capacities/{1}/delegatedTenantSettingOverrides" -f $FabricConfig.BaseUrl, $CapacityId
        Write-FabricLog -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Construct request body
        $body = @{
            EnableTenantSetting = $EnableTenantSetting
            SettingTitle        = $SettingTitle
        }

        if ($DelegateToWorkspace) {
            $body.delegateToWorkspace = $DelegateToWorkspace
        }

        if ($EnabledSecurityGroups) {
            $body.enabledSecurityGroups = $EnabledSecurityGroups
        }

        if ($ExcludedSecurityGroups) {
            $body.excludedSecurityGroups = $ExcludedSecurityGroups
        }

        # Convert body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("capacity '$CapacityId' setting '$SettingTitle'", "Update delegated tenant setting overrides")) {
            $response = Invoke-FabricAPIRequest `
                -BaseURI $apiEndpointURI `
                -Headers $FabricConfig.FabricHeaders `
                -Method Post `
                -Body $bodyJson

            # Return the API response
            Write-FabricLog -Message "Successfully updated capacity tenant setting overrides for CapacityId: $CapacityId and SettingTitle: $SettingTitle." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error updating tenant settings: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Update-FabricCapacityTenantSettingOverrides.ps1' 143
#Region '.\Public\Tenant\Update-FabricTenantSetting.ps1' -1

<#
.SYNOPSIS
Updates a Fabric tenant setting.

.DESCRIPTION
Posts an update to a specific tenant setting using its internal name. You can enable/disable the setting, optionally delegate control to capacities, domains, or workspaces (when supported), and include or exclude specific security groups. Some settings also accept additional property objects.

.PARAMETER TenantSettingName
Mandatory. Internal name/key for the tenant setting being modified. Used to compose the API route.

.PARAMETER EnableTenantSetting
Mandatory. Enables ($true) or disables ($false) the tenant setting.

.PARAMETER DelegateToCapacity
Optional. When $true, allows capacity-level delegation for this setting (if applicable).

.PARAMETER DelegateToDomain
Optional. When $true, allows domain-level delegation for this setting (if applicable).

.PARAMETER DelegateToWorkspace
Optional. When $true, allows workspace-level delegation for this setting (if applicable).

.PARAMETER EnabledSecurityGroups
Optional. Array of security group objects that are explicitly allowed. Each object must contain 'graphId' and 'name'.

.PARAMETER ExcludedSecurityGroups
Optional. Array of security group objects that are explicitly excluded. Each object must contain 'graphId' and 'name'.

.PARAMETER Properties
Optional. Array of advanced property objects for certain settings. Each object must include 'name', 'type', and 'value'.

.EXAMPLE
Update-FabricTenantSetting -TenantSettingName "SomeSetting" -EnableTenantSetting $true -EnabledSecurityGroups @(@{graphId="1";name="Group1"})

Enables the setting and includes a single security group by graphId.

.NOTES
- Requires `$FabricConfig` (BaseUrl, FabricHeaders).
- Calls `Test-TokenExpired` before invoking the API.

Author: Tiago Balabuch; Help updated by Copilot.

#>

function Update-FabricTenantSetting {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$TenantSettingName,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [bool]$EnableTenantSetting,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToCapacity,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToDomain,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [bool]$DelegateToWorkspace,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$EnabledSecurityGroups,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$ExcludedSecurityGroups,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [System.Object]$Properties
    )
    try {
        # Validate authentication token
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Validate Security Groups if provided
        if ($EnabledSecurityGroups) {
            foreach ($enabledGroup in $EnabledSecurityGroups) {
                if (-not ($enabledGroup.PSObject.Properties.Name -contains 'graphId' -and $enabledGroup.PSObject.Properties.Name -contains 'name')) {
                    throw "Each enabled security group must contain 'graphId' and 'name' properties."
                }
            }
        }

        if ($ExcludedSecurityGroups) {
            foreach ($excludedGroup in $ExcludedSecurityGroups) {
                if (-not ($excludedGroup.PSObject.Properties.Name -contains 'graphId' -and $excludedGroup.PSObject.Properties.Name -contains 'name')) {
                    throw "Each excluded security group must contain 'graphId' and 'name' properties."
                }
            }
        }

        # Validate Security Groups if provided
        if ($Properties) {
            foreach ($property in $Properties) {
                if (-not ($property.PSObject.Properties.Name -contains 'name' -and $property.PSObject.Properties.Name -contains 'type' -and $property.PSObject.Properties.Name -contains 'value')) {
                    throw "Each property object must include 'name', 'type', and 'value' properties to be valid."
                }
            }
        }

        # Construct API endpoint URL
        $apiEndpointURI = "{0}/admin/tenantsettings/{1}/update" -f $FabricConfig.BaseUrl, $TenantSettingName
        Write-FabricLog -Message "Constructed API Endpoint: $apiEndpointURI" -Level Debug

        # Construct request body
        $body = @{
            EnableTenantSetting = $EnableTenantSetting
        }

        if ($DelegateToCapacity) {
            $body.delegateToCapacity = $DelegateToCapacity
        }

        if ($DelegateToDomain) {
            $body.delegateToDomain = $DelegateToDomain
        }

        if ($DelegateToWorkspace) {
            $body.delegateToWorkspace = $DelegateToWorkspace
        }

        if ($EnabledSecurityGroups) {
            $body.enabledSecurityGroups = $EnabledSecurityGroups
        }

        if ($ExcludedSecurityGroups) {
            $body.excludedSecurityGroups = $ExcludedSecurityGroups
        }

        if ($Properties) {
            $body.properties = $Properties
        }

        # Convert body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 5
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Invoke Fabric API request
        if ($PSCmdlet.ShouldProcess("tenant setting '$TenantSettingName'", "Update tenant setting")) {
            $response = Invoke-FabricAPIRequest `
                -BaseURI $apiEndpointURI `
                -Headers $FabricConfig.FabricHeaders `
                -Method Post `
                -Body $bodyJson

            # Return the API response
            Write-FabricLog -Message "Successfully updated tenant setting." -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Error updating tenant settings: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Tenant\Update-FabricTenantSetting.ps1' 168
#Region '.\Public\Users\Get-FabricUserListAccessEntities.ps1' -1

<#
.SYNOPSIS
    Retrieves access entities for a specified user in Microsoft Fabric.

.DESCRIPTION
    This function retrieves a list of access entities associated with a specified user in Microsoft Fabric.
    It supports filtering by entity type and handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER UserId
    The unique identifier of the user whose access entities are to be retrieved. This parameter is mandatory.

.PARAMETER Type
    The type of access entity to filter the results by. This parameter is optional and supports predefined values such as 'CopyJob', 'Dashboard', 'DataPipeline', etc.

.EXAMPLE
    Get-FabricUserListAccessEntities -UserId "user-12345"
    This example retrieves all access entities associated with the user having ID "user-12345".

.EXAMPLE
    Get-FabricUserListAccessEntities -UserId "user-12345" -Type "Dashboard"
    This example retrieves only the 'Dashboard' access entities associated with the user having ID "user-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricUserListAccessEntities {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$UserId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('CopyJob', ' Dashboard', 'DataPipeline', 'Datamart', 'Environment', 'Eventhouse', 'Eventstream', 'GraphQLApi', 'KQLDashboard', 'KQLDatabase', 'KQLQueryset', 'Lakehouse', 'MLExperiment', 'MLModel', 'MirroredDatabase', 'MountedDataFactory', 'Notebook', 'PaginatedReport', 'Reflex', 'Report', 'SQLDatabase', 'SQLEndpoint', 'SemanticModel', 'SparkJobDefinition', 'VariableLibrary', 'Warehouse')]
        [string]$Type
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}admin/users/{1}/access" -f $FabricConfig.BaseUrl, $UserId
        if ($Type) {
            $apiEndpointURI += "?type=$Type"
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            # Return all workspace tenant setting overrides
            Write-FabricLog -Message "Successfully retrieved access entities for user ID '$UserId'. Entity count: $($dataItems.Count)" -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Warehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Users\Get-FabricUserListAccessEntities.ps1' 80
#Region '.\Public\Utils\Convert-FromBase64.ps1' -1

<#
.SYNOPSIS
Decodes a Base64-encoded string into its original text representation.

.DESCRIPTION
The Convert-FromBase64 function takes a Base64-encoded string as input, decodes it into a byte array,and converts it back into a UTF-8 encoded string. It is useful for reversing Base64 encoding applied to text or other data.

.PARAMETER Base64String
Mandatory. The Base64-encoded input string to decode back to its original UTF-8 text form. Supply a valid Base64 value; invalid padding or illegal characters will raise an error before returning a result.

.EXAMPLE
Convert-FromBase64 -Base64String "SGVsbG8sIFdvcmxkIQ=="

Output
    Hello, World!

.EXAMPLE
$encodedString = "U29tZSBlbmNvZGVkIHRleHQ="
Convert-FromBase64 -Base64String $encodedString

Output
    Some encoded text

.NOTES
This function assumes the Base64 input is a valid UTF-8 encoded string.
Any decoding errors will throw a descriptive error message.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026


#>
function Convert-FromBase64 {
    param (
        [Parameter(Mandatory = $true)]
        [ValidatePattern('^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$')]
        [string]$Base64String
    )
    try {
        # Convert the Base64 string to a byte array
        $bytes = [Convert]::FromBase64String($Base64String)

        # Convert the byte array back to a UTF-8 string
        $decodedString = [System.Text.Encoding]::UTF8.GetString($bytes)

        # Return the decoded string
        return $decodedString
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "An error occurred while decoding from Base64: $errorDetails" -Level Error
        throw "An error occurred while decoding from Base64: $_"
    }
}
#EndRegion '.\Public\Utils\Convert-FromBase64.ps1' 54
#Region '.\Public\Utils\Convert-ToBase64.ps1' -1

<#
.SYNOPSIS
    Encodes the content of a file into a Base64-encoded string.

.DESCRIPTION
    The Convert-ToBase64  function takes a file path as input, reads the file's content as a byte array,
    and converts it into a Base64-encoded string. This is useful for embedding binary data (e.g., images,
    documents) in text-based formats such as JSON or XML.

.PARAMETER filePath
    Mandatory. Full path to the file whose contents will be read as bytes and encoded into a Base64 string. The path must exist and refer to a file; directories or missing paths will cause the command to fail.

.EXAMPLE
     Convert-ToBase64  -filePath "C:\Path\To\File.txt"

    Output:
    VGhpcyBpcyBhbiBlbmNvZGVkIGZpbGUu

.EXAMPLE
     $encodedContent = Convert-ToBase64  -filePath "C:\Path\To\Image.jpg"
     $encodedContent | Set-Content -Path "C:\Path\To\EncodedImage.txt"

    This saves the Base64-encoded content of the image to a text file.

.NOTES
    - Ensure the file exists at the specified path before running this function.
    - Large files may cause memory constraints due to full loading into memory.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Convert-ToBase64 {
    [CmdletBinding()]
    [OutputType([string])]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$filePath
    )
    try {
        # Validate file existence
        if (-not (Test-Path -Path $filePath -PathType Leaf)) {
            throw "File not found at path: $filePath"
        }

        # Warn if file size exceeds threshold (e.g., 50MB)
        $fileInfo = Get-Item -Path $filePath
        if ($fileInfo.Length -gt 50MB) {
            Write-FabricLog -Message "Warning: File size exceeds 50MB. This may cause memory issues." -Level Warning
        }

        # Reading all the bytes from the file
        Write-FabricLog -Message "Reading all the bytes from the file specified: $filePath" -Level Debug
        $fileBytes = [System.IO.File]::ReadAllBytes($filePath)

        # Convert the byte array to Base64 string
        Write-FabricLog -Message "Convert the byte array to Base64 string" -Level Debug
        $base64String = [Convert]::ToBase64String($fileBytes)

        # Return the encoded string
        Write-FabricLog -Message "Return the encoded string for the file: $filePath" -Level Debug
        return $base64String
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "An error occurred while encoding to Base64: $errorDetails" -Level Error
        throw "An error occurred while encoding to Base64: $_"
    }
}
#EndRegion '.\Public\Utils\Convert-ToBase64.ps1' 70
#Region '.\Public\Utils\Get-FabricLongRunningOperation.ps1' -1

<#
.SYNOPSIS
Polls and returns the final status of a Fabric long-running operation.

.DESCRIPTION
The Get-FabricLongRunningOperation cmdlet repeatedly queries a Fabric long-running operation endpoint until the
operation reaches a terminal state (Succeeded, Completed, or Failed) or a timeout is exceeded. You can supply either
the operationId (preferred) or a full location URL returned by a prior asynchronous API call.

.PARAMETER operationId
The GUID identifying the long-running operation. Provide this when the previous API response returned an operationId.
If specified, the cmdlet constructs the operation status URL automatically.

.PARAMETER location
The full operation status URL (Location header) returned by some asynchronous Fabric API responses. Use this only when
an operationId was not provided, or you captured the raw Location header directly.

.PARAMETER retryAfter
The number of seconds to wait between status polls. Increasing this reduces API calls at the cost of slower feedback.
Defaults to 5 seconds which balances responsiveness with request volume.

.PARAMETER timeoutInSeconds
Maximum number of seconds to wait before aborting with a timeout error. The default of 900 seconds (15 minutes) helps
prevent indefinite polling if the service stops updating status.

.EXAMPLE
Get-FabricLongRunningOperation -operationId "12345-abcd-67890-efgh" -retryAfter 10 -timeoutInSeconds 1200

Polls the specified operation every 10 seconds for up to 20 minutes before timing out.

.EXAMPLE
Get-FabricLongRunningOperation -location "https://api.fabric.microsoft.com/v1/operations/12345-abcd/status" -retryAfter 3

Uses a raw location URL to track an operation, polling every 3 seconds.

.NOTES
Either operationId or location must be provided (but not both). Token validity is validated before polling.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026


#>
function Get-FabricLongRunningOperation {
    param (
        [Parameter(Mandatory = $false)]
        [string]$operationId,

        [Parameter(Mandatory = $false)]
        [string]$location,

        [Parameter(Mandatory = $false)]
        [int]$retryAfter = 5,

        [Parameter(Mandatory = $false)]
        [int]$timeoutInSeconds = 900
    )

    if (-not ($operationId -or $location)) {
        throw "Either 'operationId' or 'location' parameter must be provided."
    }

    # Validate authentication token before proceeding.
    Write-FabricLog -Message "Validating authentication token..." -Level Debug
    Test-TokenExpired
    Write-FabricLog -Message "Authentication token is valid." -Level Debug

    # Construct the API endpoint URI
    $apiEndpointURI = if ($operationId) {
        "https://api.fabric.microsoft.com/v1/operations/{0}" -f $operationId
    }
    else {
        $location
    }
    Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

    $startTime = Get-Date

    try {
        do {
            # Check for timeout
            if ((Get-Date) - $startTime -gt (New-TimeSpan -Seconds $timeoutInSeconds)) {
                throw "Operation timed out after $timeoutInSeconds seconds."
            }

            # Wait before the next request
            Start-Sleep -Seconds $retryAfter

            # Make the API request
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method = 'Get'
            }
            $operation = Invoke-FabricAPIRequest @apiParams

            # Log status for debugging
            Write-FabricLog -Message "Operation Status: $($operation.status)" -Level Debug

        } while ($operation.status -notin @("Succeeded", "Completed", "Failed"))

        # Return the operation result
        return $operation
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "An error occurred while checking the long running operation: $errorDetails" -Level Error
        throw
    }
}
#EndRegion '.\Public\Utils\Get-FabricLongRunningOperation.ps1' 110
#Region '.\Public\Utils\Get-FabricLongRunningOperationResult.ps1' -1

<#
.SYNOPSIS
Retrieves the result of a completed long-running operation from the Microsoft Fabric API.

.DESCRIPTION
The Get-FabricLongRunningOperationResult function queries the Microsoft Fabric API to fetch the result
of a specific long-running operation. This is typically used after confirming the operation has completed successfully.

.PARAMETER operationId
The unique identifier of the completed long-running operation whose result you want to retrieve.

.EXAMPLE
Get-FabricLongRunningOperationResult -operationId "12345-abcd-67890-efgh"

This command fetches the result of the operation with the specified operationId.

.NOTES
- Ensure the Fabric API headers (e.g., authorization tokens) are defined in $FabricConfig.FabricHeaders.
- This function does not handle polling. Ensure the operation is in a terminal state before calling this function.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026


#>
function Get-FabricLongRunningOperationResult {
    param (
        [Parameter(Mandatory = $true)]
        [string]$operationId
    )
    # Validate authentication token before proceeding.
    Write-FabricLog -Message "Validating authentication token..." -Level Debug
    Test-TokenExpired
    Write-FabricLog -Message "Authentication token is valid." -Level Debug

    # Construct the API endpoint URI
    $apiEndpointURI = "https://api.fabric.microsoft.com/v1/operations/{0}/result" -f $operationId
    Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

    try {
        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "LRO result return: $($response)" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "An error occurred while returning the operation result: $errorDetails" -Level Error
        throw
    }
}
#EndRegion '.\Public\Utils\Get-FabricLongRunningOperationResult.ps1' 58
#Region '.\Public\Utils\Invoke-FabricAPIRequest.ps1' -1

<#
.SYNOPSIS
    Sends an HTTP request to a Microsoft Fabric API, supporting pagination and long-running operations.

.DESCRIPTION
    This function executes HTTP requests against Microsoft Fabric APIs. It handles pagination using continuation tokens and manages long-running operations (LROs) when required. Supports multiple HTTP methods and processes responses based on status codes.

.PARAMETER Headers
    Hashtable of HTTP headers to include in the request.

.PARAMETER BaseURI
    The base URI for the API endpoint.

.PARAMETER Method
    The HTTP method to use. Valid values: Get, Post, Delete, Put, Patch.

.PARAMETER Body
    Optional request body for applicable HTTP methods (Post, Put, Patch).

.PARAMETER ContentType
    The content type of the request body. Default is "application/json; charset=utf-8".

.PARAMETER WaitForCompletion
    If specified, waits for completion of long-running operations before returning.

.PARAMETER MaxRetries
    Maximum number of retry attempts for transient failures (429, 503, 504).
    If not specified, uses the module's configured default (Api.RetryMaxAttempts).

.PARAMETER RetryBackoffMultiplier
    Multiplier for exponential backoff between retry attempts.
    If not specified, uses the module's configured default (Api.RetryBackoffMultiplier).

.EXAMPLE
    Invoke-FabricAPIRequest -Headers $headers -BaseURI "https://api.fabric.microsoft.com/resource" -Method Get

.EXAMPLE
    Invoke-FabricAPIRequest -Headers $headers -BaseURI "https://api.fabric.microsoft.com/resource" -Method Post -Body $body -WaitForCompletion

.EXAMPLE
    Invoke-FabricAPIRequest -Headers $headers -BaseURI "https://api.fabric.microsoft.com/resource" -Method Get -MaxRetries 5 -RetryBackoffMultiplier 3

.NOTES
    Enhanced with retry logic for transient failures (429 Too Many Requests, 503 Service Unavailable, 504 Gateway Timeout).
    Respects Retry-After headers when provided by the API.

    Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
    Version: 2.0.0
    Last Updated: 2026-01-07
#>
function Invoke-FabricAPIRequest {
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [hashtable]$Headers,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$BaseURI,

        [Parameter(Mandatory = $true)]
        [ValidateSet('Get', 'Post', 'Delete', 'Put', 'Patch')]
        [string] $Method,

        [Parameter(Mandatory = $false)]
        [string] $Body,

        [Parameter(Mandatory = $false)]
        [string] $ContentType = "application/json; charset=utf-8",

        [Parameter(Mandatory = $false)]
        [switch]$WaitForCompletion,

        [Parameter(Mandatory = $false)]
        [int]$MaxRetries,

        [Parameter(Mandatory = $false)]
        [int]$RetryBackoffMultiplier
    )
    try {
        # Get retry configuration from PSFramework or use provided values
        if (-not $MaxRetries) {
            $MaxRetries = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.RetryMaxAttempts' -Fallback 3
        }
        if (-not $RetryBackoffMultiplier) {
            $RetryBackoffMultiplier = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.RetryBackoffMultiplier' -Fallback 2
        }

        # Initialize continuation token and results collection
        $continuationToken = $null
        $results = New-Object System.Collections.Generic.List[Object]

        # Ensure System.Web assembly is loaded for URL encoding
        if (-not ([System.Web.HttpUtility] -as [type])) {
            Add-Type -AssemblyName System.Web
        }

        # Loop to handle pagination via continuation tokens
        do {
            # Construct API endpoint URI with continuation token if present
            $apiEndpointURI = $BaseURI
            if ($null -ne $continuationToken) {
                $encodedToken = [System.Web.HttpUtility]::UrlEncode($continuationToken)
                $separator = if ($BaseURI -like "*`?*") { "&" } else { "?" }
                $apiEndpointURI = "$BaseURI$separator" + "continuationToken=$encodedToken"
            }

            Write-FabricLog -Message "Calling API: $apiEndpointURI" -Level Debug

            # Prepare parameters for Invoke-RestMethod
            $invokeParams = @{
                Headers                 = $Headers
                Uri                     = $apiEndpointURI
                Method                  = $Method
                ErrorAction             = 'Stop'
                SkipHttpErrorCheck      = $true
                ResponseHeadersVariable = 'responseHeader'
                StatusCodeVariable      = 'statusCode'
            }

            # Include body and content type for applicable HTTP methods
            if ($Method -in @('Post', 'Put', 'Patch') -and $Body) {
                $invokeParams.Body = $Body
                $invokeParams.ContentType = $ContentType
            }

            # Invoke the API request with retry logic for transient failures
            $retryCount = 0
            $shouldRetry = $true

            while ($shouldRetry) {
                $response = Invoke-RestMethod @invokeParams
                Write-FabricLog -Message "API response code: $statusCode" -Level Debug

                # Check if this is a transient failure that should be retried
                $isTransientFailure = $statusCode -in @(429, 503, 504)

                if ($isTransientFailure -and $retryCount -lt $MaxRetries) {
                    $retryCount++

                    # Check for Retry-After header
                    $retryAfterSeconds = if ($responseHeader -and $responseHeader['Retry-After']) {
                        [int]$responseHeader['Retry-After']
                    } else {
                        # Calculate exponential backoff with jitter
                        $baseDelay = [Math]::Pow($RetryBackoffMultiplier, $retryCount)
                        $jitter = Get-Random -Minimum 0 -Maximum 1000 -SetSeed ([int](Get-Date).Ticks)
                        [int]($baseDelay + ($jitter / 1000))
                    }

                    Write-FabricLog -Message "Transient failure (status $statusCode). Retry $retryCount of $MaxRetries after $retryAfterSeconds seconds..." -Level Warning
                    Start-Sleep -Seconds $retryAfterSeconds

                    # Continue to next retry iteration
                    continue
                }

                # Exit retry loop if request succeeded or max retries reached
                $shouldRetry = $false
            }

            # Handle response based on HTTP status code
            switch ($statusCode) {
                200 {
                    Write-FabricLog -Message "API call succeeded." -Level Debug
                    [string]$etag = $responseHeader["ETag"]

                    if ($response) {
                        # Determine response structure and add data to results
                        $propertyNames = $response.PSObject.Properties.Name
                        $items = @()
                        switch ($true) {
                            { $propertyNames -contains 'value' } { $items = $response.value; break }
                            { $propertyNames -contains 'accessEntities' } { $items = $response.accessEntities; break }
                            { $propertyNames -contains 'domains' } { $items = $response.domains; break }
                            { $propertyNames -contains 'publishDetails' } { $items = $response.publishDetails; break }
                            { $propertyNames -contains 'definition' } { $items = $response.definition.parts; break }
                            { $propertyNames -contains 'data' } { $items = $response.data; break }
                            default { $items = @($response) }
                        }
                        foreach ($item in $items) {
                            if ($etag) {
                                # Add ETag property to each item if not already present
                                if ($item -isnot [PSCustomObject]) {
                                    $item = [PSCustomObject]$item
                                }
                                $item | Add-Member -NotePropertyName 'ETag' -NotePropertyValue $etag -Force
                            }
                            $results.Add($item)
                        }
                        # Update continuation token for pagination
                        $continuationToken = if ($propertyNames -contains 'continuationToken') { $response.continuationToken } else { $null }
                    }
                    else {
                        Write-FabricLog -Message "No data in response" -Level Debug
                        $continuationToken = $null
                    }
                }
                201 {
                    Write-FabricLog -Message "Resource created successfully." -Level Debug
                    return $response
                }
                202 {
                    # Handle long-running operations (LROs)
                    Write-FabricLog -Message "Request accepted. The operation is being processed." -Level Info
                    [string]$operationId = $responseHeader["x-ms-operation-id"]
                    [string]$location = $responseHeader["Location"]
                    $retryAfter = $responseHeader["Retry-After"]


                    # If the response contains an operation ID or Location header, handle as a long-running operation (LRO)
                    if ($operationId -or $location) {
                        Write-FabricLog -Message "Operation ID: '$operationId', Location: '$location'" -Level Debug

                        # If waiting for completion is requested, poll the operation status until completion
                        if ($WaitForCompletion.IsPresent) {
                            Write-FabricLog -Message "The operation is running synchronously. Proceeding with long-running operation." -Level Debug
                            $operationStatus = Get-FabricLongRunningOperation -operationId $operationId -location $location
                            Write-FabricLog -Message "Long Running Operation status: $operationStatus" -Level Debug

                            # If the operation succeeded and results are expected, fetch the result
                            if ($operationStatus.status -eq "Succeeded") {
                                Write-FabricLog -Message "Operation succeeded. Fetching result." -Level Debug
                                $operationResult = Get-FabricLongRunningOperationResult -operationId $operationId
                                # Add result data to the results collection, handling 'definition' property if present
                                if ($operationResult.PSObject.Properties.Name -contains 'definition') {
                                    $results.AddRange($operationResult.definition.parts)
                                }
                                else {
                                    $results.Add($operationResult)
                                }
                                return , $results.ToArray()
                            }
                            elseif ($operationStatus.status -eq "Completed") {
                                $results.Add($operationStatus)
                                return , $results.ToArray()
                            }
                            # Throw an error if the operation failed
                            elseif ($operationStatus.status -eq "Failed") {
                                throw "Fabric long-running operation failed. Status: Failed. Details: $($operationStatus | ConvertTo-Json -Depth 10)"
                            }
                            else {
                                throw "Unexpected operation status: $($operationStatus.status). Details: $($operationStatus | ConvertTo-Json -Depth 10)"
                            }
                        }
                        else {
                            # If not waiting for completion, return operation tracking information
                            Write-FabricLog -Message "The operation is running asynchronously." -Level Info
                            return [PSCustomObject]@{
                                OperationId = $operationId
                                Location    = $location
                                RetryAfter  = $retryAfter
                            }
                        }
                    }
                }
                # Handle common HTTP error codes
                400 { $errorMsg = "Bad Request" }
                401 { $errorMsg = "Unauthorized" }
                403 { $errorMsg = "Forbidden" }
                404 { $errorMsg = "Not Found" }
                409 { $errorMsg = "Conflict" }
                429 { $errorMsg = "Too Many Requests" }
                500 { $errorMsg = "Internal Server Error" }
                default { $errorMsg = "Unexpected response code: $statusCode" }
            }

            # Throw error for unsuccessful responses
            if ($statusCode -notin 200, 201, 202) {
                throw "API request failed with status code $statusCode. Error: $errorMsg Response: $($response | ConvertTo-Json -Depth 10)"
            }

        } while ($null -ne $continuationToken)

        return , $results.ToArray()
    }
    catch {
        Write-FabricLog -Message "Invoke Fabric API error. Error: $($_.Exception.Message)" -Level Error
        throw
    }
}
#EndRegion '.\Public\Utils\Invoke-FabricAPIRequest.ps1' 282
#Region '.\Public\Utils\Set-FabricApiHeaders.ps1' -1

<#
.SYNOPSIS
Sets the Fabric API headers with a valid token for the specified Azure tenant.

.DESCRIPTION
The `Set-FabricApiHeaders` function authenticates to Azure and retrieves an access token for the Fabric API.
Supports three authentication methods:
- User Principal (interactive)
- Service Principal (automated)
- Managed Identity (Azure resources)

.PARAMETER TenantId
The Azure Active Directory tenant (directory) GUID. Required for User Principal and Service Principal authentication.

.PARAMETER AppId
Client/Application ID (GUID) of the Azure AD application for service principal authentication.
Must be used together with AppSecret parameter.

.PARAMETER AppSecret
Secure string containing the client secret for service principal authentication.
Convert plain text using: `ConvertTo-SecureString -AsPlainText -Force`

.PARAMETER UseManagedIdentity
Switch to use Azure Managed Identity authentication. Suitable for Azure VMs, App Services, Functions, etc.

.PARAMETER ClientId
Optional. Client ID for user-assigned managed identity. Omit for system-assigned managed identity.

.EXAMPLE
Set-FabricApiHeaders -TenantId "12345678-1234-1234-1234-123456789012"

Authenticates using current user credentials (interactive).

.EXAMPLE
$appSecret = "your-secret" | ConvertTo-SecureString -AsPlainText -Force
Set-FabricApiHeaders -TenantId $tid -AppId $appId -AppSecret $appSecret

Authenticates using service principal (non-interactive).

.EXAMPLE
Set-FabricApiHeaders -UseManagedIdentity

Authenticates using system-assigned managed identity (Azure resources only).

.EXAMPLE
Set-FabricApiHeaders -UseManagedIdentity -ClientId "87654321-4321-4321-4321-210987654321"

Authenticates using user-assigned managed identity.

.OUTPUTS
None. Updates module-scoped authentication context.

.NOTES
API Endpoint: N/A (Authentication only)
Permissions Required: Appropriate Azure AD permissions for chosen auth method
Authentication: This IS the authentication function

Author: Tiago Balabuch, Jess Pomfret, Rob Sewell
Version: 1.0.0
Last Updated: 2026-01-07

BREAKING CHANGE: No longer populates global $FabricConfig variable.
Module now uses internal $script:FabricAuthContext.
#>
function Set-FabricApiHeaders {
    [CmdletBinding(DefaultParameterSetName = 'UserPrincipal', SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true, ParameterSetName = 'UserPrincipal')]
        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [string]$TenantId,

        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [string]$AppId,

        [Parameter(Mandatory = $true, ParameterSetName = 'ServicePrincipal')]
        [ValidateNotNullOrEmpty()]
        [System.Security.SecureString]$AppSecret,

        [Parameter(Mandatory = $true, ParameterSetName = 'ManagedIdentity')]
        [System.Diagnostics.CodeAnalysis.SuppressMessageAttribute('PSReviewUnusedParameter', '', Justification='Parameter is used for parameter set binding')]
        [switch]$UseManagedIdentity,

        [Parameter(Mandatory = $false, ParameterSetName = 'ManagedIdentity')]
        [ValidateNotNullOrEmpty()]
        [string]$ClientId
    )

    try {
        $authMethod = $PSCmdlet.ParameterSetName
        Write-PSFMessage -Level Host -Message "Authenticating to Azure using $authMethod method..."

        if ($PSCmdlet.ShouldProcess("Fabric API configuration for $authMethod", "Set authentication headers")) {
            # Authenticate based on parameter set
            switch ($authMethod) {
                'ServicePrincipal' {
                    Write-PSFMessage -Level Debug -Message "Authenticating with Service Principal: $AppId"

                    # PS 5.1 compatible: Use New-Object instead of [pscredential]::new()
                    $psCredential = New-Object System.Management.Automation.PSCredential($AppId, $AppSecret)

                    # Connect to Azure
                    Connect-AzAccount -ServicePrincipal -Credential $psCredential -Tenant $TenantId -ErrorAction Stop | Out-Null
                    Write-PSFMessage -Level Verbose -Message "Successfully authenticated as service principal"
                }
                'UserPrincipal' {
                    Write-PSFMessage -Level Debug -Message "Authenticating with User Principal for tenant: $TenantId"

                    # Connect to Azure with user credentials
                    Connect-AzAccount -Tenant $TenantId -ErrorAction Stop | Out-Null
                    Write-PSFMessage -Level Verbose -Message "Successfully authenticated as user principal"
                }
                'ManagedIdentity' {
                    Write-PSFMessage -Level Debug -Message "Authenticating with Managed Identity"

                    # Build Connect-AzAccount parameters for MI
                    $connectParams = @{
                        Identity    = $true
                        ErrorAction = 'Stop'
                    }

                    # Add AccountId for user-assigned MI
                    if ($ClientId) {
                        $connectParams.AccountId = $ClientId
                        Write-PSFMessage -Level Verbose -Message "Using user-assigned managed identity: $ClientId"
                    }
                    else {
                        Write-PSFMessage -Level Verbose -Message "Using system-assigned managed identity"
                    }

                    # Connect using managed identity
                    Connect-AzAccount @connectParams | Out-Null
                    Write-PSFMessage -Level Verbose -Message "Successfully authenticated with managed identity"
                }
            }

            # Retrieve the access token
            Write-PSFMessage -Level Debug -Message "Retrieving access token for Fabric API"
            $resourceUrl = Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.ResourceUrl'

            $fabricToken = Get-AzAccessToken -AsSecureString -ResourceUrl $resourceUrl -ErrorAction Stop -WarningAction SilentlyContinue

            # Convert secure token to plain text (PS 5.1 compatible)
            Write-PSFMessage -Level Debug -Message "Extracting token from SecureString"
            $plainTokenPtr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($fabricToken.Token)
            try {
                $plainToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($plainTokenPtr)

                # Update module-scoped authentication context
                Write-PSFMessage -Level Debug -Message "Updating module authentication context"

                $script:FabricAuthContext.FabricHeaders = @{
                    'Content-Type'  = 'application/json; charset=utf-8'
                    'Authorization' = "Bearer $plainToken"
                }
                $script:FabricAuthContext.TokenExpiresOn = $fabricToken.ExpiresOn.ToString('o')  # ISO 8601 format
                $script:FabricAuthContext.TenantId = if ($TenantId) { $TenantId } else { 'ManagedIdentity' }
                $script:FabricAuthContext.AuthMethod = $authMethod
                $script:FabricAuthContext.ClientId = $ClientId

                # Calculate time until expiration
                $expiresIn = ($fabricToken.ExpiresOn - [DateTimeOffset]::Now).TotalMinutes
                Write-PSFMessage -Level Host -Message "Authentication successful. Token expires in $([Math]::Round($expiresIn, 1)) minutes."
                Write-PSFMessage -Level Verbose -Message "Token expiration: $($fabricToken.ExpiresOn.ToString('u'))"
            }
            finally {
                # Ensure secure memory cleanup
                [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($plainTokenPtr)
            }
        }
    }
    catch {
        $errorDetails = $_.Exception.Message
        Write-PSFMessage -Level Error -Message "Failed to set Fabric authentication: $errorDetails" -ErrorRecord $_

        # Provide helpful error messages based on auth method
        $helpMessage = switch ($authMethod) {
            'ServicePrincipal' { "Verify AppId, AppSecret, and TenantId are correct. Ensure service principal has appropriate permissions." }
            'UserPrincipal' { "Verify TenantId is correct. Ensure you have appropriate permissions and can authenticate interactively." }
            'ManagedIdentity' { "Ensure managed identity is enabled on this Azure resource and has appropriate permissions. Managed Identity only works on Azure VMs, App Services, Functions, etc." }
        }

        Write-PSFMessage -Level Important -Message $helpMessage
        throw "Unable to configure Fabric authentication. $helpMessage"
    }
}
#EndRegion '.\Public\Utils\Set-FabricApiHeaders.ps1' 188
#Region '.\Public\Variable Library\Get-FabricVariableLibrary.ps1' -1

<#
.SYNOPSIS
    Retrieves variable library information from a Microsoft Fabric workspace.

.DESCRIPTION
    Fetches variable libraries from a specified workspace. You can filter results by providing either the VariableLibraryId or VariableLibraryName.
    The function ensures authentication, builds the API endpoint, performs the request, and returns the relevant variable library details.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the variable library. Required.

.PARAMETER VariableLibraryId
    The unique identifier of the variable library to retrieve. Optional.

.PARAMETER VariableLibraryName
    The display name of the variable library to retrieve. Optional.

.EXAMPLE
    Get-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890"
    Returns the variable library with ID "library-67890" from the specified workspace.

.EXAMPLE
    Get-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryName "My Variable Library"
    Returns the variable library named "My Variable Library" from the specified workspace.

.NOTES
    - Requires a `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    - Uses `Test-TokenExpired` to validate authentication before making the API call.

    Author: Updated by Jess Pomfret and Rob Sewell November 2026
    Author: Tiago Balabuch
#>
function Get-FabricVariableLibrary {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$VariableLibraryName
    )
    try {
        # Validate input parameters
        if ($VariableLibraryId -and $VariableLibraryName) {
            Write-FabricLog -Message "Specify only one parameter: either 'VariableLibraryId' or 'VariableLibraryName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($VariableLibraryId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $VariableLibraryId }, 'First')
        }
        elseif ($VariableLibraryName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $VariableLibraryName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Variable Library. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Variable Library\Get-FabricVariableLibrary.ps1' 107
#Region '.\Public\Variable Library\Get-FabricVariableLibraryDefinition.ps1' -1

<#
.SYNOPSIS
    Retrieves the definition of a variable library from a Microsoft Fabric workspace.

.DESCRIPTION
    Gets the definition of a variable library in a specified workspace by its ID. Handles authentication, builds the API endpoint, and returns the response.

.PARAMETER WorkspaceId
    The ID of the workspace containing the variable library. Required.

.PARAMETER VariableLibraryId
    The ID of the variable library to retrieve. Optional.

.PARAMETER VariableLibraryFormat
    The format for the variable library definition (e.g., 'json'). Optional.

.EXAMPLE
    Get-FabricVariableLibraryDefinition -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890"
    Retrieves the definition for the specified variable library in the given workspace.

.EXAMPLE
    Get-FabricVariableLibraryDefinition -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890" -VariableLibraryFormat "json"
    Retrieves the variable library definition in JSON format.

.NOTES
    Requires `$FabricConfig` with `BaseUrl` and `FabricHeaders`.
    Uses `Test-TokenExpired` to validate authentication before the request.
    Author: Updated by Jess Pomfret and Rob Sewell November 2026

#>
function Get-FabricVariableLibraryDefinition {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryFormat
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI with filtering logic
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries/{2}/getDefinition" -f $FabricConfig.BaseUrl, $WorkspaceId, $VariableLibraryId
        if ($VariableLibraryFormat) {
            $apiEndpointURI = "{0}?format={1}" -f $apiEndpointURI, $VariableLibraryFormat
        }
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Variable Library '$VariableLibraryId' definition retrieved successfully!" -Level Debug
        return $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Variable Library. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Variable Library\Get-FabricVariableLibraryDefinition.ps1' 77
#Region '.\Public\Variable Library\New-FabricVariableLibrary.ps1' -1

<#
.SYNOPSIS
    Creates a new Variable Library in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a Variable Library resource within the given workspace.
    Allows specifying optional description, definition file path, and folder location.

.PARAMETER WorkspaceId
    The ID of the workspace where the Variable Library will be created. Required.

.PARAMETER VariableLibraryName
    The display name for the new Variable Library. Required.

.PARAMETER VariableLibraryDescription
    Optional. A description for the Variable Library.

.PARAMETER VariableLibraryPathDefinition
    Optional. Path to the Variable Library definition files.

.PARAMETER FolderId
    Optional. The folder ID where the Variable Library will be placed.

.EXAMPLE
    New-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryName "MyLibrary" -VariableLibraryDescription "Sample Variable Library"
    Creates a new Variable Library named "MyLibrary" in the specified workspace with a description.

.NOTES
    Requires the `$FabricConfig` global variable with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function New-FabricVariableLibrary {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$VariableLibraryName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryPathDefinition,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $VariableLibraryName
        }

        if ($FolderId) {
            $body.folderId = $FolderId
        }

        if ($VariableLibraryDescription) {
            $body.description = $VariableLibraryDescription
        }

        if ($VariableLibraryPathDefinition) {
            if (-not $body.definition) {
                $body.definition = @{
                    format = "VariableLibraryV1"
                    parts  = @()
                }
            }

            # As VariableLibrary has multiple parts, we need to get the definition parts
            $jsonObjectParts = Get-FileDefinitionPart -sourceDirectory $VariableLibraryPathDefinition
            # Add new part to the parts array
            $body.definition.parts = $jsonObjectParts.parts
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json -Depth 10
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        if ($PSCmdlet.ShouldProcess("Variable Library '$VariableLibraryName' in workspace '$WorkspaceId'", "Create")) {
            $apiParams = @{
                BaseURI = $apiEndpointURI
                Headers = $FabricConfig.FabricHeaders
                Method  = 'Post'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Variable Library '$VariableLibraryName' created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Variable Library. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Variable Library\New-FabricVariableLibrary.ps1' 119
#Region '.\Public\Variable Library\Remove-FabricVariableLibrary.ps1' -1

<#
.SYNOPSIS
    Deletes a variable library from a Microsoft Fabric workspace.

.DESCRIPTION
    Removes a variable library from the specified workspace by sending a DELETE request
    to the Microsoft Fabric API using the provided WorkspaceId and VariableLibraryId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the variable library.

.PARAMETER VariableLibraryId
    The unique identifier of the variable library to remove.

.EXAMPLE
    Remove-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryId "library-67890"
    Deletes the variable library with ID "library-67890" from the workspace "workspace-12345".

.NOTES
    Requires the `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    Validates authentication with `Test-TokenExpired` before making the API call.

    Author: Tiago Balabuch
#>
function Remove-FabricVariableLibrary {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $VariableLibraryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Variable Library '$VariableLibraryId' in workspace '$WorkspaceId'", "Remove")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Delete'
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Variable Library '$VariableLibraryId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Variable Library '$VariableLibraryId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Variable Library\Remove-FabricVariableLibrary.ps1' 67
#Region '.\Public\Variable Library\Update-FabricVariableLibrary.ps1' -1

<#
.SYNOPSIS
    Updates an existing Variable Library in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update the specified Variable Library's name and optionally its description within a workspace.

.PARAMETER WorkspaceId
    Mandatory. The GUID of the workspace that contains the Variable Library being updated.

.PARAMETER VariableLibraryId
    Mandatory. The unique identifier (GUID) of the Variable Library to update.

.PARAMETER VariableLibraryName
    Mandatory. The new display name to assign to the Variable Library.

.PARAMETER VariableLibraryDescription
    Optional. A longer description that explains the purpose or scope of the Variable Library.

.PARAMETER ActiveValueSetName
    Optional. The name of the active value set to select for this Variable Library. This determines which set of variable values is effective for dependent items within the workspace.

.EXAMPLE
    Update-FabricVariableLibrary -WorkspaceId "workspace-12345" -VariableLibraryId "VariableLibrary-67890" -VariableLibraryName "Updated API" -VariableLibraryDescription "Updated description"
    Updates the Variable Library with the specified ID in the given workspace with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricVariableLibrary {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$VariableLibraryName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$VariableLibraryDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ActiveValueSetName
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/VariableLibraries/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $VariableLibraryId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $VariableLibraryName
        }

        if ($VariableLibraryDescription) {
            $body.description = $VariableLibraryDescription
        }
        if ($ActiveValueSetName) {
            if (-not $body.ContainsKey('properties') -or $null -eq $body.properties) {
                $body.properties = @{}
            }
            $body.properties.activeValueSetName = $ActiveValueSetName
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        if ($PSCmdlet.ShouldProcess("Variable Library '$VariableLibraryName' in workspace '$WorkspaceId'", "Update")) {
            $apiParams = @{
                Headers = $FabricConfig.FabricHeaders
                BaseURI = $apiEndpointURI
                Method  = 'Patch'
                Body    = $bodyJson
            }
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Variable Library '$VariableLibraryName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Variable Library. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Variable Library\Update-FabricVariableLibrary.ps1' 107
#Region '.\Public\Warehouse\Get-FabricWarehouse.ps1' -1

<#
.SYNOPSIS
    Retrieves warehouse details from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function retrieves warehouse details from a specified workspace using either the provided WarehouseId or WarehouseName.
    It handles token validation, constructs the API URL, makes the API request, and processes the response.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse exists. This parameter is mandatory.

.PARAMETER WarehouseId
    The unique identifier of the warehouse to retrieve. This parameter is optional.

.PARAMETER WarehouseName
    The name of the warehouse to retrieve. This parameter is optional.

.EXAMPLE
     Get-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseId "warehouse-67890"
    This example retrieves the warehouse details for the warehouse with ID "warehouse-67890" in the workspace with ID "workspace-12345".

.EXAMPLE
     Get-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseName "My Warehouse"
    This example retrieves the warehouse details for the warehouse named "My Warehouse" in the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricWarehouse {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseName
    )

    try {
        # Validate input parameters
        if ($WarehouseId -and $WarehouseName) {
            Write-FabricLog -Message "Specify only one parameter: either 'WarehouseId' or 'WarehouseName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($WarehouseId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $WarehouseId }, 'First')
        }
        elseif ($WarehouseName) {
            $matchedItems = $dataItems.Where({ $_.DisplayName -eq $WarehouseName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Warehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\Get-FabricWarehouse.ps1' 106
#Region '.\Public\Warehouse\Get-FabricWarehouseConnectionString.ps1' -1

<#
.SYNOPSIS
Retrieves the connection string for a specific Warehouse in a Fabric workspace.

.DESCRIPTION
The Get-FabricWarehouseConnectionString function retrieves the connection string for a given Warehouse within a specified Fabric workspace.
It supports optional parameters for guest tenant access and private link type. The function validates authentication, constructs the appropriate API endpoint,
and returns the connection string or handles errors as needed.

.PARAMETER WorkspaceId
The ID of the workspace containing the Warehouse. This parameter is mandatory.

.PARAMETER WarehouseId
The ID of the Warehouse for which to retrieve the connection string. This parameter is mandatory.

.PARAMETER GuestTenantId
(Optional) The tenant ID for guest access, if applicable.

.PARAMETER PrivateLinkType
(Optional) The type of private link to use for the connection string. Valid values are 'None' or 'Workspace'.

.EXAMPLE
Get-FabricWarehouseConnectionString -WorkspaceId "workspace123" -WarehouseId "warehouse456"

.EXAMPLE
Get-FabricWarehouseConnectionString -WorkspaceId "workspace123" -WarehouseId "warehouse456" -GuestTenantId "guestTenant789" -PrivateLinkType "Workspace"

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.
Author: Updated by Jess Pomfret and Rob Sewell November 2026
#>
function Get-FabricWarehouseConnectionString {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$GuestTenantId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('None', 'Workspace')]
        [string]$PrivateLinkType
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}/connectionString" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseId
        # Append query parameters if GuestTenantId or PrivateLinkType are provided
        $queryParams = @()
        if ($GuestTenantId) {
            $queryParams += "guestTenantId=$GuestTenantId"
        }
        if ($PrivateLinkType) {
            $queryParams += "privateLinkType=$PrivateLinkType"
        }
        if ($queryParams.Count -gt 0) {
            $apiEndpointURI += "?" + ($queryParams -join "&")
        }

        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }
        else {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Warehouse connection string. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\Get-FabricWarehouseConnectionString.ps1' 99
#Region '.\Public\Warehouse\Get-FabricWarehouseSnapshot.ps1' -1

<#
.SYNOPSIS
Gets Warehouse Snapshots or a specific Warehouse Snapshot in a workspace.

.DESCRIPTION
The Get-FabricWarehouseSnapshot cmdlet retrieves Warehouse Snapshot items for a given workspace. You can list all
snapshots or filter by snapshot Id or display name. Only one of WarehouseSnapshotId or WarehouseSnapshotName may be used.

.PARAMETER WorkspaceId
The GUID of the workspace that contains the warehouse snapshots. Required to scope the API request.

.PARAMETER WarehouseSnapshotId
Optional. When provided, returns only the snapshot matching this resource Id. Prefer this for exact retrieval when the
Id is already known from a previous call.

.PARAMETER WarehouseSnapshotName
Optional. When provided, returns only the snapshot whose display name exactly matches this value. Do not combine with
WarehouseSnapshotId.

.EXAMPLE
Get-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotId "snap-67890"

Returns the specific warehouse snapshot with the given Id.

.EXAMPLE
Get-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotName "Nightly Backup"

Returns the snapshot named "Nightly Backup" if present.

.EXAMPLE
Get-FabricWarehouseSnapshot -WorkspaceId "workspace-12345"

Lists all warehouse snapshots in the workspace.

.NOTES
    - Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
    - Calls Test-TokenExpired to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Get-FabricWarehouseSnapshot {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseSnapshotName
    )

    try {
        # Validate input parameters
        if ($WarehouseSnapshotId -and $WarehouseSnapshotName) {
            Write-FabricLog -Message "Specify only one parameter: either 'WarehouseSnapshotId' or 'WarehouseSnapshotName'." -Level Error
            return $null
        }

        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehousesnapshots" -f $FabricConfig.BaseUrl, $WorkspaceId

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Immediately handle empty response
        if (-not $dataItems) {
            Write-FabricLog -Message "No data returned from the API." -Level Warning
            return $null
        }

        # Apply filtering logic efficiently
        if ($WarehouseSnapshotId) {
            $matchedItems = $dataItems.Where({ $_.Id -eq $WarehouseSnapshotId }, 'First')
        }
        elseif ($WarehouseSnapshotName) {
            $matchedItems = $dataItems.Where({ $_.displayName -eq $WarehouseSnapshotName }, 'First')
        }
        else {
            Write-FabricLog -Message "No filter provided. Returning all items." -Level Debug
            $matchedItems = $dataItems
        }

        # Handle results
        if ($matchedItems) {
            Write-FabricLog -Message "Item(s) found matching the specified criteria." -Level Debug
            return $matchedItems
        }
        else {
            Write-FabricLog -Message "No item found matching the provided criteria." -Level Warning
            return $null
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve Warehouse Snapshot. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\Get-FabricWarehouseSnapshot.ps1' 115
#Region '.\Public\Warehouse\New-FabricWarehouse.ps1' -1

<#
.SYNOPSIS
    Creates a new warehouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a POST request to the Microsoft Fabric API to create a new warehouse
    in the specified workspace. It supports optional parameters for warehouse description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse will be created. This parameter is mandatory.

.PARAMETER WarehouseName
    The name of the warehouse to be created. This parameter is mandatory.

.PARAMETER WarehouseDescription
    An optional description for the warehouse.

.PARAMETER WarehouseCollation
    An optional collation for the warehouse.

.EXAMPLE
    New-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseName "New Warehouse" -WarehouseDescription "Description of the new warehouse"
    This example creates a new warehouse named "New Warehouse" in the workspace with ID "workspace-12345" with the provided description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricWarehouse {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Latin1_General_100_BIN2_UTF8', 'Latin1_General_100_CI_AS_KS_WS_SC_UTF8')]
        [string]$WarehouseCollation = 'Latin1_General_100_BIN2_UTF8'
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseName
        }

        if ($WarehouseDescription) {
            $body.description = $WarehouseDescription
        }

        if ($WarehouseCollation) {
            $body.creationPayload = @{
                collationType = $WarehouseCollation
            }
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Warehouse '$WarehouseName' in workspace '$WorkspaceId'", 'Create')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Data Warehouse created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Warehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\New-FabricWarehouse.ps1' 103
#Region '.\Public\Warehouse\New-FabricWarehouseSnapshot.ps1' -1

<#
.SYNOPSIS
    Creates a new warehouse snapshot in a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a POST request to the Microsoft Fabric API to create a new warehouse snapshot in the given workspace.
    Supports optional parameters for description, parent warehouse, snapshot date/time, and folder.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse snapshot will be created. Mandatory.

.PARAMETER WarehouseSnapshotName
    The name of the warehouse snapshot to create. Mandatory.

.PARAMETER WarehouseSnapshotDescription
    Optional description for the warehouse snapshot.

.PARAMETER ParentWarehouseId
    Optional ID of the parent warehouse for the snapshot.

.PARAMETER SnapshotDateTime
    Optional snapshot date/time in UTC (format: yyyy-MM-ddTHH:mm:ssZ).

.PARAMETER FolderId
    Optional folder ID to organize the snapshot.

.EXAMPLE
    New-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotName "Snapshot1" -WarehouseSnapshotDescription "Nightly snapshot"
    Creates a warehouse snapshot named "Snapshot1" in the specified workspace with a description.

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function New-FabricWarehouseSnapshot {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseSnapshotName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$ParentWarehouseId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')]
        [string]$SnapshotDateTime,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$FolderId

    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehousesnapshots" -f $FabricConfig.BaseUrl, $WorkspaceId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseSnapshotName
        }

        if ($WarehouseSnapshotDescription) {
            $body.description = $WarehouseSnapshotDescription
        }
        if ($FolderId) {
            $body.folderId = $FolderId
        }

        # Combine ParentWarehouseId and SnapshotDateTime into creationPayload if present
        if ($ParentWarehouseId -or $SnapshotDateTime) {
            $creationPayload = @{}
            if ($ParentWarehouseId) {
            $creationPayload.parentWarehouseId = $ParentWarehouseId
            }
            if ($SnapshotDateTime) {
            $creationPayload.snapshotDateTime = $SnapshotDateTime
            }
            $body.creationPayload = $creationPayload
        }

        # Convert the body to JSON format
        $bodyJson = $body | ConvertTo-Json -Depth 4
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method  = 'Post'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Warehouse Snapshot '$WarehouseSnapshotName' in workspace '$WorkspaceId'", 'Create')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Data Warehouse Snapshot created successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create Warehouse Snapshot. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\New-FabricWarehouseSnapshot.ps1' 127
#Region '.\Public\Warehouse\Remove-FabricWarehouse.ps1' -1

<#
.SYNOPSIS
    Removes a warehouse from a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a DELETE request to the Microsoft Fabric API to remove a warehouse
    from the specified workspace using the provided WorkspaceId and WarehouseId.

.PARAMETER WorkspaceId
    The unique identifier of the workspace from which the warehouse will be removed.

.PARAMETER WarehouseId
    The unique identifier of the warehouse to be removed.

.EXAMPLE
    Remove-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseId "warehouse-67890"
    This example removes the warehouse with ID "warehouse-67890" from the workspace with ID "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricWarehouse {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Warehouse '$WarehouseId' in workspace '$WorkspaceId'", 'Delete')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Warehouse '$WarehouseId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Warehouse '$WarehouseId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\Remove-FabricWarehouse.ps1' 68
#Region '.\Public\Warehouse\Remove-FabricWarehouseSnapshot.ps1' -1

<#
.SYNOPSIS
    Deletes a warehouse snapshot from a specified Microsoft Fabric workspace.

.DESCRIPTION
    Sends a DELETE request to the Microsoft Fabric API to remove a warehouse snapshot
    identified by WarehouseSnapshotId from the given workspace (WorkspaceId).

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the warehouse snapshot.

.PARAMETER WarehouseSnapshotId
    The unique identifier of the warehouse snapshot to delete.

.EXAMPLE
    Remove-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotId "snapshot-67890"
    Deletes the warehouse snapshot with ID "snapshot-67890" from workspace "workspace-12345".

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch
#>
function Remove-FabricWarehouseSnapshot {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotId
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Token validation completed." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehousesnapshots/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseSnapshotId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Warehouse Snapshot '$WarehouseSnapshotId' in workspace '$WorkspaceId'", 'Delete')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Warehouse Snapshot '$WarehouseSnapshotId' deleted successfully from workspace '$WorkspaceId'." -Level Info
            return $response
        }

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete Warehouse Snapshot '$WarehouseSnapshotId' from workspace '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\Remove-FabricWarehouseSnapshot.ps1' 68
#Region '.\Public\Warehouse\Update-FabricWarehouse.ps1' -1

<#
.SYNOPSIS
    Updates an existing warehouse in a specified Microsoft Fabric workspace.

.DESCRIPTION
    This function sends a PATCH request to the Microsoft Fabric API to update an existing warehouse
    in the specified workspace. It supports optional parameters for warehouse description.

.PARAMETER WorkspaceId
    The unique identifier of the workspace where the warehouse exists. This parameter is optional.

.PARAMETER WarehouseId
    The unique identifier of the warehouse to be updated. This parameter is mandatory.

.PARAMETER WarehouseName
    The new name of the warehouse. This parameter is mandatory.

.PARAMETER WarehouseDescription
    An optional new description for the warehouse.

.EXAMPLE
    Update-FabricWarehouse -WorkspaceId "workspace-12345" -WarehouseId "warehouse-67890" -WarehouseName "Updated Warehouse" -WarehouseDescription "Updated description"
    This example updates the warehouse with ID "warehouse-67890" in the workspace with ID "workspace-12345" with a new name and description.

.NOTES
    - Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure token validity before making the API request.

    Author: Tiago Balabuch

#>
function Update-FabricWarehouse {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseDescription
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseName
        }

        if ($WarehouseDescription) {
            $body.description = $WarehouseDescription
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Warehouse '$WarehouseId' to '$WarehouseName' in workspace '$WorkspaceId'", 'Update')) {
            $response = Invoke-FabricAPIRequest @apiParams
            # Return the API response
            Write-FabricLog -Message "Warehouse '$WarehouseName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Warehouse. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\Update-FabricWarehouse.ps1' 96
#Region '.\Public\Warehouse\Update-FabricWarehouseSnapshot.ps1' -1

<#
.SYNOPSIS
    Updates an existing warehouse snapshot in a Microsoft Fabric workspace.

.DESCRIPTION
    Sends a PATCH request to the Microsoft Fabric API to update a warehouse snapshot's name, description, or snapshot date/time within a specified workspace.

.PARAMETER WorkspaceId
    The unique identifier of the workspace containing the warehouse snapshot.

.PARAMETER WarehouseSnapshotId
    The unique identifier of the warehouse snapshot to update.

.PARAMETER WarehouseSnapshotName
    The new display name for the warehouse snapshot.

.PARAMETER WarehouseSnapshotDescription
    (Optional) A new description for the warehouse snapshot.

.PARAMETER SnapshotDateTime
    (Optional) The snapshot date/time in ISO 8601 format (yyyy-MM-ddTHH:mm:ssZ).

.EXAMPLE
    Update-FabricWarehouseSnapshot -WorkspaceId "workspace-12345" -WarehouseSnapshotId "snapshot-67890" -WarehouseSnapshotName "Q1 Snapshot" -WarehouseSnapshotDescription "Quarter 1 data" -SnapshotDateTime "2024-06-01T00:00:00Z"

.NOTES
    - Requires `$FabricConfig` global configuration with `BaseUrl` and `FabricHeaders`.
    - Calls `Test-TokenExpired` to ensure authentication token validity before making the API request.

    Author: Tiago Balabuch
#>
function Update-FabricWarehouseSnapshot {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact='Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WarehouseSnapshotName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WarehouseSnapshotDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$')]
        [string]$SnapshotDateTime
    )
    try {
        # Validate authentication token before proceeding.
        Write-FabricLog -Message "Validating authentication token..." -Level Debug
        Test-TokenExpired
        Write-FabricLog -Message "Authentication token is valid." -Level Debug

        # Construct the API endpoint URI
        $apiEndpointURI = "{0}/workspaces/{1}/warehouses/{2}" -f $FabricConfig.BaseUrl, $WorkspaceId, $WarehouseId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            displayName = $WarehouseSnapshotName
        }

        if ($WarehouseSnapshotDescription) {
            $body.description = $WarehouseSnapshotDescription
        }

        if ($SnapshotDateTime) {
            if (-not $body.ContainsKey('properties')) {
                $body.properties = @{}
            }
            $body.properties.snapshotDateTime = $SnapshotDateTime
        }

        # Convert the body to JSON
        $bodyJson = $body | ConvertTo-Json
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method  = 'Patch'
            Body    = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Warehouse Snapshot '$WarehouseSnapshotId' to '$WarehouseSnapshotName' in workspace '$WorkspaceId'", 'Update')) {
            $response = Invoke-FabricAPIRequest @apiParams
            # Return the API response
            Write-FabricLog -Message "Warehouse Snapshot '$WarehouseSnapshotName' updated successfully!" -Level Info
            return $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update Warehouse Snapshot '$WarehouseSnapshotName'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Warehouse\Update-FabricWarehouseSnapshot.ps1' 108
#Region '.\Public\Workspace\Add-FabricWorkspaceCapacity.ps1' -1

<#
.SYNOPSIS
Assigns a Fabric workspace to a specified capacity.

.DESCRIPTION
The `Add-FabricWorkspaceCapacity` function sends a POST request to assign a workspace to a specific capacity.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be assigned.

.PARAMETER CapacityId
The unique identifier of the capacity to which the workspace should be assigned.

.EXAMPLE
Add-FabricWorkspaceCapacity -WorkspaceId "workspace123" -CapacityId "capacity456"

Assigns the workspace with ID "workspace123" to the capacity "capacity456".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricWorkspaceCapacity {
    [CmdletBinding()]
    [Alias("Assign-FabricWorkspaceCapacity")]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId
    )

    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'assignToCapacity'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            capacityId = $CapacityId
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Successfully assigned workspace with ID '$WorkspaceId' to capacity with ID '$CapacityId'." -Level Info
        $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to assign workspace with ID '$WorkspaceId' to capacity with ID '$CapacityId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Add-FabricWorkspaceCapacity.ps1' 75
#Region '.\Public\Workspace\Add-FabricWorkspaceIdentity.ps1' -1

<#
.SYNOPSIS
Provisions an identity for a Fabric workspace.

.DESCRIPTION
The `Add-FabricWorkspaceIdentity` function provisions an identity for a specified workspace by making an API call.

.PARAMETER WorkspaceId
The unique identifier of the workspace for which the identity will be provisioned.

.EXAMPLE
Add-FabricWorkspaceIdentity -WorkspaceId "workspace123"

Provisions a Managed Identity for the workspace with ID "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricWorkspaceIdentity {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'provisionIdentity'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response.
        Write-FabricLog -Message "Workspace identity was successfully provisioned for workspace '$WorkspaceId'." -Level Info
        $response

    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to provision workspace identity. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Add-FabricWorkspaceIdentity.ps1' 58
#Region '.\Public\Workspace\Add-FabricWorkspaceRoleAssignment.ps1' -1

<#
.SYNOPSIS
Assigns a role to a principal for a specified Fabric workspace.

.DESCRIPTION
The `Add-FabricWorkspaceRoleAssignments` function assigns a role (e.g., Admin, Contributor, Member, Viewer) to a principal (e.g., User, Group, ServicePrincipal) in a Fabric workspace by making a POST request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace.

.PARAMETER PrincipalId
The unique identifier of the principal (User, Group, etc.) to assign the role.

.PARAMETER PrincipalType
The type of the principal. Allowed values: Group, ServicePrincipal, ServicePrincipalProfile, User.

.PARAMETER WorkspaceRole
The role to assign to the principal. Allowed values: Admin, Contributor, Member, Viewer.

.EXAMPLE
Add-FabricWorkspaceRoleAssignment -WorkspaceId "workspace123" -PrincipalId "principal123" -PrincipalType "User" -WorkspaceRole "Admin"

Assigns the Admin role to the user with ID "principal123" in the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Add-FabricWorkspaceRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$PrincipalId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Group', 'ServicePrincipal', 'ServicePrincipalProfile', 'User')]
        [string]$PrincipalType,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admin', 'Contributor', 'Member', 'Viewer')]
        [string]$WorkspaceRole
    )

    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'roleAssignments'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            principal = @{
                id   = $PrincipalId
                type = $PrincipalType
            }
            role      = $WorkspaceRole
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }
        $response = Invoke-FabricAPIRequest @apiParams

        # Return the API response
        Write-FabricLog -Message "Role '$WorkspaceRole' assigned to principal '$PrincipalId' successfully in workspace '$WorkspaceId'." -Level Info
        $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to assign role. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Add-FabricWorkspaceRoleAssignment.ps1' 94
#Region '.\Public\Workspace\Get-FabricWorkspace.ps1' -1

<#
.SYNOPSIS
Retrieves details of a Microsoft Fabric workspace by its ID or name.

.DESCRIPTION
The `Get-FabricWorkspace` function fetches workspace details from the Fabric API. It supports filtering by WorkspaceId or WorkspaceName.

.PARAMETER WorkspaceId
The unique identifier of the workspace to retrieve.

.PARAMETER WorkspaceName
The display name of the workspace to retrieve.

.EXAMPLE
Get-FabricWorkspace -WorkspaceId "workspace123"

Fetches details of the workspace with ID "workspace123".

.EXAMPLE
Get-FabricWorkspace -WorkspaceName "MyWorkspace"

Fetches details of the workspace with the name "MyWorkspace".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.
- Returns the matching workspace details or all workspaces if no filter is provided.

Author: Tiago Balabuch
#>

function Get-FabricWorkspace {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WorkspaceName
    )

    try {
        # Validate input parameters
        if ($WorkspaceId -and $WorkspaceName) {
            Write-FabricLog -Message "Specify only one parameter: either 'WorkspaceId' or 'WorkspaceName'." -Level Error
            return
        }

        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering and output results
        Select-FabricResource -InputObject $dataItems -Id $WorkspaceId -DisplayName $WorkspaceName -ResourceType 'Workspace'
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve workspace. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Get-FabricWorkspace.ps1' 75
#Region '.\Public\Workspace\Get-FabricWorkspaceGitConnection.ps1' -1

<#
.SYNOPSIS
Retrieves Git connection details for Microsoft Fabric workspaces.

.DESCRIPTION
The `Get-FabricWorkspaceGitConnection` function queries the Fabric API to obtain Git integration details for one or more workspaces. You can optionally filter results by specifying a WorkspaceId.

.PARAMETER WorkspaceId
(Optional) The unique identifier of the workspace to filter Git connection details for. If omitted, all available workspace Git connections are returned.

.EXAMPLE
Get-FabricWorkspaceGitConnection -WorkspaceId "workspace123"

Returns the Git connection details for the workspace with ID "workspace123".

.EXAMPLE
Get-FabricWorkspaceGitConnection

Returns Git connection details for all available workspaces.

.NOTES
- Requires the `$FabricConfig` global variable to be configured with `BaseUrl` and `FabricHeaders`.
- Validates authentication using `Test-TokenExpired` before making API requests.
- Returns matching Git connection details or `$null` if no matches are found.

Author: Tiago Balabuch
#>

function Get-FabricWorkspaceGitConnection {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )
    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'admin/workspaces/discoverGitConnections'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering - using custom property 'workspaceId' instead of 'Id'
        if ($WorkspaceId) {
            $matchedItems = $dataItems.Where({ $_.workspaceId -eq $WorkspaceId }, 'First')
            if ($matchedItems) {
                $matchedItems
            }
            else {
                Write-FabricLog -Message "No Git connection found for WorkspaceId '$WorkspaceId'." -Level Warning
            }
        }
        else {
            $dataItems
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve workspace. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Get-FabricWorkspaceGitConnection.ps1' 71
#Region '.\Public\Workspace\Get-FabricWorkspaceRoleAssignment.ps1' -1

<#
.SYNOPSIS
Retrieves role assignments for a specified Fabric workspace.

.DESCRIPTION
The `Get-FabricWorkspaceRoleAssignments` function fetches the role assignments associated with a Fabric workspace by making a GET request to the API. If `WorkspaceRoleAssignmentId` is provided, it retrieves the specific role assignment.

.PARAMETER WorkspaceId
The unique identifier of the workspace to fetch role assignments for.

.PARAMETER WorkspaceRoleAssignmentId
(Optional) The unique identifier of a specific role assignment to retrieve.

.EXAMPLE
Get-FabricWorkspaceRoleAssignments -WorkspaceId "workspace123"

Fetches all role assignments for the workspace with the ID "workspace123".

.EXAMPLE
Get-FabricWorkspaceRoleAssignments -WorkspaceId "workspace123" -WorkspaceRoleAssignmentId "role123"

Fetches the role assignment with the ID "role123" for the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Get-FabricWorkspaceRoleAssignment {
    [CmdletBinding()]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceRoleAssignmentId
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'roleAssignments'

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Get'
        }
        $dataItems = Invoke-FabricAPIRequest @apiParams

        # Apply filtering
        $matchedItems = Select-FabricResource -InputObject $dataItems -Id $WorkspaceRoleAssignmentId -ResourceType 'WorkspaceRoleAssignment'

        # Transform data into custom objects
        if ($matchedItems) {
            $customResults = foreach ($obj in $matchedItems) {
                [PSCustomObject]@{
                    ID                = $obj.id
                    PrincipalId       = $obj.principal.id
                    DisplayName       = $obj.principal.displayName
                    Type              = $obj.principal.type
                    UserPrincipalName = $obj.principal.userDetails.userPrincipalName
                    aadAppId          = $obj.principal.servicePrincipalDetails.aadAppId
                    Role              = $obj.role
                }
            }
            $customResults
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to retrieve role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Get-FabricWorkspaceRoleAssignment.ps1' 83
#Region '.\Public\Workspace\New-FabricWorkspace.ps1' -1

<#
.SYNOPSIS
Creates a new Fabric workspace.

.DESCRIPTION
The New-FabricWorkspace cmdlet creates a Microsoft Fabric workspace by issuing a POST request to the Fabric API.
You must provide a valid display name. Optionally, include a description to aid discoverability and a capacity Id to
assign the workspace immediately to a capacity. The command supports ShouldProcess for safer automation (use -WhatIf).

.PARAMETER WorkspaceName
The display name of the workspace to create. Allowed characters are letters, numbers, spaces, and underscores. Choose
a name that clearly reflects the workspace purpose (e.g. Finance Analytics) for easier administration.

.PARAMETER WorkspaceDescription
Optional textual description explaining the workspace’s intended usage, stakeholders, or data domain. Providing a
meaningful description helps other administrators and users understand scope without opening items.

.PARAMETER CapacityId
Optional GUID of the capacity to assign the workspace to at creation time. If omitted, the workspace might be created
in a default capacity or remain unassigned depending on tenant settings. Ensure you have rights to use the capacity.

.EXAMPLE
New-FabricWorkspace -WorkspaceName "Finance Analytics" -WorkspaceDescription "Finance planning & reporting models" -CapacityId "aaaaaaaa-bbbb-cccc-dddd-ffffffffffff"

Creates a workspace with a descriptive purpose and assigns it to a specified capacity.

.EXAMPLE
New-FabricWorkspace -WorkspaceName "DataLab" -WhatIf

Shows what would happen without actually creating the workspace.

.NOTES
- Requires `$FabricConfig` global configuration, including BaseUrl and FabricHeaders.
- Calls Test-TokenExpired to ensure token validity before making the API request.
- Supports ShouldProcess for confirmation and -WhatIf/-Confirm behavior.

Author: Tiago Balabuch
#>

function New-FabricWorkspace {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WorkspaceName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceDescription,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$CapacityId
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces'

        # Construct the request body
        $body = @{
            displayName = $WorkspaceName
        }

        if ($WorkspaceDescription) {
            $body.description = $WorkspaceDescription
        }

        if ($CapacityId) {
            $body.capacityId = $CapacityId
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
            Body = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceName'", 'Create')) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Workspace '$WorkspaceName' created successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to create workspace. Error: $errorDetails" -Level Error

    }
}
#EndRegion '.\Public\Workspace\New-FabricWorkspace.ps1' 101
#Region '.\Public\Workspace\Remove-FabricWorkspace.ps1' -1

<#
.SYNOPSIS
Deletes an existing Fabric workspace by its workspace ID.

.DESCRIPTION
The `Remove-FabricWorkspace` function deletes a workspace in the Fabric platform by sending a DELETE request to the API. It validates the workspace ID and handles both success and error responses.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be deleted.

.EXAMPLE
Remove-FabricWorkspace -WorkspaceId "workspace123"

Deletes the workspace with the ID "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>
function Remove-FabricWorkspace {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId'", 'Delete')) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Workspace '$WorkspaceId' deleted successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to delete workspace. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Remove-FabricWorkspace.ps1' 56
#Region '.\Public\Workspace\Remove-FabricWorkspaceCapacity.ps1' -1

<#
.SYNOPSIS
Unassigns a Fabric workspace from its capacity.

.DESCRIPTION
The `Remove-FabricWorkspaceCapacity` function sends a POST request to unassign a workspace from its assigned capacity.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be unassigned from its capacity.

.EXAMPLE
Remove-FabricWorkspaceCapacity -WorkspaceId "workspace123"

Unassigns the workspace with ID "workspace123" from its capacity.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Remove-FabricWorkspaceCapacity {
    [CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )
    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'unassignFromCapacity'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        if ($PSCmdlet.ShouldProcess("$WorkspaceId" , "Remove from Capacity")) {
            # Make the API request
        $response = Invoke-FabricAPIRequest `
            -BaseURI $apiEndpointURI `
            -Headers $FabricConfig.FabricHeaders `
            -Method Post
        }


        # Return the API response
        Write-FabricLog -Message "Workspace capacity has been successfully unassigned from workspace '$WorkspaceId'." -Level Info
        $response
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to unassign workspace from capacity. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Remove-FabricWorkspaceCapacity.ps1' 57
#Region '.\Public\Workspace\Remove-FabricWorkspaceIdentity.ps1' -1

<#
.SYNOPSIS
Deprovisions the Managed Identity for a specified Fabric workspace.

.DESCRIPTION
The `Remove-FabricWorkspaceCapacity` function deprovisions the Managed Identity from the given workspace by calling the appropriate API endpoint.

.PARAMETER WorkspaceId
The unique identifier of the workspace from which the identity will be removed.

.EXAMPLE
Remove-FabricWorkspaceCapacity -WorkspaceId "workspace123"

Deprovisions the Managed Identity for the workspace with ID "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Remove-FabricWorkspaceIdentity {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId
    )

    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'deprovisionIdentity'
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            BaseURI = $apiEndpointURI
            Headers = $FabricConfig.FabricHeaders
            Method = 'Post'
        }

        if ($PSCmdlet.ShouldProcess("Workspace identity for '$WorkspaceId'", 'Deprovision')) {
            Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Workspace identity was successfully deprovisioned for workspace '$WorkspaceId'." -Level Info
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to deprovision workspace identity. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Remove-FabricWorkspaceIdentity.ps1' 59
#Region '.\Public\Workspace\Remove-FabricWorkspaceRoleAssignment.ps1' -1

<#
.SYNOPSIS
Removes a role assignment from a Fabric workspace.

.DESCRIPTION
The `Remove-FabricWorkspaceRoleAssignment` function deletes a specific role assignment from a Fabric workspace by making a DELETE request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace.

.PARAMETER WorkspaceRoleAssignmentId
The unique identifier of the role assignment to be removed.

.EXAMPLE
Remove-FabricWorkspaceRoleAssignment -WorkspaceId "workspace123" -WorkspaceRoleAssignmentId "role123"

Removes the role assignment with the ID "role123" from the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch

#>

function Remove-FabricWorkspaceRoleAssignment {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'High')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceRoleAssignmentId
    )

    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'roleAssignments' -SubresourceId $WorkspaceRoleAssignmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Delete'
        }

        if ($PSCmdlet.ShouldProcess("Role assignment '$WorkspaceRoleAssignmentId' in workspace '$WorkspaceId'", 'Remove')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Role assignment '$WorkspaceRoleAssignmentId' successfully removed from workspace '$WorkspaceId'." -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to remove role assignments for WorkspaceId '$WorkspaceId'. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Remove-FabricWorkspaceRoleAssignment.ps1' 68
#Region '.\Public\Workspace\Update-FabricWorkspace.ps1' -1

<#
.SYNOPSIS
Updates the properties of a Fabric workspace.

.DESCRIPTION
The `Update-FabricWorkspace` function updates the name and/or description of a specified Fabric workspace by making a PATCH request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace to be updated.

.PARAMETER WorkspaceName
The new name for the workspace.

.PARAMETER WorkspaceDescription
(Optional) The new description for the workspace.

.EXAMPLE
Update-FabricWorkspace -WorkspaceId "workspace123" -WorkspaceName "NewWorkspaceName"

Updates the name of the workspace with the ID "workspace123" to "NewWorkspaceName".

.EXAMPLE
Update-FabricWorkspace -WorkspaceId "workspace123" -WorkspaceName "NewName" -WorkspaceDescription "Updated description"

Updates both the name and description of the workspace "workspace123".

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Update-FabricWorkspace {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidatePattern('^[a-zA-Z0-9_ ]*$')]
        [string]$WorkspaceName,

        [Parameter(Mandatory = $false)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceDescription
    )

    try {
        # Validate authentication
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId

        # Construct the request body
        $body = @{
            displayName = $WorkspaceName
        }

        if ($WorkspaceDescription) {
            $body.description = $WorkspaceDescription
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Workspace '$WorkspaceId' to '$WorkspaceName'", 'Update')) {
            $response = Invoke-FabricAPIRequest @apiParams
            Write-FabricLog -Message "Workspace '$WorkspaceName' updated successfully!" -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update workspace. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Update-FabricWorkspace.ps1' 90
#Region '.\Public\Workspace\Update-FabricWorkspaceRoleAssignment.ps1' -1

<#
.SYNOPSIS
Updates the role assignment for a specific principal in a Fabric workspace.

.DESCRIPTION
The `Update-FabricWorkspaceRoleAssignment` function updates the role assigned to a principal in a workspace by making a PATCH request to the API.

.PARAMETER WorkspaceId
The unique identifier of the workspace where the role assignment exists.

.PARAMETER WorkspaceRoleAssignmentId
The unique identifier of the role assignment to be updated.

.PARAMETER WorkspaceRole
The new role to assign to the principal. Must be one of the following:
- Admin
- Contributor
- Member
- Viewer

.EXAMPLE
Update-FabricWorkspaceRoleAssignment -WorkspaceId "workspace123" -WorkspaceRoleAssignmentId "assignment456" -WorkspaceRole "Admin"

Updates the role assignment to "Admin" for the specified workspace and role assignment.

.NOTES
- Requires `$FabricConfig` global configuration, including `BaseUrl` and `FabricHeaders`.
- Calls `Test-TokenExpired` to ensure token validity before making the API request.

Author: Tiago Balabuch
#>

function Update-FabricWorkspaceRoleAssignment {
    [CmdletBinding(SupportsShouldProcess=$true, ConfirmImpact = 'Medium')]
    param (
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$WorkspaceRoleAssignmentId,

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [ValidateSet('Admin', 'Contributor', 'Member', 'Viewer')]
        [string]$WorkspaceRole
    )
    try {
        # Validate authentication token before proceeding.
        Invoke-FabricAuthCheck -ThrowOnFailure

        # Construct the API endpoint URI
        $apiEndpointURI = Build-FabricAPIUri -Resource 'workspaces' -ItemId $WorkspaceId -Subresource 'roleAssignments' -SubresourceId $WorkspaceRoleAssignmentId
        Write-FabricLog -Message "API Endpoint: $apiEndpointURI" -Level Debug

        # Construct the request body
        $body = @{
            role = $WorkspaceRole
        }

        # Convert the body to JSON
        $bodyJson = Convert-FabricRequestBody -InputObject $body
        Write-FabricLog -Message "Request Body: $bodyJson" -Level Debug

        # Make the API request
        $apiParams = @{
            Headers = $FabricConfig.FabricHeaders
            BaseURI = $apiEndpointURI
            Method = 'Patch'
            Body = $bodyJson
        }

        if ($PSCmdlet.ShouldProcess("Role assignment '$WorkspaceRoleAssignmentId' in workspace '$WorkspaceId' to '$WorkspaceRole'", 'Update')) {
            $response = Invoke-FabricAPIRequest @apiParams

            # Return the API response
            Write-FabricLog -Message "Role assignment $WorkspaceRoleAssignmentId updated successfully in workspace '$WorkspaceId'." -Level Info
            $response
        }
    }
    catch {
        # Capture and log error details
        $errorDetails = $_.Exception.Message
        Write-FabricLog -Message "Failed to update role assignment. Error: $errorDetails" -Level Error
    }
}
#EndRegion '.\Public\Workspace\Update-FabricWorkspaceRoleAssignment.ps1' 88

