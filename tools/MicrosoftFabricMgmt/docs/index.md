# Fabric ACE Toolkit Documentation

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

```bash
git clone https://github.com/tiagobalabuch/FabricACEToolkit.git
Import-Module ./FabricACEToolkit/FabricACEToolkit.psm1
```

## Configuration

Before using the toolkit, set the Fabric Headers using the command `Set-FabricApiHeaders`. Without this you cannot call an API global variable with your API `BaseUrl` and `FabricHeaders`:

```powershell
Set-FabricApiHeaders -tenantId "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx"
```

## Functions

## Public Functions

### Capacity
- [Get-FabricCapacity.ps1](Get-FabricCapacity.md)

### Dashboard
- [Get-FabricDashboard.ps1](Get-FabricDashboard.md)

### Data Pipeline
- [Get-FabricDataPipeline.ps1](Get-FabricDataPipeline.md)
- [New-FabricDataPipeline.ps1](New-FabricDataPipeline.md)
- [Remove-FabricDataPipelines.ps1](Remove-FabricDataPipeline.md)
- [Update-FabricNotebook.ps1](Update-FabricDataPipeline.md)
### Datamart
- [Get-FabricDatamart.ps1](Get-FabricDatamart.md)

### Domain
- [Assign-FabricDomainWorkspaceByCapacity.ps1](Assign-FabricDomainWorkspaceByCapacity.md)
- [Assign-FabricDomainWorkspaceById.ps1](Assign-FabricDomainWorkspaceById.md)
- [Assign-FabricDomainWorkspaceByPrincipal.ps1](Assign-FabricDomainWorkspaceByPrincipal.md)
- [Assign-FabricDomainWorkspaceRoleAssignment.ps1](Assign-FabricDomainWorkspaceRoleAssignment.md)
- [Get-FabricDomain.ps1](Get-FabricDomain.md)
- [Get-FabricDomainWorkspace.ps1](Get-FabricDomainWorkspace.md)
- [New-FabricDomain.ps1](New-FabricDomain.md)
- [Remove-FabricDomain.ps1](Remove-FabricDomain.md)
- [Unassign-FabricDomainWorkspace.ps1](Unassign-FabricDomainWorkspace.md)
- [Unassign-FabricDomainWorkspaceRoleAssignment.ps1](Unassign-FabricDomainWorkspaceRoleAssignment.md)
- [Update-FabricDomain.ps1](Update-FabricDomain.md)

### Environment
- [Get-FabricEnvironment.ps1](Get-FabricEnvironment.md)
- [Get-FabricEnvironmentLibrary.ps1](Get-FabricEnvironmentLibrary.md)
- [Get-FabricEnvironmentSparkCompute.ps1](Get-FabricEnvironmentSparkCompute.md)
- [Get-FabricEnvironmentStagingLibrary.ps1](Get-FabricEnvironmentStagingLibrary.md)
- [Get-FabricEnvironmentStagingSparkCompute.ps1](Get-FabricEnvironmentStagingSparkCompute.md)
- [New-FabricEnvironment.ps1](New-FabricEnvironment.md)
- [Publish-FabricEnvironment.ps1](Publish-FabricEnvironment.md)
- [Remove-FabricEnvironment.ps1](Remove-FabricEnvironment.md)
- [Remove-FabricEnvironmentStagingLibrary.ps1](Remove-FabricEnvironmentStagingLibrary.md)
- [Stop-FabricEnvironmentPublish.ps1](Stop-FabricEnvironmentPublish.md)
- [Update-FabricEnvironment.ps1](Update-FabricEnvironment.md)
- [Update-FabricEnvironmentStagingSparkCompute.ps1](Update-FabricEnvironmentStagingSparkCompute.md)
- [Upload-FabricEnvironmentStagingLibrary.ps1](Upload-FabricEnvironmentStagingLibrary.md)

