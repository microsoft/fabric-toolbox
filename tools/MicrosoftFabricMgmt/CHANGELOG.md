# Changelog for MicrosoftFabricMgmt

The format is based on and uses the types of changes according to [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.6] - 2026-02-26

### Added

- **`Get-FabricItem`**: New function to list or retrieve items within a workspace using the core Items API
  (`GET /workspaces/{workspaceId}/items` and `GET /workspaces/{workspaceId}/items/{itemId}`).
  - Supports optional `ItemType` filter when listing (e.g. `Lakehouse`, `Notebook`)
  - Pipeline input from `Get-FabricWorkspace` via `Alias('id')` on `WorkspaceId`
  - Output objects carry `workspaceId` and `id` properties enabling direct piping to `Get-FabricOneLakeDataAccessRole`

- **`Get-FabricOneLakeDataAccessRole`** *(Preview API)*: New function to retrieve OneLake data access roles for a Fabric item
  using the preview OneLake Data Access Security API endpoints.
  - Without `-RoleName`: lists all roles via `GET /workspaces/{workspaceId}/items/{itemId}/dataAccessRoles` (paginated)
  - With `-RoleName`: retrieves a specific role via `GET /workspaces/{workspaceId}/items/{itemId}/dataAccessRoles/{roleName}?preview=true`
  - Pipeline input from `Get-FabricItem` — `workspaceId` binds to `WorkspaceId`, `id` binds to `ItemId` via alias
  - Human-readable terminal output via custom Format.ps1xml view; the full PSObject is preserved for pipeline use
  - Graceful error handling: `moreDetails` from structured API error responses surfaced as a tidy Warning; full error at Debug
  - Full three-command pipeline supported:
    ```powershell
    Get-FabricWorkspace -WorkspaceName "MyWorkspace" | Get-FabricItem | Get-FabricOneLakeDataAccessRole
    Get-FabricWorkspace -WorkspaceName "MyWorkspace" | Get-FabricItem -ItemType "Lakehouse" | Get-FabricOneLakeDataAccessRole
    ```

### Changed

- **`Invoke-FabricAPIRequest`**: Improved error handling for structured API error responses
  - `moreDetails` entries from Fabric API error responses are now included in the thrown error message
  - `$script:FabricLastAPIError` is now populated before throwing on non-2xx responses, enabling callers to access
    structured error data in their catch blocks under PowerShell 7 (where `$_.ErrorDetails.Message` is not populated)
  - Inner catch log level changed from `Error` to `Debug` to prevent duplicate output (callers own the user-facing message)

- **`prefix.ps1`**: Added module-load warning for the preview OneLake Data Access Security API notice

## [1.0.5] - 2026-02-24 

### Added

- **Pipeline Support for all Remove-* functions**: All 46 `Remove-*` functions now fully support PowerShell pipeline input, enabling patterns like:
  ```powershell
  Get-FabricLakehouse -WorkspaceId $wsId | Where-Object { $_.displayName -like 'test*' } | Remove-FabricLakehouse
  Get-FabricWorkspace -WorkspaceName 'OldWorkspace' | Remove-FabricWorkspace
  ```
  - All resource ID parameters now have `ValueFromPipeline = $true` and `ValueFromPipelineByPropertyName = $true`
  - All `WorkspaceId` parameters have `ValueFromPipelineByPropertyName = $true` to bind from piped objects
  - All functions now use proper `process { }` blocks for correct multi-item pipeline processing
  - `[Alias('id')]` added to resource ID parameters where missing to enable binding from API response objects
  - Fixed `Remove-FabricWarehouseSnapshot`: moved `[Alias('id')]` from `WorkspaceId` to `WarehouseSnapshotId`
  - Fixed `Remove-FabricWorkspace`, `Remove-FabricWorkspaceCapacity`, `Remove-FabricWorkspaceIdentity`: added `[Alias('id')]` to `WorkspaceId` so `Get-FabricWorkspace | Remove-Fabric*` pipeline works correctly
  - Fixed `Remove-FabricDomainWorkspace`, `Remove-FabricDomainWorkspaceRoleAssignment`: added `[Alias('id')]` to `DomainId` so `Get-FabricDomain | Remove-Fabric*` pipeline works correctly

