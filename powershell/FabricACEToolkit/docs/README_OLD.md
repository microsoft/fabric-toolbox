# FabricACEToolkit Documentation

## Overview
The FabricACEToolkit is a collection of PowerShell scripts designed to interact with the Microsoft Fabric API. It provides functionalities to manage various resources within a Microsoft Fabric workspace, such as Spark Job Definitions, ML Models, Reports, Notebooks, and more.

## Table of Contents
- [Installation](#installation)
- [Configuration](#configuration)
- [Functions](#functions)
- [Examples](#examples)
- [License](#license)

## Installation
To install the FabricACEToolkit, clone the repository and import the module in your PowerShell session:
```sh
git clone https://github.com/tiagobalabuch/FabricACEToolkit.git
Import-Module ./FabricACEToolkit/FabricACEToolkit.psm1
```

## Configuration
Before using the toolkit, set the Fabric Headers using the command `Set-FabricApiHeaders`. Without this you cannot call an API global variable with your API `BaseUrl` and `FabricHeaders`:

```ps1
Set-FabricApiHeaders -tenantId "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx"
```
## Functions

## Root Directory
- `FabricACEToolkit.psd1`
- `FabricACEToolkit.psm1`
- `LICENSE`
- `README.md`

## Private Directory
- `Convert-FromBase64.ps1`
- `Convert-ToBase64.ps1`
- `Get-ErrorResponse.ps1`
- `Get-FabricLongRunningOperation.ps1`
- `Get-FabricLongRunningOperationResult.ps1`
- `Get-FileDefinitionParts.ps1`
- `Is-TokenExpired-DEPRECATED.ps1`
- `Test-TokenExpired.ps1`
- `Write-Message.ps1`

## Public Functions

### Set-FabricApiHeaders 
[Set-FabricApiHeaders.ps1](/docs/Set-FabricApiHeaders.md)


### Capacity
- [Get-FabricCapacity.ps1](/docs/Get-FabricCapacity.md)

### Dashboard
- [Get-FabricDashboard.ps1](/docs/Get-FabricDashboard.md)

### Data Pipeline
- [Get-FabricDataPipeline.ps1](/docs/Get-FabricDataPipeline.md)
- [New-FabricDataPipeline.ps1](/docs/New-FabricDataPipeline.md)
- [Remove-FabricDataPipelines.ps1](/docs/Remove-FabricDataPipeline.md)
- [Update-FabricNotebook.ps1](/docs/Update-FabricDataPipeline.md)
### Datamart
- [Get-FabricDatamart.ps1](/docs/Get-FabricDatamart.md)

### Domain
- [Assign-FabricDomainWorkspaceByCapacity.ps1](/docs/Assign-FabricDomainWorkspaceByCapacity.md)
- `Assign-FabricDomainWorkspaceById.ps1`
- `Assign-FabricDomainWorkspaceByPrincipal.ps1`
- `Assign-FabricDomainWorkspaceRoleAssignment.ps1`
- `Get-FabricDomain.ps1`
- `Get-FabricDomainWorkspace.ps1`
- `New-FabricDomain.ps1`
- `Remove-FabricDomain.ps1`
- `Unassign-FabricDomainWorkspace.ps1`
- `Unassign-FabricDomainWorkspaceRoleAssignment.ps1`
- `Update-FabricDomain.ps1`

### Environment
- `Get-FabricEnvironment.ps1`
- `Get-FabricEnvironmentLibrary.ps1`
- `Get-FabricEnvironmentSparkCompute.ps1`
- `Get-FabricEnvironmentStagingLibrary.ps1`
- `Get-FabricEnvironmentStagingSparkCompute.ps1`
- `New-FabricEnvironment.ps1`
- `Publish-FabricEnvironment.ps1`
- `Remove-FabricEnvironment.ps1`
- `Remove-FabricEnvironmentStagingLibrary.ps1`
- `Stop-FabricEnvironmentPublish.ps1`
- `Update-FabricEnvironment.ps1`
- `Update-FabricEnvironmentStagingSparkCompute.ps1`
- `Upload-FabricEnvironmentStagingLibrary.ps1`

### Eventhouse
- `Get-FabricEventhouse.ps1`
- `Get-FabricEventhouseDefinition.ps1`
- `New-FabricEventhouse.ps1`
- `Remove-FabricEventhouse.ps1`
- `Update-FabricEventhouse.ps1`
- `Update-FabricEventhouseDefinition.ps1`

### Eventstream
- `Get-FabricEventstream.ps1`
- `Get-FabricEventstreamDefinition.ps1`
- `New-FabricEventstream.ps1`
- `Remove-FabricEventstream.ps1`
- `Update-FabricEventstream.ps1`
- `Update-FabricEventstreamDefinition.ps1`

### KQL Dashboard
- `Get-FabricKQLDashboard.ps1`
- `Get-FabricKQLDashboardDefinition.ps1`
- `New-FabricKQLDashboard.ps1`
- `Remove-FabricKQLDashboard.ps1`
- `Update-FabricKQLDashboard.ps1`
- `Update-FabricKQLDashboardDefinition.ps1`

### KQL Database
- `Get-FabricKQLDatabase.ps1`
- `Get-FabricKQLDatabaseDefinition.ps1`
- `New-FabricKQLDatabase.ps1`
- `Remove-FabricKQLDatabase.ps1`
- `Update-FabricKQLDatabase.ps1`
- `Update-FabricKQLDatabaseDefinition.ps1`

### KQL Queryset
- `Get-FabricKQLQueryset.ps1`
- `Get-FabricKQLQuerysetDefinition.ps1`
- `New-FabricKQLQueryset.ps1`
- `Remove-FabricKQLQueryset.ps1`
- `Update-FabricKQLQueryset.ps1`
- `Update-FabricKQLQuerysetDefinition.ps1`

### Lakehouse
- `Get-FabricLakehouse.ps1`
- `Get-FabricLakehouseTable.ps1`
- `Load-FabricLakehouseTable.ps1`
- `New-FabricLakehouse.ps1`
- `Remove-FabricLakehouse.ps1`
- `Start-FabricLakehouseTableMaintenance.ps1`
- `Update-FabricLakehouse.ps1`

### ML Experiment
- `Get-FabricMLExperiment.ps1`
- `New-FabricMLExperiment.ps1`
- `Remove-FabricMLExperiment.ps1`
- `Update-FabricMLExperiment.ps1`

### ML Model
- `Get-FabricMLModel.ps1`
- `New-FabricMLModel.ps1`
- `Remove-FabricMLModel.ps1`
- `Update-FabricMLModel.ps1`

### Mirrored Database
- `Get-FabricMirroredDatabase.ps1`
- `Get-FabricMirroredDatabaseTableStatus.ps1`
- `New-FabricMirroredDatabase.ps1`
- `Remove-FabricMirroredDatabase.ps1`
- `Update-FabricMirroredDatabase.ps1`

### Mirrored Warehouse
- `Get-FabricMirroredWarehouse.ps1`
- `New-FabricMirroredWarehouse.ps1`
- `Remove-FabricMirroredWarehouse.ps1`
- `Update-FabricMirroredWarehouse.ps1`

### Notebook
- `Get-FabricNotebook.ps1`
- `Get-FabricNotebookDefinition.ps1`
- `New-FabricNotebook.ps1`
- `New-FabricNotebookNEW.ps1`
- `Remove-FabricNotebook.ps1`
- `Update-FabricNotebook.ps1`
- `Update-FabricNotebookDefinition.ps1`

### Paginated Reports
- `Get-FabricPaginatedReport.ps1`
- `Update-FabricPaginatedReport.ps1`

### Reflex
- `Get-FabricReflex.ps1`
- `Get-FabricReflexDefinition.ps1`
- `New-FabricReflex.ps1`
- `Remove-FabricReflex.ps1`
- `Update-FabricReflex.ps1`
- `Update-FabricReflexDefinition.ps1`

### Report
- `Get-FabricReport.ps1`
- `Get-FabricReportDefinition.ps1`
- `New-FabricReport.ps1`
- `Remove-FabricReport.ps1`
- `Update-FabricReport.ps1`
- `Update-FabricReportDefinition.ps1`

### Semantic Model
- `Get-FabricSemanticModel.ps1`
- `New-FabricSemanticModel.ps1`
- `Remove-FabricSemanticModel.ps1`
- `Set-FabricSemanticModel.ps1`

### Spark Job Definition
- `Get-FabricSparkJobDefinition.ps1`
- `New-FabricSparkJobDefinition.ps1`
- `Remove-FabricSparkJobDefinition.ps1`
- `Set-FabricSparkJobDefinition.ps1`

### SQL Endpoints
- `Get-FabricSQLEndpoint.ps1`

### Tenant
- `Get-FabricTenantSetting.ps1`
- `Get-FabricTenantSettingOverridesCapacity.ps1`

### Warehouse
- `Get-FabricWarehouse.ps1`
- `New-FabricWarehouse.ps1`
- `Remove-FabricWarehouse.ps1`
- `Update-FabricWarehouse.ps1`

### Workspace
- `Add-FabricWorkspaceIdentity.ps1`
- `Add-FabricWorkspaceRoleAssignment.ps1`
- `Assign-FabricWorkspaceCapacity.ps1`
- `Get-FabricWorkspace.ps1`
- `Get-FabricWorkspaceRoleAssignment.ps1`
- `New-FabricWorkspace.ps1`
- `Remove-FabricWorkspace.ps1`
- `Remove-FabricWorkspaceIdentity.ps1`
- `Remove-FabricWorkspaceRoleAssignment.ps1`
- `Unassign-FabricWorkspaceCapacity.ps1`
- `Update-FabricWorkspace.ps1`
- `Update-FabricWorkspaceRoleAssignment.ps1`

## Examples



## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.