### Eventhouse
- [Get-FabricEventhouse.ps1](Get-FabricEventhouse.md)
- [Get-FabricEventhouseDefinition.ps1](Get-FabricEventhouseDefinition.md)
- [New-FabricEventhouse.ps1](New-FabricEventhouse.md)
- [Remove-FabricEventhouse.ps1](Remove-FabricEventhouse.md)
- [Update-FabricEventhouse.ps1](Update-FabricEventhouse.md)
- [Update-FabricEventhouseDefinition.ps1](Update-FabricEventhouseDefinition.md)

### Eventstream
- [Get-FabricEventstream.ps1](Get-FabricEventstream.md)
- [Get-FabricEventstreamDefinition.ps1](Get-FabricEventstreamDefinition.md)
- [New-FabricEventstream.ps1](New-FabricEventstream.md)
- [Remove-FabricEventstream.ps1](Remove-FabricEventstream.md)
- [Update-FabricEventstream.ps1](Update-FabricEventstream.md)
- [Update-FabricEventstreamDefinition.ps1](Update-FabricEventstreamDefinition.md)

### KQL Dashboard
- [Get-FabricKQLDashboard.ps1](Get-FabricKQLDashboard.md)
- [Get-FabricKQLDashboardDefinition.ps1](Get-FabricKQLDashboardDefinition.md)
- [New-FabricKQLDashboard.ps1](New-FabricKQLDashboard.md)
- [Remove-FabricKQLDashboard.ps1](Remove-FabricKQLDashboard.md)
- [Update-FabricKQLDashboard.ps1](Update-FabricKQLDashboard.md)
- [Update-FabricKQLDashboardDefinition.ps1](Update-FabricKQLDashboardDefinition.md)

### KQL Database
- [Get-FabricKQLDatabase.ps1](Get-FabricKQLDatabase.md)
- [Get-FabricKQLDatabaseDefinition.ps1](Get-FabricKQLDatabaseDefinition.md)
- [New-FabricKQLDatabase.ps1](New-FabricKQLDatabase.md)
- [Remove-FabricKQLDatabase.ps1](Remove-FabricKQLDatabase.md)
- [Update-FabricKQLDatabase.ps1](Update-FabricKQLDatabase.md)
- [Update-FabricKQLDatabaseDefinition.ps1](Update-FabricKQLDatabaseDefinition.md)

### KQL Queryset
- [Get-FabricKQLQueryset.ps1](Get-FabricKQLQueryset.md)
- [Get-FabricKQLQuerysetDefinition.ps1](Get-FabricKQLQuerysetDefinition.md)
- [New-FabricKQLQueryset.ps1](New-FabricKQLQueryset.md)
- [Remove-FabricKQLQueryset.ps1](Remove-FabricKQLQueryset.md)
- [Update-FabricKQLQueryset.ps1](Update-FabricKQLQueryset.md)
- [Update-FabricKQLQuerysetDefinition.ps1](Update-FabricKQLQuerysetDefinition.md)

### Lakehouse
- [Get-FabricLakehouse.ps1](Get-FabricLakehouse.md)
- [Get-FabricLakehouseTable.ps1](Get-FabricLakehouseTable.md)
- [Load-FabricLakehouseTable.ps1](Load-FabricLakehouseTable.md)
- [New-FabricLakehouse.ps1](New-FabricLakehouse.md)
- [Remove-FabricLakehouse.ps1](Remove-FabricLakehouse.md)
- [Start-FabricLakehouseTableMaintenance.ps1](Start-FabricLakehouseTableMaintenance.md)
- [Update-FabricLakehouse.ps1](Update-FabricLakehouse.md)