- **New Resource Types** (27 new functions):
  - **Graph Model** (8 functions): Complete Graph Model management
    - `Get-FabricGraphModel`: List and retrieve Graph Models with filtering by ID or name
    - `New-FabricGraphModel`: Create new Graph Models with optional definition
    - `Update-FabricGraphModel`: Update Graph Model display name and description
    - `Remove-FabricGraphModel`: Delete Graph Models with confirmation support
    - `Get-FabricGraphModelDefinition`: Retrieve Graph Model definitions (supports LRO)
    - `Update-FabricGraphModelDefinition`: Update Graph Model definitions (supports LRO)
    - `Invoke-FabricGraphModelQuery`: Execute queries against Graph Models
    - `Get-FabricGraphModelQueryableType`: List queryable types for Graph Models
  - **Snowflake Database** (6 functions): Snowflake integration in Fabric
    - `Get-FabricSnowflakeDatabase`: List and retrieve Snowflake Databases
    - `New-FabricSnowflakeDatabase`: Create new Snowflake Database connections
    - `Update-FabricSnowflakeDatabase`: Update Snowflake Database properties
    - `Remove-FabricSnowflakeDatabase`: Delete Snowflake Database connections
    - `Get-FabricSnowflakeDatabaseDefinition`: Retrieve connection definitions
    - `Update-FabricSnowflakeDatabaseDefinition`: Update connection definitions
  - **Cosmos DB Database** (6 functions): Cosmos DB integration in Fabric
    - `Get-FabricCosmosDBDatabase`: List and retrieve Cosmos DB Databases
    - `New-FabricCosmosDBDatabase`: Create new Cosmos DB Database connections
    - `Update-FabricCosmosDBDatabase`: Update Cosmos DB Database properties
    - `Remove-FabricCosmosDBDatabase`: Delete Cosmos DB Database connections
    - `Get-FabricCosmosDBDatabaseDefinition`: Retrieve connection definitions
    - `Update-FabricCosmosDBDatabaseDefinition`: Update connection definitions

- **Admin API Functions** (8 new functions): Tenant-wide administration capabilities
  - `Get-FabricAdminWorkspace`: List all workspaces in tenant with filtering by name, type, capacity, and state
  - `Get-FabricAdminItem`: List all items in tenant with filtering by workspace, capacity, type, and state
  - `Get-FabricAdminReport`: List all reports in tenant with filtering by workspace
  - `Get-FabricAdminWorkspaceUser`: Get users with access to any workspace
  - `Get-FabricAdminGitConnection`: List all Git connections in tenant
  - `Get-FabricAdminItemUser`: Get users with access to any item
  - `Get-FabricAdminUserAccess`: List items a specific user can access
  - `Restore-FabricAdminWorkspace`: Restore deleted workspaces

- **Format File Updates**: Added PSTypeName support for new resource types
  - `MicrosoftFabric.GraphModel`
  - `MicrosoftFabric.SnowflakeDatabase`
  - `MicrosoftFabric.CosmosDBDatabase`
  - `MicrosoftFabric.AdminWorkspace`
  - `MicrosoftFabric.AdminItem`
  - `MicrosoftFabric.AdminReport`
  - `MicrosoftFabric.AdminWorkspaceUser`
  - `MicrosoftFabric.AdminGitConnection`
  - `MicrosoftFabric.AdminItemUser`
  - `MicrosoftFabric.AdminUserAccess`

- **Intelligent Output Formatting System**: Automatic formatting of Get-* cmdlet output with resolved GUIDs to human-readable names
  - Format views for Items, Workspaces, Capacities, Domains, Role Assignments, and Jobs
  - Displays: Capacity Name, Workspace Name, Item Name, Type, and ID in consistent format
  - Automatic name resolution with intelligent caching for optimal performance

- **Public Helper Functions** (3 new functions exported):
  - `Resolve-FabricCapacityName`: Converts capacity GUIDs to display names with caching
  - `Resolve-FabricWorkspaceName`: Converts workspace GUIDs to display names with caching
  - `Resolve-FabricCapacityIdFromWorkspace`: Cascading resolution for items without direct capacityId
  - All functions use PSFramework configuration for caching (persists across sessions)
  - Comprehensive documentation added for all three functions

