# Changelog

All notable changes to the MicrosoftFabricMgmt project will be documented in this file.

## [Unreleased]
### Added
### Fixed
### Changed


## [0.5.4] – 2025-08-28
### Added

- New Spark Job Definition functions
  - Get-FabricSparkJobDefinitionLivySession
- New Spark functions
  - Get-FabricSparkLivySession
- New Warehouse functions
  - Get-FabricWarehouseConnectionString
  - Get-FabricWarehouseSnapshot
  - New-FabricWarehouseSnapshot
  - Remove-FabricWarehouseSnapshot
  - Update-FabricWarehouseSnapshot
- New GraphQLApi functions
  - Get-FabricGraphQLApi
  - Get-FabricGraphQLApiDefinition
  - New-FabricGraphQLApi
  - Remove-FabricGraphQLApi
  - Update-FabricGraphQLApi
  - Update-FabricGraphQLApiDefinition
- New Mounted Data Factory functions
  - Get-FabricMountedDataFactory
  - Get-FabricMountedDataFactoryDefinition
  - New-FabricMountedDataFactory
  - Remove-FabricMountedDataFactory
  - Update-FabricMountedDataFactory
  - Update-FabricMountedDataFactoryDefinition
- New SQL Endpoint functions
  - Update-FabricSQLEndpointMetadata
  - Get-FabricSQLEndpointConnectionString
- New Variable Library functions
  - Get-FabricVariableLibrary
  - Get-FabricVariableLibraryDefinition
  - New-FabricVariableLibrary
  - Remove-FabricVariableLibrary
  - Update-FabricVariableLibrary
  - Update-FabricVariableLibraryDefinition
### Fixed
  - Get-FabricSQLEndpoint - Fixed error message
### Changed

- 

## [0.5.3] – 2025-08-19
### Added
- New Connections functions
  - Add-FabricConnectionRoleAssignment
  - Get-FabricConnection
  - Get-FabricConnectionSupportedType
  - Remove-FabricConnection
  - Remove-FabricConnectionRoleAssignment
  - Update-FabricConnectionRoleAssignment
- New Eventstream functions
  - Get-FabricEventstreamDestination
  - Get-FabricEventstreamDestinationConnection
  - Get-FabricEventstreamSource
  - Get-FabricEventstreamSourceConnection
  - Get-FabricEventstreamTopology
  - Resume-FabricEventstream
  - Resume-FabricEventstreamDestination
  - Resume-FabricEventstreamSource
  - Suspend-FabricEventstream
  - Suspend-FabricEventstreamDestination
  - Suspend-FabricEventstreamSource
- New Lakehouse functions
  - Start-FabricLakehouseRefreshMaterializedLakeView
  - Get-FabricLakehouseLivySession
- New Notebook functions
  - Get-FabricNotebookLivySession

### Fixed

### Changed
Changed comment-based help in the Start-FabricLakehouseTableMaintenance function

## [0.5.2] – 2025-08-04

### Added
- New Folder functions
  - Get-FabricFolder
  - Move-FabricFolder
  - New-FabricFolder
  - Remove-FabricFolder
  - Update-FabricFolder
- New Managed Private Endpoints functions
  - Get-FabricManagedPrivateEndpoint
  - New-FabricManagedPrivateEndpoint
  - Remove-FabricManagedPrivateEndpoint
- New OneLake Shortcut functions
  - Get-FabricOneLakeShortcut
  - New-FabricOneLakeShortcut
  - Remove-FabricOneLakeShortcut
  - Reset-FabricOneLakeShortcutCache

### Changed

Invoke-FabricAPIRequest function now can return ETAG from the request header if exists

### Fixed
  - Remove the -ForegroundColor parameter for Write-Error and Write-Warning in the Write-Message function
  - Get-FabricWarehouse: Incorrect variable name used for input validation
  - New-FabricWarehouse: Remove the line breaks between parameters to enhance readability
  - New-FabricFolder: Make the folder name parameter mandatory
  
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