### Mirrored Database
- [Get-FabricMirroredDatabase.ps1](Get-FabricMirroredDatabase.md)
- [Get-FabricMirroredDatabaseDefinition.ps1](Get-FabricMirroredDatabaseDefinition.md)
- [Get-FabricMirroredDatabaseStatus.ps1](Get-FabricMirroredDatabaseStatus.md)
- [Get-FabricMirroredDatabaseTableStatus.ps1](Get-FabricMirroredDatabaseTableStatus.md)
- [New-FabricMirroredDatabase.ps1](New-FabricMirroredDatabase.md)
- [Remove-FabricMirroredDatabase.ps1](Remove-FabricMirroredDatabase.md)
- [Start-FabricMirroredDatabaseMirroring.ps1](Start-FabricMirroredDatabaseMirroring.md)
- [Stop-FabricMirroredDatabaseMirroring.ps1](Stop-FabricMirroredDatabaseMirroring.md)
- [Update-FabricMirroredDatabase.ps1](Update-FabricMirroredDatabase.md)
- [Update-FabricMirroredDatabaseDefinition.ps1](Update-FabricMirroredDatabaseDefinition.md)


### Mirrored Warehouse

[Get-FabricMirroredWarehouse.ps1](Get-FabricMirroredWarehouse.md)

### ML Experiment
- [Get-FabricMLExperiment.ps1](Get-FabricMLExperiment.md)
- [New-FabricMLExperiment.ps1](New-FabricMLExperiment.md)
- [Remove-FabricMLExperiment.ps1](Remove-FabricMLExperiment.md)
- [Update-FabricMLExperiment.ps1](Update-FabricMLExperiment.md)

### ML Model
- [Get-FabricMLModel.ps1](Get-FabricMLModel.md)
- [New-FabricMLModel.ps1](New-FabricMLModel.md)
- [Remove-FabricMLModel.ps1](Remove-FabricMLModel.md)
- [Update-FabricMLModel.ps1](Update-FabricMLModel.md)

### Notebook
- [Get-FabricNotebook.ps1](Get-FabricNotebook.md)
- [Get-FabricNotebookDefinition.ps1](Get-FabricNotebookDefinition.md)
- [New-FabricNotebook.ps1](New-FabricNotebook.md)
- [Remove-FabricNotebook.ps1](Remove-FabricNotebook.md)
- [Update-FabricNotebook.ps1](Update-FabricNotebook.md)
- [Update-FabricNotebookDefinition.ps1](Update-FabricNotebookDefinition.md)

### Paginated Reports
- [Get-FabricPaginatedReport.ps1](Get-FabricPaginatedReport.md)
- [Update-FabricPaginatedReport.ps1](Update-FabricPaginatedReport.md)

### Reflex
- [Get-FabricReflex.ps1](Get-FabricReflex.md)
- [Get-FabricReflexDefinition.ps1](Get-FabricReflexDefinition.md)
- [New-FabricReflex.ps1](New-FabricReflex.md)
- [Remove-FabricReflex.ps1](Remove-FabricReflex.md)
- [Update-FabricReflex.ps1](Update-FabricReflex.md)
- [Update-FabricReflexDefinition.ps1](Update-FabricReflexDefinition.md)

### Report
- [Get-FabricReport.ps1](Get-FabricReport.md)
- [Get-FabricReportDefinition.ps1](Get-FabricReportDefinition.md)
- [New-FabricReport.ps1](New-FabricReport.md)
- [Remove-FabricReport.ps1](Remove-FabricReport.md)
- [Update-FabricReport.ps1](Update-FabricReport.md)
- [Update-FabricReportDefinition.ps1](Update-FabricReportDefinition.md)

### Semantic Model
- [Get-FabricSemanticModel.ps1](Get-FabricSemanticModel.md)
- [Get-FabricSemanticModelDefinition.ps1](Get-FabricSemanticModelDefinition.md)
- [New-FabricSemanticModel.ps1](New-FabricSemanticModel.md)
- [Remove-FabricSemanticModel.ps1](Remove-FabricSemanticModel.md)
- [Update-FabricSemanticModel.ps1](Update-FabricSemanticModel.md)
- [Update-FabricSemanticModelDefinition.ps1](Update-FabricSemanticModelDefinition.md)