- **Cascading Resolution**: Items that only return workspaceId (Lakehouse, Notebook, etc.) now display Capacity Name by cascading through workspace to get capacityId

- **Format Views** (6 views in MicrosoftFabricMgmt.Format.ps1xml):
  - `FabricItemView`: For 32 item types (Lakehouse, Notebook, Warehouse, Environment, Report, etc.)
  - `WorkspaceView`: For workspace objects
  - `CapacityView`: For capacity objects
  - `DomainView`: For domain objects
  - `RoleAssignmentView`: For workspace role assignments (NEW)
  - `JobView`: For job-related objects

- **Formatted Output** applied to 11 Get-* functions:
  - Get-FabricLakehouse
  - Get-FabricNotebook
  - Get-FabricWarehouse
  - Get-FabricWorkspace
  - Get-FabricCapacity
  - Get-FabricWorkspaceRoleAssignment (includes workspaceId for name resolution)
  - Get-FabricEnvironment
  - Get-FabricEventhouse
  - Get-FabricApacheAirflowJob
  - Get-FabricGraphQLApi
  - Get-FabricEventstream

- **Documentation**:
  - [Resolve-FabricCapacityName.md](docs/Resolve-FabricCapacityName.md) - Complete cmdlet documentation
  - [Resolve-FabricWorkspaceName.md](docs/Resolve-FabricWorkspaceName.md) - Complete cmdlet documentation
  - [Resolve-FabricCapacityIdFromWorkspace.md](docs/Resolve-FabricCapacityIdFromWorkspace.md) - Cascading resolution documentation
  - [OUTPUT-FORMATTING.md](docs/OUTPUT-FORMATTING.md) - Updated with cascading resolution details
  - [PHASE6_FORMATTING_COMPLETION.md](PHASE6_FORMATTING_COMPLETION.md) - Roadmap for remaining 23 functions

### Changed

- **Pipeline Support**: All new functions support PowerShell pipeline with `ValueFromPipelineByPropertyName`
  - WorkspaceId parameters accept pipeline input with `Alias('id')` for seamless piping
  - Item ID parameters support piping from Get-* functions
  - Example: `Get-FabricWorkspace | Get-FabricGraphModel` works naturally
- **Admin Functions**: Use `Select-FabricResource` helper for consistent filtering and type decoration
- **Select-FabricResource**: Enhanced with optional `-TypeName` parameter for automatic type decoration
- **Select-FabricResource**: Changed "not found" log messages from `Warning` to `Verbose` — unresolved IDs are expected in mixed-capacity environments
- **Module Manifest**: Exported 3 new public helper functions (Resolve-FabricCapacityName, Resolve-FabricWorkspaceName, Resolve-FabricCapacityIdFromWorkspace)
- **Module Manifest**: Added `FormatsToProcess = @('MicrosoftFabricMgmt.Format.ps1xml')` to load format file
- **Get-FabricWorkspaceRoleAssignment**: Now returns custom objects with workspaceId for name resolution and type decoration
- **Resolve-FabricCapacityName**: Changed "not found" and error log messages from `Warning` to `Verbose`
- **Resolve-FabricWorkspaceName**: Changed "not found" and error log messages from `Warning` to `Verbose`
- **Resolve-FabricCapacityIdFromWorkspace**: Changed error log message from `Warning` to `Verbose`

### Performance Improvements

- **Intelligent Caching**: Name resolutions cached using PSFramework configuration system
  - First lookup: 100-500ms (API call)
  - Cached lookup: <1ms (200-500x faster!)
  - Cache persists across PowerShell sessions
  - Dramatically improves performance for repeated queries
