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
