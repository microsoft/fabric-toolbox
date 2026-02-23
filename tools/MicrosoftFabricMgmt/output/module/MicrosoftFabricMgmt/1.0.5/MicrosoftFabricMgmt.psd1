@{

    # Script module or binary module file associated with this manifest.
    RootModule           = 'MicrosoftFabricMgmt.psm1'

    # Version number of this module.
    ModuleVersion        = '1.0.5'

    # Supported PSEditions
    CompatiblePSEditions = @('Desktop', 'Core')

    # ID used to uniquely identify this module
    GUID                 = 'd0110b5c-cfcc-4bcc-8049-468880cf66c8'

    # Author of this module
    Author               = 'Rob Sewell, Jess Pomfret and Tiago Balabuch on behalf of Fabric Community'

    # Company or vendor of this module
    CompanyName          = 'Microsoft Fabric Mgmt by Fabric Toolbox'

    # Copyright statement for this module
    Copyright            = '2025 Microsoft Fabric Mgmt by Fabric Toolbox'

    # Description of the functionality provided by this module
    Description          = 'PowerShell module for managing Microsoft Fabric resources via the Fabric API. Supports workspaces, lakehouses, warehouses, notebooks, and more.'

    # Minimum version of the PowerShell engine required by this module
    PowerShellVersion    = '7.0'

    # Name of the PowerShell host required by this module
    # PowerShellHostName = ''

    # Minimum version of the PowerShell host required by this module
    # PowerShellHostVersion = ''

    # Minimum version of Microsoft .NET Framework required by this module. This prerequisite is valid for the PowerShell Desktop edition only.
    # DotNetFrameworkVersion = ''

    # Minimum version of the common language runtime (CLR) required by this module. This prerequisite is valid for the PowerShell Desktop edition only.
    # ClrVersion = ''

    # Processor architecture (None, X86, Amd64) required by this module
    # ProcessorArchitecture = ''

    # Modules that must be imported into the global environment prior to importing this module
    # Modules that must be imported into the global environment prior to importing this module
    RequiredModules      = @(
        @{ ModuleName = 'PSFramework'; ModuleVersion = '1.12.345' },
        @{ ModuleName = 'Az.Accounts'; ModuleVersion = '5.0.0' },
        @{ ModuleName = 'Az.Resources'; ModuleVersion = '6.15.1' },
        @{ ModuleName = 'MicrosoftPowerBIMgmt'; ModuleVersion = '1.2.1111' }
    )


    # Assemblies that must be loaded prior to importing this module
    # RequiredAssemblies = @()

    # Script files (.ps1) that are run in the caller's environment prior to importing this module.
    # ScriptsToProcess = @()

    # Type files (.ps1xml) to be loaded when importing this module
    # TypesToProcess = @()

    # Format files (.ps1xml) to be loaded when importing this module
    FormatsToProcess     = @('MicrosoftFabricMgmt.Format.ps1xml')

    # Modules to import as nested modules of the module specified in RootModule/ModuleToProcess
    # NestedModules = @()

    # Functions to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no functions to export.
    FunctionsToExport    = @('Get-FabricAdminGitConnection','Get-FabricAdminItem','Get-FabricAdminItemUser','Get-FabricAdminReport','Get-FabricAdminUserAccess','Get-FabricAdminWorkspace','Get-FabricAdminWorkspaceUser','Restore-FabricAdminWorkspace','Get-FabricApacheAirflowJob','Get-FabricApacheAirflowJobDefinition','New-FabricApacheAirflowJob','Remove-FabricApacheAirflowJob','Update-FabricApacheAirflowJob','Update-FabricApacheAirflowJobDefinition','Get-FabricCapacity','Add-FabricConnectionRoleAssignment','Get-FabricConnection','Get-FabricConnectionSupportedType','Remove-FabricConnection','Remove-FabricConnectionRoleAssignment','Update-FabricConnectionRoleAssignment','Get-FabricCopyJob','Get-FabricCopyJobDefinition','New-FabricCopyJob','Remove-FabricCopyJob','Update-FabricCopyJob','Update-FabricCopyJobDefinition','Get-FabricCosmosDBDatabase','Get-FabricCosmosDBDatabaseDefinition','New-FabricCosmosDBDatabase','Remove-FabricCosmosDBDatabase','Update-FabricCosmosDBDatabase','Update-FabricCosmosDBDatabaseDefinition','Get-FabricDashboard','Get-FabricDataPipeline','New-FabricDataPipeline','Remove-FabricDataPipeline','Update-FabricDataPipeline','Get-FabricDataflow','Get-FabricDataflowDefinition','Get-FabricDataflowParameter','New-FabricDataflow','Remove-FabricDataflow','Start-FabricDataflowJob','Update-FabricDataflow','Update-FabricDataflowDefinition','Get-FabricDatamart','Add-FabricDomainWorkspaceByCapacity','Add-FabricDomainWorkspaceById','Add-FabricDomainWorkspaceByPrincipal','Add-FabricDomainWorkspaceByRoleAssignment','Get-FabricDomain','Get-FabricDomainWorkspace','New-FabricDomain','Remove-FabricDomain','Remove-FabricDomainWorkspace','Remove-FabricDomainWorkspaceRoleAssignment','Update-FabricDomain','Get-FabricEnvironment','Get-FabricEnvironmentLibrary','Get-FabricEnvironmentSparkCompute','Get-FabricEnvironmentStagingLibrary','Get-FabricEnvironmentStagingSparkCompute','Import-FabricEnvironmentStagingLibrary','New-FabricEnvironment','Publish-FabricEnvironment','Remove-FabricEnvironment','Remove-FabricEnvironmentStagingLibrary','Stop-FabricEnvironmentPublish','Update-FabricEnvironment','Update-FabricEnvironmentStagingSparkCompute','Get-FabricEventhouse','Get-FabricEventhouseDefinition','New-FabricEventhouse','Remove-FabricEventhouse','Update-FabricEventhouse','Update-FabricEventhouseDefinition','Get-FabricEventstream','Get-FabricEventstreamDefinition','Get-FabricEventstreamDestination','Get-FabricEventstreamDestinationConnection','Get-FabricEventstreamSource','Get-FabricEventstreamSourceConnection','Get-FabricEventstreamTopology','New-FabricEventstream','Remove-FabricEventstream','Resume-FabricEventstream','Resume-FabricEventstreamDestination','Resume-FabricEventstreamSource','Suspend-FabricEventstream','Suspend-FabricEventstreamDestination','Suspend-FabricEventstreamSource','Update-FabricEventstream','Update-FabricEventstreamDefinition','Get-FabricExternalDataShare','Revoke-FabricExternalDataShare','Get-FabricFolder','Move-FabricFolder','New-FabricFolder','Remove-FabricFolder','Update-FabricFolder','Get-FabricGraphModel','Get-FabricGraphModelDefinition','Get-FabricGraphModelQueryableType','Invoke-FabricGraphModelQuery','New-FabricGraphModel','Remove-FabricGraphModel','Start-FabricGraphModelRefresh','Update-FabricGraphModel','Update-FabricGraphModelDefinition','Get-FabricGraphQLApi','Get-FabricGraphQLApiDefinition','New-FabricGraphQLApi','Remove-FabricGraphQLApi','Update-FabricGraphQLApi','Update-FabricGraphQLApiDefinition','Get-FabricKQLDashboard','Get-FabricKQLDashboardDefinition','New-FabricKQLDashboard','Remove-FabricKQLDashboard','Update-FabricKQLDashboard','Update-FabricKQLDashboardDefinition','Get-FabricKQLDatabase','Get-FabricKQLDatabaseDefinition','New-FabricKQLDatabase','Remove-FabricKQLDatabase','Update-FabricKQLDatabase','Update-FabricKQLDatabaseDefinition','Get-FabricKQLQueryset','Get-FabricKQLQuerysetDefinition','New-FabricKQLQueryset','Remove-FabricKQLQueryset','Update-FabricKQLQueryset','Update-FabricKQLQuerysetDefinition','Remove-FabricLabel','Set-FabricLabel','Get-FabricLakehouse','Get-FabricLakehouseLivySession','Get-FabricLakehouseTable','New-FabricLakehouse','Remove-FabricLakehouse','Start-FabricLakehouseRefreshMaterializedLakeView','Start-FabricLakehouseTableMaintenance','Update-FabricLakehouse','Write-FabricLakehouseTableData','Get-FabricManagedPrivateEndpoint','New-FabricManagedPrivateEndpoint','Remove-FabricManagedPrivateEndpoint','Get-FabricMirroredDatabase','Get-FabricMirroredDatabaseDefinition','Get-FabricMirroredDatabaseStatus','Get-FabricMirroredDatabaseTableStatus','New-FabricMirroredDatabase','Remove-FabricMirroredDatabase','Start-FabricMirroredDatabaseMirroring','Stop-FabricMirroredDatabaseMirroring','Update-FabricMirroredDatabase','Update-FabricMirroredDatabaseDefinition','Get-FabricMirroredWarehouse','Get-FabricMLExperiment','New-FabricMLExperiment','Remove-FabricMLExperiment','Update-FabricMLExperiment','Get-FabricMLModel','New-FabricMLModel','Remove-FabricMLModel','Update-FabricMLModel','Get-FabricMountedDataFactory','Get-FabricMountedDataFactoryDefinition','New-FabricMountedDataFactory','Remove-FabricMountedDataFactory','Update-FabricMountedDataFactory','Update-FabricMountedDataFactoryDefinition','Get-FabricNotebook','Get-FabricNotebookDefinition','Get-FabricNotebookLivySession','New-FabricNotebook','New-FabricNotebookNEW','Remove-FabricNotebook','Update-FabricNotebook','Update-FabricNotebookDefinition','Get-FabricOneLakeDataAccessSecurity','Get-FabricOneLakeShortcut','New-FabricOneLakeShortcut','Remove-FabricOneLakeShortcut','Reset-FabricOneLakeShortcutCache','Set-FabricOneLakeDataAccessSecurity','Get-FabricPaginatedReport','Update-FabricPaginatedReport','Get-FabricReflex','Get-FabricReflexDefinition','New-FabricReflex','Remove-FabricReflex','Update-FabricReflex','Update-FabricReflexDefinition','Get-FabricReport','Get-FabricReportDefinition','New-FabricReport','Remove-FabricReport','Update-FabricReport','Update-FabricReportDefinition','Get-FabricSemanticModel','Get-FabricSemanticModelDefinition','New-FabricSemanticModel','Remove-FabricSemanticModel','Update-FabricSemanticModel','Update-FabricSemanticModelDefinition','Remove-FabricSharingLinks','Remove-FabricSharingLinksBulk','Get-FabricSnowflakeDatabase','Get-FabricSnowflakeDatabaseDefinition','New-FabricSnowflakeDatabase','Remove-FabricSnowflakeDatabase','Update-FabricSnowflakeDatabase','Update-FabricSnowflakeDatabaseDefinition','Get-FabricSparkCustomPool','Get-FabricSparkLivySession','Get-FabricSparkSettings','Get-FabricSparkWorkspaceSettings','New-FabricSparkCustomPool','Remove-FabricSparkCustomPool','Update-FabricSparkCustomPool','Update-FabricSparkSettings','Update-FabricSparkWorkspaceSettings','Get-FabricSparkJobDefinition','Get-FabricSparkJobDefinitionDefinition','Get-FabricSparkJobDefinitionLivySession','New-FabricSparkJobDefinition','Remove-FabricSparkJobDefinition','Start-FabricSparkJobDefinitionOnDemand','Update-FabricSparkJobDefinition','Update-FabricSparkJobDefinitionDefinition','Get-FabricSQLDatabase','Get-FabricSQLDatabaseConnectionString','Get-FabricSQLDatabaseDefinition','New-FabricSQLDatabase','Remove-FabricSQLDatabase','Start-FabricSQLDatabaseMirroring','Stop-FabricSQLDatabaseMirroring','Update-FabricSQLDatabase','Update-FabricSQLDatabaseDefinition','Get-FabricSQLEndpoint','Get-FabricSQLEndpointConnectionString','Update-FabricSQLEndpointMetadata','Get-FabricTag','New-FabricTag','Remove-FabricTag','Update-FabricTag','Get-FabricCapacityTenantSettingOverrides','Get-FabricDomainTenantSettingOverrides','Get-FabricTenantSetting','Get-FabricTenantSettingOverridesCapacity','Get-FabricWorkspaceTenantSettingOverrides','Revoke-FabricCapacityTenantSettingOverrides','Update-FabricCapacityTenantSettingOverrides','Update-FabricTenantSetting','Get-FabricUserListAccessEntities','Clear-FabricNameCache','Convert-FromBase64','Convert-ToBase64','Get-FabricLongRunningOperation','Get-FabricLongRunningOperationResult','Invoke-FabricAPIRequest','Resolve-FabricCapacityIdFromWorkspace','Resolve-FabricCapacityName','Resolve-FabricWorkspaceName','Set-FabricApiHeaders','Get-FabricVariableLibrary','Get-FabricVariableLibraryDefinition','New-FabricVariableLibrary','Remove-FabricVariableLibrary','Update-FabricVariableLibrary','Get-FabricWarehouse','Get-FabricWarehouseConnectionString','Get-FabricWarehouseSnapshot','New-FabricWarehouse','New-FabricWarehouseSnapshot','Remove-FabricWarehouse','Remove-FabricWarehouseSnapshot','Update-FabricWarehouse','Update-FabricWarehouseSnapshot','Add-FabricWorkspaceCapacity','Add-FabricWorkspaceIdentity','Add-FabricWorkspaceRoleAssignment','Get-FabricWorkspace','Get-FabricWorkspaceAsAdmin','Get-FabricWorkspaceGitConnection','Get-FabricWorkspaceRoleAssignment','New-FabricWorkspace','Remove-FabricWorkspace','Remove-FabricWorkspaceCapacity','Remove-FabricWorkspaceIdentity','Remove-FabricWorkspaceRoleAssignment','Update-FabricWorkspace','Update-FabricWorkspaceRoleAssignment')

    # Cmdlets to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no cmdlets to export.
    CmdletsToExport      = @()

    # Variables to export from this module
    VariablesToExport    = 'FabricConfig'

    # Aliases to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no aliases to export.
    AliasesToExport      = @('Get-FileDefinitionParts','Assign-FabricDomainWorkspaceByCapacity','Assign-FabricDomainWorkspaceByRoleAssignment','Unassign-FabricDomainWorkspace','Unassign-FabricDomainWorkspaceByRoleAssignment','Get-FabricExternalDataShares','Load-FabricLakehouseTable','Assign-FabricWorkspaceCapacity')

    # DSC resources to export from this module
    # DscResourcesToExport = @()

    # List of all modules packaged with this module
    # ModuleList = @()

    # List of all files packaged with this module
    # FileList = @()

    # Private data to pass to the module specified in RootModule/ModuleToProcess. This may also contain a PSData hashtable with additional module metadata used by PowerShell.
    PrivateData          = @{

        PSData = @{

            # Tags applied to this module. These help with module discovery in online galleries.
            # Tags = @()

            # A URL to the license for this module.
            LicenseUri   = 'https://github.com/microsoft/fabric-toolbox/blob/main/tools/MicrosoftFabricMgmt/LICENSE'

            # A URL to the main website for this project.
            ProjectUri   = 'https://github.com/microsoft/fabric-toolbox/'

            # A URL to an icon representing this module.
            # IconUri = ''

            # Tags applied to this module. These help with module discovery in online galleries.
            # Tags = @()

            # A URL to the license for this module.
            # LicenseUri = ''

            # A URL to the main website for this project.
            # ProjectUri = ''

            # A URL to an icon representing this module.
            # IconUri = ''

            # ReleaseNotes of this module
            ReleaseNotes = '## [1.0.5] - 2026-02-23
### Added

- **Pipeline Support for all Remove-* functions**: All 46 `Remove-*` functions now fully support PowerShell pipeline input, enabling patterns like:
  ```powershell
  Get-FabricLakehouse -WorkspaceId $wsId | Where-Object { $_.displayName -like ''test*'' } | Remove-FabricLakehouse
  Get-FabricWorkspace -WorkspaceName ''OldWorkspace'' | Remove-FabricWorkspace
  ```
  - All resource ID parameters now have `ValueFromPipeline = $true` and `ValueFromPipelineByPropertyName = $true`
  - All `WorkspaceId` parameters have `ValueFromPipelineByPropertyName = $true` to bind from piped objects
  - All functions now use proper `process { }` blocks for correct multi-item pipeline processing
  - `[Alias(''id'')]` added to resource ID parameters where missing to enable binding from API response objects
  - Fixed `Remove-FabricWarehouseSnapshot`: moved `[Alias(''id'')]` from `WorkspaceId` to `WarehouseSnapshotId`
  - Fixed `Remove-FabricWorkspace`, `Remove-FabricWorkspaceCapacity`, `Remove-FabricWorkspaceIdentity`: added `[Alias(''id'')]` to `WorkspaceId` so `Get-FabricWorkspace | Remove-Fabric*` pipeline works correctly
  - Fixed `Remove-FabricDomainWorkspace`, `Remove-FabricDomainWorkspaceRoleAssignment`: added `[Alias(''id'')]` to `DomainId` so `Get-FabricDomain | Remove-Fabric*` pipeline works correctly

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
  - WorkspaceId parameters accept pipeline input with `Alias(''id'')` for seamless piping
  - Item ID parameters support piping from Get-* functions
  - Example: `Get-FabricWorkspace | Get-FabricGraphModel` works naturally
- **Admin Functions**: Use `Select-FabricResource` helper for consistent filtering and type decoration
- **Select-FabricResource**: Enhanced with optional `-TypeName` parameter for automatic type decoration
- **Select-FabricResource**: Changed "not found" log messages from `Warning` to `Verbose` — unresolved IDs are expected in mixed-capacity environments
- **Module Manifest**: Exported 3 new public helper functions (Resolve-FabricCapacityName, Resolve-FabricWorkspaceName, Resolve-FabricCapacityIdFromWorkspace)
- **Module Manifest**: Added `FormatsToProcess = @(''MicrosoftFabricMgmt.Format.ps1xml'')` to load format file
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
  - `Resolve-FabricWorkspaceName` also caches the workspace''s capacity ID — a subsequent `Resolve-FabricCapacityIdFromWorkspace` call for the same workspace is served from cache without an API call
  - `Resolve-FabricCapacityIdFromWorkspace` also caches the workspace''s display name — a subsequent `Resolve-FabricWorkspaceName` call for the same workspace is served from cache without an API call

### Fixed
- **Repeated API calls for same capacity/workspace ID**: Fixed a cache miss bug where `Reso'

            # Prerelease string of this module
            # Prerelease = ''

            # Flag to indicate whether the module requires explicit user acceptance for install/update/save
            # RequireLicenseAcceptance = $false

            # External dependent modules of this module
            # ExternalModuleDependencies = @()

        } # End of PSData hashtable

    } # End of PrivateData hashtable

    # HelpInfo URI of this module
    # HelpInfoURI = ''

    # Default prefix for commands exported from this module. Override the default prefix using Import-Module -Prefix.
    # DefaultCommandPrefix = ''

}