- **Cascading Resolution Caching**: Both levels cached (workspace→capacityId AND capacityId→name)
- **Cache miss elimination for unresolvable IDs**: `Resolve-FabricCapacityName`, `Resolve-FabricWorkspaceName`, and `Resolve-FabricCapacityIdFromWorkspace` now cache fallback/sentinel values when a lookup fails, preventing repeated API calls for the same ID within a session
  - Previously, each call with an unresolvable capacity or workspace ID triggered a fresh API call every time
  - Now the fallback result (ID string or `__NONE__` sentinel) is cached on first failure, so subsequent calls return immediately without an API round-trip
  - `Resolve-FabricCapacityIdFromWorkspace` uses a `__NONE__` sentinel to distinguish "no capacity assigned" (cached) from "not yet looked up" (cache miss)
- **Cross-cache population**: Resolve functions now populate related caches in a single API call
  - `Resolve-FabricWorkspaceName` also caches the workspace's capacity ID — a subsequent `Resolve-FabricCapacityIdFromWorkspace` call for the same workspace is served from cache without an API call
  - `Resolve-FabricCapacityIdFromWorkspace` also caches the workspace's display name — a subsequent `Resolve-FabricWorkspaceName` call for the same workspace is served from cache without an API call

### Fixed
- **Repeated API calls for same capacity/workspace ID**: Fixed a cache miss bug where `Resolve-*` functions would make a fresh API call on every invocation for IDs that had previously failed to resolve, instead of caching the negative result
- **Get-FabricAdminItem**: Fixed pipeline support - WorkspaceId parameter now accepts input from pipeline via `ValueFromPipelineByPropertyName` with `Alias('id')`
- **Get-FabricAdminItem**: Removed warning when no items are returned - now silently returns nothing as per module standards
- **Get-FabricAdminItem**: Added output formatting - now displays Capacity Name, Workspace Name, Item Name, Type, and ID in table view
- **Format File**: Added `MicrosoftFabric.AdminItem` to FabricItemView for automatic formatting of admin API items
- **Format File**: Updated Item Name column to handle both `displayName` (standard items) and `name` (admin API items) properties
- **Invoke-FabricAPIRequest**: Added support for `itemEntities` property in response handling (used by Admin API endpoints)
- **Invoke-FabricAPIRequest**: Fixed array conversion error when `Retry-After` header is returned as an array - now handles both single values and arrays correctly
- **Get-FabricAdminItem**: Fixed handling of empty `itemEntities` responses - now correctly returns empty array instead of failing
- Fixed overly restrictive `ValidatePattern` on name parameters across 18 cmdlets to match Microsoft Fabric documentation
  - **Fabric items** (Lakehouse, Warehouse, KQL Database, Tags, Variable Library, Spark Job Definition, SQL Endpoints): Changed pattern from `'^[a-zA-Z0-9_ ]*$'` to `'^[a-zA-Z0-9_]*$'` (removed space support as per Fabric naming restrictions)
  - **Workspaces**: Removed restrictive pattern validation entirely to support broader character set allowed by Fabric workspaces


## [1.0.4] - 2026-02-16

### Added

- **New Resource Types** (27 new functions):
  - **Graph Model** (8 functions): Complete Graph Model management
    - `Get-FabricGraphModel`: List and retrieve Graph Models with filtering by ID or name
    - `New-FabricGraphModel`: Create new Graph Models with optional definition
    - `Update-FabricGraphModel`: Update Graph Model display name and description
    - `Remove-FabricGraphModel`: Delete Graph Models with confirmation support
    - `Get-FabricGraphModelDefinition`: Retrieve Graph Model definitions (supports LRO)
    - `Update-FabricGraphModelDefinition`: Update Graph Model definitions (supports LRO)
    - `Invoke-FabricGraphModelQuery`: Execute queries against Graph Models
    - `Get-FabricGraphModelQueryableType`: List queryable types for Graph Models
  - **Snowflake Database** (6 functions): Snowflake integration in Fabric
    - `Get-FabricSnowflakeDatabase`: List and retrieve Snowflake Databases
    - `New-FabricSnowflakeDatabase`: Create new Snowflake Database connections
    - `Update-FabricSnowflakeDatabase`: Update Snowflake Database properties
    - `Remove-FabricSnowflakeDatabase`: Delete Snowflake Database connections
    - `Get-FabricSnowflakeDatabaseDefinition`: Retrieve connection definitions
    - `Update-FabricSnowflakeDatabaseDefinition`: Update connection definitions
  - **Cosmos DB Database** (6 functions): Cosmos DB integration in Fabric
    - `Get-FabricCosmosDBDatabase`: List and retrieve Cosmos DB Databases
    - `New-FabricCosmosDBDatabase`: Create new Cosmos DB Database connections
    - `Update-FabricCosmosDBDatabase`: Update Cosmos DB Database properties
    - `Remove-FabricCosmosDBDatabase`: Delete Cosmos DB Database connections
    - `Get-FabricCosmosDBDatabaseDefinition`: Retrieve connection definitions
    - `Update-FabricCosmosDBDatabaseDefinition`: Update connection definitions