### Spark
- [Get-FabricSparkCustomPool.ps1](Get-FabricSparkCustomPool.md)
- [Get-FabricSparkSettings.ps1](Get-FabricSparkSettings.md)
- [New-FabricSparkCustomPool.ps1](New-FabricSparkCustomPool.md)
- [Remove-FabricSparkCustomPool.ps1](Remove-FabricSparkCustomPool.md)
- [Update-FabricSparkCustomPool.ps1](Update-FabricSparkCustomPool.md)
- [Update-FabricSparkSettings.ps1](Update-FabricSparkSettings.md)

### Spark Job Definition
- [Get-FabricSparkJobDefinition.ps1](Get-FabricSparkJobDefinition.md)
- [Get-FabricSparkJobDefinitionDefinition.ps1](Get-FabricSparkJobDefinitionDefinition.md)
- [New-FabricSparkJobDefinition.ps1](New-FabricSparkJobDefinition.md)
- [Remove-FabricSparkJobDefinition.ps1](Remove-FabricSparkJobDefinition.md)
- [Start-FabricSparkJobDefinitionOnDemand.ps1](Start-FabricSparkJobDefinitionOnDemand.md)
- [Update-FabricSparkJobDefinition.ps1](Update-FabricSparkJobDefinition.md)
- [Update-FabricSparkJobDefinitionDefinition.ps1](Update-FabricSparkJobDefinitionDefinition.md)

### SQL Endpoints
- [Get-FabricSQLEndpoint.ps1](Get-FabricSQLEndpoint.md)

### Tenant
- [Get-FabricTenantSetting.ps1](Get-FabricTenantSetting.md)
- [Get-FabricTenantSettingOverridesCapacity.ps1](Get-FabricTenantSettingOverridesCapacity.md)

## Utils
- [Convert-FromBase64.ps1](Convert-FromBase64.md)
- [Convert-ToBase64.ps1](Convert-ToBase64.md)
- [Get-FabricLongRunningOperation.ps1](Get-FabricLongRunningOperation.md)
- [Get-FabricLongRunningOperationResult.ps1](Get-FabricLongRunningOperationResult.md)
- [Set-FabricApiHeaders.ps1](Set-FabricApiHeaders.md)

### Warehouse
- [Get-FabricWarehouse.ps1](Get-FabricWarehouse.md)
- [New-FabricWarehouse.ps1](New-FabricWarehouse.md)
- [Remove-FabricWarehouse.ps1](Remove-FabricWarehouse.md)
- [Update-FabricWarehouse.ps1](Update-FabricWarehouse.md)

### Workspace
- [Add-FabricWorkspaceIdentity.ps1](Add-FabricWorkspaceIdentity.md)
- [Add-FabricWorkspaceRoleAssignment.ps1](Add-FabricWorkspaceRoleAssignments.md)
- [Assign-FabricWorkspaceCapacity.ps1](Assign-FabricWorkspaceCapacity.md)
- [Get-FabricWorkspace.ps1](Get-FabricWorkspace.md)
- [Get-FabricWorkspaceRoleAssignment.ps1](Get-FabricWorkspaceRoleAssignment.md)
- [New-FabricWorkspace.ps1](New-FabricWorkspace.md)
- [Remove-FabricWorkspace.ps1](Remove-FabricWorkspace.md)
- [Remove-FabricWorkspaceIdentity.ps1](Remove-FabricWorkspaceIdentity.md)
- [Remove-FabricWorkspaceRoleAssignment.ps1](Remove-FabricWorkspaceRoleAssignment.md)
- [Unassign-FabricWorkspaceCapacity.ps1](Unassign-FabricWorkspaceCapacity.md)
- [Update-FabricWorkspace.ps1](Update-FabricWorkspace.md)
- [Update-FabricWorkspaceRoleAssignment.ps1](Update-FabricWorkspaceRoleAssignment.md)



## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.