# Fabric SQL Schema Extraction & CI/CD Pipeline

## Overview

This accelerator provides **automated CI/CD pipelines for Microsoft Fabric Data Warehouses and Lakehouses**, enabling enterprise-grade SQL schema version control, dependency management, and multi-environment deployments.

### What It Does

- **Extracts SQL schemas** from Fabric Lakehouse SQL endpoints into version-controlled .sqlproj files
- **Auto-detects dependencies** between lakehouses and warehouses by scanning SQL code
- **Builds DACPACs** in correct topological order with cross-database reference resolution
- **Deploys schemas** to dev/test/prod environments using SqlPackage
- **Tracks schema drift** through Git commits with automated branch creation

### Key Benefits

✅ **Zero manual configuration** - Dependencies detected automatically from SQL code  
✅ **Cross-database references** - Warehouses can reference lakehouse objects seamlessly  
✅ **Multi-environment promotion** - Branch-based deployment to dev → test → prod  
✅ **Git-based version control** - All schema changes tracked with full history  
✅ **Defensive coding patterns** - Battle-tested for cross-platform Azure Pipelines reliability

---

## Table of Contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup Instructions](#setup-instructions)
- [Repository Structure](#repository-structure)
- [Usage](#usage)
  - [Running Schema Extraction](#running-schema-extraction)
  - [Running Deployment](#running-deployment)
- [How It Works](#how-it-works)
- [Pipeline Parameters](#pipeline-parameters)
- [Test Objects](#test-objects)
- [Example Scenarios](#example-scenarios)
- [Learning Focus: Defensive Coding Patterns](#learning-focus-defensive-coding-patterns)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)

---

## Architecture

```
Fabric Lakehouses  →  SqlPackage  →  Extract SQL Schemas  →  Auto-Detect Dependencies
       ↓                                        ↓
    [SQL Queries]                    [.sql files + .sqlproj]
                                               ↓
                        ┌───────────────────────────────────┐
                        │  topological-sort dependency order │
                        └───────────────────────────────────┘
                                      ↓
                   [Build Lakehouse DACPACs in Order]
                                      ↓
                ┌──────────────────────────────────────┐
                │  Scan for Cross-Database References  │
                │  [DB].[schema].[object] Regex Match  │
                └──────────────────────────────────────┘
                                      ↓
              [Auto-Inject ArtifactReferences]
                                      ↓
                   [Build Warehouse DACPAC]
                                      ↓
          [Publish to DevOps → Test → Prod]
```

---

## Prerequisites

### Azure/Fabric Requirements

1. **Microsoft Fabric Workspace**
   - Fabric capacity assigned to workspace
   - Lakehouses with SQL endpoint enabled
   - Warehouse (optional, if deploying warehouse schemas)

2. **Azure DevOps Organization**
   - YAML pipelines enabled
   - Repository with pipelines and scripts from this accelerator

3. **Azure Service Principal**
   - Application (client) ID and secret
   - Registered in Azure AD tenant
   - **Required API Permissions:**
     - `https://api.fabric.microsoft.com/.default` - Fabric API access
   - **Required Access:**
     - Contributor role on Fabric workspaces (dev, test, prod)
     - Workspace Admin or Member role for deployment operations

4. **Azure Key Vault** (Optional but Recommended)
   - Store service principal credentials securely
   - Link to Azure DevOps variable group

### Tools (Auto-installed by Pipelines)

The following tools are automatically installed during pipeline execution:
- **.NET SDK 8.x** - For building SQL projects
- **SqlPackage** - Microsoft SQL Server Data-Tier Application CLI
- **Python 3.12** - For Fabric API calls
- **Python packages:** `fabric-cicd`, `azure-identity`, `requests`

---

## Setup Instructions

Follow these steps to configure the pipelines in your Azure DevOps environment.

### Step 1: Create Service Principal

If you don't already have a service principal:

```bash
# Login to Azure
az login

# Create service principal
az ad sp create-for-rbac --name "fabric-cicd-sp" --role Contributor

# Note the output: appId (client ID), password (secret), tenant
```

### Step 2: Configure Variable Groups

Create two variable groups in Azure DevOps (Pipelines → Library → Variable Groups):

#### Variable Group 1: `Fabric_Deployment_Group_S`

Link this group to Azure Key Vault (recommended) or create pipeline variables:

| Variable Name | Description | Example Value |
|---------------|-------------|---------------|
| `aztenantid` | Azure AD tenant ID | `12345678-1234-1234-1234-123456789abc` |
| `azclientid` | Service principal client ID | `87654321-4321-4321-4321-cba987654321` |
| `azspsecret` | Service principal secret | `your-secret-value` (mark as secret) |

#### Variable Group 2: `Fabric_Deployment_Group_DWFeature_NS`

Create pipeline variables (not linked to Key Vault):

| Variable Name | Description | Example Value |
|---------------|-------------|---------------|
| `devWorkspaceName` | Dev workspace display name | `Fabric Dev Workspace` |
| `testWorkspaceName` | Test workspace display name | `Fabric Test Workspace` |
| `prodWorkspaceName` | Prod workspace display name | `Fabric Prod Workspace` |
| `GITDIRECTORY` | Repository directory path | `fabric` or `.` |
| `featureWorkspaceName` | Optional feature workspace | `Fabric Feature Workspace` |
| `WAREHOUSE_NAME` | Optional warehouse name override | `DemoWarehouse` |

### Step 3: Grant Service Principal Access to Fabric

```powershell
# Install Fabric PowerShell module
Install-Module -Name MicrosoftFabric -Scope CurrentUser

# Connect to Fabric
Connect-Fabric

# Grant workspace access (repeat for each workspace)
Add-FabricWorkspaceUser -WorkspaceId <workspace-id> `
    -EmailAddress <service-principal-app-id>@<tenant-id> `
    -Role Admin
```

Alternatively, grant access through Fabric Portal:
1. Open workspace → Settings → Manage access
2. Add service principal by client ID
3. Assign "Admin" or "Member" role

### Step 4: Import Pipelines to Azure DevOps

1. Navigate to **Pipelines → Create Pipeline**
2. Select **Azure Repos Git** (or your repository location)
3. Choose **Existing Azure Pipelines YAML file**
4. Select `.pipeline/Extract-Lakehouse-Schema.yml`
5. Save (don't run yet)
6. Repeat for `.pipeline/Deploy-To-Fabric.yml`

### Step 5: Configure Pipeline Permissions

For each pipeline:
1. Edit pipeline → More actions (⋮) → Settings
2. Grant access to variable groups:
   - `Fabric_Deployment_Group_S`
   - `Fabric_Deployment_Group_DWFeature_NS`

### Step 6: Create Repository Folder Structure

In your repository, create the following structure:

```
your-repo/
├── .pipeline/                          # Pipeline YAML files
│   ├── Deploy-To-Fabric.yml
│   └── Extract-Lakehouse-Schema.yml
├── .deploy/                            # Deployment scripts
│   ├── deploy-to-fabric.py
│   └── extract-lakehouse-schema.ps1
└── fabric/                             # Your warehouse projects (create this)
    └── DemoWarehouse.Warehouse/        # Example warehouse project
        ├── dbo/
        │   ├── Views/
        │   │   └── vw_Example.sql
        │   ├── StoredProcedures/
        │   │   └── sp_Example.sql
        │   └── Tables/
        │       └── tbl_Example.sql
        └── DemoWarehouse.sqlproj
```

**Note:** The `lakehouse-schema/` directory is auto-generated by the extraction pipeline.

---

## Repository Structure

### Expected Directory Layout

```
Git-based-deployment-with-sqlproj-schemas/
├── README.md                                    # This file
├── .pipeline/
│   ├── Deploy-To-Fabric.yml                    # Main CI/CD pipeline (749 lines)
│   └── Extract-Lakehouse-Schema.yml            # Schema extraction pipeline (427 lines)
├── .deploy/
│   ├── deploy-to-fabric.py                     # Workspace/SQL endpoint discovery (328 lines)
│   └── extract-lakehouse-schema.ps1            # Schema extraction logic (565 lines)
├── fabric/                                      # User-created warehouse projects
│   └── {WarehouseName}.Warehouse/
│       ├── dbo/
│       │   ├── Tables/*.sql
│       │   ├── Views/*.sql
│       │   ├── StoredProcedures/*.sql
│       │   └── Functions/*.sql
│       └── {WarehouseName}.sqlproj
└── lakehouse-schema/                            # Auto-generated by extraction pipeline
    └── {LakehouseName}/
        ├── dbo/
        │   ├── Tables/*.sql
        │   ├── Views/*.sql
        │   ├── StoredProcedures/*.sql
        │   ├── Functions/*.sql
        │   └── Security/*.sql
        ├── {LakehouseName}.sqlproj
        └── dependency-manifest.json
```

### Warehouse .sqlproj Template

Create warehouse projects using this template:

```xml
<?xml version="1.0" encoding="utf-8"?>
<Project DefaultTargets="Build">
  <Sdk Name="Microsoft.Build.Sql" Version="0.1.19-preview" />
  <PropertyGroup>
    <Name>DemoWarehouse</Name>
    <DSP>Microsoft.Data.Tools.Schema.Sql.SqlDwUnifiedDatabaseSchemaProvider</DSP>
    <DefaultCollation>Latin1_General_100_BIN2_UTF8</DefaultCollation>
  </PropertyGroup>
  <Target Name="BeforeBuild">
    <Delete Files="$(BaseIntermediateOutputPath)\project.assets.json" />
  </Target>
  <!-- SQL files are auto-discovered; do not add explicit <Compile> items -->
  <!-- ArtifactReferences are auto-injected by pipeline -->
</Project>
```

### SQL File Naming Conventions

- **Cross-database references:** Use 3-part names `[DatabaseName].[schema].[object]`
- **Same-database references:** Use 2-part names `[schema].[object]`
- **Avoid:** Scalar-valued functions (not supported by Fabric)
- **Supported object types:** Tables, Views, Stored Procedures, Table-valued Functions

---

## Usage

### Running Schema Extraction

The **Extract-Lakehouse-Schema** pipeline downloads SQL schemas from Fabric lakehouses and commits them to Git.

#### Scenario 1: Manual Extraction (Initial Setup)

1. Navigate to **Pipelines → Extract-Lakehouse-Schema**
2. Click **Run pipeline**
3. Configure parameters:
   - `source_environment`: `dev` (or your starting environment)
   - `create_branch`: `true` (creates new branch for changes)
   - `branch_name`: `schema-extraction/initial` (or your preferred name)
4. Click **Run**

**What Happens:**
- Pipeline connects to dev workspace
- Extracts schemas from all lakehouses with SQL endpoints enabled
- Creates `lakehouse-schema/` directory with .sqlproj files
- Detects dependencies between lakehouses
- Commits changes to new branch: `schema-extraction/initial`
- Creates pull request (optional, configure branch policies)

#### Scenario 2: Feature Branch Extraction

For development in a dedicated feature workspace:

1. Run pipeline with parameters:
   - `source_environment`: `dev` (ignored when custom_workspace_name is set)
   - `custom_workspace_name`: `Fabric Feature Workspace` (your feature workspace)
   - `create_branch`: `true`
   - `branch_name`: `feature/new-analytics`
2. Click **Run**

**Result:** Schemas extracted from feature workspace and committed to `feature/new-analytics` branch.

#### Scenario 3: Pull Request Triggered Extraction

Configure **branch policy** on `main` branch:
1. Branch policies → Build validation → Add build policy
2. Select `Extract-Lakehouse-Schema` pipeline
3. Branch filter: `main`

**Behavior:** When PR is created, pipeline automatically:
- Detects PR source branch name
- Attempts to find matching workspace by name
- Extracts schemas and commits back to PR branch
- Enables schema drift detection in code review

#### Scenario 4: Scheduled Drift Detection

Uncomment the schedule trigger in `Extract-Lakehouse-Schema.yml`:

```yaml
schedules:
  - cron: "0 2 * * *"  # 2 AM daily
    displayName: Daily drift detection
    branches:
      include:
        - main
```

**Result:** Daily extraction commits schema changes, providing audit trail of manual modifications.

### Running Deployment

The **Deploy-To-Fabric** pipeline builds DACPACs and deploys to Fabric workspaces.

#### Branch-Based Deployment

Deployments trigger automatically based on branch:

| Branch | Target Environment | Workspace Variable |
|--------|-------------------|-------------------|
| `dev` | Development | `devWorkspaceName` |
| `test` | Test | `testWorkspaceName` |
| `prod` | Production | `prodWorkspaceName` |

**Workflow:**

1. **Deploy to Dev:**
   ```bash
   git checkout dev
   git merge main  # Or make changes directly
   git push origin dev
   ```
   → Pipeline deploys to dev workspace

2. **Promote to Test:**
   ```bash
   git checkout test
   git merge dev
   git push origin test
   ```
   → Pipeline deploys to test workspace

3. **Promote to Prod:**
   ```bash
   git checkout prod
   git merge test
   git push origin prod
   ```
   → Pipeline deploys to prod workspace

#### Customizing Deployment Scope

Use the `items_in_scope` parameter to control which Fabric item types deploy:

**Default (all items):**
```json
["Notebook","DataPipeline","Lakehouse","SemanticModel","Report","Warehouse","CopyJob"]
```

**Warehouses and lakehouses only:**
```json
["Lakehouse","Warehouse"]
```

To set this:
1. Edit pipeline → Variables
2. Add/modify `items_in_scope` variable
3. Set value to JSON array of desired types

#### Monitoring Deployment

1. Navigate to pipeline run
2. Check each stage:
   - **Fabric Item Deployment** - Publishes notebooks, pipelines, reports
   - **Build Lakehouse DACPACs** - Compiles lakehouse schemas
   - **Build Warehouse DACPACs** - Compiles warehouse with references
   - **Deploy Warehouse** - Publishes warehouse schema
   - **Deploy Lakehouses** - Publishes lakehouse views/stored procedures

3. Review artifacts:
   - `lakehouse-dacpacs` - Built lakehouse DACPACs
   - `warehouse-dacpac` - Built warehouse DACPAC
   - `diagnostics` - SqlPackage diagnostic logs

---

## How It Works

### Architecture

```
Fabric Lakehouses  →  SqlPackage  →  Extract SQL Schemas  →  Auto-Detect Dependencies
       ↓                                        ↓
    [SQL Queries]                    [.sql files + .sqlproj]
                                               ↓
                        ┌───────────────────────────────────┐
                        │  topological-sort dependency order │
                        └───────────────────────────────────┘
                                      ↓
                   [Build Lakehouse DACPACs in Order]
                                      ↓
                ┌──────────────────────────────────────┐
                │  Scan for Cross-Database References  │
                │  [DB].[schema].[object] Regex Match  │
                └──────────────────────────────────────┘
                                      ↓
              [Auto-Inject ArtifactReferences]
                                      ↓
                   [Build Warehouse DACPAC]
                                      ↓
          [Publish to DevOps → Test → Prod]
```

### Phase-by-Phase Breakdown

#### Phase 1: Schema Extraction
- **Tool:** SqlPackage `/Action:Extract`
- **Input:** Fabric Lakehouse SQL endpoints (discovered via Fabric API)
- **Output:** `.sql` files organized by object type (Tables, Views, StoredProcedures, Functions)
- **Process:**
  1. Connect to each lakehouse SQL endpoint using service principal
  2. Extract schema to temporary directory
  3. Reorganize files into folder structure
  4. **Filter out scalar functions** (not supported by Fabric)
  5. Create SDK-style `.sqlproj` file
  6. Remove self-references (convert 3-part to 2-part names for same-database objects)

#### Phase 2: Dependency Detection
- **Tool:** PowerShell regex scanning
- **Input:** All `.sql` files in repository
- **Pattern:** `[DatabaseName].[schema].[object]` (3-part names)
- **Output:** `dependency-manifest.json`
- **Process:**
  1. Scan all SQL files for cross-database reference patterns
  2. Exclude system databases (sys, INFORMATION_SCHEMA, master, tempdb)
  3. Record dependencies only for projects in repository
  4. Build dependency graph

#### Phase 3: Lakehouse DACPAC Build
- **Tool:** `dotnet build` with `Microsoft.Build.Sql`
- **Input:** Lakehouse `.sqlproj` files
- **Process:**
  1. Calculate build order using topological sort
  2. Inject `<ArtifactReference>` elements for lakehouse-to-lakehouse dependencies
  3. Build each lakehouse project in dependency order
  4. Output DACPACs to `.deploy/dacpacs/lakehouse/{name}/`

#### Phase 4: Warehouse Artifact Reference Injection
- **Tool:** PowerShell XML manipulation
- **Input:** Warehouse `.sqlproj` files, built lakehouse DACPACs
- **Process:**
  1. Scan warehouse SQL files for cross-database references to lakehouses
  2. Calculate relative paths to lakehouse DACPACs
  3. Inject `<ArtifactReference>` elements into warehouse `.sqlproj`
  4. Each reference includes:
     - DACPAC path
     - Database variable literal value
     - SQLCMD variable name

#### Phase 5: Warehouse DACPAC Build
- **Tool:** `dotnet build`
- **Input:** Warehouse `.sqlproj` with artifact references
- **Process:**
  1. Create temporary build directory
  2. Copy warehouse projects and lakehouse DACPACs
  3. Build with relaxed validation (suppress cross-database warnings)
  4. Output DACPAC to `fabric/{WarehouseName}.Warehouse/bin/`

#### Phase 6: Multi-Environment Deployment
- **Tool:** SqlPackage `/Action:Publish`
- **Input:** Built DACPACs, target workspace connection strings
- **Process:**
  1. Discover target workspace and SQL endpoints from Fabric API
  2. **Deploy warehouse:**
     - Publish all objects (tables, views, stored procedures, functions)
     - Drop objects not in source (controlled by parameter)
     - Reference lakehouse DACPACs for unresolved references
  3. **Deploy lakehouses:**
     - Publish only views, stored procedures, functions (exclude tables)
     - Deploy in dependency order
     - Drop objects not in source

---

## Pipeline Parameters

### Extract-Lakehouse-Schema Pipeline

| Parameter | Type | Default | Description | When to Use |
|-----------|------|---------|-------------|-------------|
| `source_environment` | string | `dev` | Source environment | Initial extraction from dev/test/prod workspace |
| `custom_workspace_name` | string | `` | Custom workspace name | Feature branch development in dedicated workspace |
| `create_branch` | boolean | `true` | Create new branch | Manual runs creating new feature branch |
| `branch_name` | string | `schema-extraction/auto` | Target branch name | Specify custom branch name for organization |

**Example: Extract from feature workspace**
```yaml
source_environment: dev  # Ignored
custom_workspace_name: Fabric Feature Analytics
create_branch: true
branch_name: feature/analytics-v2
```

### Deploy-To-Fabric Pipeline

| Parameter | Type | Default | Description | When to Use |
|-----------|------|---------|-------------|-------------|
| `items_in_scope` | string (JSON array) | `["Notebook","DataPipeline","Lakehouse","SemanticModel","Report","Warehouse","CopyJob"]` | Fabric items to deploy | Limit deployment to specific item types |

**Example: Deploy only warehouses and lakehouses**
```yaml
items_in_scope: '["Lakehouse","Warehouse"]'
```

---

## Test Objects

## Test Objects

The accelerator documentation references consolidated test scripts for validating cross-database dependencies. These scripts demonstrate proper reference patterns for Fabric SQL objects.

### Creating Test Objects

If you want to test the pipeline with sample dependencies, create these objects manually in your Fabric workspace:

#### Lakehouse Test Objects

Run this script in your lakehouse SQL endpoint (e.g., `DemoLakehouse_Shortcut`) to create test objects with dependencies:

```sql
-- Create view with cross-database dependency (3-part name)
CREATE VIEW dbo.vw_CrossDatabase AS
SELECT * FROM [DemoLakehouse].[dbo].[SourceTable];

-- Create view with same-database reference (2-part name)
CREATE VIEW dbo.vw_SameDatabase AS
SELECT * FROM [dbo].[LocalTable];

-- Create stored procedure with cross-database dependency
CREATE PROCEDURE dbo.sp_CrossDatabaseProc
AS
BEGIN
    SELECT * FROM [DemoLakehouse].[dbo].[SourceTable];
END;

-- Create table-valued function
CREATE FUNCTION dbo.tvf_CrossDatabaseFunction()
RETURNS TABLE
AS
RETURN
    SELECT * FROM [DemoLakehouse].[dbo].[SourceTable];

-- Note: Scalar functions are NOT supported by Fabric and will be filtered out
```

#### Warehouse Test Objects

Run this script in your warehouse (e.g., `DemoWarehouse`) to create test objects that reference lakehouses:

```sql
-- Create view referencing multiple lakehouses
CREATE VIEW dbo.vw_CrossJoin AS
SELECT 
    l1.Column1,
    l2.Column2
FROM [DemoLakehouse].[dbo].[Table1] l1
CROSS JOIN [DemoLakehouse_Shortcut].[dbo].[Table2] l2;

-- Create stored procedure with lakehouse dependencies
CREATE PROCEDURE dbo.sp_AggregateFromLakehouses
AS
BEGIN
    SELECT 
        COUNT(*) as TotalRecords
    FROM [DemoLakehouse].[dbo].[Table1]
    UNION ALL
    SELECT 
        COUNT(*) as TotalRecords
    FROM [DemoLakehouse_Shortcut].[dbo].[Table2];
END;

-- Create table-valued function with lakehouse dependency
CREATE FUNCTION dbo.tvf_FilteredLakehouseData(@MinValue INT)
RETURNS TABLE
AS
RETURN
    SELECT * 
    FROM [DemoLakehouse].[dbo].[Table1]
    WHERE Value >= @MinValue;
```

### Reference Naming Rules

| Reference Type | Naming Convention | Example |
|----------------|-------------------|---------|
| Cross-database (lakehouse to lakehouse) | 3-part name | `[DemoLakehouse].[dbo].[Table1]` |
| Cross-database (warehouse to lakehouse) | 3-part name | `[DemoLakehouse].[dbo].[Table1]` |
| Same-database | 2-part name | `[dbo].[LocalTable]` |
| System objects | 2-part name | `[sys].[tables]` |

**Important Notes:**
- **Scalar functions** are automatically filtered out during extraction (Fabric limitation)
- Only **table-valued functions** and **inline table-valued functions** are supported
- Using 3-part names for same-database objects will cause resolution errors

---

## Example Scenarios

### Scenario 1: Initial Setup and First Extraction

**Goal:** Set up pipelines and extract schemas from dev workspace for the first time.

**Steps:**
1. Complete [Setup Instructions](#setup-instructions) (service principal, variable groups, pipelines)
2. Ensure dev workspace has lakehouses with SQL endpoints enabled
3. Run **Extract-Lakehouse-Schema** pipeline:
   - `source_environment`: `dev`
   - `create_branch`: `true`
   - `branch_name`: `schema-extraction/initial`
4. Wait for pipeline completion (5-10 minutes for typical workspace)
5. Review created PR or branch:
   - `lakehouse-schema/` directory created
   - One subfolder per lakehouse
   - `.sqlproj` and `.sql` files committed

**Validation:**
```powershell
# Check created structure
ls lakehouse-schema/
# Should show: DemoLakehouse/, DemoLakehouse_Shortcut/, etc.

# Review extracted project
cat lakehouse-schema/DemoLakehouse/DemoLakehouse.sqlproj

# Check for dependencies
cat lakehouse-schema/DemoLakehouse/dependency-manifest.json
```

6. Merge branch to `main`
7. Sync `main` to `dev` branch to trigger deployment

**Expected Result:** Schemas version-controlled in Git, ready for deployment pipeline.

---

### Scenario 2: Adding a New Lakehouse

**Goal:** Add a new lakehouse to existing workspace and update version control.

**Steps:**
1. Create new lakehouse in Fabric workspace (e.g., `CustomerAnalytics`)
2. Enable SQL endpoint (Workspace → Lakehouse → Settings → SQL endpoint)
3. Create SQL objects (views, stored procedures, functions)
4. Run **Extract-Lakehouse-Schema** pipeline:
   - `source_environment`: `dev`
   - `create_branch`: `true`
   - `branch_name`: `feature/add-customer-analytics-lakehouse`
5. Review PR - new directory `lakehouse-schema/CustomerAnalytics/` added
6. Merge to `main`
7. Deploy to environments by merging to `dev`/`test`/`prod` branches

**Validation:**
```powershell
# Verify new lakehouse directory
ls lakehouse-schema/CustomerAnalytics/

# Check if pipeline discovers it
# Look for "Lakehouse: CustomerAnalytics" in extraction logs
```

---

### Scenario 3: Cross-Database Warehouse Development

**Goal:** Create a warehouse with views/stored procedures that reference multiple lakehouses.

**Steps:**
1. Create warehouse project in repository:
   ```
   fabric/
   └── SalesWarehouse.Warehouse/
       ├── dbo/
       │   ├── Views/
       │   │   └── vw_CustomerSales.sql
       │   └── StoredProcedures/
       │       └── sp_DailySalesReport.sql
       └── SalesWarehouse.sqlproj
   ```

2. Create warehouse in Fabric workspace (name must match: `SalesWarehouse`)

3. Add SQL objects with cross-database references:
   ```sql
   -- fabric/SalesWarehouse.Warehouse/dbo/Views/vw_CustomerSales.sql
   CREATE VIEW [dbo].[vw_CustomerSales] AS
   SELECT 
       c.CustomerId,
       c.CustomerName,
       s.SalesAmount
   FROM [CustomerLakehouse].[dbo].[Customers] c
   INNER JOIN [SalesLakehouse].[dbo].[Sales] s
       ON c.CustomerId = s.CustomerId;
   ```

4. Commit warehouse project to `main` branch
5. Merge `main` to `dev` branch
6. **Deploy-To-Fabric** pipeline automatically:
   - Detects `[CustomerLakehouse]` and `[SalesLakehouse]` references
   - Injects `<ArtifactReference>` elements
   - Builds warehouse DACPAC with lakehouse dependencies
   - Deploys to dev workspace

**Validation:**
Check pipeline logs for:
```
Scanning warehouse SQL files for cross-database references...
Found reference: CustomerLakehouse
Found reference: SalesLakehouse
Injecting ArtifactReference for CustomerLakehouse
Injecting ArtifactReference for SalesLakehouse
Building warehouse DACPAC...
Publishing warehouse to Fabric...
```

Query warehouse to verify:
```sql
SELECT TOP 10 * FROM [dbo].[vw_CustomerSales];
```

---

### Scenario 4: Promoting Changes Through Environments

**Goal:** Deploy a schema change from dev → test → prod with proper validation.

**Steps:**

1. **Develop in Dev Workspace:**
   ```bash
   git checkout dev
   # Make changes to SQL files or run extraction
   git add .
   git commit -m "Add new customer aggregation view"
   git push origin dev
   ```
   → Deploys to dev workspace automatically

2. **Test in Test Environment:**
   ```bash
   git checkout test
   git merge dev
   git push origin test
   ```
   → Deploys to test workspace automatically

3. **Validate in Test:**
   - Run integration tests
   - Verify performance
   - Check data quality

4. **Deploy to Production:**
   ```bash
   git checkout prod
   git merge test --no-ff  # Create merge commit for audit trail
   git push origin prod
   ```
   → Deploys to prod workspace automatically

5. **Rollback if Needed:**
   ```bash
   git checkout prod
   git revert HEAD
   git push origin prod
   ```
   → Reverts to previous schema

**Best Practices:**
- Use pull requests for test and prod branches
- Require approvals for prod deployments
- Tag releases: `git tag v1.2.0 && git push --tags`
- Document breaking changes in commit messages

---

---

## Learning Focus: Defensive Coding Patterns

This solution implements defensive SQL/XML handling practices that prevent common CI/CD failures. These patterns are valuable learning examples for anyone building cross-platform Azure Pipelines.

### 1. Cross-Platform Path Handling

**Problem:**
```powershell
# This fails on Linux agents
$path -like "*\lakehouse-schema\*"  # Backslash treated as escape character
```

**Solution:**
```powershell
# This works on both Windows and Linux
$path -match '[\\/]lakehouse-schema[\\/]'  # Accepts both / and \
```

**Location:** [.deploy/extract-lakehouse-schema.ps1](.deploy/extract-lakehouse-schema.ps1) (lines 330-333, 394-397)

**Why It Matters:** Azure Pipelines can run on Windows, Linux, or macOS agents. Hardcoding Windows path separators causes silent failures on non-Windows agents.

---

### 2. XML NULL Safety

**Problem:**
```powershell
# This crashes when ItemGroup has no ArtifactReference children
$itemGroup.ArtifactReference  # Returns $null
foreach ($ref in $itemGroup.ArtifactReference) {
    $itemGroup.RemoveChild($ref)  # RemoveChild($null) → Exception
}
```

**Solution:**
```powershell
# Use XPath which returns empty NodeList, not null
$existingRefs = $itemGroup.SelectNodes("./ArtifactReference")
foreach ($ref in $existingRefs) {
    [void]$itemGroup.RemoveChild($ref)  # Safe even when empty
}
```

**Location:** [.deploy/extract-lakehouse-schema.ps1](.deploy/extract-lakehouse-schema.ps1) (lines 402-407)

**Why It Matters:** Direct property enumeration returns `$null` for missing elements, causing NullReferenceException. XPath always returns a collection (empty if no matches).

---

### 3. DACPAC Model Caching

**Problem:**
```xml
<!-- Explicit Compile items cause SDK to treat .sql files as C# source -->
<Project>
  <ItemGroup>
    <Compile Include="dbo/Tables/Table1.sql" />
    <Compile Include="dbo/Views/View1.sql" />
  </ItemGroup>
</Project>
```
**Error:** `error CS1056: Unexpected character '$'` (SQL treated as C# code)

**Solution:**
```xml
<!-- Remove explicit Compile items; SDK auto-discovers .sql files -->
<Project DefaultTargets="Build">
  <Sdk Name="Microsoft.Build.Sql" Version="0.1.19-preview" />
  <!-- SQL files are auto-discovered; no ItemGroup needed -->
</Project>
```

**Location:** Example warehouse projects in `fabric/` directory

**Why It Matters:** `Microsoft.Build.Sql` SDK automatically discovers `.sql` files. Explicit `<Compile>` items override SDK behavior, causing build failures.

---

### 4. Object Reference Syntax

**Problem:**
```sql
-- Using 3-part name for same-database object
CREATE VIEW dbo.vw_Example AS
SELECT * FROM [DemoWarehouse].[dbo].[LocalTable];
```
**Error:** `SQL71561: View [dbo].[vw_Example] contains unresolved reference to [DemoWarehouse].[dbo].[LocalTable]`

**Solution:**
```sql
-- Use 2-part name for same-database objects
CREATE VIEW dbo.vw_Example AS
SELECT * FROM [dbo].[LocalTable];

-- Use 3-part name ONLY for cross-database references
CREATE VIEW dbo.vw_CrossDB AS
SELECT * FROM [DemoLakehouse].[dbo].[RemoteTable];
```

**Location:** Documented in SQL file naming conventions

**Why It Matters:** SqlPackage cannot resolve 3-part names for objects in the same database during DACPAC publish. Use 3-part names exclusively for external database references.

---

### 5. Scalar Function Filtering

**Problem:**
```sql
-- Fabric doesn't support scalar-valued functions
CREATE FUNCTION dbo.fn_Calculate(@x INT)
RETURNS INT
AS
BEGIN
    RETURN @x * 2;
END;
```
**Error:** `SQL70015: Scalar-valued functions are not supported`

**Solution:**
```powershell
# Automatically detect and filter scalar functions during extraction
$sqlFiles = Get-ChildItem -Path $extractPath -Filter "*.sql" -Recurse
foreach ($sqlFile in $sqlFiles) {
    $content = Get-Content $sqlFile.FullName -Raw
    if ($content -match 'CREATE\s+FUNCTION.*RETURNS\s+\w+\s+AS\s+BEGIN') {
        # Scalar function detected - skip
        Remove-Item $sqlFile.FullName
        Write-Host "Filtered scalar function: $($sqlFile.Name)"
    }
}
```

**Location:** [.deploy/extract-lakehouse-schema.ps1](.deploy/extract-lakehouse-schema.ps1) (scalar function detection logic)

**Why It Matters:** SqlPackage extraction includes scalar functions, but Fabric deployment rejects them. Proactive filtering prevents build failures.

---

### 6. Topological Sort Array Forcing

**Problem:**
```powershell
# PowerShell returns scalar instead of array for single-item result
function Get-TopoOrder($projects) {
    # ... sorting logic ...
    return $sorted  # Returns [string] if only one project
}

$order = Get-TopoOrder $projects
foreach ($proj in $order) {  # Iterates characters if scalar
    # Build fails - treating string as char array
}
```

**Solution:**
```powershell
# Force array output with @() wrapper
function Get-TopoOrder($projects) {
    # ... sorting logic ...
    return @($sorted)  # Always returns [array]
}
```

**Location:** [.pipeline/Deploy-To-Fabric.yml](.pipeline/Deploy-To-Fabric.yml) (topological sort functions)

**Why It Matters:** PowerShell's implicit unrolling converts single-item arrays to scalars. Forcing array type prevents iteration errors when only one project exists.

---

### 7. BuildProjectReferences Flag Management

**Problem:**
```powershell
# Building lakehouse projects with BuildProjectReferences=true
dotnet build $lakehouseProj /p:BuildProjectReferences=true
# Each project builds its dependencies
# Duplicate model conflicts: "Table 'dbo.Table1' already exists in model"
```

**Solution:**
```powershell
# Lakehouse projects: disable recursive dependency building
dotnet build $lakehouseProj /p:BuildProjectReferences=false

# Warehouse projects: enable it (needs lakehouse models)
dotnet build $warehouseProj /p:BuildProjectReferences=true
```

**Location:** [.pipeline/Deploy-To-Fabric.yml](.pipeline/Deploy-To-Fabric.yml) (build stages)

**Why It Matters:** When multiple projects reference the same DACPAC, enabling `BuildProjectReferences` causes each to build the dependency independently, creating model conflicts.

---

## Troubleshooting

### Extraction Pipeline Issues

#### Issue: "No lakehouses found in workspace"

**Symptoms:**
- Pipeline completes but no `lakehouse-schema/` directory created
- Log shows: `No Lakehouse items with SQL endpoints in workspace`

**Causes:**
- Lakehouse SQL endpoint not enabled
- Service principal lacks workspace access
- Workspace name mismatch

**Resolution:**
1. Verify lakehouse SQL endpoint enabled:
   - Fabric Portal → Workspace → Lakehouse → Settings → SQL analytics endpoint: **Enabled**
2. Check service principal permissions:
   ```powershell
   Get-FabricWorkspaceUser -WorkspaceId <workspace-id> | 
       Where-Object { $_.PrincipalName -like "*<client-id>*" }
   ```
3. Verify workspace name matches variable group exactly (case-sensitive)

---

#### Issue: "SQL46010: Incorrect Syntax near '-'"

**Symptoms:**
```
Error SQL46010: Incorrect syntax near --
```

**Cause:** SqlPackage extraction sometimes corrupts comment lines (single `-` instead of `--`)

**Resolution:**
1. Check extracted SQL files for malformed comments:
   ```powershell
   # Find files with single-dash comments
   Get-ChildItem lakehouse-schema -Recurse -Filter "*.sql" | 
       Select-String -Pattern "^\s*-\s[^-]" | 
       Select-Object Path, LineNumber, Line
   ```
2. Manually fix corrupted files:
   ```sql
   -- Before (invalid)
   - This is a comment
   
   -- After (valid)
   -- This is a comment
   ```
3. Commit fixes to repository

**Prevention:** This is a known SqlPackage bug. Monitor extraction logs for parsing warnings.

---

#### Issue: "[skip ci] infinite loop"

**Symptoms:**
- Extraction pipeline triggers itself repeatedly
- Git commits stack up with same message

**Cause:** `[skip ci]` marker missing from commit message

**Resolution:**
- Verify commit step in pipeline includes marker:
  ```yaml
  - bash: |
      git commit -m "Auto-extract schemas [skip ci]"
  ```
- Check branch policies don't override `[skip ci]` behavior
- Manually stop pipeline runs and merge PR to break loop

---

### Deployment Pipeline Issues

#### Issue: "SQL71561: Unresolved reference to object [DB].[schema].[object]"

**Symptoms:**
```
Error SQL71561: View [dbo].[vw_Example] contains an unresolved reference 
to object [DemoLakehouse].[dbo].[Table1]
```

**Causes:**
- ArtifactReference missing from warehouse `.sqlproj`
- DACPAC file path incorrect
- Lakehouse DACPAC not built before warehouse

**Resolution:**

1. **Check ArtifactReferences were injected:**
   ```powershell
   # View warehouse project XML
   cat fabric/DemoWarehouse.Warehouse/DemoWarehouse.sqlproj | 
       Select-String -Pattern "ArtifactReference"
   ```
   Should show:
   ```xml
   <ArtifactReference Include="..\..\.deploy\dacpacs\lakehouse\DemoLakehouse\DemoLakehouse.dacpac">
     <DatabaseVariableLiteralValue>DemoLakehouse</DatabaseVariableLiteralValue>
     <DatabaseSqlCmdVariable>DemoLakehouse</DatabaseSqlCmdVariable>
   </ArtifactReference>
   ```

2. **Verify lakehouse DACPAC exists:**
   ```powershell
   ls .deploy/dacpacs/lakehouse/*/
   ```
   Should show: `DemoLakehouse.dacpac`

3. **Check build order:**
   - Review pipeline logs: "Build Lakehouse DACPACs" stage must complete before "Build Warehouse DACPAC"
   - Verify topological sort output shows correct order

4. **Validate relative paths use forward slashes:**
   ```xml
   <!-- Correct (cross-platform) -->
   <ArtifactReference Include="../../.deploy/dacpacs/lakehouse/DemoLakehouse.dacpac">
   
   <!-- Incorrect (Windows-only) -->
   <ArtifactReference Include="..\..\deploy\dacpacs\lakehouse\DemoLakehouse.dacpac">
   ```

---

#### Issue: "Build Dependency Cycle Detected"

**Symptoms:**
```
ERROR: Circular dependency detected in build order
Project A depends on Project B
Project B depends on Project A
```

**Cause:** Mutual cross-database references between lakehouses (not supported)

**Resolution:**
1. Review dependency manifest:
   ```powershell
   cat lakehouse-schema/*/dependency-manifest.json | ConvertFrom-Json
   ```
2. Identify circular references
3. Refactor SQL objects:
   - Option A: Move shared objects to common lakehouse
   - Option B: Remove cross-references (denormalize data)
   - Option C: Use warehouse as integration layer (lakehouses don't reference each other)

**Best Practice:** Lakehouses should not cross-reference each other. Use warehouse as the aggregation/integration layer.

---

#### Issue: "SQL70015: Scalar-valued functions are not supported"

**Symptoms:**
```
Error SQL70015: Function [dbo].[fn_Calculate] is a scalar-valued function. 
Scalar-valued functions are not supported by the target platform.
```

**Cause:** Scalar function not filtered during extraction

**Resolution:**
1. **Automatic fix (re-extract):**
   - Run extraction pipeline again
   - Updated script automatically filters scalar functions

2. **Manual fix:**
   ```powershell
   # Find scalar functions in lakehouse-schema/
   Get-ChildItem lakehouse-schema -Recurse -Filter "*.sql" | 
       ForEach-Object {
           $content = Get-Content $_.FullName -Raw
           if ($content -match 'CREATE\s+FUNCTION.*RETURNS\s+\w+\s+AS\s+BEGIN') {
               Write-Host "Scalar function found: $($_.FullName)"
               Remove-Item $_.FullName
           }
       }
   ```

3. **Refactor to table-valued function:**
   ```sql
   -- Before (scalar - not supported)
   CREATE FUNCTION dbo.fn_Calculate(@x INT)
   RETURNS INT
   AS
   BEGIN
       RETURN @x * 2;
   END;
   
   -- After (table-valued - supported)
   CREATE FUNCTION dbo.tvf_Calculate(@x INT)
   RETURNS TABLE
   AS
   RETURN (SELECT @x * 2 AS Result);
   
   -- Usage changes from:
   SELECT dbo.fn_Calculate(5)
   -- To:
   SELECT Result FROM dbo.tvf_Calculate(5)
   ```

---

#### Issue: "401 Unauthorized" when calling Fabric API

**Symptoms:**
```
ERROR: Failed to get workspace ID: 401 Unauthorized
```

**Causes:**
- Service principal secret expired or incorrect
- Service principal missing Fabric API permissions
- Tenant ID mismatch

**Resolution:**

1. **Verify credentials:**
   ```powershell
   # Test authentication
   $tenantId = "<your-tenant-id>"
   $clientId = "<your-client-id>"
   $clientSecret = "<your-secret>"
   
   $body = @{
       grant_type    = "client_credentials"
       client_id     = $clientId
       client_secret = $clientSecret
       scope         = "https://api.fabric.microsoft.com/.default"
   }
   
   $token = Invoke-RestMethod -Method Post `
       -Uri "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token" `
       -Body $body
   
   Write-Host "Token acquired: $($token.access_token.Substring(0,20))..."
   ```

2. **Check API permissions:**
   - Azure Portal → App Registrations → Your SPN → API Permissions
   - Should include: `https://api.fabric.microsoft.com/.default`
   - Click "Grant admin consent"

3. **Verify workspace access:**
   - Fabric Portal → Workspace → Manage access
   - Add service principal with Admin or Member role

4. **Update variable group if secret changed:**
   - Azure DevOps → Pipelines → Library → `Fabric_Deployment_Group_S`
   - Update `azspsecret` variable
   - Mark as secret

---

### Build Issues

#### Issue: "error CS1056: Unexpected character '$'"

**Symptoms:**
```
error CS1056: Unexpected character '$'
error CS1002: ; expected
```

**Cause:** `.sqlproj` has explicit `<Compile>` items, causing SDK to treat SQL as C# code

**Resolution:**
1. Remove explicit `<Compile>` items from `.sqlproj`:
   ```xml
   <!-- Remove this entire ItemGroup -->
   <ItemGroup>
     <Compile Include="dbo/Tables/Table1.sql" />
     <Compile Include="dbo/Views/View1.sql" />
   </ItemGroup>
   ```

2. Ensure proper SDK reference:
   ```xml
   <Project DefaultTargets="Build">
     <Sdk Name="Microsoft.Build.Sql" Version="0.1.19-preview" />
     <!-- SQL files are auto-discovered -->
   </Project>
   ```

3. Clean build artifacts:
   ```powershell
   dotnet clean
   Remove-Item -Recurse -Force */bin, */obj
   dotnet build
   ```

---

### Deployment Issues

#### Issue: "Block on possible data loss"

**Symptoms:**
```
Warning SQL72014: Data motion will result in data loss
Error SQL72015: Deployment blocked due to possible data loss
```

**Cause:** Schema change would delete data (e.g., dropping table, changing column type)

**Resolution:**

1. **Allow data loss** (non-production environments):
   ```powershell
   sqlpackage /Action:Publish `
       /p:BlockOnPossibleDataLoss=false `
       # ... other parameters
   ```
   
2. **Use pre/post-deployment scripts** (production):
   ```sql
   -- PreDeployment.sql
   -- Backup data before schema change
   SELECT * INTO dbo.Table1_Backup FROM dbo.Table1;
   
   -- PostDeployment.sql
   -- Restore data after schema change
   INSERT INTO dbo.Table1 SELECT * FROM dbo.Table1_Backup;
   DROP TABLE dbo.Table1_Backup;
   ```

3. **Modify deployment property in pipeline:**
   - Edit `.pipeline/Deploy-To-Fabric.yml`
   - Locate SqlPackage publish command
   - Change `/p:BlockOnPossibleDataLoss=false` to `true` for production

---

## Contributing

This accelerator is part of the [Microsoft Fabric Toolbox](https://github.com/microsoft/fabric-toolbox) - a community-driven collection of tools, accelerators, and samples for Microsoft Fabric.

### How to Contribute

We welcome contributions! Here's how you can help:

1. **Report Issues**
   - Found a bug? [Open an issue](https://github.com/microsoft/fabric-toolbox/issues)
   - Include pipeline logs, error messages, and reproduction steps
   - Specify your environment (Fabric region, Azure DevOps agent OS)

2. **Suggest Enhancements**
   - Have an idea for improvement? [Start a discussion](https://github.com/microsoft/fabric-toolbox/discussions)
   - Explain the use case and benefits
   - Consider backward compatibility

3. **Submit Pull Requests**
   - Fork the repository
   - Create a feature branch: `git checkout -b feature/your-feature-name`
   - Make your changes
   - Test thoroughly (provide test results in PR description)
   - Submit PR with clear description of changes
   - Reference related issues

4. **Improve Documentation**
   - Clarify confusing sections
   - Add examples or screenshots
   - Fix typos or broken links
   - Share your deployment experiences

### What This Accelerator Demonstrates

This solution showcases several advanced patterns valuable for learning:

✅ **Automated cross-platform SQL project discovery** without manual configuration  
✅ **DACPAC-based multi-environment deployment** with branch-based promotion  
✅ **Defensive PowerShell/XML handling** for fragile build environments  
✅ **Dependency resolution using code analysis** rather than explicit metadata  
✅ **Git-based schema versioning** with automated drift detection  
✅ **Cross-database reference handling** for enterprise data warehousing  

The defensive coding patterns documented in this README prevent common pitfalls encountered when building production CI/CD pipelines for SQL Server Data Tools (SSDT) and Microsoft.Build.Sql projects across heterogeneous agent environments.

### Code of Conduct

This project follows the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information, see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/).

### License

This project is licensed under the [MIT License](../../../LICENSE).

---

## Additional Resources

- [Microsoft Fabric Documentation](https://learn.microsoft.com/fabric/)
- [Azure DevOps Pipelines Documentation](https://learn.microsoft.com/azure/devops/pipelines/)
- [SqlPackage Documentation](https://learn.microsoft.com/sql/tools/sqlpackage/)
- [Microsoft.Build.Sql SDK](https://learn.microsoft.com/sql/tools/sql-database-projects/sql-database-projects)
- [Fabric REST API Reference](https://learn.microsoft.com/rest/api/fabric/)

### Related Accelerators

Explore other CI/CD accelerators in this repository:

- [Git-based deployments](../Git-based-deployments/) - General Fabric workspace Git integration
- [Git-based deployments with Build environments](../Git-based-deployments-using-Build-environments/) - Environment-specific builds
- [Deploy using Fabric deployment pipelines](../Deploy-using-Fabric-deployment-pipelines/) - Native Fabric deployment pipelines
- [Automate warehouse SQL endpoint deployment](../automate-wh-sqlendpoint-deployment/) - Warehouse-specific automation

---

**Questions?** Open a [discussion](https://github.com/microsoft/fabric-toolbox/discussions) or [issue](https://github.com/microsoft/fabric-toolbox/issues) on GitHub.

**Found this helpful?** ⭐ Star the [fabric-toolbox repository](https://github.com/microsoft/fabric-toolbox)!
