# FUAM | Technical Deep Dive

**Last Updated:** February 4, 2026  
**Authors:** Kevin Thomas and Gellért Gintli

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Data Ingestion Framework](#data-ingestion-framework)
4. [Technical Components](#technical-components)
5. [Data Storage Architecture](#data-storage-architecture)
6. [Authentication & Authorization](#authentication--authorization)
7. [ETL Pipeline Design](#etl-pipeline-design)
8. [Data Modeling Strategy](#data-modeling-strategy)
9. [Deployment Architecture](#deployment-architecture)
10. [Monitoring & Maintenance](#monitoring--maintenance)
11. [Security Considerations](#security-considerations)
12. [Extensibility & Customization](#extensibility--customization)
13. [Appendix: Reference Information](#appendix-reference-information)
14. [Other helpful resources](#other-helpful-resources)

---

## Executive Summary

Fabric Unified Admin Monitoring (FUAM) is a comprehensive solution accelerator designed to provide holistic monitoring and governance capabilities for Microsoft Fabric tenants. Built entirely using native Fabric components, FUAM ingests data from multiple sources including Admin APIs, Scanner API, Capacity Metrics, and Activity Logs to create a unified monitoring platform.

> [!CAUTION]  
> The FUAM solution accelerator is not an official Microsoft product! It is a solution accelerator, which can help you implement a monitoring solution within Fabric. As such there is no offical support available and there is a risk that things might break. E.g. the extraction of Capacity Metrics data. This is based on the Capacity Metrics App and elements of that App could change without notice and impact FUAM.


### Key Technical Characteristics

- **Architecture Pattern:** Modular, orchestrated data pipeline architecture with medallion (Bronze-Silver-Gold) pattern
- **Data Processing Engine:** Apache Spark via Fabric Notebooks
- **Storage Layer:** Delta Lake format in Fabric Lakehouses
- **Orchestration:** Fabric Data Pipelines with parameterized execution
- **Reporting:** DirectLake semantic models with Power BI reports
- **Deployment Model:** Automated deployment via Python notebooks using Fabric CLI

### Design Principles

1. **Modularity:** Each data module operates independently with standardized interfaces
2. **Parameterization:** All pipelines support both initial and incremental data loads
3. **Idempotency:** Pipelines can be safely re-run without data duplication
4. **Extensibility:** Custom modules can be added without modifying core components
5. **Performance:** Optimized for large-scale enterprise tenants with thousands of workspaces

---

## System Architecture

### High-Level Architecture

FUAM implements a modern data platform architecture with clear separation of concerns across data ingestion, transformation, storage, and presentation layers.

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Data Sources                                │
├─────────────────────────────────────────────────────────────────────┤
│  • Fabric Admin APIs       • Scanner API (Admin Metadata)           │
│  • Power BI Admin APIs     • Capacity Metrics App                   │
│  • Activity Logs API       • Capacity Refreshables API              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Orchestration Layer (Pipelines)                  │
├─────────────────────────────────────────────────────────────────────┤
│  Main: Load_FUAM_Data_E2E                                           │
│  Sub-Pipelines: Load_Activities, Load_Inventory, Load_Capacities,   │
│                 Load_Capacity_Metrics, Load_Tenant_Settings, etc.   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Processing Layer (Notebooks)                       │
├─────────────────────────────────────────────────────────────────────┤
│  Unit Notebooks: Extract → Transform → Load (ETL)                   │
│  • 01_Transfer_* (Extract & Load)                                   │
│  • 02_Transfer_* (Transform)                                        │
│  • 03_Aggregate_* (Aggregate)                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Storage Layer (Lakehouses)                       │
├─────────────────────────────────────────────────────────────────────┤
│  FUAM_Lakehouse:                                                    │
│    • Files/bronze/* (Raw JSON/API responses)                        │
│    • Tables/* (Delta tables - Gold layer)                           │
│  FUAM_Staging_Lakehouse: Temporary processing                       │
│  FUAM_Config_Lakehouse: Deployment artifacts                        │
│  FUAM_Backup_Lakehouse: Historical backups                          │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Semantic Layer (Semantic Models)                   │
├─────────────────────────────────────────────────────────────────────┤
│  • FUAM_Core_SM (Time-based analysis)                               │
│  • FUAM_Item_SM (Item-based analysis)                               |
│  Mode: DirectLake (Default)                                         │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Presentation Layer (Reports)                       │
├─────────────────────────────────────────────────────────────────────┤
│  • FUAM_Core_Report (Main monitoring dashboard)                     │
│  • FUAM_Item_Analyzer_Report                                        │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

#### Lakehouse Components

**1. FUAM_Lakehouse (Primary Data Store)**
- **Purpose:** Central repository for all monitoring data
- **Structure:**
  - `Files/bronze/`: Raw API responses (JSON format)
  - `Files/history/`: Historical activity logs
  - `Tables/`: Delta tables (Gold layer)
- **Key Tables:**
  - `activities`: User activity logs
  - `aggregated_activities_last_30days`: Pre-aggregated activity metrics
  - `capacities`: Capacity information
  - `capacity_metrics_by_timepoint`: CU consumption by 30-second intervals by capacity
  - `capacity_metrics_by_item_kind_by_day`: Daily CU by item type
  - `capacity_metrics_by_item_by_operation_by_day`: Detailed operation-level metrics by item by operation
  - `workspaces`: Workspace metadata
  - `semantic_models`: Semantic model metadata from Scanner API
  - `reports`, `dashboards`, `dataflows`, `notebooks`, etc.
  - `tenant_settings`: Historical tenant setting snapshots
  - `calendar`: Date dimension with time intelligence columns

**2. FUAM_Staging_Lakehouse**
- **Purpose:** Temporary storage for intermediate transformations
- **Lifecycle:** Data written during pipeline execution, cleaned up after successful completion
- **Usage Pattern:** Silver layer processing before final gold layer write

**3. FUAM_Config_Lakehouse**
- **Purpose:** Deployment configuration storage
- **Contents:**
  - `table_definitions.snappy.parquet`: Schema definitions for all tables
  - `FUAM_Table_Definitions`: Metadata table for dynamic table creation
- **Usage:** Referenced during initial deployment and table schema updates

**4. FUAM_Backup_Lakehouse**
- **Purpose:** Historical backup and disaster recovery
- **Retention:** Configurable based on organizational requirements
- **Scope:** Both raw files and Delta table snapshots

---

## Data Ingestion Framework

### Ingestion Patterns

FUAM implements three primary data ingestion patterns, each optimized for different data characteristics:

#### 1. REPLACE Pattern

**Use Case:** Data that represents current state and should be completely refreshed
**Implementation Strategy:** Truncate and reload
**Applied To:**
- Capacities
- Domains
- Tenant Settings snapshots
- Delegated Tenant Setting Overrides

**Example Notebook:** `01_Transfer_Capacities_Unit.Notebook`

```python
# Pseudo-code representation
def replace_pattern():
    # Extract from API
    raw_data = call_api_endpoint()
    
    # Transform
    silver_df = transform_and_cleanse(raw_data)
    
    # Load (overwrite)
    silver_df.write.mode("overwrite") \
        .option("mergeSchema", "true") \
        .format("delta") \
        .saveAsTable(gold_table_name)
```

**Characteristics:**
- Simple to implement and maintain
- Ensures no orphaned records
- Full data refresh on every execution
- No historical tracking of changes

#### 2. MERGE Pattern

**Use Case:** Data that changes over time and requires tracking of historical state
**Implementation Strategy:** Upsert based on unique keys
**Applied To:**
- Activities (merged by date)
- Active Items
- Capacity Refreshables
- Capacity Metrics (by timepoint)
- Git Connections
- Workspaces (state changes)

**Example Notebook:** `01_Transfer_Active_Items_Unit.Notebook`

```python
# Pseudo-code representation
def merge_pattern(silver_df, gold_table_name, key_columns):
    from delta.tables import DeltaTable
    
    if table_exists(gold_table_name):
        # Merge logic
        gold_df = DeltaTable.forPath(spark, gold_table_name)
        
        # Build merge condition
        merge_condition = " AND ".join([
            f"s.{col} = t.{col}" for col in key_columns
        ])
        
        gold_df.alias('t').merge(
            silver_df.alias('s'),
            merge_condition
        ) \
        .whenMatchedUpdateAll() \
        .whenNotMatchedInsertAll() \
        .execute()
    else:
        # Initial load
        silver_df.write.mode("append") \
            .format("delta") \
            .saveAsTable(gold_table_name)
```

**Characteristics:**
- Preserves historical data
- Updates only changed records
- Efficient for incremental loads
- Requires unique key definition
- Supports complex merge logic (conditional updates)

#### 3. APPEND Pattern

**Use Case:** Immutable time-series data that should never be updated
**Implementation Strategy:** Add new records, never modify existing
**Applied To:**
- Calendar table (date dimension)
- Activity log history

**Characteristics:**
- Simplest pattern for time-series data
- No update logic required
- Natural partitioning by date
- Efficient for analytical queries

### Data Flow Architecture

Each module follows a standardized data flow:

```
API/Source → Bronze (Raw JSON) → Silver (Transformed DataFrame) → Gold (Delta Table)
```

**Bronze Layer:**
- Raw API responses stored as JSON files
- No transformation applied
- Enables data replay and audit trails
- Location: `FUAM_Lakehouse/Files/bronze/{module_name}/`

**Silver Layer:**
- In-memory Spark DataFrames
- Schema validation and type conversion
- Data cleansing and enrichment
- Column renaming for consistency
- Location: Transient (FUAM_Staging_Lakehouse for complex transformations)

**Gold Layer:**
- Delta tables optimized for analytics
- Partitioned by date where applicable
- Indexed for common query patterns
- Location: `FUAM_Lakehouse/Tables/`

---

## Technical Components

### Cloud Connections

FUAM uses two primary cloud connections for API authentication:

**1. fuam pbi-service-api admin**
- **Type:** Web v2 Connection
- **Base URL:** `https://api.powerbi.com/v1.0/myorg/admin`
- **Token Audience:** `https://analysis.windows.net/powerbi/api`
- **Authentication:** Service Principal (Client ID + Secret)
- **Used By:**
  - Load_PBI_Workspaces_E2E
  - Load_Capacities_E2E
  - Load_Capacity_Refreshables_E2E
  - Load_Activities_E2E

**2. fuam fabric-service-api admin**
- **Type:** Web v2 Connection
- **Base URL:** `https://api.fabric.microsoft.com/v1/admin`
- **Token Audience:** `https://api.fabric.microsoft.com`
- **Authentication:** Service Principal (Client ID + Secret)
- **Used By:**
  - Load_Items_E2E
  - Load_Domains_E2E
  - Load_Git_Connections_E2E
  - Load_WidelyShared_* pipelines

### Pipeline Architecture

#### Main Orchestration Pipeline: Load_FUAM_Data_E2E

This is the central orchestration pipeline that coordinates all data ingestion modules.

**Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `has_tenant_domains` | Boolean | false | Enable domain data extraction |
| `extract_powerbi_artifacts_only` | Boolean | false | Limit to Power BI items only (exclude Fabric items) |
| `metric_days_in_scope` | Integer | 2 | Days of capacity metrics to extract (1-14) |
| `metric_workspace` | String | - | Capacity Metrics App workspace name or ID |
| `metric_dataset` | String | - | Capacity Metrics semantic model name or ID |
| `activity_days_in_scope` | Integer | 2 | Days of activity logs to extract (2-28) |
| `display_data` | Boolean | false | Enable verbose logging in notebooks |
| `optional_keyvault_name` | String | "" | Azure Key Vault name for SPN credentials |
| `optional_keyvault_sp_tenantId_secret_name` | String | "" | Key Vault secret name for Tenant ID |
| `optional_keyvault_sp_clientId_secret_name` | String | "" | Key Vault secret name for Client ID |
| `optional_keyvault_sp_secret_secret_name` | String | "" | Key Vault secret name for SPN secret |
| `activity_anonymize_tables` | Boolean | false | Hash sensitive user information in activities |
| `activity_anonymize_after_days` | Integer | 0 | Anonymize activities older than N days |
| `activity_anonymize_files` | Boolean | false | Delete raw activity JSON files after processing |

**Execution Flow:**

```
Load_FUAM_Data_E2E
├── Load_Workspaces (Parallel)
├── Load_Capacities (Parallel)
│
├── Load_Inventory
│   └── 01_Transfer_Incremental_Inventory_Unit (Scanner API)
│       ├── Semantic Models
│       ├── Reports
│       ├── Dashboards
│       ├── Dataflows
│       ├── Lakehouses
│       ├── Warehouses
│       ├── Notebooks
│       ├── Pipelines
│       └── Other Fabric Items
│
├── Load_Activities (Depends on: Load_Inventory)
│   ├── 02_Transfer_Activities_Unit
│   └── 03_Aggregate_Activities_Unit
│
├── Load_Active_Items (Depends on: Load_Inventory)
│   └── 01_Transfer_Active_Items_Unit
│
├── Load_Capacity_Refreshables (Depends on: Load_Active_Items)
│   └── 01_Transfer_Capacity_Refreshables_Unit
│
├── Load_Capacity_Metrics (Depends on: Load_Capacity_Refreshables)
│   ├── 01_Transfer_CapacityMetricData_Timepoints_Unit
│   ├── 02_Transfer_CapacityMetricData_ItemKind_Unit
│   └── 03_Transfer_CapacityMetricData_ItemOperation_Unit
│
├── Generate_Calendar_Table (Depends on: Load_Capacity_Metrics)
│
├── Load_Tenant_Settings (Parallel)
│   └── 01_Transfer_Tenant_Admin_Settings_Unit
│
├── Load_Delegated_Tenant_Settings_Overrides (Parallel, Optional)
│   └── 01_Transfer_Delegated_Tenant_Settings_Overrides_Unit
│
├── Load_Domains (Optional, if has_tenant_domains=true)
│   └── 01_Transfer_Domains_Unit
│
├── Load_Git_Connections (Parallel)
│   └── 01_Transfer_Git_Connections_Unit
│
├── Load_WidelyShared_OrganizationLinks (Parallel)
│   └── 01_Transfer_WidelyShared_OrganizationLinks_Unit
│
└── Load_WidelyShared_PublishedToWeb (Parallel)
    └── 01_Transfer_WidelyShared_PublishedToWeb_Unit
```

**Dependency Management:**
- Activities load depends on Inventory (to get workspace context)
- Active Items depends on Inventory (to filter valid items)
- Capacity Refreshables depends on Active Items (to get semantic model list)
- Capacity Metrics depends on Capacity Refreshables (to contextualize metrics)
- Calendar generation depends on Capacity Metrics (to ensure date range coverage)

---

## Data Storage Architecture

### Delta Lake Implementation

FUAM leverages Delta Lake for all structured data storage, providing ACID transactions, schema evolution, and time travel capabilities.

**Key Delta Features Used:**

1. **Schema Evolution:**
    - The FUAM_Lakehouse tables supports dynamic schemas


2. **Merge Operations:**
```python
delta_table.merge(source_df, merge_condition) \
    .whenMatchedUpdate(set = {...}) \
    .whenNotMatchedInsert(values = {...}) \
    .execute()
```
Implements upsert patterns for incremental data loads.

3. **Partitioning:**
Key tables are partitioned for query performance:
- `activities`: Partitioned by `ActivityDate`
- `capacity_metrics_by_timepoint`: Partitioned by `Date` (derived from TimePoint)
- `aggregated_activities_last_30days`: Partitioned by `Date`

4. **Data Skipping:**
Delta automatically creates statistics for efficient file pruning.

### Metadata Tracking

Some tables include standard metadata columns:

- `fuam_modified_at`: Timestamp of last FUAM update
- `fuam_deleted`: Soft delete flag (for tracking removed items)

These enable change tracking and historical analysis of item lifecycle.

---

## Authentication & Authorization

### Service Principal Configuration

FUAM requires a Service Principal with specific permissions to access Fabric Admin APIs.

**Required Permissions:**
1. **No Azure AD API Permissions:** Unlike typical enterprise applications, the Service Principal should NOT have any Microsoft Graph or Power BI Service API permissions configured in Azure AD. API access is granted through the Fabric admin tenant settings.

2. **Tenant Settings Enablement:**
   - Service Principal must be member of a security group enabled for:
     - "Service principals can use Fabric APIs"
     - "Service principals can access read-only admin APIs"


### Authentication Flows

**Flow 1: Pipeline → API (via Cloud Connection)**
```
Pipeline Activity
    → Cloud Connection (SPN credentials)
        → Fabric/Power BI Admin API
            → Return JSON data
                → Write to Bronze (Files)
```

**Flow 2: Notebook → Scanner API (via SPN)**
```
Notebook (Owner Identity)
    → Azure Key Vault (retrieve SPN credentials)
        → Scanner API (with SPN token)
            → Return metadata
                → Process in Spark
                    → Write to Gold (Delta tables)
```

### Azure Key Vault Integration (Optional)

For enhanced security, FUAM supports storing Service Principal credentials in Azure Key Vault.

**Setup:**
1. Create Azure Key Vault
2. Add secrets:
   - `spn-tenant-id`: Azure AD Tenant ID
   - `spn-client-id`: Service Principal Application ID
   - `spn-client-secret`: Service Principal Secret
3. Grant Fabric workspace identity "Get" permission on secrets
4. Configure Key Vault parameters in `Load_FUAM_Data_E2E` pipeline

**Notebook Implementation:**
```python
# Check if Key Vault is configured
if optional_keyvault_name:
    # Retrieve from Key Vault
    tenant_id = mssparkutils.credentials.getSecret(
        optional_keyvault_name, 
        optional_keyvault_sp_tenantId_secret_name
    )
    client_id = mssparkutils.credentials.getSecret(
        optional_keyvault_name, 
        optional_keyvault_sp_clientId_secret_name
    )
    client_secret = mssparkutils.credentials.getSecret(
        optional_keyvault_name, 
        optional_keyvault_sp_secret_secret_name
    )
    # Use for Scanner API authentication
else:
    # Fall back to notebook owner identity
    # (requires Fabric Administrator role)
```

---

## ETL Pipeline Design

FUAM has been built based on common data engineering implementation patterns.

### Notebook Structure

Each data ingestion notebook follows a standardized structure:

```python
# Cell 1: Documentation
"""
Module: Capacities
Strategy: REPLACE
Source: Fabric Admin API - /capacities
Target: FUAM_Lakehouse.capacities
"""

# Cell 2: Parameters
bronze_file_location = "Files/bronze/capacities/"
gold_table_name = "capacities"
display_data = False  # Pipeline parameter

# Cell 3: Imports
from delta.tables import DeltaTable
from pyspark.sql.functions import *
import json

# Cell 4: API Call (if applicable)
# This cell is skipped - API call happens in pipeline

# Cell 5: Bronze → Silver Transformation
# Read JSON from bronze
bronze_df = spark.read.json(bronze_file_location)

# Transform and cleanse
silver_df = bronze_df.select(
    col("id").alias("Id"),
    col("displayName").alias("DisplayName"),
    col("sku").alias("Sku"),
    upper(col("id")).alias("CapacityIdUpper"),  # Consistency fix
    current_timestamp().alias("fuam_modified_at"),
    lit(False).alias("fuam_deleted")
)

# Cell 6: Silver → Gold Load
# Apply ingestion pattern (REPLACE/MERGE/APPEND)
if display_data:
    silver_df.display()

# REPLACE pattern
silver_df.write.mode("overwrite") \
    .option("mergeSchema", "true") \
    .format("delta") \
    .saveAsTable(gold_table_name)

# Cell 7: Validation
if display_data:
    print(f"Rows written: {silver_df.count()}")
    spark.sql(f"SELECT COUNT(*) FROM {gold_table_name}").display()
```

### Error Handling Patterns


**Pattern 1: Graceful Degradation**
```python
try:
    # Extract optional field that may not exist
    additional_field = col("optionalField")
except Exception:
    # Provide default value
    additional_field = lit(None).alias("optionalField")
```

**Pattern 2: Data Validation**
```python
# Validate schema before write
expected_columns = ["Id", "Name", "Type", ...]
actual_columns = silver_df.columns

missing = set(expected_columns) - set(actual_columns)
if missing:
    raise ValueError(f"Missing required columns: {missing}")
```

**Pattern 3: Idempotent Operations**
```python
# Ensure operations can be safely re-run
if spark._jsparkSession.catalog().tableExists('FUAM_Lakehouse', gold_table_name):
    # Table exists - use merge/update logic
    merge_to_table(silver_df, gold_table_name)
else:
    # Initial load - create table
    silver_df.write.format("delta").saveAsTable(gold_table_name)
```

---

## Data Modeling Strategy

### Semantic Model Architecture

#### FUAM_Core_SM (Primary Model)

**Design Philosophy:** Time-based analytical model
**Mode:** DirectLake
**Relationships:** Star schema with Calendar as central dimension

**Key Tables:**
- **Fact Tables:**
  - `activities`
  - `capacity_metrics_by_timepoint`
  - `capacity_metrics_by_item_kind_by_day`
  - `aggregated_activities_last_30days`

- **Dimension Tables:**
  - `calendar` (Central dimension)
  - `workspaces`
  - `capacities`
  - `semantic_models`
  - `reports`
  - `tenant_settings`

**Relationship Pattern:**
```
calendar (1) ─────< activities (∞)
                     └─ Relationship: calendar[Date] → activities[ActivityDate]

calendar (1) ─────< capacity_metrics_by_timepoint (∞)
                     └─ Relationship: calendar[Date] → capacity_metrics_by_timepoint[Date]

workspaces (1) ───< activities (∞)
                     └─ Relationship: workspaces[Id] → activities[WorkspaceId]

capacities (1) ───< workspaces (∞)
                     └─ Relationship: capacities[Id] → workspaces[CapacityId]
```

**Measure Structure:**

All measures are organized in the `Metrics` placeholder table:

```dax
// Measure Group: Activities
[Total Activities] := COUNTROWS(activities)

[Unique Users] := DISTINCTCOUNT(activities[UserId])

[Activities L7D] := 
CALCULATE(
    [Total Activities],
    calendar[IsInLast7Days] = TRUE
)

// Measure Group: Capacity Metrics
[Total CU Consumption] := SUM(capacity_metrics_by_timepoint[TotalCU])

[Background CU %] := 
DIVIDE(
    SUM(capacity_metrics_by_timepoint[BackgroundCU]),
    [Total CU Consumption],
    0
)

// Measure Group: Workspaces
[Active Workspaces] := 
CALCULATE(
    DISTINCTCOUNT(workspaces[Id]),
    workspaces[State] = "Active"
)

// Time Intelligence using Calendar columns
[Activities Previous Month] := 
CALCULATE(
    [Total Activities],
    DATEADD(calendar[Date], -1, MONTH)
)
```

**DirectLake Configuration:**
```json
{
  "model": {
    "defaultMode": "directLake",
    "expressions": [
      {
        "name": "DatabaseQuery",
        "kind": "m",
        "expression": "let\n    Source = Lakehouse(\"FUAM_Lakehouse\")\nin\n    Source"
      }
    ]
  }
}
```

#### FUAM_Item_SM (Item-Focused Model)

**Design Philosophy:** Item-centric analysis model
**Mode:** DirectLake
**Focus:** Deep-dive into individual items (semantic models, reports, etc.)

**Key Tables:**
- `semantic_models`
- `reports`
- `dataflows`
- `workspaces`
- `capacity_refreshables`
- `activities` (filtered by item-related activities)

**Relationship Pattern:**
```
workspaces (1) ───< semantic_models (∞)
                     └─ workspaces[Id] → semantic_models[WorkspaceId]

semantic_models (1) ─< reports (∞)
                         └─ semantic_models[Id] → reports[DatasetId]

semantic_models (1) ─< capacity_refreshables (∞)
                         └─ semantic_models[Id] → capacity_refreshables[ItemId]
```


### Pipeline Performance Best Practices

**Incremental Loading:**
Configure pipelines for incremental loads after initial full load:
```
Initial Load: activity_days_in_scope = 28, metric_days_in_scope = 14
Daily Load:   activity_days_in_scope = 2,  metric_days_in_scope = 2
```


---

## Deployment Architecture

### Automated Deployment Process

FUAM uses the `Deploy_FUAM.ipynb` notebook for automated deployment and updates.

**Deployment Flow:**

```
1. User imports Deploy_FUAM.ipynb into FUAM workspace
     ↓
2. Notebook installs ms-fabric-cli
     ↓
3. Downloads src.zip, config.zip, data.zip from GitHub
     ↓
4. Extracts deployment_config.yaml and deployment_order.json
     ↓
5. Reads configuration:
     - Workspace name
     - Connection names
     - Folder structure
     - Item deployment order
     ↓
6. Creates/validates cloud connections (if first deployment)
     ↓
7. Creates lakehouses (FUAM_Lakehouse, FUAM_Staging_Lakehouse, etc.)
     ↓
8. Uploads table_definitions.snappy.parquet to FUAM_Config_Lakehouse
     ↓
9. Deploys items in order:
     - Notebooks
     - Pipelines
     - Semantic Models
     - Reports
     ↓
10. Organizes items into folders based on deployment_config.yaml
     ↓
11. Runs Init_FUAM_Lakehouse_Tables notebook
     ↓
12. Deployment complete
```

**Configuration Files:**

**deployment_config.yaml:**
```yaml
workspace: "FUAM"
connections:
  pbi_connection: fuam pbi-service-api admin
  fabric_connection: fuam fabric-service-api admin

fuam_lakehouse_semantic_models:
  - FUAM_Core_SM.SemanticModel
  - FUAM_Item_SM.SemanticModel

folders:
  - name: "Capacities"
    items:
      - 01_Transfer_Capacities_Unit.Notebook
      - Load_Capacities_E2E.DataPipeline
  - name: "Activities"
    items:
      - 02_Transfer_Activities_Unit.Notebook
      - 03_Aggregate_Activities_Unit.Notebook
      - Load_Activities_E2E.DataPipeline
  # ... more folders
```

**deployment_order.json:**
```json
{
  "order": [
    "FUAM_Lakehouse.Lakehouse",
    "FUAM_Staging_Lakehouse.Lakehouse",
    "FUAM_Config_Lakehouse.Lakehouse",
    "FUAM_Backup_Lakehouse.Lakehouse",
    "Init_FUAM_Lakehouse_Tables.Notebook",
    "01_Transfer_Capacities_Unit.Notebook",
    "Load_Capacities_E2E.DataPipeline",
    "FUAM_Core_SM.SemanticModel",
    "FUAM_Core_Report.Report"
  ]
}
```

### Deployment via Fabric CLI

The deployment notebook uses `ms-fabric-cli` for programmatic item creation:

```python
import subprocess
import json

def deploy_item(item_path, workspace_name):
    """Deploy a Fabric item using CLI"""
    cmd = [
        "fabric",
        "item",
        "create",
        "--workspace", workspace_name,
        "--path", item_path
    ]
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise Exception(f"Deployment failed: {result.stderr}")
    
    return json.loads(result.stdout)

# Deploy pipeline
deploy_item("./src/Load_Capacities_E2E.DataPipeline", "FUAM")
```

### Update vs. Initial Deployment

The deployment notebook intelligently handles both scenarios:

**Initial Deployment:**
- Creates all items from scratch
- Sets up connections (without credentials)
- Initializes lakehouse tables
- Displays post-deployment instructions

**Update Deployment:**
- Overwrites existing items (based on name matching)
- Preserves data in lakehouses
- Updates connections if configuration changed
- Maintains pipeline schedules
- Does NOT require credential re-entry

---

## Monitoring & Maintenance

### Pipeline Monitoring

**Built-in Monitoring:**
- Pipeline run history in Fabric portal
- Activity duration metrics
- Error logs and stack traces

### Maintenance Pipeline: Maintenance_for_FUAM

**Purpose:** Housekeeping and optimization tasks


**Optimization Notebook for FUAM_Lakehouse:**

`02_FUAM_Lakehouse_Optimization` notebook runs OPTIMIZE and VACUUM commands

**Schedule Recommendation:** Weekly, off-peak hours

---

## Security Considerations

### Data Privacy

**Activity Log Anonymization:**

FUAM provides built-in anonymization for sensitive user information:

```python
# In 02_Transfer_Activities_Unit.Notebook
from pyspark.sql.functions import md5, concat_ws

if anonymize_tables:
    # Hash sensitive columns
    activities_df = activities_df.withColumn(
        "UserId", 
        md5(concat_ws("_", col("UserId"), lit(anonymization_salt)))
    )
    activities_df = activities_df.withColumn(
        "UserKey", 
        md5(concat_ws("_", col("UserKey"), lit(anonymization_salt)))
    )
    
    # Optionally anonymize historical data
    if anonymize_after_days > 0:
        cutoff_date = current_date() - expr(f"INTERVAL {anonymize_after_days} DAYS")
        
        spark.sql(f"""
            UPDATE activities
            SET 
                UserId = md5(CONCAT(UserId, '{anonymization_salt}')),
                UserKey = md5(CONCAT(UserKey, '{anonymization_salt}'))
            WHERE ActivityDate < '{cutoff_date}'
        """)
```

**Raw File Deletion:**

```python
# Delete raw JSON files after processing
if anonymize_files:
    for file in bronze_activity_files:
        mssparkutils.fs.rm(file.path, recurse=True)
```

### Access Control

**Workspace-Level Security:**
- FUAM workspace should be restricted to Admin users
- Use Azure AD security groups for granular control
- Implement Row-Level Security (RLS) in your custom semantic models if needed 
    (please review the following article before you implement RLS based on FUAM data: [Direct Lake - DirectQuery fallback](https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview#directquery-fallback))

### Credential Management

**Service Principal Secret Rotation (after x days):**

1. Create new client secret in Azure AD
2. Update Key Vault secret (if using Key Vault)
3. Update cloud connection credentials in Fabric
4. Test pipeline execution
5. Remove old secret after validation period


---

## Extensibility & Customization


We recommend to create a new workspace with an empty Lakehouse, where you can shortcut the FUAM_Lakehouse data. The new workspace is a great candidate to put your additional logic, customizations on top of FUAM.
This approach prevents that the update mechanism of FUAM overwrites or deletes your custom logic.

### Adding Custom Modules

**Create Custom Notebook**

```python
# Custom_Transfer_Compliance_Data.Notebook

# Parameters
bronze_file_location = "Files/bronze/compliance/"
gold_table_name = "compliance_data"

# Read custom API data
bronze_df = spark.read.json(bronze_file_location)

# Transform
silver_df = bronze_df.select(
    col("id").alias("Id"),
    col("complianceStatus").alias("Status"),
    col("lastChecked").cast("timestamp").alias("LastChecked"),
    current_timestamp().alias("fuam_modified_at")
)

# Load
silver_df.write.mode("overwrite") \
    .format("delta") \
    .saveAsTable(gold_table_name)
```

You can build your own orchestration pipeline within your new workspace.
Invoke the Load_FUAM_Data_E2E pipeline as a sub-pipeline and add your additional custom logic.


### Best Practices

The following best practices are recommendations only and don't fit for every organisation.

**1. Pipeline Scheduling:**
- **Initial Load:** Run once, full historical extract
  - `activity_days_in_scope = 28`
  - `metric_days_in_scope = 14`
- **Daily Incremental:** Schedule for off-peak hours (e.g., 2:00 AM UTC)
  - `activity_days_in_scope = 2` (overlap for late-arriving data)
  - `metric_days_in_scope = 2`

**2. Capacity Planning:**
- Tenants with **<500 workspaces (attached to capacity):** at least F2 capacity
- Tenants with **500 - 1,000 workspaces (attached to capacity):** F4 recommended (for intial load higher)
- Tenants with **>1,000 workspaces (attached to capacity):** F8+ with optimized pipelines

**3. Data Retention:**
- **Tenant Settings:** Retain all (snapshot history)
- **Bronze Files:** Delete after successful processing (or retain for audit)

**4. Semantic Model Refresh:**
- DirectLake: No refresh needed (framing only)

**5. Report Performance for custom reports:**
- Implement report-level filters (e.g., Last 30 Days)
- Avoid row-level calculations in visuals

**6. Monitoring of FUAM:**
- Set up pipeline failure alerts (email/Teams)
- Monitor pipeline duration trends
- Track lakehouse storage growth
- Review capacity CU consumption

**7. Security:**
- Rotate Service Principal secrets every 90/180 days
- Use Key Vault for credential management
- Enable anonymization for production deployments
- Implement RLS for multi-team environments 
    (please review the following article before you implement RLS based on FUAM data: [Direct Lake - DirectQuery fallback](https://learn.microsoft.com/en-us/fabric/fundamentals/direct-lake-overview#directquery-fallback))

---

## Appendix: Reference Information

### API Endpoints Used

| Module | Endpoint | Method | Authentication |
|--------|----------|--------|----------------|
| Capacities | `/admin/capacities` | GET | SPN (PBI API) |
| Workspaces | `/admin/groups?$top=5000` | GET | SPN (PBI API) |
| Activities | `/admin/activityevents` | GET | SPN (PBI API) |
| Active Items | `/admin/items` | GET | SPN (Fabric API) |
| Domains | `/admin/domains` | GET | SPN (Fabric API) |
| Git Connections | `/admin/gitConnections` | GET | SPN (Fabric API) |
| Inventory | `/admin/workspaces/getInfo` | POST | SPN via Key Vault |
| Capacity Refreshables | `/admin/capacities/{id}/refreshables` | GET | SPN (PBI API) |
| Widely Shared | `/admin/widelySharedArtifacts/linksSharedToWholeOrganization` | GET | SPN (Fabric API) |

### Table Schema Reference

**Core Tables Count:** 40+ tables
**Primary Categories:**
- Inventory tables (15+): semantic_models, reports, dashboards, dataflows, lakehouses, warehouses, etc.
- Activity tables (2): activities, aggregated_activities_last_30days
- Capacity tables (7): capacities, capacity_users, capacity_metrics_*, capacity_refreshables_*
- Configuration tables (3): tenant_settings, delegated_tenant_settings_overrides, domains
- Dimensional tables (3): calendar, workspaces, calendar_timepoints

### Key Metrics

**Pipeline Execution Times (Approximate):**
- Small Tenant: 15-30 minutes
- Medium Tenant: 45-90 minutes
- Large Tenant: 2-4 hours


### Version Compatibility

**Fabric Runtime:**
- Requires: Spark 3.4+
- Python: 3.10+
- Delta Lake: 2.4+

----------------


## Other helpful resources

##### Built-in Fabric monitoring features
- [Microsoft Fabric Capacity Metrics app ](https://learn.microsoft.com/en-us/fabric/enterprise/metrics-app)
- [What is the admin monitoring workspace? (preview)](https://learn.microsoft.com/en-us/fabric/admin/monitoring-workspace)
- [Microsoft Fabric Chargeback app (preview)](https://learn.microsoft.com/en-us/fabric/enterprise/chargeback-app)

##### FUAM related videos
- [Video - FUAM in Guy in a Cube](https://www.youtube.com/watch?v=G_-N2VMO8C0&themeRefresh=1)
- [Video - Brief introduction to FUAM](https://youtu.be/CmHMOsQcMGI)

##### Other FUAM articles
- [Overview - FUAM](/monitoring/fabric-unified-admin-monitoring/README.md)
- [Documentation - FUAM's Authorization & Authentication](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Authorization.md)
- [Documentation - FUAM Architecture](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Architecture.md)
- [Documentation - FUAM Lakehouse table lineage](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf)
- [Documentation - FUAM Engine level analyzer reports](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Engine_Level_Analyzer_Reports.md)

##### Some other Fabric Toolbox assets
- [Overview - Fabric Cost Analysis](/monitoring/fabric-cost-analysis/README.md)
- [Overview - Fabric Spark Monitoring](/monitoring/fabric-spark-monitoring/README.md)
- [Overview - Fabric Workspace Monitoring report templates](/monitoring/workspace-monitoring-dashboards/README.md)
- [Overview - Semantic Model MCP Server](https://github.com/microsoft/fabric-toolbox/tree/main/tools/SemanticModelMCPServer)
- [Overview - Semantic Model Audit tool](/tools/SemanticModelAudit/README.md)

##### Semantic Link & Semantic Link Lab
- [What is semantic link?](https://learn.microsoft.com/en-us/fabric/data-science/semantic-link-overview)
- [Overview - Semantic Link Labs](https://github.com/microsoft/semantic-link-labs/blob/main/README.md)
