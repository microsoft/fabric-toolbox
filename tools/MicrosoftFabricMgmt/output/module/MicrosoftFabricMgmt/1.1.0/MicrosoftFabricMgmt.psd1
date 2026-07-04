@{

    # Script module or binary module file associated with this manifest.
    RootModule           = 'MicrosoftFabricMgmt.psm1'

    # Version number of this module.
    ModuleVersion        = '1.1.0'

    # Supported PSEditions
    CompatiblePSEditions = @('Core')

    # ID used to uniquely identify this module
    GUID                 = 'd0110b5c-cfcc-4bcc-8049-468880cf66c8'

    # Author of this module
    Author               = 'Rob Sewell, Jess Pomfret and Tiago Balabuch on behalf of Fabric Community'

    # Company or vendor of this module
    CompanyName          = 'Microsoft Fabric Mgmt by Fabric Toolbox'

    # Copyright statement for this module
    Copyright            = '2026 Microsoft Fabric Mgmt by Fabric Toolbox'

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
    FunctionsToExport    = @('Add-FabricAdminCapacityWorkspace','Add-FabricAdminPipelineUser','Add-FabricAdminWorkspaceUser','Export-FabricAdminDataflow','Get-FabricAdminActivityEvent','Get-FabricAdminApp','Get-FabricAdminAppUser','Get-FabricAdminCapacity','Get-FabricAdminCapacityUser','Get-FabricAdminDashboard','Get-FabricAdminDashboardSubscription','Get-FabricAdminDashboardTile','Get-FabricAdminDashboardUser','Get-FabricAdminDataflow','Get-FabricAdminDataflowDatasource','Get-FabricAdminDataflowUpstream','Get-FabricAdminDataflowUser','Get-FabricAdminDataset','Get-FabricAdminDatasetDataflowLink','Get-FabricAdminDatasetDatasource','Get-FabricAdminDatasetUser','Get-FabricAdminEncryptionKey','Get-FabricAdminGateway','Get-FabricAdminGatewayDatasource','Get-FabricAdminGatewayDatasourceById','Get-FabricAdminGatewayInventory','Get-FabricAdminGitConnection','Get-FabricAdminImport','Get-FabricAdminItem','Get-FabricAdminItemUser','Get-FabricAdminModifiedWorkspace','Get-FabricAdminPipeline','Get-FabricAdminPipelineUser','Get-FabricAdminProfile','Get-FabricAdminRefreshable','Get-FabricAdminReport','Get-FabricAdminReportSubscription','Get-FabricAdminReportUser','Get-FabricAdminUserAccess','Get-FabricAdminUserArtifactAccess','Get-FabricAdminUserSubscription','Get-FabricAdminWidelySharedArtifactLink','Get-FabricAdminWidelySharedArtifactWeb','Get-FabricAdminWorkspace','Get-FabricAdminWorkspaceScanResult','Get-FabricAdminWorkspaceScanStatus','Get-FabricAdminWorkspaceUnusedArtifact','Get-FabricAdminWorkspaceUser','New-FabricAdminEncryptionKey','Remove-FabricAdminCapacityWorkspace','Remove-FabricAdminInformationProtectionLabel','Remove-FabricAdminPipelineUser','Remove-FabricAdminProfile','Remove-FabricAdminWorkspaceUser','Restore-FabricAdminWorkspace','Set-FabricAdminInformationProtectionLabel','Start-FabricAdminEncryptionKeyRotation','Start-FabricAdminWorkspaceScan','Update-FabricAdminCapacity','Update-FabricAdminPipelineUser','Update-FabricAdminWorkspace','Get-FabricAnomalyDetector','Get-FabricAnomalyDetectorDefinition','New-FabricAnomalyDetector','Remove-FabricAnomalyDetector','Update-FabricAnomalyDetector','Update-FabricAnomalyDetectorDefinition','Get-FabricApacheAirflowJob','Get-FabricApacheAirflowJobDefinition','New-FabricApacheAirflowJob','Remove-FabricApacheAirflowJob','Update-FabricApacheAirflowJob','Update-FabricApacheAirflowJobDefinition','Get-FabricCapacity','Add-FabricConnectionRoleAssignment','Get-FabricConnection','Get-FabricConnectionSupportedType','New-FabricConnection','Remove-FabricConnection','Remove-FabricConnectionRoleAssignment','Update-FabricConnection','Update-FabricConnectionRoleAssignment','Get-FabricCopyJob','Get-FabricCopyJobDefinition','New-FabricCopyJob','Remove-FabricCopyJob','Update-FabricCopyJob','Update-FabricCopyJobDefinition','Get-FabricCosmosDBDatabase','Get-FabricCosmosDBDatabaseDefinition','New-FabricCosmosDBDatabase','Remove-FabricCosmosDBDatabase','Update-FabricCosmosDBDatabase','Update-FabricCosmosDBDatabaseDefinition','Get-FabricDashboard','Get-FabricDataPipeline','Get-FabricDataPipelineDefinition','New-FabricDataPipeline','Remove-FabricDataPipeline','Update-FabricDataPipeline','Update-FabricDataPipelineDefinition','Get-FabricDataflow','Get-FabricDataflowDefinition','Get-FabricDataflowParameter','New-FabricDataflow','Remove-FabricDataflow','Start-FabricDataflowJob','Update-FabricDataflow','Update-FabricDataflowDefinition','Get-FabricDatamart','Add-FabricDeploymentPipelineRoleAssignment','Add-FabricDeploymentPipelineStageWorkspace','Get-FabricDeploymentPipeline','Get-FabricDeploymentPipelineOperation','Get-FabricDeploymentPipelineRoleAssignment','Get-FabricDeploymentPipelineStage','Get-FabricDeploymentPipelineStageItem','Invoke-FabricDeploymentPipelineDeploy','New-FabricDeploymentPipeline','Remove-FabricDeploymentPipeline','Remove-FabricDeploymentPipelineRoleAssignment','Remove-FabricDeploymentPipelineStageWorkspace','Update-FabricDeploymentPipeline','Update-FabricDeploymentPipelineStage','Get-FabricDigitalTwinBuilder','Get-FabricDigitalTwinBuilderDefinition','New-FabricDigitalTwinBuilder','Remove-FabricDigitalTwinBuilder','Update-FabricDigitalTwinBuilder','Update-FabricDigitalTwinBuilderDefinition','Get-FabricDigitalTwinBuilderFlow','Get-FabricDigitalTwinBuilderFlowDefinition','New-FabricDigitalTwinBuilderFlow','Remove-FabricDigitalTwinBuilderFlow','Update-FabricDigitalTwinBuilderFlow','Update-FabricDigitalTwinBuilderFlowDefinition','Add-FabricDomainWorkspaceByCapacity','Add-FabricDomainWorkspaceById','Add-FabricDomainWorkspaceByPrincipal','Add-FabricDomainWorkspaceByRoleAssignment','Get-FabricDomain','Get-FabricDomainWorkspace','New-FabricDomain','Remove-FabricDomain','Remove-FabricDomainWorkspace','Remove-FabricDomainWorkspaceRoleAssignment','Update-FabricDomain','Get-FabricEnvironment','Get-FabricEnvironmentLibrary','Get-FabricEnvironmentSparkCompute','Get-FabricEnvironmentStagingLibrary','Get-FabricEnvironmentStagingSparkCompute','Import-FabricEnvironmentStagingLibrary','New-FabricEnvironment','Publish-FabricEnvironment','Remove-FabricEnvironment','Remove-FabricEnvironmentStagingLibrary','Stop-FabricEnvironmentPublish','Update-FabricEnvironment','Update-FabricEnvironmentStagingSparkCompute','Get-FabricEventSchemaSet','Get-FabricEventSchemaSetDefinition','New-FabricEventSchemaSet','Remove-FabricEventSchemaSet','Update-FabricEventSchemaSet','Update-FabricEventSchemaSetDefinition','Get-FabricEventhouse','Get-FabricEventhouseDefinition','New-FabricEventhouse','Remove-FabricEventhouse','Update-FabricEventhouse','Update-FabricEventhouseDefinition','Get-FabricEventstream','Get-FabricEventstreamDefinition','Get-FabricEventstreamDestination','Get-FabricEventstreamDestinationConnection','Get-FabricEventstreamSource','Get-FabricEventstreamSourceConnection','Get-FabricEventstreamTopology','New-FabricEventstream','Remove-FabricEventstream','Resume-FabricEventstream','Resume-FabricEventstreamDestination','Resume-FabricEventstreamSource','Suspend-FabricEventstream','Suspend-FabricEventstreamDestination','Suspend-FabricEventstreamSource','Update-FabricEventstream','Update-FabricEventstreamDefinition','Approve-FabricExternalDataShareInvitation','Get-FabricExternalDataShare','Get-FabricExternalDataShareInvitation','New-FabricExternalDataShare','Remove-FabricExternalDataShare','Revoke-FabricExternalDataShare','Get-FabricFolder','Move-FabricFolder','New-FabricFolder','Remove-FabricFolder','Update-FabricFolder','Connect-FabricWorkspaceGit','Disconnect-FabricWorkspaceGit','Get-FabricWorkspaceGitCredential','Get-FabricWorkspaceGitStatus','Initialize-FabricWorkspaceGitConnection','Save-FabricWorkspaceGitCommit','Update-FabricWorkspaceFromGit','Update-FabricWorkspaceGitCredential','Get-FabricGraphModel','Get-FabricGraphModelDefinition','Get-FabricGraphModelQueryableType','Invoke-FabricGraphModelQuery','New-FabricGraphModel','Remove-FabricGraphModel','Start-FabricGraphModelRefresh','Update-FabricGraphModel','Update-FabricGraphModelDefinition','Get-FabricGraphQuerySet','Get-FabricGraphQuerySetDefinition','New-FabricGraphQuerySet','Remove-FabricGraphQuerySet','Update-FabricGraphQuerySet','Update-FabricGraphQuerySetDefinition','Get-FabricGraphQLApi','Get-FabricGraphQLApiDefinition','New-FabricGraphQLApi','Remove-FabricGraphQLApi','Update-FabricGraphQLApi','Update-FabricGraphQLApiDefinition','Get-FabricItem','Get-FabricItemJobInstance','Get-FabricItemSchedule','New-FabricItemSchedule','Remove-FabricItemSchedule','Start-FabricItemJob','Stop-FabricItemJobInstance','Update-FabricItemSchedule','Get-FabricKQLDashboard','Get-FabricKQLDashboardDefinition','New-FabricKQLDashboard','Remove-FabricKQLDashboard','Update-FabricKQLDashboard','Update-FabricKQLDashboardDefinition','Get-FabricKQLDatabase','Get-FabricKQLDatabaseDefinition','New-FabricKQLDatabase','Remove-FabricKQLDatabase','Update-FabricKQLDatabase','Update-FabricKQLDatabaseDefinition','Get-FabricKQLQueryset','Get-FabricKQLQuerysetDefinition','New-FabricKQLQueryset','Remove-FabricKQLQueryset','Update-FabricKQLQueryset','Update-FabricKQLQuerysetDefinition','Remove-FabricLabel','Set-FabricLabel','Get-FabricLakehouse','Get-FabricLakehouseLivySession','Get-FabricLakehouseTable','New-FabricLakehouse','Remove-FabricLakehouse','Start-FabricLakehouseRefreshMaterializedLakeView','Start-FabricLakehouseTableMaintenance','Update-FabricLakehouse','Write-FabricLakehouseTableData','Get-FabricManagedPrivateEndpoint','New-FabricManagedPrivateEndpoint','Remove-FabricManagedPrivateEndpoint','Get-FabricMap','Get-FabricMapDefinition','New-FabricMap','Remove-FabricMap','Update-FabricMap','Update-FabricMapDefinition','Get-FabricMirroredAzureDatabricksCatalog','Get-FabricMirroredAzureDatabricksCatalogDefinition','New-FabricMirroredAzureDatabricksCatalog','Remove-FabricMirroredAzureDatabricksCatalog','Update-FabricMirroredAzureDatabricksCatalog','Update-FabricMirroredAzureDatabricksCatalogDefinition','Get-FabricMirroredDatabase','Get-FabricMirroredDatabaseDefinition','Get-FabricMirroredDatabaseStatus','Get-FabricMirroredDatabaseTableStatus','New-FabricMirroredDatabase','Remove-FabricMirroredDatabase','Start-FabricMirroredDatabaseMirroring','Stop-FabricMirroredDatabaseMirroring','Update-FabricMirroredDatabase','Update-FabricMirroredDatabaseDefinition','Get-FabricMirroredWarehouse','Get-FabricMLExperiment','New-FabricMLExperiment','Remove-FabricMLExperiment','Update-FabricMLExperiment','Disable-FabricMLModelEndpointVersion','Enable-FabricMLModelEndpointVersion','Get-FabricMLModel','Get-FabricMLModelEndpoint','Get-FabricMLModelEndpointVersion','Invoke-FabricMLModelEndpointScore','Invoke-FabricMLModelEndpointVersionScore','New-FabricMLModel','Remove-FabricMLModel','Update-FabricMLModel','Update-FabricMLModelEndpoint','Update-FabricMLModelEndpointVersion','Get-FabricMountedDataFactory','Get-FabricMountedDataFactoryDefinition','New-FabricMountedDataFactory','Remove-FabricMountedDataFactory','Update-FabricMountedDataFactory','Update-FabricMountedDataFactoryDefinition','Get-FabricNotebook','Get-FabricNotebookDefinition','Get-FabricNotebookLivySession','New-FabricNotebook','Remove-FabricNotebook','Update-FabricNotebook','Update-FabricNotebookDefinition','Get-FabricOneLakeDataAccessRole','Get-FabricOneLakeDataAccessSecurity','Get-FabricOneLakeShortcut','New-FabricOneLakeShortcut','Remove-FabricOneLakeShortcut','Reset-FabricOneLakeShortcutCache','Set-FabricOneLakeDataAccessSecurity','Set-FabricOneLakeImmutabilityPolicy','Get-FabricOntology','Get-FabricOntologyDefinition','New-FabricOntology','Remove-FabricOntology','Update-FabricOntology','Update-FabricOntologyDefinition','Get-FabricOperationsAgent','Get-FabricOperationsAgentDefinition','New-FabricOperationsAgent','Remove-FabricOperationsAgent','Update-FabricOperationsAgent','Update-FabricOperationsAgentDefinition','Get-FabricPaginatedReport','Update-FabricPaginatedReport','Get-FabricReflex','Get-FabricReflexDefinition','New-FabricReflex','Remove-FabricReflex','Update-FabricReflex','Update-FabricReflexDefinition','Get-FabricReport','Get-FabricReportDefinition','New-FabricReport','Remove-FabricReport','Update-FabricReport','Update-FabricReportDefinition','Get-FabricSemanticModel','Get-FabricSemanticModelDefinition','New-FabricSemanticModel','Remove-FabricSemanticModel','Update-FabricSemanticModel','Update-FabricSemanticModelDefinition','Remove-FabricSharingLinks','Remove-FabricSharingLinksBulk','Get-FabricSnowflakeDatabase','Get-FabricSnowflakeDatabaseDefinition','New-FabricSnowflakeDatabase','Remove-FabricSnowflakeDatabase','Update-FabricSnowflakeDatabase','Update-FabricSnowflakeDatabaseDefinition','Get-FabricSparkCustomPool','Get-FabricSparkLivySession','Get-FabricSparkSettings','Get-FabricSparkWorkspaceSettings','New-FabricSparkCustomPool','Remove-FabricSparkCustomPool','Update-FabricSparkCustomPool','Update-FabricSparkSettings','Update-FabricSparkWorkspaceSettings','Get-FabricSparkJobDefinition','Get-FabricSparkJobDefinitionDefinition','Get-FabricSparkJobDefinitionLivySession','New-FabricSparkJobDefinition','Remove-FabricSparkJobDefinition','Start-FabricSparkJobDefinitionOnDemand','Update-FabricSparkJobDefinition','Update-FabricSparkJobDefinitionDefinition','Get-FabricSQLDatabase','Get-FabricSQLDatabaseConnectionString','Get-FabricSQLDatabaseDefinition','New-FabricSQLDatabase','Remove-FabricSQLDatabase','Start-FabricSQLDatabaseMirroring','Stop-FabricSQLDatabaseMirroring','Update-FabricSQLDatabase','Update-FabricSQLDatabaseDefinition','Get-FabricSQLEndpoint','Get-FabricSQLEndpointConnectionString','Update-FabricSQLEndpointMetadata','Get-FabricTag','New-FabricTag','Remove-FabricTag','Update-FabricTag','Get-FabricCapacityTenantSettingOverrides','Get-FabricDomainTenantSettingOverrides','Get-FabricTenantSetting','Get-FabricTenantSettingOverridesCapacity','Get-FabricWorkspaceTenantSettingOverrides','Revoke-FabricCapacityTenantSettingOverrides','Update-FabricCapacityTenantSettingOverrides','Update-FabricTenantSetting','Get-FabricUserDataFunction','Get-FabricUserDataFunctionDefinition','New-FabricUserDataFunction','Remove-FabricUserDataFunction','Update-FabricUserDataFunction','Update-FabricUserDataFunctionDefinition','Get-FabricUserListAccessEntities','Clear-FabricNameCache','Convert-FromBase64','Convert-ToBase64','Get-FabricLongRunningOperation','Get-FabricLongRunningOperationResult','Invoke-FabricAPIRequest','Resolve-FabricCapacityIdFromWorkspace','Resolve-FabricCapacityName','Resolve-FabricDatasetName','Resolve-FabricGatewayName','Resolve-FabricWorkspaceName','Set-FabricApiHeaders','Get-FabricVariableLibrary','Get-FabricVariableLibraryDefinition','New-FabricVariableLibrary','Remove-FabricVariableLibrary','Update-FabricVariableLibrary','Get-FabricWarehouse','Get-FabricWarehouseConnectionString','Get-FabricWarehouseRestorePoint','Get-FabricWarehouseSnapshot','New-FabricWarehouse','New-FabricWarehouseRestorePoint','New-FabricWarehouseSnapshot','Remove-FabricWarehouse','Remove-FabricWarehouseRestorePoint','Remove-FabricWarehouseSnapshot','Restore-FabricWarehouseToRestorePoint','Update-FabricWarehouse','Update-FabricWarehouseRestorePoint','Update-FabricWarehouseSnapshot','Add-FabricWorkspaceCapacity','Add-FabricWorkspaceIdentity','Add-FabricWorkspaceRoleAssignment','Get-FabricWorkspace','Get-FabricWorkspaceAsAdmin','Get-FabricWorkspaceGitConnection','Get-FabricWorkspaceRoleAssignment','New-FabricWorkspace','Remove-FabricWorkspace','Remove-FabricWorkspaceCapacity','Remove-FabricWorkspaceIdentity','Remove-FabricWorkspaceRoleAssignment','Update-FabricWorkspace','Update-FabricWorkspaceRoleAssignment','Get-FabricWorkspaceGitOutboundPolicy','Get-FabricWorkspaceNetworkCommunicationPolicy','Get-FabricWorkspaceOutboundConnectionRule','Get-FabricWorkspaceOutboundGatewayRule','Set-FabricWorkspaceGitOutboundPolicy','Set-FabricWorkspaceNetworkCommunicationPolicy','Set-FabricWorkspaceOutboundConnectionRule','Set-FabricWorkspaceOutboundGatewayRule')

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
            ReleaseNotes = '## [1.1.0] - 2026-07-04

### Added

- **Workspace networking commands** (8 new) filling the remaining platform networking gap
  (all preview, under `/workspaces/{workspaceId}/networking/communicationPolicy/...`):
  `Get/Set-FabricWorkspaceNetworkCommunicationPolicy` (full policy; PUT supports optimistic
  concurrency via `-IfMatch`), `Get/Set-FabricWorkspaceOutboundConnectionRule`,
  `Get/Set-FabricWorkspaceOutboundGatewayRule`, and `Get/Set-FabricWorkspaceGitOutboundPolicy`
  (`-IfMatch`). Getters enrich with `WorkspaceName` + a `MicrosoftFabric.*` type and honor `-Raw`;
  setters take hashtable pass-through bodies and support `-WhatIf`/`-Confirm`.
- **`Set-FabricOneLakeImmutabilityPolicy`** (new): `POST /workspaces/{workspaceId}/onelake/settings/modifyImmutabilityPolicy`;
  `-Scope` (DiagnosticLogs) + `-RetentionDays`; supports `-WhatIf`/`-Confirm` and `-Raw`.

### Fixed

- **`Get-FabricAdminWorkspace` filtering**: the `-Filter` parameter (and `-Top`/`-Skip`/`-OrderBy`)
  never worked — the Fabric admin `GET /admin/workspaces` endpoint does not support OData query
  options, so those values were silently ignored. Removed the four phantom parameters and added the
  genuinely-supported `-EncryptionStatus` (auto-sets `-Include encryption`) and `-Include`. Also fixed
  `-WorkspaceName`, which returned nothing because the results were re-filtered client-side on
  `displayName` while the admin API returns `name`; filtering is now server-side via the `name` query
  parameter. Use the named filters (`-CapacityId`/`-WorkspaceName`/`-WorkspaceType`/`-State`/
  `-EncryptionStatus`) or pipe to `Where-Object`/`Select-Object` for client-side work.
- **`scripts/Update-FabricAPISpecsCache.ps1`**: now auto-discovers and downloads the nested
  `./definitions/{name}.json` files each swagger `$ref`s (cached as `{spec}.{name}.definitions.json`)
  — e.g. `platform.workspaceNetworkingPolicy.definitions.json`, connections, deploymentPipelines,
  gitIntegration, externaldatasharing — so the body/response schemas for those operations are
  durably resolvable during validation. 15 nested files fetched (platform, admin, eventstream), 0 failures.
- **`scripts/sync-test-expected-params.ps1` idempotency**: a second run no longer corrupts
  test files. Previously the `param()`-insert fallback ran whenever the regex replacement
  produced no change — including the already-synced case — so re-running duplicated the
  `$expectedParams` block into every synced test file (253 had both a `param()` and the array).
  The branch is now chosen by whether the block exists, the pattern anchors on horizontal
  whitespace so replacement is byte-stable, and the helper (`Set-ExpectedParamsInTest`, renamed
  from the unapproved-verb `Replace-…`) plus the main loop are guarded for dot-source testing.
  New regression suite `tests/Unit/SyncExpectedParams.Tests.ps1`; idempotency also verified
  against the real `tests/Unit` tree (second run: 0 files changed).

### Changed

- **Job-type-in-path modernization**: `Start-FabricLakehouseRefreshMaterializedLakeView`,
  `Start-FabricLakehouseTableMaintenance`, and `Start-FabricSparkJobDefinitionOnDemand` now call
  the preferred `.../jobs/{jobType}/instances` path-segment form instead of the legacy
  `.../jobs/instances?jobType=` query form (both are accepted by the API; the path form is the
  documented shape). Behavior tests assert the new URL and that the query form is gone. Also
  removed a dead undefined-variable body reference in the Spark on-demand function.
- **Display formatting backfill (pass 2)**: `WarehouseSnapshot` (a full item) folded into the
  shared item table/list views; new dedicated views `ItemJobInstanceView` (Workspace / Job Type /
  Status / Invoke Type / Start / ID), `ItemScheduleView`, `LakehouseTableView`, and
  `WarehouseRestorePointView`. Single-object/status/scalar types (networking policies, mirroring
  statuses, Livy sessions, etc.) intentionally remain on default list rendering per the
  "add a view only when a resource needs a distinct table" rule.
- **`Get-FabricAdminRefreshable`**: `-CapacityId` is now optional. When omitted, the org-wide
  refreshables list is returned (`GET /admin/capacities/refreshables`, `$top` defaulted to 1000);
  when supplied, behavior is unchanged. Added `-Expand` (e.g. `capacities`) for both variants.
- **Display formatting backfill** (`MicrosoftFabricMgmt.Format.ps1xml`): the standard item
  resource types `AnomalyDetector`, `DigitalTwinBuilder`, `DigitalTwinBuilderFlow`,
  `EventSchemaSet`, `GraphQuerySet`, `Map`, `MirroredAzureDatabricksCatalog`, `Ontology`,
  `OperationsAgent`, and `UserDataFunction` now render with the shared Capacity/Workspace/Item
  table + list views. Added dedicated `ConnectionView` (Connection Name / Connectivity Type /
  Gateway Name / ID) and `DeploymentPipelineView` (Pipeline Name / Description / ID). Formatting
  is display-only; the enriched object still carries every property.

### Added (earlier this release)

- **Additional resource commands** (19) filling verified coverage gaps:
  - **DataPipeline definition** (2): `Get/Update-FabricDataPipelineDefinition`.
  - **Warehouse restore points** (5): `Get/New/Update/Remove-FabricWarehouseRestorePoint`,
    `Restore-FabricWarehouseToRestorePoint`.
  - **ML Model endpoint** (8): `Get/Update-FabricMLModelEndpoint`,
    `Get/Update-FabricMLModelEndpointVersion`, `Enable/Disable-FabricMLModelEndpointVersion`
    (Disable supports `-All` → deactivateAll), `Invoke-FabricMLModelEndpointScore`,
    `Invoke-FabricMLModelEndpointVersionScore`.
  - **External Data Share** (4): `New-FabricExternalDataShare`, `Remove-FabricExternalDataShare`
    (provider delete, distinct from revoke), `Get-FabricExternalDataShareInvitation`,
    `Approve-FabricExternalDataShareInvitation` (recipient accept).
- **Deployment Pipelines command family** (14 new commands): pipeline CRUD
  (`Get/New/Update/Remove-FabricDeploymentPipeline`), stages
  (`Get/Update-FabricDeploymentPipelineStage`, `Get-FabricDeploymentPipelineStageItem`),
  workspace assignment (`Add/Remove-FabricDeploymentPipelineStageWorkspace`),
  deployment (`Invoke-FabricDeploymentPipelineDeploy`), operations
  (`Get-FabricDeploymentPipelineOperation`), and role assignments
  (`Get/Add/Remove-FabricDeploymentPipelineRoleAssignment`), all under `/deploymentPipelines/...`.
  Deploy `-Items`/`-Options` are hashtable/array pass-throughs; state-changing commands support
  `-WhatIf`/`-Confirm`; getters honor `-Raw` and add a `MicrosoftFabric.*` type.
- **Workspace Git integration command family** (8 new commands): `Connect-FabricWorkspaceGit`,
  `Disconnect-FabricWorkspaceGit`, `Initialize-FabricWorkspaceGitConnection`,
  `Save-FabricWorkspaceGitCommit` (commit workspace → git), `Update-FabricWorkspaceFromGit`
  (update workspace ← git), `Get-FabricWorkspaceGitStatus`, `Get-FabricWorkspaceGitCredential`,
  `Update-FabricWorkspaceGitCredential` (all under `/workspaces/{workspaceId}/git/...`).
  Complex bodies (provider details, commit mode/items, conflict resolution, credentials source)
  are hashtable pass-throughs; state-changing commands support `-WhatIf`/`-Confirm`; getters honor `-Raw`.
- **Job Scheduler command family** (7 new commands) for generic item jobs and schedules:
  `New-FabricItemSchedule`, `Get-FabricItemSchedule`, `Update-FabricItemSchedule`,
  `Remove-FabricItemSchedule` (`.../items/{itemId}/jobs/{jobType}/schedules[/{scheduleId}]`),
  `Start-FabricItemJob` (`POST .../jobs/{jobType}/instances`), `Get-FabricItemJobInstance`
  (`.../jobs/instances[/{jobInstanceId}]`), and `Stop-FabricItemJobInstance`
  (`POST .../jobs/instances/{jobInstanceId}/cancel`). Schedule `-Configuration` and job
  `-ExecutionData` are hashtable pass-throughs; getters enrich WorkspaceName + type and
  honor `-Raw`; state-changing commands support `-WhatIf`/`-Confirm`.
- **`New-FabricConnection`** and **`Update-FabricConnection`**: new commands completing the
  connection CRUD family (Get/Remove/RoleAssignment already existed).
  - `New-FabricConnection` → `POST /connections`; `Update-FabricConnection` → `PATCH /connections/{connectionId}`.
  - The polymorphic (per connectivity type) request body is expressed via `-ConnectionDetails`/
    `-CredentialDetails` hashtables plus typed `-ConnectivityType`/`-GatewayId`/`-PrivacyLevel` parameters.
  - Return the full created/updated connection object (all API properties) enriched with a resolved
    `GatewayName` (when gateway-bound) and the `MicrosoftFabric.Connection` type; `-Raw` returns the
    untouched response. `SupportsShouldProcess` (honors `-WhatIf`/`-Confirm`).

### Fixed

- **`New-FabricAPIUri -Segments` (34 functions were silently broken)**: The helper never had a `-Segments`
  parameter, yet 34 functions called `New-FabricAPIUri -Segments @(...)` — every `*Definition` getter/updater
  built via segments plus the Domain functions. The call failed parameter binding, the error was swallowed by
  the surrounding try/catch, and the function returned nothing without ever calling the API. Added a `-Segments`
  parameter (its own parameter set) that builds the path from an ordered segment list, restoring these functions.
- **`Add/Remove/Update-FabricConnectionRoleAssignment`**: Corrected the request URI. These functions built
  `/connections/roleAssignments/{connectionId}` instead of the correct `/connections/{connectionId}/roleAssignments`
  (and `.../roleAssignments/{roleAssignmentId}` for Remove/Update), so they targeted the wrong endpoint at runtime.
  Root cause was `New-FabricAPIUri` placing `-Subresource` before `-ItemId`; the connection id was passed via `-ItemId`.
- **`Remove-FabricSharingLinks`**: Removed a dead validation loop over an undefined `$Items` variable and repaired
  corrupted comment-based help. No change to the (already correct) `POST /admin/items/removeAllSharingLinks'

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