- **Admin API Functions** (8 new functions): Tenant-wide administration capabilities
  - `Get-FabricAdminWorkspace`: List all workspaces in tenant with filtering by name, type, capacity, and state
  - `Get-FabricAdminItem`: List all items in tenant with filtering by workspace, capacity, type, and state
  - `Get-FabricAdminReport`: List all reports in tenant with filtering by workspace
  - `Get-FabricAdminWorkspaceUser`: Get users with access to any workspace
  - `Get-FabricAdminGitConnection`: List all Git connections in tenant
  - `Get-FabricAdminItemUser`: Get users with access to any item
  - `Get-FabricAdminUserAccess`: List items a specific user can access
  - `Restore-FabricAdminWorkspace`: Restore deleted workspaces

- **Format File Updates**: Added PSTypeName support for new resource types
  - `MicrosoftFabric.GraphModel`
  - `MicrosoftFabric.SnowflakeDatabase`
  - `MicrosoftFabric.CosmosDBDatabase`
  - `MicrosoftFabric.AdminWorkspace`
  - `MicrosoftFabric.AdminItem`
  - `MicrosoftFabric.AdminReport`
  - `MicrosoftFabric.AdminWorkspaceUser`
  - `MicrosoftFabric.AdminGitConnection`
  - `MicrosoftFabric.AdminItemUser`
  - `MicrosoftFabric.AdminUserAccess`

- **Intelligent Output Formatting System**: Automatic formatting of Get-* cmdlet output with resolved GUIDs to human-readable names
  - Format views for Items, Workspaces, Capacities, Domains, Role Assignments, and Jobs
  - Displays: Capacity Name, Workspace Name, Item Name, Type, and ID in consistent format
  - Automatic name resolution with intelligent caching for optimal performance

- **Public Helper Functions** (3 new functions exported):
  - `Resolve-FabricCapacityName`: Converts capacity GUIDs to display names with caching
  - `Resolve-FabricWorkspaceName`: Converts workspace GUIDs to display names with caching
  - `Resolve-FabricCapacityIdFromWorkspace`: Cascading resolution for items without direct capacityId
  - All functions use PSFramework configuration for caching (persists across sessions)
  - Comprehensive documentation added for all three functions

- **Cascading Resolution**: Items that only return workspaceId (Lakehouse, Notebook, etc.) now display Capacity Name by cascading through workspace to get capacityId

- **Format Views** (6 views in MicrosoftFabricMgmt.Format.ps1xml):
  - `FabricItemView`: For 32 item types (Lakehouse, Notebook, Warehouse, Environment, Report, etc.)
  - `WorkspaceView`: For workspace objects
  - `CapacityView`: For capacity objects
  - `DomainView`: For domain objects
  - `RoleAssignmentView`: For workspace role assignments (NEW)
  - `JobView`: For job-related objects

- **Formatted Output** applied to 11 Get-* functions:
  - Get-FabricLakehouse
  - Get-FabricNotebook
  - Get-FabricWarehouse
  - Get-FabricWorkspace
  - Get-FabricCapacity
  - Get-FabricWorkspaceRoleAssignment (includes workspaceId for name resolution)
  - Get-FabricEnvironment
  - Get-FabricEventhouse
  - Get-FabricApacheAirflowJob
  - Get-FabricGraphQLApi
  - Get-FabricEventstream

