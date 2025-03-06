# Powershell FabricACEToolkit

## Overview
The FabricACEToolkit is a collection of PowerShell scripts designed to interact with the Microsoft Fabric API. It provides functionalities to manage various resources within a Microsoft Fabric workspace, such as Spark Job Definitions, ML Models, Reports, Notebooks, and more.

## Table of Contents
- [Installation](#installation)
- [Prerequisites](#prerequisites)
- [Configuration](#configuration)
- [Functions](#functions)
- [License](#license)

## Installation
To install the FabricACEToolkit, clone the repository and import the module in your PowerShell session:
```sh
git clone https://github.com/microsoft/fabric-toolbox.git
Import-Module ./fabric-toolbox/powershell/FabricACEToolkit.psm1
```

## Prerequisites

You can install the entire Azure PowerShell module or just the Az.Accounts module, which is required for this toolkit.

1. [Instal Azure PowerShell module](https://learn.microsoft.com/en-us/powershell/azure/install-azure-powershell?view=azps-13.0.0)
2. [Install individual module](https://learn.microsoft.com/en-us/powershell/azure/install-azps-optimized?view=azps-13.0.0#install-individual-service-specific-modules)


```powershell
Install-Module -Name Az -Repository PSGallery -Force
```
```powershell
Install-Module -Name Az.Accounts -Force -AllowClobber
```

> [!NOTE]
> After install or update you can import the Az.Accounts module

```powershell
Import-Module Az.Accounts -Force
```

## Configuration

Before using the toolkit, set the Fabric Headers using the command `Set-FabricApiHeaders`. Without this you cannot call an API global variable with your API `BaseUrl` and `FabricHeaders`:

```powershell
# User Principal
Set-FabricApiHeaders -tenantId "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx"
```

```powershell
# Service Principal
$tenantId = "xxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxx"
$appId = "00000000-0000-0000-0000-000000000000"
$appSecret = "your-secret"
$secureAppSecret = $appSecret | ConvertTo-SecureString -AsPlainText -Force

Set-FabricApiHeadersV2 -TenantId $tenantId -AppId $appId -AppSecret $secureAppSecret

```

## Functions

### Capacity
- [Get-FabricCapacity.ps1](/powershell/FabricACEToolkit/docs/Get-FabricCapacity.md)

### Dashboard
- [Get-FabricDashboard.ps1](/powershell/FabricACEToolkit/docs/Get-FabricDashboard.md)

### Data Pipeline
- [Get-FabricDataPipeline.ps1](/powershell/FabricACEToolkit/docs/Get-FabricDataPipeline.md)
- [New-FabricDataPipeline.ps1](/powershell/FabricACEToolkit/docs/New-FabricDataPipeline.md)
- [Remove-FabricDataPipelines.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricDataPipeline.md)
- [Update-FabricNotebook.ps1](/powershell/FabricACEToolkit/docs/Update-FabricDataPipeline.md)
### Datamart
- [Get-FabricDatamart.ps1](/powershell/FabricACEToolkit/docs/Get-FabricDatamart.md)

### Domain
- [Assign-FabricDomainWorkspaceByCapacity.ps1](/powershell/FabricACEToolkit/docs/Assign-FabricDomainWorkspaceByCapacity.md)
- [Assign-FabricDomainWorkspaceById.ps1](/powershell/FabricACEToolkit/docs/Assign-FabricDomainWorkspaceById.md)
- [Assign-FabricDomainWorkspaceByPrincipal.ps1](/powershell/FabricACEToolkit/docs/Assign-FabricDomainWorkspaceByPrincipal.md)
- [Assign-FabricDomainWorkspaceRoleAssignment.ps1](/powershell/FabricACEToolkit/docs/Assign-FabricDomainWorkspaceRoleAssignment.md)
- [Get-FabricDomain.ps1](/powershell/FabricACEToolkit/docs/Get-FabricDomain.md)
- [Get-FabricDomainWorkspace.ps1](/powershell/FabricACEToolkit/docs/Get-FabricDomainWorkspace.md)
- [New-FabricDomain.ps1](/powershell/FabricACEToolkit/docs/New-FabricDomain.md)
- [Remove-FabricDomain.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricDomain.md)
- [Unassign-FabricDomainWorkspace.ps1](/powershell/FabricACEToolkit/docs/Unassign-FabricDomainWorkspace.md)
- [Unassign-FabricDomainWorkspaceRoleAssignment.ps1](/powershell/FabricACEToolkit/docs/Unassign-FabricDomainWorkspaceRoleAssignment.md)
- [Update-FabricDomain.ps1](/powershell/FabricACEToolkit/docs/Update-FabricDomain.md)

### Environment
- [Get-FabricEnvironment.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEnvironment.md)
- [Get-FabricEnvironmentLibrary.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEnvironmentLibrary.md)
- [Get-FabricEnvironmentSparkCompute.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEnvironmentSparkCompute.md)
- [Get-FabricEnvironmentStagingLibrary.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEnvironmentStagingLibrary.md)
- [Get-FabricEnvironmentStagingSparkCompute.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEnvironmentStagingSparkCompute.md)
- [New-FabricEnvironment.ps1](/powershell/FabricACEToolkit/docs/New-FabricEnvironment.md)
- [Publish-FabricEnvironment.ps1](/powershell/FabricACEToolkit/docs/Publish-FabricEnvironment.md)
- [Remove-FabricEnvironment.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricEnvironment.md)
- [Remove-FabricEnvironmentStagingLibrary.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricEnvironmentStagingLibrary.md)
- [Stop-FabricEnvironmentPublish.ps1](/powershell/FabricACEToolkit/docs/Stop-FabricEnvironmentPublish.md)
- [Update-FabricEnvironment.ps1](/powershell/FabricACEToolkit/docs/Update-FabricEnvironment.md)
- [Update-FabricEnvironmentStagingSparkCompute.ps1](/powershell/FabricACEToolkit/docs/Update-FabricEnvironmentStagingSparkCompute.md)
- [Upload-FabricEnvironmentStagingLibrary.ps1](/powershell/FabricACEToolkit/docs/Upload-FabricEnvironmentStagingLibrary.md)

### Eventhouse
- [Get-FabricEventhouse.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEventhouse.md)
- [Get-FabricEventhouseDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEventhouseDefinition.md)
- [New-FabricEventhouse.ps1](/powershell/FabricACEToolkit/docs/New-FabricEventhouse.md)
- [Remove-FabricEventhouse.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricEventhouse.md)
- [Update-FabricEventhouse.ps1](/powershell/FabricACEToolkit/docs/Update-FabricEventhouse.md)
- [Update-FabricEventhouseDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricEventhouseDefinition.md)

### Eventstream
- [Get-FabricEventstream.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEventstream.md)
- [Get-FabricEventstreamDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricEventstreamDefinition.md)
- [New-FabricEventstream.ps1](/powershell/FabricACEToolkit/docs/New-FabricEventstream.md)
- [Remove-FabricEventstream.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricEventstream.md)
- [Update-FabricEventstream.ps1](/powershell/FabricACEToolkit/docs/Update-FabricEventstream.md)
- [Update-FabricEventstreamDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricEventstreamDefinition.md)

### KQL Dashboard
- [Get-FabricKQLDashboard.ps1](/powershell/FabricACEToolkit/docs/Get-FabricKQLDashboard.md)
- [Get-FabricKQLDashboardDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricKQLDashboardDefinition.md)
- [New-FabricKQLDashboard.ps1](/powershell/FabricACEToolkit/docs/New-FabricKQLDashboard.md)
- [Remove-FabricKQLDashboard.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricKQLDashboard.md)
- [Update-FabricKQLDashboard.ps1](/powershell/FabricACEToolkit/docs/Update-FabricKQLDashboard.md)
- [Update-FabricKQLDashboardDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricKQLDashboardDefinition.md)

### KQL Database
- [Get-FabricKQLDatabase.ps1](/powershell/FabricACEToolkit/docs/Get-FabricKQLDatabase.md)
- [Get-FabricKQLDatabaseDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricKQLDatabaseDefinition.md)
- [New-FabricKQLDatabase.ps1](/powershell/FabricACEToolkit/docs/New-FabricKQLDatabase.md)
- [Remove-FabricKQLDatabase.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricKQLDatabase.md)
- [Update-FabricKQLDatabase.ps1](/powershell/FabricACEToolkit/docs/Update-FabricKQLDatabase.md)
- [Update-FabricKQLDatabaseDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricKQLDatabaseDefinition.md)

### KQL Queryset
- [Get-FabricKQLQueryset.ps1](/powershell/FabricACEToolkit/docs/Get-FabricKQLQueryset.md)
- [Get-FabricKQLQuerysetDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricKQLQuerysetDefinition.md)
- [New-FabricKQLQueryset.ps1](/powershell/FabricACEToolkit/docs/New-FabricKQLQueryset.md)
- [Remove-FabricKQLQueryset.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricKQLQueryset.md)
- [Update-FabricKQLQueryset.ps1](/powershell/FabricACEToolkit/docs/Update-FabricKQLQueryset.md)
- [Update-FabricKQLQuerysetDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricKQLQuerysetDefinition.md)

### Lakehouse
- [Get-FabricLakehouse.ps1](/powershell/FabricACEToolkit/docs/Get-FabricLakehouse.md)
- [Get-FabricLakehouseTable.ps1](/powershell/FabricACEToolkit/docs/Get-FabricLakehouseTable.md)
- [Load-FabricLakehouseTable.ps1](/powershell/FabricACEToolkit/docs/Load-FabricLakehouseTable.md)
- [New-FabricLakehouse.ps1](/powershell/FabricACEToolkit/docs/New-FabricLakehouse.md)
- [Remove-FabricLakehouse.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricLakehouse.md)
- [Start-FabricLakehouseTableMaintenance.ps1](/powershell/FabricACEToolkit/docs/Start-FabricLakehouseTableMaintenance.md)
- [Update-FabricLakehouse.ps1](/powershell/FabricACEToolkit/docs/Update-FabricLakehouse.md)


### Mirrored Database
- [Get-FabricMirroredDatabase.ps1](/powershell/FabricACEToolkit/docs/Get-FabricMirroredDatabase.md)
- [Get-FabricMirroredDatabaseDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricMirroredDatabaseDefinition.md)
- [Get-FabricMirroredDatabaseStatus.ps1](/powershell/FabricACEToolkit/docs/Get-FabricMirroredDatabaseStatus.md)
- [Get-FabricMirroredDatabaseTableStatus.ps1](/powershell/FabricACEToolkit/docs/Get-FabricMirroredDatabaseTableStatus.md)
- [New-FabricMirroredDatabase.ps1](/powershell/FabricACEToolkit/docs/New-FabricMirroredDatabase.md)
- [Remove-FabricMirroredDatabase.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricMirroredDatabase.md)
- [Start-FabricMirroredDatabaseMirroring.ps1](/powershell/FabricACEToolkit/docs/Start-FabricMirroredDatabaseMirroring.md)
- [Stop-FabricMirroredDatabaseMirroring.ps1](/powershell/FabricACEToolkit/docs/Stop-FabricMirroredDatabaseMirroring.md)
- [Update-FabricMirroredDatabase.ps1](/powershell/FabricACEToolkit/docs/Update-FabricMirroredDatabase.md)
- [Update-FabricMirroredDatabaseDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricMirroredDatabaseDefinition.md)


### Mirrored Warehouse

[Get-FabricMirroredWarehouse.ps1](/powershell/FabricACEToolkit/docs/Get-FabricMirroredWarehouse.md)

### ML Experiment
- [Get-FabricMLExperiment.ps1](/powershell/FabricACEToolkit/docs/Get-FabricMLExperiment.md)
- [New-FabricMLExperiment.ps1](/powershell/FabricACEToolkit/docs/New-FabricMLExperiment.md)
- [Remove-FabricMLExperiment.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricMLExperiment.md)
- [Update-FabricMLExperiment.ps1](/powershell/FabricACEToolkit/docs/Update-FabricMLExperiment.md)

### ML Model
- [Get-FabricMLModel.ps1](/powershell/FabricACEToolkit/docs/Get-FabricMLModel.md)
- [New-FabricMLModel.ps1](/powershell/FabricACEToolkit/docs/New-FabricMLModel.md)
- [Remove-FabricMLModel.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricMLModel.md)
- [Update-FabricMLModel.ps1](/powershell/FabricACEToolkit/docs/Update-FabricMLModel.md)

### Notebook
- [Get-FabricNotebook.ps1](/powershell/FabricACEToolkit/docs/Get-FabricNotebook.md)
- [Get-FabricNotebookDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricNotebookDefinition.md)
- [New-FabricNotebook.ps1](/powershell/FabricACEToolkit/docs/New-FabricNotebook.md)
- [Remove-FabricNotebook.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricNotebook.md)
- [Update-FabricNotebook.ps1](/powershell/FabricACEToolkit/docs/Update-FabricNotebook.md)
- [Update-FabricNotebookDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricNotebookDefinition.md)

### Paginated Reports
- [Get-FabricPaginatedReport.ps1](/powershell/FabricACEToolkit/docs/Get-FabricPaginatedReport.md)
- [Update-FabricPaginatedReport.ps1](/powershell/FabricACEToolkit/docs/Update-FabricPaginatedReport.md)

### Reflex
- [Get-FabricReflex.ps1](/powershell/FabricACEToolkit/docs/Get-FabricReflex.md)
- [Get-FabricReflexDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricReflexDefinition.md)
- [New-FabricReflex.ps1](/powershell/FabricACEToolkit/docs/New-FabricReflex.md)
- [Remove-FabricReflex.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricReflex.md)
- [Update-FabricReflex.ps1](/powershell/FabricACEToolkit/docs/Update-FabricReflex.md)
- [Update-FabricReflexDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricReflexDefinition.md)

### Report
- [Get-FabricReport.ps1](/powershell/FabricACEToolkit/docs/Get-FabricReport.md)
- [Get-FabricReportDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricReportDefinition.md)
- [New-FabricReport.ps1](/powershell/FabricACEToolkit/docs/New-FabricReport.md)
- [Remove-FabricReport.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricReport.md)
- [Update-FabricReport.ps1](/powershell/FabricACEToolkit/docs/Update-FabricReport.md)
- [Update-FabricReportDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricReportDefinition.md)

### Semantic Model
- [Get-FabricSemanticModel.ps1](/powershell/FabricACEToolkit/docs/Get-FabricSemanticModel.md)
- [Get-FabricSemanticModelDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricSemanticModelDefinition.md)
- [New-FabricSemanticModel.ps1](/powershell/FabricACEToolkit/docs/New-FabricSemanticModel.md)
- [Remove-FabricSemanticModel.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricSemanticModel.md)
- [Update-FabricSemanticModel.ps1](/powershell/FabricACEToolkit/docs/Update-FabricSemanticModel.md)
- [Update-FabricSemanticModelDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricSemanticModelDefinition.md)

### Spark
- [Get-FabricSparkCustomPool.ps1](/powershell/FabricACEToolkit/docs/Get-FabricSparkCustomPool.md)
- [Get-FabricSparkSettings.ps1](/powershell/FabricACEToolkit/docs/Get-FabricSparkSettings.md)
- [New-FabricSparkCustomPool.ps1](/powershell/FabricACEToolkit/docs/New-FabricSparkCustomPool.md)
- [Remove-FabricSparkCustomPool.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricSparkCustomPool.md)
- [Update-FabricSparkCustomPool.ps1](/powershell/FabricACEToolkit/docs/Update-FabricSparkCustomPool.md)
- [Update-FabricSparkSettings.ps1](/powershell/FabricACEToolkit/docs/Update-FabricSparkSettings.md)

### Spark Job Definition
- [Get-FabricSparkJobDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricSparkJobDefinition.md)
- [Get-FabricSparkJobDefinitionDefinition.ps1](/powershell/FabricACEToolkit/docs/Get-FabricSparkJobDefinitionDefinition.md)
- [New-FabricSparkJobDefinition.ps1](/powershell/FabricACEToolkit/docs/New-FabricSparkJobDefinition.md)
- [Remove-FabricSparkJobDefinition.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricSparkJobDefinition.md)
- [Start-FabricSparkJobDefinitionOnDemand.ps1](/powershell/FabricACEToolkit/docs/Start-FabricSparkJobDefinitionOnDemand.md)
- [Update-FabricSparkJobDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricSparkJobDefinition.md)
- [Update-FabricSparkJobDefinitionDefinition.ps1](/powershell/FabricACEToolkit/docs/Update-FabricSparkJobDefinitionDefinition.md)

### SQL Endpoints
- [Get-FabricSQLEndpoint.ps1](/powershell/FabricACEToolkit/docs/Get-FabricSQLEndpoint.md)

### Tenant
- [Get-FabricTenantSetting.ps1](/powershell/FabricACEToolkit/docs/Get-FabricTenantSetting.md)
- [Get-FabricTenantSettingOverridesCapacity.ps1](/powershell/FabricACEToolkit/docs/Get-FabricTenantSettingOverridesCapacity.md)

## Utils
- [Convert-FromBase64.ps1](/powershell/FabricACEToolkit/docs/Convert-FromBase64.md)
- [Convert-ToBase64.ps1](/powershell/FabricACEToolkit/docs/Convert-ToBase64.md)
- [Get-FabricLongRunningOperation.ps1](/powershell/FabricACEToolkit/docs/Get-FabricLongRunningOperation.md)
- [Get-FabricLongRunningOperationResult.ps1](/powershell/FabricACEToolkit/docs/Get-FabricLongRunningOperationResult.md)
- [Set-FabricApiHeaders.ps1](/powershell/FabricACEToolkit/docs/Set-FabricApiHeaders.md)

### Warehouse
- [Get-FabricWarehouse.ps1](/powershell/FabricACEToolkit/docs/Get-FabricWarehouse.md)
- [New-FabricWarehouse.ps1](/powershell/FabricACEToolkit/docs/New-FabricWarehouse.md)
- [Remove-FabricWarehouse.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricWarehouse.md)
- [Update-FabricWarehouse.ps1](/powershell/FabricACEToolkit/docs/Update-FabricWarehouse.md)

### Workspace
- [Add-FabricWorkspaceIdentity.ps1](/powershell/FabricACEToolkit/docs/Add-FabricWorkspaceIdentity.md)
- [Add-FabricWorkspaceRoleAssignment.ps1](/powershell/FabricACEToolkit/docs/Add-FabricWorkspaceRoleAssignments.md)
- [Assign-FabricWorkspaceCapacity.ps1](/powershell/FabricACEToolkit/docs/Assign-FabricWorkspaceCapacity.md)
- [Get-FabricWorkspace.ps1](/powershell/FabricACEToolkit/docs/Get-FabricWorkspace.md)
- [Get-FabricWorkspaceRoleAssignment.ps1](/powershell/FabricACEToolkit/docs/Get-FabricWorkspaceRoleAssignment.md)
- [New-FabricWorkspace.ps1](/powershell/FabricACEToolkit/docs/New-FabricWorkspace.md)
- [Remove-FabricWorkspace.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricWorkspace.md)
- [Remove-FabricWorkspaceIdentity.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricWorkspaceIdentity.md)
- [Remove-FabricWorkspaceRoleAssignment.ps1](/powershell/FabricACEToolkit/docs/Remove-FabricWorkspaceRoleAssignment.md)
- [Unassign-FabricWorkspaceCapacity.ps1](/powershell/FabricACEToolkit/docs/Unassign-FabricWorkspaceCapacity.md)
- [Update-FabricWorkspace.ps1](/powershell/FabricACEToolkit/docs/Update-FabricWorkspace.md)
- [Update-FabricWorkspaceRoleAssignment.ps1](/powershell/FabricACEToolkit/docs/Update-FabricWorkspaceRoleAssignment.md)

## License
This project is licensed under the MIT License. See the [LICENSE](/LICENSE) file for details.