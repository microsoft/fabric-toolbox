# Breaking Changes in Version 1.0.0

## Overview

Version 1.0.0 of the MicrosoftFabricMgmt module represents a complete modernization with significant breaking changes. This document details what has changed and provides guidance for migrating your scripts.

**Important:** Version 1.0.0 does NOT maintain backward compatibility with 0.x versions. You will need to update your scripts according to this guide.

---

## Breaking Change #1: Removed Global `$FabricConfig` Variable

### What Changed

The global `$FabricConfig` variable has been completely removed. The module now uses internal state management via PSFramework with a module-scoped `$script:FabricAuthContext` variable.

### Previous Approach (0.x)

```powershell
# OLD - No longer works
Set-FabricApiHeaders -TenantId "12345678-1234-1234-1234-123456789012"

# Direct access to global variable
$FabricConfig.BaseUrl
$FabricConfig.FabricHeaders
$FabricConfig.TokenExpiresOn
$FabricConfig.TenantIdGlobal
```

### New Approach (1.0.0)

```powershell
# NEW - Authentication works the same way
Set-FabricApiHeaders -TenantId "12345678-1234-1234-1234-123456789012"

# Module manages auth internally - no global variable access needed
# All functions automatically use the internal authentication context
Get-FabricWorkspace -WorkspaceId "87654321-4321-4321-4321-210987654321"

# If you need configuration values, use PSFramework:
Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.BaseUrl'
Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Api.TimeoutSeconds'
Get-PSFConfigValue -FullName 'MicrosoftFabricMgmt.Auth.TokenRefreshThresholdSeconds'
```

### Why This Change?

1. **Better Security**: No global variable containing authentication tokens
2. **Modern PowerShell**: PSFramework provides enterprise-grade configuration management
3. **Follows Best Practices**: PowerShell community standards discourage global variables
4. **Enables New Features**: Automatic token refresh, better logging, and more

---

## Breaking Change #2: Custom `Write-Message` Function Removed

### What Changed

The custom `Write-Message` function has been replaced with PSFramework's `Write-PSFMessage` throughout the module.

### Previous Approach (0.x)

```powershell
# OLD - No longer available
Write-Message -Message "Processing request" -Level Info
Write-Message -Message "Debug information" -Level Debug
Write-Message -Message "Error occurred" -Level Error
```

### New Approach (1.0.0)

```powershell
# NEW - Use PSFramework logging
Write-PSFMessage -Message "Processing request" -Level Host
Write-PSFMessage -Message "Debug information" -Level Debug
Write-PSFMessage -Message "Error occurred" -Level Error -ErrorRecord $_
```

### Impact

This change only affects you if you were directly calling `Write-Message` in your scripts. The module's logging output will continue to work normally with improved capabilities:

- Configurable logging levels
- Multiple logging providers (console, file, event log, etc.)
- Structured logging support
- Better performance

### PSFramework Logging Configuration

```powershell
# Control logging verbosity
Set-PSFLoggingProvider -Name logfile -InstanceName MicrosoftFabricMgmt `
    -FilePath "C:\Logs\FabricMgmt.log" -Enabled $true

# Filter messages by level
Set-PSFConfig -FullName 'psframework.logging.minimumlevel' -Value 'Warning'

# See all available configuration
Get-PSFConfig -Module PSFramework
```

---

## Breaking Change #3: `Test-TokenExpired` Now Returns Boolean

### What Changed

The `Test-TokenExpired` function now returns `$true` (expired) or `$false` (valid) instead of throwing exceptions.

### Previous Approach (0.x)

```powershell
# OLD - Would throw exception if expired
try {
    Test-TokenExpired -FabricConfig $FabricConfig
    # Token is valid, continue
}
catch {
    # Token expired - exception thrown
    Write-Host "Token expired: $_"
}
```

### New Approach (1.0.0)

```powershell
# NEW - Returns boolean
$isExpired = Test-TokenExpired
if ($isExpired) {
    Write-Host "Token expired, please re-authenticate"
    Set-FabricApiHeaders -TenantId $tenantId
}

# Or use auto-refresh for Managed Identity
$isExpired = Test-TokenExpired -AutoRefresh
if (-not $isExpired) {
    # Token is valid (either was valid or was refreshed)
    Get-FabricWorkspace -WorkspaceId $workspaceId
}
```

### Why This Change?

Returning boolean values instead of throwing exceptions provides:
- More flexible error handling
- Better PowerShell script flow control
- Automatic token refresh capability
- Consistent with PowerShell testing conventions (Test-* verbs return boolean)

---

## New Features in Version 1.0.0

### 1. Managed Identity Authentication

Azure Managed Identity authentication is now supported for secure, credential-free authentication from Azure resources.

```powershell
# System-assigned managed identity
Set-FabricApiHeaders -UseManagedIdentity

# User-assigned managed identity
Set-FabricApiHeaders -UseManagedIdentity -ClientId "87654321-4321-4321-4321-210987654321"
```

**Benefits:**
- No credential storage required
- Works on Azure VMs, App Services, Functions, Container Instances, etc.
- Automatic token refresh supported

### 2. Automatic Token Refresh

Managed Identity authentication now supports automatic token refresh:

```powershell
# Set authentication once
Set-FabricApiHeaders -UseManagedIdentity