- **Documentation**:
  - [Resolve-FabricCapacityName.md](docs/Resolve-FabricCapacityName.md) - Complete cmdlet documentation
  - [Resolve-FabricWorkspaceName.md](docs/Resolve-FabricWorkspaceName.md) - Complete cmdlet documentation
  - [Resolve-FabricCapacityIdFromWorkspace.md](docs/Resolve-FabricCapacityIdFromWorkspace.md) - Cascading resolution documentation
  - [OUTPUT-FORMATTING.md](docs/OUTPUT-FORMATTING.md) - Updated with cascading resolution details
  - [PHASE6_FORMATTING_COMPLETION.md](PHASE6_FORMATTING_COMPLETION.md) - Roadmap for remaining 23 functions

### Changed

- **Pipeline Support**: All new functions support PowerShell pipeline with `ValueFromPipelineByPropertyName`
  - WorkspaceId parameters accept pipeline input with `Alias('id')` for seamless piping
  - Item ID parameters support piping from Get-* functions
  - Example: `Get-FabricWorkspace | Get-FabricGraphModel` works naturally
- **Admin Functions**: Use `Select-FabricResource` helper for consistent filtering and type decoration
- **Select-FabricResource**: Enhanced with optional `-TypeName` parameter for automatic type decoration
- **Module Manifest**: Exported 3 new public helper functions (Resolve-FabricCapacityName, Resolve-FabricWorkspaceName, Resolve-FabricCapacityIdFromWorkspace)
- **Module Manifest**: Added `FormatsToProcess = @('MicrosoftFabricMgmt.Format.ps1xml')` to load format file
- **Get-FabricWorkspaceRoleAssignment**: Now returns custom objects with workspaceId for name resolution and type decoration

### Performance Improvements

- **Intelligent Caching**: Name resolutions cached using PSFramework configuration system
  - First lookup: 100-500ms (API call)
  - Cached lookup: <1ms (200-500x faster!)
  - Cache persists across PowerShell sessions
  - Dramatically improves performance for repeated queries
- **Cascading Resolution Caching**: Both levels cached (workspace→capacityId AND capacityId→name)

### Fixed
- **Get-FabricAdminItem**: Fixed pipeline support - WorkspaceId parameter now accepts input from pipeline via `ValueFromPipelineByPropertyName` with `Alias('id')`
- **Get-FabricAdminItem**: Removed warning when no items are returned - now silently returns nothing as per module standards
- **Invoke-FabricAPIRequest**: Added support for `itemEntities` property in response handling (used by Admin API endpoints)
- **Invoke-FabricAPIRequest**: Fixed array conversion error when `Retry-After` header is returned as an array - now handles both single values and arrays correctly
- **Get-FabricAdminItem**: Fixed handling of empty `itemEntities` responses - now correctly returns empty array instead of failing
- Fixed overly restrictive `ValidatePattern` on name parameters across 18 cmdlets to match Microsoft Fabric documentation
  - **Fabric items** (Lakehouse, Warehouse, KQL Database, Tags, Variable Library, Spark Job Definition, SQL Endpoints): Changed pattern from `'^[a-zA-Z0-9_ ]*$'` to `'^[a-zA-Z0-9_]*$'` (removed space support as per Fabric naming restrictions)
  - **Workspaces**: Removed restrictive pattern validation entirely to support broader character set allowed by Fabric workspaces


### Deprecated
### Removed
### Security


## [1.0.4] - 2026-02-16

### Added

