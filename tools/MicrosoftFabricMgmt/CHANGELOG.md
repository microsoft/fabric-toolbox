# Changelog for MicrosoftFabricMgmt

The format is based on and uses the types of changes according to [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
### Changed
### Fixed
### Deprecated
### Removed
### Security

## [1.0.0] - 2026-01-07

### BREAKING CHANGES

⚠️ **Version 1.0.0 contains significant breaking changes. See [BREAKING-CHANGES.md](BREAKING-CHANGES.md) for detailed migration guide.**

- **BREAKING**: Removed global `$FabricConfig` variable - Module now uses internal state management via PSFramework with `$script:FabricAuthContext`
- **BREAKING**: Removed custom `Write-Message` function - All logging now uses PSFramework's `Write-PSFMessage`
- **BREAKING**: `Test-TokenExpired` now returns boolean (`$true`/`$false`) instead of throwing exceptions for better error handling
- **BREAKING**: PowerShell 5.1 minimum version required (supports both PowerShell 5.1 and 7+)

### Added

- **Managed Identity Authentication**: Full support for Azure Managed Identity (both system-assigned and user-assigned)
  - `Set-FabricApiHeaders -UseManagedIdentity` for system-assigned identity
  - `Set-FabricApiHeaders -UseManagedIdentity -ClientId "..."` for user-assigned identity
- **Automatic Token Refresh**: New `Test-TokenExpired -AutoRefresh` capability for Managed Identity authentication
- **PSFramework Integration**: Complete migration to PSFramework for configuration and logging
  - Configuration: `Get-PSFConfig -Module MicrosoftFabricMgmt` to view all settings
  - Logging: Enterprise-grade logging with multiple providers (file, event log, etc.)
- **New Helper Function**: `Invoke-TokenRefresh` for automatic token renewal (Managed Identity only)
- **Configuration Options**: New PSFramework-based configuration settings:
  - `Api.BaseUrl`: Base URL for Fabric API endpoints
  - `Api.ResourceUrl`: Azure resource URL for token acquisition
  - `Api.TimeoutSeconds`: Default timeout for API requests (30 seconds)
  - `Api.RetryMaxAttempts`: Maximum retry attempts (3)
  - `Api.RetryBackoffMultiplier`: Exponential backoff multiplier (2)
  - `Auth.TokenRefreshThresholdSeconds`: Token refresh threshold (300 seconds / 5 minutes)
  - `Json.DefaultDepth`: Default depth for JSON conversion (10)
- **Module Cleanup Handler**: Automatic cleanup of sensitive authentication data when module is unloaded
- **Enhanced Documentation**: Complete comment-based help updates for all authentication functions

### Changed

- **Module Manifest**: Updated to version 1.0.0 with explicit PowerShell 5.1 compatibility
  - Added `RequiredModules = @('PSFramework')` dependency
  - Added `CompatiblePSEditions = @('Desktop', 'Core')` for explicit PS 5.1 and 7+ support
  - Updated `PowerShellVersion = '5.1'` minimum requirement
- **Module Initialization** (`prefix.ps1`): Complete rewrite with PSFramework configuration system
  - Initializes all module configuration on import
  - Creates module-scoped `$script:FabricAuthContext` instead of global `$FabricConfig`
  - Registers module cleanup handler for security
  - Displays breaking change notice on module load
- **Authentication** (`Set-FabricApiHeaders`): Complete rewrite with modern PowerShell patterns
  - Three parameter sets: `UserPrincipal`, `ServicePrincipal`, `ManagedIdentity`
  - All code is PowerShell 5.1 compatible (uses `New-Object` instead of `::new()`)
  - Uses PSFramework logging (`Write-PSFMessage`) throughout
  - Updates module-scoped `$script:FabricAuthContext` instead of global variable
  - Enhanced error messages with context-specific guidance
  - Stores authentication method and metadata for token refresh capability
- **Token Validation** (`Test-TokenExpired`): Enhanced with auto-refresh and better error handling
  - Returns `$true` (expired) or `$false` (valid) instead of throwing exceptions
  - New `-AutoRefresh` parameter for automatic token renewal
  - Proactive refresh when token < 5 minutes from expiration
  - Uses PSFramework logging and configuration
  - Checks module-scoped `$script:FabricAuthContext` instead of `$FabricConfig`
- **All Logging**: Migrated from custom `Write-Message` to PSFramework's `Write-PSFMessage`
  - Better performance and flexibility
  - Supports multiple logging providers
  - Configurable log levels and filtering
  - Structured logging support

### Removed

- **Global `$FabricConfig` Variable**: Removed entirely - use module functions instead
- **Custom `Write-Message` Function**: Removed - use `Write-PSFMessage` from PSFramework
- **Exception-Based Token Validation**: `Test-TokenExpired` no longer throws - returns boolean

### Security

- **Improved Token Security**: Module-scoped authentication context prevents accidental global variable exposure
- **Automatic Memory Cleanup**: Secure cleanup of authentication data when module is unloaded
- **SecureString Handling**: Proper SecureString to plain text conversion with guaranteed memory cleanup

### Migration Guide

**If upgrading from 0.x to 1.0.0:**

1. Remove all `$FabricConfig` references from your scripts
2. Authentication still works the same way via `Set-FabricApiHeaders`
3. Use `Get-PSFConfigValue` if you need configuration values
4. Update any `Test-TokenExpired` calls to handle boolean return values
5. Consider migrating Azure-hosted workloads to Managed Identity authentication

**See [BREAKING-CHANGES.md](BREAKING-CHANGES.md) for complete migration guide with examples.**

### Previous Version Changes

## [Unreleased - 0.x]

### Added
- added unit tests for `Get-FabricWorkspaceUser` function to ensure it works correctly with multiple workspaces both in the pipeline and passed to a parameter.
- Added unit tests for Aliases for `Get-FabricWorkspaceUser` function to ensure backward compatibility.
- Added credits for authors to all functions and Unit tests to verify the existence of such tags #89

### Changed
- Updated `Get-FabricWorkspaceUser` to support pipeline input for `WorkspaceId` and `WorkspaceName` parameters.
- Renamed `Get-FabricWorkspaceUsers` to match the singular form
- Get-FabricSqlDatabase accepts Workspace as a pipeline, handles errors correctly and can filter by name (#117).

### Fixed
### Deprecated
### Removed
### Security

## 0.22.0 - 20250609

### Added

- Introduced new PowerShell functions for managing Fabric workspaces, recovery points, configurations, tenant settings, and workspace identities.
- Added unit tests for key functions, including `Get-FabricAPIclusterURI` and `Get-FabricCapacityTenantOverrides`.
- Added standard tests for each function and enhanced Help tests to filter by exported commands.
- Added OutputType attributes to several functions for improved type safety.
- Added support for WhatIf and Confirm parameters to update and revoke functions.
- Added Contributor Covenant Code of Conduct and enhanced contributing guidelines.
- Added commit message guidelines for contributors using GitHub Copilot.

### Changed

- Refactored `Get-FabricAPIClusterURI` to use `Invoke-FabricRestApi` for improved consistency.
- Updated validation pattern for `WorkspaceName` to allow additional special characters, then removed the pattern for greater flexibility.
- Improved documentation for many functions, especially around parameters like `WorkspaceId`.
- Refactored multiple functions for clarity, consistency, and maintainability.
- Enhanced error handling and confirmation prompts (ShouldProcess) for potentially destructive actions.
- Updated module manifest and build/test workflows for better automation and deployment.
- Improved code formatting using the dbatools formatter.

### Fixed

- Fixed issues with `New-FabricDataPipeline` and its call to `Invoke-FabricAPIRequest`.
- Fixed capital letter handling in test automation.
- Fixed ResourceUrl for token retrieval in `Connect-FabricAccount`.
- Fixed bugs in `New-FabricEventhouse` and improved ShouldProcess logic.
- Fixed parameter naming and example formatting in several functions.
- Fixed issue with call to `Invoke-FabricAPIRequest` from `Remove-FabricWarehouse`.

### Deprecated

- None.

### Removed

- Removed unnecessary or duplicate functions (e.g., `Get-AllFabricDatasetRefreshes`, `Get-AllFabricCapacities`).
- Removed obsolete scripts and commented-out configuration paths.
- Removed `Invoke-FabricAPIRequest` and replaced it by `Invoke-FabricRestMethodExtended`
- Removed `Confirm-FabricAuthToken` 
- Renamed `Test-TokenExpired` to `Confirm-TokenState` and extended it using `EnableTokenRefresh` Feature Flag
- Removed `Set-FabricApiHeaders` and merged the entire logic to `Connect-FabricAccount`

### Security

- None.

---

**Contributors:**  
Rob Sewell, Jess Pomfret, Ioana Bouariu, Frank Geisler, Kamil Nowinski, and others.

**Note:**
For a full list of changes and details, please see the commit history.