# Token automatically refreshes when < 5 minutes remaining
# (when using -AutoRefresh with Test-TokenExpired)
$isExpired = Test-TokenExpired -AutoRefresh
```

**Benefits:**
- Long-running scripts don't need manual re-authentication
- Proactive refresh prevents API call failures
- Configurable refresh threshold

### 3. PSFramework Configuration System

All module configuration is now managed via PSFramework:

```powershell
# View all module configuration
Get-PSFConfig -Module MicrosoftFabricMgmt

# Modify configuration values
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.TimeoutSeconds' -Value 60
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Api.RetryMaxAttempts' -Value 5
Set-PSFConfig -Module 'MicrosoftFabricMgmt' -Name 'Auth.TokenRefreshThresholdSeconds' -Value 600

# Persist configuration for future sessions
Register-PSFConfig -FullName 'MicrosoftFabricMgmt.Api.TimeoutSeconds'
```

**Available Configuration:**
- `Api.BaseUrl`: Base URL for Fabric API endpoints
- `Api.ResourceUrl`: Azure resource URL for token acquisition
- `Api.TimeoutSeconds`: Default timeout for API requests
- `Api.RetryMaxAttempts`: Maximum retry attempts for failures
- `Api.RetryBackoffMultiplier`: Exponential backoff multiplier
- `Auth.TokenRefreshThresholdSeconds`: Token refresh threshold (default 300 seconds / 5 minutes)
- `Json.DefaultDepth`: Default depth for JSON conversion

### 4. Enhanced Logging

PSFramework logging provides enterprise-grade capabilities:

```powershell
# Enable file logging
Set-PSFLoggingProvider -Name logfile -InstanceName FabricMgmt `
    -FilePath "C:\Logs\FabricMgmt-%Date%.log" `
    -FileType CSV -Enabled $true

# Enable Windows Event Log
Set-PSFLoggingProvider -Name eventlog -InstanceName FabricMgmt `
    -LogName Application -Source MicrosoftFabricMgmt -Enabled $true

# View logging providers
Get-PSFLoggingProvider

# View recent log messages
Get-PSFMessage | Select-Object -Last 50
```

---

## Migration Checklist

Use this checklist to migrate your scripts from 0.x to 1.0.0:

- [ ] **Remove all `$FabricConfig` references** from your scripts
  - Search: `$FabricConfig`
  - Replace: Remove or use `Get-PSFConfigValue` for configuration values

- [ ] **Update any `Write-Message` calls** (if you used this internal function)
  - Search: `Write-Message`
  - Replace: `Write-PSFMessage`

- [ ] **Update `Test-TokenExpired` usage** (if you called this directly)
  - Change from try/catch to boolean return value check
  - Consider using `-AutoRefresh` parameter for Managed Identity

- [ ] **Test authentication** with your existing credentials
  - User Principal: No changes needed to authentication call
  - Service Principal: No changes needed to authentication call
  - Consider migrating to Managed Identity for Azure-hosted workloads

- [ ] **Test all your scripts** in a development environment first
  - Verify authentication works
  - Verify all API calls succeed
  - Check error handling still works as expected

- [ ] **Update documentation** and runbooks to reflect new patterns

---

## PowerShell Version Support

Version 1.0.0 supports both:
- **PowerShell 5.1** (Windows PowerShell)
- **PowerShell 7+** (PowerShell Core)

All code is compatible with both versions. Test your scripts on both versions if you use them in different environments.

---

## Getting Help

If you encounter issues during migration:

1. **Check the documentation**: Use `Get-Help` for any function
   ```powershell
   Get-Help Set-FabricApiHeaders -Full
   Get-Help about_MicrosoftFabricMgmt_Authentication
   ```

2. **Review the CHANGELOG**: See [CHANGELOG.md](CHANGELOG.md) for detailed changes

3. **Report issues**: [GitHub Issues](https://github.com/your-org/fabric-toolbox/issues)

4. **Review examples**: All functions include updated examples
   ```powershell
   Get-Help Get-FabricWorkspace -Examples
   ```

---

## Rollback Procedure

If you need to temporarily rollback to version 0.x:

```powershell
# Uninstall version 1.0.0
Uninstall-Module -Name MicrosoftFabricMgmt -RequiredVersion 1.0.0 -Force

# Install latest 0.x version
Install-Module -Name MicrosoftFabricMgmt -RequiredVersion 0.5.4 -Force

# Verify version
Get-Module MicrosoftFabricMgmt -ListAvailable | Select-Object Name, Version
```

**Note:** Rollback is only intended as a temporary measure. Plan to migrate to 1.0.0 as the 0.x versions will not receive future updates.

---

## Summary

Version 1.0.0 modernizes the MicrosoftFabricMgmt module with:
- ✅ Improved security (no global variables)
- ✅ Better configuration management (PSFramework)
- ✅ Enhanced logging capabilities
- ✅ Managed Identity support
- ✅ Automatic token refresh
- ✅ PowerShell 5.1 and 7+ compatibility
- ✅ Following PowerShell best practices

While these changes require updating your scripts, they provide a much better foundation for reliable, maintainable automation of Microsoft Fabric resources.

---

**Last Updated:** 2026-01-07
**Module Version:** 1.0.0
**Previous Version:** 0.5.4