- **New Resource Types** (27 new functions):
  - **Graph Model** (8 functions): Complete Graph Model management
    - `Get-FabricGraphModel`: List and retrieve Graph Models with filtering by ID or name
    - `New-FabricGraphModel`: Create new Graph Models with optional definition
    - `Update-FabricGraphModel`: Update Graph Model display name and description
    - `Remove-FabricGraphModel`: Delete Graph Models with confirmation support
    - `Get-FabricGraphModelDefinition`: Retrieve Graph Model definitions (supports LRO)
    - `Update-FabricGraphModelDefinition`: Update Graph Model definitions (supports LRO)
    - `Invoke-FabricGraphModelQuery`: Execute queries against Graph Models
    - `Get-FabricGraphModelQueryableType`: List queryable types for Graph Models
  - **Snowflake Database** (6 functions): Snowflake integration in Fabric
    - `Get-FabricSnowflakeDatabase`: List and retrieve Snowflake Databases
    - `New-FabricSnowflakeDatabase`: Create new Snowflake Database connections
    - `Update-FabricSnowflakeDatabase`: Update Snowflake Database properties
    - `Remove-FabricSnowflakeDatabase`: Delete Snowflake Database connections
    - `Get-FabricSnowflakeDatabaseDefinition`: Retrieve connection definitions
    - `Update-FabricSnowflakeDatabaseDefinition`: Update connection definitions
  - **Cosmos DB Database** (6 functions): Cosmos DB integration in Fabric
    - `Get-FabricCosmosDBDatabase`: List and retrieve Cosmos DB Databases
    - `New-FabricCosmosDBDatabase`: Create new Cosmos DB Database connections
    - `Update-FabricCosmosDBDatabase`: Update Cosmos DB Database properties
    - `Remove-FabricCosmosDBDatabase`: Delete Cosmos DB Database connections
    - `Get-FabricCosmosDBDatabaseDefinition`: Retrieve connection definitions
    - `Update-FabricCosmosDBDatabaseDefinition`: Update connection definitions

- **Admin API Functions** (8 new functions): Tenant-wide administration capabilities
  - `Get-FabricAdminWorkspace`: List all workspaces in tenant with filtering by name, type, capacity, and state
  - `Get-FabricAdminItem`: List all items in tenant with filtering by workspace, capacity, type, and state
  - `Get-FabricAdminReport`: List all reports in tenant with filtering by workspace
  - `Get-FabricAdminWorkspaceUser`: Get users with access to any workspace
  - `Get-FabricAdminGitConnection`: List all Git connections in tenant
  - `Get-FabricAdminItemUser`: Get users with access to any item
  - `Get-FabricAdminUserAccess`: List items a specific user can access
  - `Restore-FabricAdminWorkspace`: Restore deleted workspaces

- **Format File Updates**: Added PSTypeName support for new resource types
  - `MicrosoftFabric.GraphModel`
  - `MicrosoftFabric.SnowflakeDatabase`
  - `MicrosoftFabric.CosmosDBDatabase`
  - `MicrosoftFabric.AdminWorkspace`
  - `MicrosoftFabric.AdminItem`
  - `MicrosoftFabric.AdminReport`
  - `MicrosoftFabric.AdminWorkspaceUser`
  - `MicrosoftFabric.AdminGitConnection`
  - `MicrosoftFabric.AdminItemUser`
  - `MicrosoftFabric.AdminUserAccess`

- **Intelligent Output Formatting System**: Automatic formatting of Get-* cmdlet output with resolved GUIDs to human-readable names
  - Format views for Items, Workspaces, Capacities, Domains, Role Assignments, and Jobs
  - Displays: Capacity Name, Workspace Name, Item Name, Type, and ID in consistent format
  - Automatic name resolution with intelligent caching for optimal performance

- **Public Helper Functions** (3 new functions exported):
  - `Resolve-FabricCapacityName`: Converts capacity GUIDs to display names with caching
  - `Resolve-FabricWorkspaceName`: Converts workspace GUIDs to display names with caching
  - `Resolve-FabricCapacityIdFromWorkspace`: Cascading resolution for items without direct capacityId
  - All functions use PSFramework configuration for caching (persists across sessions)
  - Comprehensive documentation added for all three functions

- **Cascading Resolution**: Items that only return workspaceId (Lakehouse, Notebook, etc.) now display Capacity Name by cascading through workspace to get capacityId

- **Format Views** (6 views in MicrosoftFabricMgmt.Format.ps1xml):
  - `FabricItemView`: For 32 item types (Lakehouse, Notebook, Warehouse, Environment, Report, etc.)
  - `WorkspaceView`: For workspace objects
  - `CapacityView`: For capacity objects
  - `DomainView`: For domain objects
  - `RoleAssignmentView`: For workspace role assignments (NEW)
  - `JobView`: For job-related objects

