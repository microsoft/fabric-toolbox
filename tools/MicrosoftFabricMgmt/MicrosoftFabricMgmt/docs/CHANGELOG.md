# Changelog

All notable changes to the MicrosoftFabricMgmt project will be documented in this file.

## [Unreleased]

## [0.5.1] – 2025-07-30

### Added
- New Folder functions
  - Get-FabricFolder
  - Move-FabricFolder
  - New-FabricFolder
  - Remove-FabricFolder
  - Update-FabricFolder

### Fixed
    *Remove the -ForegroundColor parameter for Write-Error and Write-Warning in the Write-Message function*

## [0.5.0] – 2025-07-19

### Added

- Introduced Invoke-FabricAPIRequest for making API requests with support for pagination and error handling.
- Added new functions:
  - Apache Air Flow
  - Copy Job
  - External Data Shares Providers
  - Labels
  - Sharing links
  - Tags
  - Tenant settings
  - Workspace
  - Users

### Changed

- Renamed a few functions
  - Get-FabricSparkSettings to Get-FabricSparkWorkspaceSettings
  - Update-FabricSparkSettings to Update-FabricSparkWorkspaceSettings
  - Get-FabricTenantSettingOverridesCapacity to Get-FabricCapacityTenantSettingOverrides

- Standardized parameter naming and API patterns
- Enhanced error handling across all cmdlets
- Refactor API request parameters in multiple scripts for consistency and readability. Now it uses a splatting format.

### Fixed

- Authentication fallback when environment variables for Fabric credentials are missing.
- Fix message types
- Fix bugs

---

## [0.1.0] – 2025-06-09

### Added

- Initial PowerShell module structure and framework
- Basic authentication and API connection handling
- Core utility functions for API interactions
- Module manifest and basic configuration
