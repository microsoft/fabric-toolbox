# MicrosoftFabricMgmt PowerShell Module


## Overview

**MicrosoftFabricMgmt** is an enterprise-grade PowerShell module providing comprehensive automation and management capabilities for **Microsoft Fabric** environments. Built with PowerShell best practices and modern development standards, this module delivers a robust, production-ready interface to the entire Microsoft Fabric REST API ecosystem.

### 🚀 Key Features

- **244+ Cmdlets** - Complete coverage of Microsoft Fabric REST API
- **42 Resource Types** - Manage Lakehouses, Warehouses, Notebooks, Pipelines, ML Models, Eventstreams, and more
- **Multiple Auth Methods** - User Principal, Service Principal, and Managed Identity support
- **Enterprise Ready** - Built-in retry logic, comprehensive error handling, and PSFramework logging
- **API Validated** - All endpoints verified against [official Microsoft Fabric REST API specifications](https://github.com/microsoft/fabric-rest-api-specs)
- **Cross-Platform** - PowerShell 5.1+ and PowerShell 7+ compatible
- **Fully Documented** - Complete help documentation and examples for every cmdlet
- **Modern Architecture** - Centralized helper functions eliminate code duplication and improve maintainability

### 💪 What You Can Do

**Workspace Management**
- Create, update, and manage workspaces
- Configure role-based access control (RBAC)
- Assign workspaces to capacities and domains
- Provision workspace identities

**Data Platform**
- Manage Lakehouses, Warehouses, and SQL Endpoints
- Orchestrate Data Pipelines and Dataflows
- Configure Mirrored Databases
- Automate OneLake shortcuts and data access policies

**Analytics & BI**
- Deploy and manage Semantic Models, Reports, and Dashboards
- Create KQL Databases, Dashboards, and Querysets
- Configure Eventhouses and Real-Time Intelligence
- Manage Paginated Reports

**Data Engineering**
- Deploy Notebooks and Spark Job Definitions
- Configure Environments and custom Spark pools
- Manage ML Experiments and Models
- Orchestrate Apache Airflow Jobs

**Streaming & Real-Time**
- Create and manage Eventstreams
- Configure destinations and sources
- Control stream operations (pause, resume, suspend)

**Administration**
- Tenant-level settings and capacity management
- Domain administration and workspace assignments
- Connection and gateway management
- Deployment pipeline automation

---

## Quick Start

### Installation

#### From PowerShell Gallery (Recommended)

As with all PowerShell modules, you can either clone the repository and import the module manually, or use the PowerShell Gallery to install it directly. We recommend using the PowerShell Gallery for easier updates and management.

```powershell
# Install from PowerShell Gallery
Install-Module -Name MicrosoftFabricMgmt

> **Note**: The module will be published to PowerShell Gallery soon. Until then, use the manual installation method below.

#### Manual Installation (Current Method)

```powershell
# Install required dependencies
$RequiredModules = @(
    @{ Name = 'PSFramework'; MinimumVersion = '5.0.0' }
    @{ Name = 'Az.Accounts'; MinimumVersion = '5.0.0' }
    @{ Name = 'Az.Resources'; MinimumVersion = '6.15.1' }
    @{ Name = 'MicrosoftPowerBIMgmt'; MinimumVersion = '1.2.1111' }
)

foreach ($module in $RequiredModules) {
    if (-not (Get-Module -ListAvailable -Name $module.Name -ErrorAction SilentlyContinue)) {
        Install-Module -Name $module.Name -MinimumVersion $module.MinimumVersion -Repository PSGallery -Scope CurrentUser
    }
}

# Clone the repository
git clone https://github.com/microsoft/fabric-toolbox.git
cd fabric-toolbox

You can also download the ZIP file from GitHub and extract it. You can even use [this function Rob created](https://gist.github.com/SQLDBAWithABeard/fc2c5bf1e0c2ba6a89e88d234e1a79c0 ) to only extract the tools MicrosoftFabricMgmt:


# Import the module
Import-Module .\output\module\MicrosoftFabricMgmt\*\MicrosoftFabricMgmt.psd1
```

### Authentication Setup

Before using any cmdlets, authenticate to Microsoft Fabric using `Set-FabricApiHeaders`. The module supports three authentication methods:

#### Option 1: User Principal (Interactive)

Best for: Interactive sessions, development, testing

```powershell
# Authenticate with your user account
Set-FabricApiHeaders -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"

# This will prompt for interactive authentication via your browser
# Your credentials are cached for the session
```

#### Option 2: Service Principal (Automated)

Best for: CI/CD pipelines, automation scripts, scheduled tasks

```powershell
# Define your Service Principal credentials
$tenantId = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
$appId = "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
$appSecret = "your-client-secret-value"

# Convert secret to SecureString
$secureAppSecret = $appSecret | ConvertTo-SecureString -AsPlainText -Force

# Authenticate
Set-FabricApiHeaders -TenantId $tenantId -AppId $appId -AppSecret $secureAppSecret
```

**Service Principal Setup Requirements:**
1. Register an App in Azure AD
2. Grant **Fabric API permissions** to the App
3. Assign appropriate **Fabric roles** (Admin, Member, Contributor, Viewer)
4. Enable [Service Principal access in Fabric admin settings](https://learn.microsoft.com/fabric/admin/service-admin-portal-developer#service-principals-can-use-fabric-apis)

#### Option 3: Managed Identity (Azure Resources)

Best for: Azure VMs, Azure Functions, Azure Automation, Azure DevOps

```powershell
# Authenticate using the system-assigned or user-assigned managed identity
Set-FabricApiHeaders -TenantId "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" -UseManagedIdentity

# For user-assigned managed identity, specify the client ID
$managedIdentityClientId = "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"
Set-FabricApiHeaders -TenantId $tenantId -UseManagedIdentity -ManagedIdentityId $managedIdentityClientId
```

**Managed Identity Setup Requirements:**
1. Enable Managed Identity on your Azure resource
2. Grant **Fabric API permissions** via Azure RBAC
3. Assign appropriate **Fabric workspace roles**

### Your First Commands

Once authenticated, you're ready to manage your Fabric environment:

```powershell
# List all workspaces you have access to
Get-FabricWorkspace

# Get a specific workspace by name
Get-FabricWorkspace -WorkspaceName "My Analytics Workspace"

# Create a new workspace
$newWorkspace = New-FabricWorkspace -WorkspaceName "Dev Environment" -WorkspaceDescription "Development workspace for analytics"

# List all lakehouses in a workspace
Get-FabricLakehouse -WorkspaceId $newWorkspace.id

# Create a lakehouse
New-FabricLakehouse -WorkspaceId $newWorkspace.id -LakehouseName "Sales Data" -LakehouseDescription "Sales analytics lakehouse"

# List notebooks in a workspace
Get-FabricNotebook -WorkspaceId $newWorkspace.id

# Get workspace role assignments
Get-FabricWorkspaceRoleAssignment -WorkspaceId $newWorkspace.id

# Add a user to the workspace
Add-FabricWorkspaceRoleAssignment -WorkspaceId $newWorkspace.id -PrincipalId "user@contoso.com" -Role "Contributor"
```

### Common Scenarios

#### 📊 Deploy a Complete Analytics Environment

```powershell
# 1. Create workspace
$workspace = New-FabricWorkspace -WorkspaceName "Sales Analytics" -WorkspaceDescription "Q4 Sales Analysis"

# 2. Assign to capacity
Add-FabricWorkspaceCapacity -WorkspaceId $workspace.id -CapacityId $capacityId

# 3. Create lakehouse for data storage
$lakehouse = New-FabricLakehouse -WorkspaceId $workspace.id -LakehouseName "SalesData"

# 4. Create warehouse for analytics
$warehouse = New-FabricWarehouse -WorkspaceId $workspace.id -WarehouseName "SalesWarehouse"

# 5. Deploy notebooks for data processing
New-FabricNotebook -WorkspaceId $workspace.id -NotebookName "Data Processing"

# 6. Create data pipeline for orchestration
New-FabricDataPipeline -WorkspaceId $workspace.id -DataPipelineName "Sales ETL Pipeline"

# 7. Add team members
Add-FabricWorkspaceRoleAssignment -WorkspaceId $workspace.id -PrincipalId "analyst@contoso.com" -Role "Contributor"
```

#### 🔄 Automate Environment Promotion

```powershell
# Get items from Dev workspace
$devWorkspace = Get-FabricWorkspace -WorkspaceName "Dev"
$notebooks = Get-FabricNotebook -WorkspaceId $devWorkspace.id
$pipelines = Get-FabricDataPipeline -WorkspaceId $devWorkspace.id

# Create in Production workspace
$prodWorkspace = Get-FabricWorkspace -WorkspaceName "Production"

foreach ($notebook in $notebooks) {
    $definition = Get-FabricNotebookDefinition -WorkspaceId $devWorkspace.id -NotebookId $notebook.id
    New-FabricNotebook -WorkspaceId $prodWorkspace.id -NotebookName $notebook.displayName
    Update-FabricNotebookDefinition -WorkspaceId $prodWorkspace.id -NotebookId $newNotebook.id -NotebookDefinition $definition
}
```

#### 🛡️ Audit Workspace Access

```powershell
# Get all workspaces
$workspaces = Get-FabricWorkspace

# Audit role assignments
$auditReport = foreach ($workspace in $workspaces) {
    $assignments = Get-FabricWorkspaceRoleAssignment -WorkspaceId $workspace.id

    foreach ($assignment in $assignments) {
        [PSCustomObject]@{
            WorkspaceName = $workspace.displayName
            UserEmail = $assignment.UserPrincipalName
            DisplayName = $assignment.DisplayName
            Role = $assignment.Role
            Type = $assignment.Type
        }
    }
}

# Export to CSV
$auditReport | Export-Csv -Path "FabricWorkspaceAudit_$(Get-Date -Format 'yyyyMMdd').csv" -NoTypeInformation
```

---

## Prerequisites

### PowerShell Version
- **PowerShell 5.1** or later
- **PowerShell 7+** (recommended for cross-platform support)

### Required Modules
The following modules are automatically installed as dependencies:

| Module | Minimum Version | Purpose |
|--------|----------------|---------|
| PSFramework | 5.0.0 | Configuration management and logging |
| Az.Accounts | 5.0.0 | Azure authentication |
| Az.Resources | 6.15.1 | Azure resource management |
| MicrosoftPowerBIMgmt | 1.2.1111 | Power BI integration |

### Permissions Required

**For User Principal:**
- Appropriate Fabric workspace roles (Admin, Member, Contributor, or Viewer)
- Tenant-level permissions for admin operations

**For Service Principal:**
- App must be enabled in [Fabric admin portal](https://learn.microsoft.com/fabric/admin/service-admin-portal-developer#service-principals-can-use-fabric-apis)
- Fabric API delegated scopes granted
- Workspace roles assigned

**For Managed Identity:**
- Identity must have Fabric API permissions
- Workspace roles assigned via RBAC

---

## Architecture & Design

### Modern PowerShell Best Practices

This module implements industry-standard PowerShell development practices:

- ✅ **DRY Principle** - Centralized helper functions eliminate 1,000+ lines of duplicate code
- ✅ **Approved Verbs** - All cmdlets use [PowerShell approved verbs](https://learn.microsoft.com/powershell/scripting/developer/cmdlet/approved-verbs-for-windows-powershell-commands)
- ✅ **Proper Scoping** - Module-scoped variables prevent global namespace pollution
- ✅ **Natural Output** - Leverages PowerShell pipeline for idiomatic code
- ✅ **Comprehensive Error Handling** - Try/catch blocks with detailed error messages
- ✅ **PSFramework Integration** - Consistent logging and configuration management
- ✅ **API Validation** - All endpoints verified against [official Fabric REST API specs](https://github.com/microsoft/fabric-rest-api-specs)

### Centralized Helper Functions

The module uses four core helper functions that provide:

1. **Invoke-FabricAuthCheck** - Consistent authentication validation across all cmdlets
2. **New-FabricAPIUri** - Standardized API endpoint construction with proper encoding
3. **Convert-FabricRequestBody** - Uniform JSON serialization
4. **Select-FabricResource** - Consistent resource filtering for Get-* cmdlets

**Benefits:**
- Bug fixes in one place automatically benefit all 244 cmdlets
- Consistent behavior across entire module
- Easier testing and maintenance
- Enhanced retry logic with exponential backoff

### Built-in Resilience

- **Automatic Retry Logic** - Handles transient failures (429, 503, 504 status codes)
- **Exponential Backoff** - Intelligent retry delays with jitter
- **Respects Rate Limits** - Honors `Retry-After` headers from API
- **Comprehensive Logging** - Debug, verbose, and error logging via PSFramework

---

## Documentation

### Cmdlet Help

Every cmdlet includes comprehensive help documentation:

```powershell
# Get help for any cmdlet
Get-Help Get-FabricWorkspace -Full
Get-Help Set-FabricApiHeaders -Examples
Get-Help New-FabricLakehouse -Parameter LakehouseName

# List all available cmdlets
Get-Command -Module MicrosoftFabricMgmt

# Find cmdlets by resource type
Get-Command -Module MicrosoftFabricMgmt -Name *Lakehouse*
Get-Command -Module MicrosoftFabricMgmt -Name *Notebook*
```

### Resource Coverage

The module provides comprehensive coverage of Microsoft Fabric resources:

<details>
<summary><b>📦 42 Resource Types (Click to expand)</b></summary>

| Resource Type | Cmdlets | Description |
|---------------|---------|-------------|
| **Workspace** | 13 | Workspace management, RBAC, capacity assignment |
| **Lakehouse** | 9 | Lakehouse operations, table management |
| **Warehouse** | 9 | Warehouse operations and snapshots |
| **Notebook** | 8 | Notebook deployment and management |
| **Data Pipeline** | 4 | Pipeline orchestration |
| **Eventstream** | 17 | Real-time data streaming |
| **Eventhouse** | 6 | Real-time analytics platform |
| **Environment** | 13 | Spark environment management |
| **ML Model** | 4 | Machine learning model management |
| **ML Experiment** | 4 | ML experiment tracking |
| **KQL Database** | 6 | KQL database operations |
| **KQL Dashboard** | 6 | KQL dashboard management |
| **KQL Queryset** | 6 | KQL query management |
| **Spark Job Definition** | 8 | Spark job orchestration |
| **Spark** | 9 | Spark pool and settings |
| **Report** | 6 | Power BI report operations |
| **Semantic Model** | 6 | Semantic model management |
| **Dashboard** | 1 | Dashboard operations |
| **Datamart** | 1 | Datamart management |
| **Mirrored Database** | 10 | Database mirroring |
| **Domain** | 11 | Domain administration |
| **Apache Airflow Job** | 6 | Airflow job management |
| **Copy Job** | 6 | Data copy operations |
| **Reflex** | 6 | Reflex item management |
| **GraphQL API** | 6 | GraphQL API operations |
| **Paginated Reports** | 2 | Paginated report management |
| **Mounted Data Factory** | 6 | Data Factory integration |
| **External Data Share** | 2 | Data sharing operations |
| **Folder** | 5 | Workspace folder management |
| **OneLake** | 6 | OneLake shortcuts and security |
| **SQL Endpoints** | 3 | SQL endpoint management |
| **Variable Library** | 5 | Variable management |
| **Labels** | 2 | Item labeling |
| **Tags** | 4 | Item tagging |
| **Sharing Links** | 2 | Sharing link management |
| **Connections** | 6 | Connection and gateway management |
| **Capacity** | 1 | Capacity operations |
| **Tenant** | 8 | Tenant-level settings |
| **Users** | 1 | User operations |
| **Utils** | 6 | Utility functions |
| **Managed Private Endpoint** | 3 | Private endpoint management |
| **Mirrored Warehouse** | 1 | Warehouse mirroring |

**Total: 244+ Cmdlets** across 42 resource types

</details>

---

## Advanced Usage

### Pipeline Integration

All cmdlets support PowerShell pipeline operations:

```powershell
# Get all lakehouses and export their metadata
Get-FabricWorkspace |
    ForEach-Object {
        Get-FabricLakehouse -WorkspaceId $_.id
    } |
    Export-Csv -Path "AllLakehouses.csv" -NoTypeInformation

# Filter workspaces and list their notebooks
Get-FabricWorkspace |
    Where-Object { $_.displayName -like "Dev*" } |
    ForEach-Object {
        Get-FabricNotebook -WorkspaceId $_.id |
            Select-Object @{N='Workspace';E={$_.displayName}}, displayName, id
    }
```

### Error Handling

```powershell
try {
    $workspace = New-FabricWorkspace -WorkspaceName "Production" -ErrorAction Stop
    Write-Host "Workspace created: $($workspace.id)"
}
catch {
    Write-Error "Failed to create workspace: $_"
    # Handle error appropriately
}
```

### Logging and Diagnostics

The module uses PSFramework for comprehensive logging:

```powershell
# Enable verbose logging
$VerbosePreference = "Continue"
Get-FabricWorkspace

# View PSFramework message log
Get-PSFMessage -Last 50

# Configure logging to file
Set-PSFLoggingProvider -Name logfile -FilePath "C:\Logs\Fabric.log" -Enabled $true
```

---

## Contributing

We welcome contributions! This project is part of the [microsoft/fabric-toolbox](https://github.com/microsoft/fabric-toolbox) repository.

### Development Setup

```powershell
# Clone the repository
git clone https://github.com/microsoft/fabric-toolbox.git
cd fabric-toolbox/tools/MicrosoftFabricMgmt

# Install development dependencies
.\build.ps1 -ResolveDependency

# Build the module
.\build.ps1 -Tasks build

# Run tests
.\build.ps1 -Tasks test
```

### Module Build System

The module uses [Sampler](https://github.com/gaelcolas/Sampler), a modern PowerShell module scaffolding framework:

- **Build**: `.\build.ps1 -Tasks build`
- **Test**: `.\build.ps1 -Tasks test`
- **Clean**: `.\build.ps1 -Tasks clean`
- **Pack**: `.\build.ps1 -Tasks pack`

---

## Support & Resources

### Documentation
- **Module Documentation**: See `docs/` folder for detailed cmdlet documentation
- **Microsoft Fabric Docs**: [Microsoft Fabric Documentation](https://learn.microsoft.com/fabric/)
- **REST API Reference**: [Fabric REST API](https://learn.microsoft.com/rest/api/fabric/)
- **API Specifications**: [Official Swagger Specs](https://github.com/microsoft/fabric-rest-api-specs)

### Community
- **Issues**: [GitHub Issues](https://github.com/microsoft/fabric-toolbox/issues)
- **Discussions**: [GitHub Discussions](https://github.com/microsoft/fabric-toolbox/discussions)

### Getting Help

```powershell
# Get help for any cmdlet
Get-Help <CmdletName> -Full

# List all cmdlets in the module
Get-Command -Module MicrosoftFabricMgmt

# Find cmdlets by keyword
Get-Command -Module MicrosoftFabricMgmt | Where-Object { $_.Name -like "*Lakehouse*" }
```

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](../../LICENSE) file for details.

---

## Changelog

### Latest Release

**Version 1.0.0** - Major Modernization Release
- ✅ 244+ cmdlets covering all major Fabric resource types
- ✅ Centralized helper functions (1,000+ lines of duplicate code eliminated)
- ✅ Enhanced retry logic with exponential backoff
- ✅ All endpoints validated against official API specifications
- ✅ PowerShell 5.1 and 7+ compatibility
- ✅ Comprehensive error handling and logging
- ✅ Fixed workspace role assignment URI construction bug
- ✅ Implemented PowerShell community best practices

For detailed release notes, see [CHANGELOG.md](./CHANGELOG.md).

---

## Acknowledgments

**Authors & Contributors:**
- Tiago Balabuch
- Jess Pomfret
- Rob Sewell

**Special Thanks:**
- Microsoft Fabric Team for the comprehensive REST API
- PowerShell Community for best practices and guidance
- PSFramework Team for the excellent logging and configuration framework

---

<p align="center">
  <strong>Built with ❤️ by the Microsoft Fabric community</strong><br>
  <a href="https://github.com/microsoft/fabric-toolbox">GitHub</a> •
  <a href="https://learn.microsoft.com/fabric/">Microsoft Fabric Docs</a> •
  <a href="https://www.powershellgallery.com/packages/MicrosoftFabricMgmt">PowerShell Gallery</a>
</p>