- **Formatted Output** applied to 11 Get-* functions:
  - Get-FabricLakehouse
  - Get-FabricNotebook
  - Get-FabricWarehouse
  - Get-FabricWorkspace
  - Get-FabricCapacity
  - Get-FabricWorkspaceRoleAssignment (includes workspaceId for name resolution)
  - Get-FabricEnvironment
  - Get-FabricEventhouse
  - Get-FabricApacheAirflowJob
  - Get-FabricGraphQLApi
  - Get-FabricEventstream

- **Documentation**:
  - [Resolve-FabricCapacityName.md](docs/Resolve-FabricCapacityName.md) - Complete cmdlet documentation
  - [Resolve-FabricWorkspaceName.md](docs/Resolve-FabricWorkspaceName.md) - Complete cmdlet documentation
  - [Resolve-FabricCapacityIdFromWorkspace.md](docs/Resolve-FabricCapacityIdFromWorkspace.md) - Cascading resolution documentation
  - [OUTPUT-FORMATTING.md](docs/OUTPUT-FORMATTING.md) - Updated with cascading resolution details
  - [PHASE6_FORMATTING_COMPLETION.md](PHASE6_FORMATTING_COMPLETION.md) - Roadmap for remaining 23 functions

### Changed

- **Pipeline Support**: All new functions support PowerShell pipeline with `ValueFromPipelineByPropertyName`
  - WorkspaceId parameters accept pipeline input with `Alias('id')` for seamless piping
  - Item ID parameters support piping from Get-* functions
  - Example: `Get-FabricWorkspace | Get-FabricGraphModel` works naturally
- **Admin Functions**: Use `Select-FabricResource` helper for consistent filtering and type decoration
- **Select-FabricResource**: Enhanced with optional `-TypeName` parameter for automatic type decoration
- **Module Manifest**: Exported 3 new public helper functions (Resolve-FabricCapacityName, Resolve-FabricWorkspaceName, Resolve-FabricCapacityIdFromWorkspace)
- **Module Manifest**: Added `FormatsToProcess = @('MicrosoftFabricMgmt.Format.ps1xml')` to load format file
- **Get-FabricWorkspaceRoleAssignment**: Now returns custom objects with workspaceId for name resolution and type decoration

### Performance Improvements

- **Intelligent Caching**: Name resolutions cached using PSFramework configuration system
  - First lookup: 100-500ms (API call)
  - Cached lookup: <1ms (200-500x faster!)
  - Cache persists across PowerShell sessions
  - Dramatically improves performance for repeated queries
- **Cascading Resolution Caching**: Both levels cached (workspace→capacityId AND capacityId→name)

### Fixed
- **Get-FabricAdminItem**: Fixed pipeline support - WorkspaceId parameter now accepts input from pipeline via `ValueFromPipelineByPropertyName` with `Alias('id')`
- **Get-FabricAdminItem**: Removed warning when no items are returned - now silently returns nothing as per module standards
- **Invoke-FabricAPIRequest**: Added support for `itemEntities` property in response handling (used by Admin API endpoints)
- **Invoke-FabricAPIRequest**: Fixed array conversion error when `Retry-After` header is returned as an array - now handles both single values and arrays correctly
- **Get-FabricAdminItem**: Fixed handling of empty `itemEntities` responses - now correctly returns empty array instead of failing
- Fixed overly restrictive `ValidatePattern` on name parameters across 18 cmdlets to match Microsoft Fabric documentation
  - **Fabric items** (Lakehouse, Warehouse, KQL Database, Tags, Variable Library, Spark Job Definition, SQL Endpoints): Changed pattern from `'^[a-zA-Z0-9_ ]*$'` to `'^[a-zA-Z0-9_]*$'` (removed space support as per Fabric naming restrictions)
  - **Workspaces**: Removed restrictive pattern validation entirely to support broader character set allowed by Fabric workspaces


### Deprecated
### Removed
### Security


## [1.0.2] - 2026-01-07

### Added
### Changed
Minimum PowerShell version 7.0 in module manifest.
### Fixed
### Deprecated
### Removed
Powershell 5.1 support.
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

---

**Contributors:**  
Rob Sewell, Jess Pomfret, Ioana Bouariu, Frank Geisler, and others.

**Note:**
For a full list of changes and details, please see the commit history.
