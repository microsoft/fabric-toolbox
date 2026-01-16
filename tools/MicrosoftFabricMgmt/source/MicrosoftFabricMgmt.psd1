@{

    # Script module or binary module file associated with this manifest.
    RootModule           = 'MicrosoftFabricMgmt.psm1'

    # Version number of this module.
    ModuleVersion        = '1.0.3'

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
        @{ ModuleName = 'PSFramework'; ModuleVersion = '1.12.0' },
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
    FunctionsToExport    = 'Get-FabricApacheAirflowJob',
    'Get-FabricApacheAirflowJobDefinition',
    'New-FabricApacheAirflowJob', 'Remove-FabricApacheAirflowJob',
    'Update-FabricApacheAirflowJob', 'Update-FabricCopyJobDefinition',
    'Get-FabricCapacity', 'Add-FabricConnectionRoleAssignment',
    'Get-FabricConnection', 'Get-FabricConnectionSupportedType',
    'Remove-FabricConnection', 'Remove-FabricConnectionRoleAssignment',
    'Update-FabricConnectionRoleAssignment', 'Get-FabricCopyJob',
    'Get-FabricCopyJobDefinition', 'New-FabricCopyJob',
    'Remove-FabricCopyJob', 'Update-FabricCopyJob',
    'Update-FabricCopyJobDefinition', 'Get-FabricDashboard',
    'Get-FabricDataPipeline', 'New-FabricDataPipeline',
    'Remove-FabricDataPipeline', 'Update-FabricDataPipeline',
    'Get-FabricDatamart', 'Assign-FabricDomainWorkspaceByCapacity',
    'Assign-FabricDomainWorkspaceById',
    'Assign-FabricDomainWorkspaceByPrincipal',
    'Assign-FabricDomainWorkspaceRoleAssignment', 'Get-FabricDomain',
    'Get-FabricDomainWorkspace', 'New-FabricDomain',
    'Remove-FabricDomain', 'Unassign-FabricDomainWorkspace',
    'Unassign-FabricDomainWorkspaceRoleAssignment',
    'Update-FabricDomain', 'Get-FabricEnvironment',
    'Get-FabricEnvironmentLibrary', 'Get-FabricEnvironmentSparkCompute',
    'Get-FabricEnvironmentStagingLibrary',
    'Get-FabricEnvironmentStagingSparkCompute', 'New-FabricEnvironment',
    'Publish-FabricEnvironment', 'Remove-FabricEnvironment',
    'Remove-FabricEnvironmentStagingLibrary',
    'Stop-FabricEnvironmentPublish', 'Update-FabricEnvironment',
    'Update-FabricEnvironmentStagingSparkCompute',
    'Upload-FabricEnvironmentStagingLibrary', 'Get-FabricEventhouse',
    'Get-FabricEventhouseDefinition', 'New-FabricEventhouse',
    'Remove-FabricEventhouse', 'Update-FabricEventhouse',
    'Update-FabricEventhouseDefinition', 'Get-FabricEventstream',
    'Get-FabricEventstreamDefinition',
    'Get-FabricEventstreamDestination',
    'Get-FabricEventstreamDestinationConnection',
    'Get-FabricEventstreamSource',
    'Get-FabricEventstreamSourceConnection',
    'Get-FabricEventstreamTopology', 'New-FabricEventstream',
    'Remove-FabricEventstream', 'Resume-FabricEventstream',
    'Resume-FabricEventstreamDestination',
    'Resume-FabricEventstreamSource', 'Suspend-FabricEventstream',
    'Suspend-FabricEventstreamDestination',
    'Suspend-FabricEventstreamSource', 'Update-FabricEventstream',
    'Update-FabricEventstreamDefinition', 'Get-FabricExternalDataShare',
    'Revoke-FabricExternalDataShare', 'Get-FabricFolder',
    'Move-FabricFolder', 'New-FabricFolder', 'Remove-FabricFolder',
    'Update-FabricFolder', 'Get-FabricGraphQLApi',
    'Get-FabricGraphQLApiDefinition', 'New-FabricGraphQLApi',
    'Remove-FabricGraphQLApi', 'Update-FabricGraphQLApi',
    'Update-FabricGraphQLApiDefinition', 'Get-FabricKQLDashboard',
    'Get-FabricKQLDashboardDefinition', 'New-FabricKQLDashboard',
    'Remove-FabricKQLDashboard', 'Update-FabricKQLDashboard',
    'Update-FabricKQLDashboardDefinition', 'Get-FabricKQLDatabase',
    'Get-FabricKQLDatabaseDefinition', 'New-FabricKQLDatabase',
    'Remove-FabricKQLDatabase', 'Update-FabricKQLDatabase',
    'Update-FabricKQLDatabaseDefinition', 'Get-FabricKQLQueryset',
    'Get-FabricKQLQuerysetDefinition', 'New-FabricKQLQueryset',
    'Remove-FabricKQLQueryset', 'Update-FabricKQLQueryset',
    'Update-FabricKQLQuerysetDefinition', 'Remove-FabricLabel',
    'Set-FabricLabel', 'Get-FabricLakehouse',
    'Get-FabricLakehouseLivySession', 'Get-FabricLakehouseTable',
    'Load-FabricLakehouseTable', 'New-FabricLakehouse',
    'Remove-FabricLakehouse',
    'Start-FabricLakehouseRefreshMaterializedLakeView',
    'Start-FabricLakehouseTableMaintenance', 'Update-FabricLakehouse',
    'Get-FabricManagedPrivateEndpoint',
    'New-FabricManagedPrivateEndpoint',
    'Remove-FabricManagedPrivateEndpoint', 'Get-FabricMirroredDatabase',
    'Get-FabricMirroredDatabaseDefinition',
    'Get-FabricMirroredDatabaseStatus',
    'Get-FabricMirroredDatabaseTableStatus',
    'New-FabricMirroredDatabase', 'Remove-FabricMirroredDatabase',
    'Start-FabricMirroredDatabaseMirroring',
    'Stop-FabricMirroredDatabaseMirroring',
    'Update-FabricMirroredDatabase',
    'Update-FabricMirroredDatabaseDefinition',
    'Get-FabricMirroredWarehouse', 'Get-FabricMLExperiment',
    'New-FabricMLExperiment', 'Remove-FabricMLExperiment',
    'Update-FabricMLExperiment', 'Get-FabricMLModel', 'New-FabricMLModel',
    'Remove-FabricMLModel', 'Update-FabricMLModel',
    'Get-FabricMountedDataFactory',
    'Get-FabricMountedDataFactoryDefinition',
    'New-FabricMountedDataFactory', 'Remove-FabricMountedDataFactory',
    'Update-FabricMountedDataFactory',
    'Update-FabricMountedDataFactoryDefinition', 'Get-FabricNotebook',
    'Get-FabricNotebookDefinition', 'Get-FabricNotebookLivySession',
    'New-FabricNotebook', 'New-FabricNotebookNEW',
    'Remove-FabricNotebook', 'Update-FabricNotebook',
    'Update-FabricNotebookDefinition',
    'Get-FabricOneLakeDataAccessSecurity', 'Get-FabricOneLakeShortcut',
    'New-FabricOneLakeShortcut', 'Remove-FabricOneLakeShortcut',
    'Reset-FabricOneLakeShortcutCache',
    'Set-FabricOneLakeDataAccessSecurity', 'Get-FabricPaginatedReport',
    'Update-FabricPaginatedReport', 'Get-FabricReflex',
    'Get-FabricReflexDefinition', 'New-FabricReflex',
    'Remove-FabricReflex', 'Update-FabricReflex',
    'Update-FabricReflexDefinition', 'Get-FabricReport',
    'Get-FabricReportDefinition', 'New-FabricReport',
    'Remove-FabricReport', 'Update-FabricReport',
    'Update-FabricReportDefinition', 'Get-FabricSemanticModel',
    'Get-FabricSemanticModelDefinition', 'New-FabricSemanticModel',
    'Remove-FabricSemanticModel', 'Update-FabricSemanticModel',
    'Update-FabricSemanticModelDefinition',
    'Remove-FabricBulkSharingLinks', 'Remove-FabricSharingLinks',
    'Get-FabricSparkCustomPool', 'Get-FabricSparkLivySession',
    'Get-FabricSparkSettings', 'Get-FabricSparkWorkspaceSettings',
    'New-FabricSparkCustomPool', 'Remove-FabricSparkCustomPool',
    'Update-FabricSparkCustomPool', 'Update-FabricSparkSettings',
    'Update-FabricSparkWorkspaceSettings',
    'Get-FabricSparkJobDefinition',
    'Get-FabricSparkJobDefinitionDefinition',
    'Get-FabricSparkJobDefinitionLivySession',
    'New-FabricSparkJobDefinition', 'Remove-FabricSparkJobDefinition',
    'Start-FabricSparkJobDefinitionOnDemand',
    'Update-FabricSparkJobDefinition',
    'Update-FabricSparkJobDefinitionDefinition',
    'Get-FabricSQLEndpoint', 'Get-FabricSQLEndpointConnectionString',
    'Update-FabricSQLEndpointMetadata', 'Get-FabricTag', 'New-FabricTag',
    'Remove-FabricTag', 'Update-FabricTag',
    'Get-FabricCapacityTenantSettingOverrides',
    'Get-FabricDomainTenantSettingOverrides', 'Get-FabricTenantSetting',
    'Get-FabricTenantSettingOverridesCapacity',
    'Get-FabricWorkspaceTenantSettingOverrides',
    'Revoke-FabricCapacityTenantSettingOverrides',
    'Update-FabricCapacityTenantSettingOverrides',
    'Update-FabricTenantSetting', 'Get-FabricUserListAccessEntities',
    'Convert-FromBase64', 'Convert-ToBase64',
    'Get-FabricLongRunningOperation',
    'Get-FabricLongRunningOperationResult', 'Invoke-FabricAPIRequest',
    'Set-FabricApiHeaders', 'Clear-FabricNameCache',
    'Resolve-FabricCapacityName', 'Resolve-FabricWorkspaceName',
    'Resolve-FabricCapacityIdFromWorkspace', 'Get-FabricVariableLibrary',
    'Get-FabricVariableLibraryDefinition', 'New-FabricVariableLibrary',
    'Remove-FabricVariableLibrary', 'Update-FabricVariableLibrary',
    'Get-FabricWarehouse', 'Get-FabricWarehouseConnectionString',
    'Get-FabricWarehouseSnapshot', 'New-FabricWarehouse',
    'New-FabricWarehouseSnapshot', 'Remove-FabricWarehouse',
    'Remove-FabricWarehouseSnapshot', 'Update-FabricWarehouse',
    'Update-FabricWarehouseSnapshot', 'Add-FabricWorkspaceIdentity',
    'Add-FabricWorkspaceRoleAssignment',
    'Assign-FabricWorkspaceCapacity', 'Get-FabricWorkspace',
    'Get-FabricWorkspaceGitConnection',
    'Get-FabricWorkspaceRoleAssignment', 'New-FabricWorkspace',
    'Remove-FabricWorkspace', 'Remove-FabricWorkspaceIdentity',
    'Remove-FabricWorkspaceRoleAssignment',
    'Unassign-FabricWorkspaceCapacity', 'Update-FabricWorkspace',
    'Update-FabricWorkspaceRoleAssignment'

    # Cmdlets to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no cmdlets to export.
    CmdletsToExport      = @()

    # Variables to export from this module
    VariablesToExport    = 'FabricConfig'

    # Aliases to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no aliases to export.
    AliasesToExport      = @()

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
            ReleaseNotes = '# Changelog for MicrosoftFabricMgmt

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
- **BREAKING**: Removed custom `Write-Message` function - All logging now uses PSFrameworks `Write-PSFMessage`
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
  - Added `RequiredModules  dependency
  - Added `CompatiblePSEditions  for explicit PS 5.1 and 7+ support
  - Updated `PowerShellVersion ` minimum requirement
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
- **All Logging**: Migrated from custom `Write-Message` to PSFrameworks `Write-PSFMessage`
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
'

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
