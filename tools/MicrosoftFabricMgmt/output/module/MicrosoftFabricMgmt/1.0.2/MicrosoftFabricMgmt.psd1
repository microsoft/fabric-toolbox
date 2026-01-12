@{

    # Script module or binary module file associated with this manifest.
    RootModule           = 'MicrosoftFabricMgmt.psm1'

    # Version number of this module.
    ModuleVersion        = '1.0.2'

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
    PowerShellVersion    = '5.1'

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
    # FormatsToProcess = @()

    # Modules to import as nested modules of the module specified in RootModule/ModuleToProcess
    # NestedModules = @()

    # Functions to export from this module, for best performance, do not use wildcards and do not delete the entry, use an empty array if there are no functions to export.
    FunctionsToExport    = @('Get-FabricApacheAirflowJob','Get-FabricApacheAirflowJobDefinition','New-FabricApacheAirflowJob','Remove-FabricApacheAirflowJob','Update-FabricApacheAirflowJob','Update-FabricApacheAirflowJobDefinition','Get-FabricCapacity','Add-FabricConnectionRoleAssignment','Get-FabricConnection','Get-FabricConnectionSupportedType','Remove-FabricConnection','Remove-FabricConnectionRoleAssignment','Update-FabricConnectionRoleAssignment','Get-FabricCopyJob','Get-FabricCopyJobDefinition','New-FabricCopyJob','Remove-FabricCopyJob','Update-FabricCopyJob','Update-FabricCopyJobDefinition','Get-FabricDashboard','Get-FabricDataPipeline','New-FabricDataPipeline','Remove-FabricDataPipeline','Update-FabricDataPipeline','Get-FabricDatamart','Add-FabricDomainWorkspaceByCapacity','Add-FabricDomainWorkspaceById','Add-FabricDomainWorkspaceByPrincipal','Add-FabricDomainWorkspaceByRoleAssignment','Get-FabricDomain','Get-FabricDomainWorkspace','New-FabricDomain','Remove-FabricDomain','Remove-FabricDomainWorkspace','Remove-FabricDomainWorkspaceRoleAssignment','Update-FabricDomain','Get-FabricEnvironment','Get-FabricEnvironmentLibrary','Get-FabricEnvironmentSparkCompute','Get-FabricEnvironmentStagingLibrary','Get-FabricEnvironmentStagingSparkCompute','Import-FabricEnvironmentStagingLibrary','New-FabricEnvironment','Publish-FabricEnvironment','Remove-FabricEnvironment','Remove-FabricEnvironmentStagingLibrary','Stop-FabricEnvironmentPublish','Update-FabricEnvironment','Update-FabricEnvironmentStagingSparkCompute','Get-FabricEventhouse','Get-FabricEventhouseDefinition','New-FabricEventhouse','Remove-FabricEventhouse','Update-FabricEventhouse','Update-FabricEventhouseDefinition','Get-FabricEventstream','Get-FabricEventstreamDefinition','Get-FabricEventstreamDestination','Get-FabricEventstreamDestinationConnection','Get-FabricEventstreamSource','Get-FabricEventstreamSourceConnection','Get-FabricEventstreamTopology','New-FabricEventstream','Remove-FabricEventstream','Resume-FabricEventstream','Resume-FabricEventstreamDestination','Resume-FabricEventstreamSource','Suspend-FabricEventstream','Suspend-FabricEventstreamDestination','Suspend-FabricEventstreamSource','Update-FabricEventstream','Update-FabricEventstreamDefinition','Get-FabricExternalDataShare','Revoke-FabricExternalDataShare','Get-FabricFolder','Move-FabricFolder','New-FabricFolder','Remove-FabricFolder','Update-FabricFolder','Get-FabricGraphQLApi','Get-FabricGraphQLApiDefinition','New-FabricGraphQLApi','Remove-FabricGraphQLApi','Update-FabricGraphQLApi','Update-FabricGraphQLApiDefinition','Get-FabricKQLDashboard','Get-FabricKQLDashboardDefinition','New-FabricKQLDashboard','Remove-FabricKQLDashboard','Update-FabricKQLDashboard','Update-FabricKQLDashboardDefinition','Get-FabricKQLDatabase','Get-FabricKQLDatabaseDefinition','New-FabricKQLDatabase','Remove-FabricKQLDatabase','Update-FabricKQLDatabase','Update-FabricKQLDatabaseDefinition','Get-FabricKQLQueryset','Get-FabricKQLQuerysetDefinition','New-FabricKQLQueryset','Remove-FabricKQLQueryset','Update-FabricKQLQueryset','Update-FabricKQLQuerysetDefinition','Remove-FabricLabel','Set-FabricLabel','Get-FabricLakehouse','Get-FabricLakehouseLivySession','Get-FabricLakehouseTable','New-FabricLakehouse','Remove-FabricLakehouse','Start-FabricLakehouseRefreshMaterializedLakeView','Start-FabricLakehouseTableMaintenance','Update-FabricLakehouse','Write-FabricLakehouseTableData','Get-FabricManagedPrivateEndpoint','New-FabricManagedPrivateEndpoint','Remove-FabricManagedPrivateEndpoint','Get-FabricMirroredDatabase','Get-FabricMirroredDatabaseDefinition','Get-FabricMirroredDatabaseStatus','Get-FabricMirroredDatabaseTableStatus','New-FabricMirroredDatabase','Remove-FabricMirroredDatabase','Start-FabricMirroredDatabaseMirroring','Stop-FabricMirroredDatabaseMirroring','Update-FabricMirroredDatabase','Update-FabricMirroredDatabaseDefinition','Get-FabricMirroredWarehouse','Get-FabricMLExperiment','New-FabricMLExperiment','Remove-FabricMLExperiment','Update-FabricMLExperiment','Get-FabricMLModel','New-FabricMLModel','Remove-FabricMLModel','Update-FabricMLModel','Get-FabricMountedDataFactory','Get-FabricMountedDataFactoryDefinition','New-FabricMountedDataFactory','Remove-FabricMountedDataFactory','Update-FabricMountedDataFactory','Update-FabricMountedDataFactoryDefinition','Get-FabricNotebook','Get-FabricNotebookDefinition','Get-FabricNotebookLivySession','New-FabricNotebook','New-FabricNotebookNEW','Remove-FabricNotebook','Update-FabricNotebook','Update-FabricNotebookDefinition','Get-FabricOneLakeDataAccessSecurity','Get-FabricOneLakeShortcut','New-FabricOneLakeShortcut','Remove-FabricOneLakeShortcut','Reset-FabricOneLakeShortcutCache','Set-FabricOneLakeDataAccessSecurity','Get-FabricPaginatedReport','Update-FabricPaginatedReport','Get-FabricReflex','Get-FabricReflexDefinition','New-FabricReflex','Remove-FabricReflex','Update-FabricReflex','Update-FabricReflexDefinition','Get-FabricReport','Get-FabricReportDefinition','New-FabricReport','Remove-FabricReport','Update-FabricReport','Update-FabricReportDefinition','Get-FabricSemanticModel','Get-FabricSemanticModelDefinition','New-FabricSemanticModel','Remove-FabricSemanticModel','Update-FabricSemanticModel','Update-FabricSemanticModelDefinition','Remove-FabricSharingLinks','Remove-FabricSharingLinksBulk','Get-FabricSparkCustomPool','Get-FabricSparkLivySession','Get-FabricSparkSettings','Get-FabricSparkWorkspaceSettings','New-FabricSparkCustomPool','Remove-FabricSparkCustomPool','Update-FabricSparkCustomPool','Update-FabricSparkSettings','Update-FabricSparkWorkspaceSettings','Get-FabricSparkJobDefinition','Get-FabricSparkJobDefinitionDefinition','Get-FabricSparkJobDefinitionLivySession','New-FabricSparkJobDefinition','Remove-FabricSparkJobDefinition','Start-FabricSparkJobDefinitionOnDemand','Update-FabricSparkJobDefinition','Update-FabricSparkJobDefinitionDefinition','Get-FabricSQLEndpoint','Get-FabricSQLEndpointConnectionString','Update-FabricSQLEndpointMetadata','Get-FabricTag','New-FabricTag','Remove-FabricTag','Update-FabricTag','Get-FabricCapacityTenantSettingOverrides','Get-FabricDomainTenantSettingOverrides','Get-FabricTenantSetting','Get-FabricTenantSettingOverridesCapacity','Get-FabricWorkspaceTenantSettingOverrides','Revoke-FabricCapacityTenantSettingOverrides','Update-FabricCapacityTenantSettingOverrides','Update-FabricTenantSetting','Get-FabricUserListAccessEntities','Convert-FromBase64','Convert-ToBase64','Get-FabricLongRunningOperation','Get-FabricLongRunningOperationResult','Invoke-FabricAPIRequest','Set-FabricApiHeaders','Get-FabricVariableLibrary','Get-FabricVariableLibraryDefinition','New-FabricVariableLibrary','Remove-FabricVariableLibrary','Update-FabricVariableLibrary','Get-FabricWarehouse','Get-FabricWarehouseConnectionString','Get-FabricWarehouseSnapshot','New-FabricWarehouse','New-FabricWarehouseSnapshot','Remove-FabricWarehouse','Remove-FabricWarehouseSnapshot','Update-FabricWarehouse','Update-FabricWarehouseSnapshot','Add-FabricWorkspaceCapacity','Add-FabricWorkspaceIdentity','Add-FabricWorkspaceRoleAssignment','Get-FabricWorkspace','Get-FabricWorkspaceGitConnection','Get-FabricWorkspaceRoleAssignment','New-FabricWorkspace','Remove-FabricWorkspace','Remove-FabricWorkspaceCapacity','Remove-FabricWorkspaceIdentity','Remove-FabricWorkspaceRoleAssignment','Update-FabricWorkspace','Update-FabricWorkspaceRoleAssignment')

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
            ReleaseNotes = '## [1.0.2] - 2026-01-12

### Added
### Changed
### Fixed
### Deprecated
### Removed
### Security

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
