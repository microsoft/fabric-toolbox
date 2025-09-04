# FUAM Architecture 

## General

FUAM's architecture is **based on Fabric items** such as pipelines, notebooks, lakehouses, semantic models, and Power BI reports. We designed the component to be modular, allowing you to extend FUAM with your own modules. This architectural design also makes the solution easier to maintain.

The **data ingestion** logic is orchestrated and parameterizable, allowing you to use the main orchestration pipeline for initial and incremental data loads. **FUAM_Lakehouse** is one of the core components of the architecture. All data is transformed and stored persistently, opening up powerful possibilities for analyzing the collected data in a semantic model in DirectLake mode.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_architecture.png)

## Lakehouses

FUAM is designed to be modular. FUAM aims for a medallion architecture (Bronze, Silver, and Gold), with the target tables (Gold layer) and the raw files (Bronze layer) stored centrally.

|Lakehouse|Description|
|--|--|
|FUAM_Lakehouse|Main data storage. Stores all FUAM data in Delta parquet tables.|
|FUAM_Staging_Lakehouse|Intermediate storage for processing. No long-term storage of data.|
|FUAM_Config_Lakehouse|Used for deployment of FUAM.|
|FUAM_Backup_Lakehouse|Used for backup of raw and/or parquet files.|

You can find the detailed documentation of **FUAM_Lakehouse** tables, data lineage, and its purpose here:  
[FUAM Lakehouse table documentation](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf).

## Modules (Pipelines)

FUAM is based on a modular approach. Each module contains the end-to-end logic for data ingestion (from the source to the lakehouse table). Each module is orchestrated in a central orchestration pipeline, which significantly simplifies scheduling.

|Module| Description | Item name| Populated tables in FUAM_Lakehouse |
|--|--|--|--|
|Capacities|Collects capacities and their properties.|Load_Capacities_E2E|capacities, capacity_users|
|Workspaces|Collects existing workspaces. Personal workspaces are **not** in scope.|Load_Workspaces_E2E|workspaces|
|Capacity Refreshables|Collects scheduled semantic models and their telemetry from historical refreshes.|Load_Capacity_Refreshables_E2E|capacity_refreshables, capacity_refreshable_days, capacity_refreshable_details, capacity_refreshable_summaries, capacity_refreshable_times|
|Capacity Metrics|Collects capacity metrics on three different levels: Aggregated TimePoints, Operations, CUs by Item Kind by Day, and Operations, CUs by Item By Day By OperationName.|Load_Capacity_Metrics_E2E|capacity_metrics_by_timepoint, capacity_metrics_by_item_kind_by_day, capacity_metrics_by_item_by_operation_by_day, calendar_timepoints|
|Activities|Collects activity logs from the tenant.|Load_Activities_E2E|activities, aggregated_activities_last_30days|
|Active Items|Collects data about active items on the tenant.|Load_Active_Items_E2E|active_items|
|Inventory|Collects metadata about the tenant via Scanner API.|Load_Inventory_E2E|dashboards, dataflows, datasource_instances, environments, eventhouses, eventstreams, kql_databases, lakehouses, notebooks, pipelines, reflexes, reports, semantic_models, warehouses, workspaces_scanned_users|
|Tenant Settings|Takes snapshots of current tenant settings.|Load_Tenant_Settings_E2E|tenant_settings, tenant_settings_enabled_security_groups|
|Delegated Tenant Setting Overrides|Takes snapshots of current delegated capacity tenant setting overrides.|Load_Delegated_Tenant_Settings_Overrides_E2E|delegated_tenant_settings_overrides|
|Git Connections|Collects currently configured git connections to workspaces.|Load_Git_Connections_E2E|git_connections|
|Calendar|The calendar generates rows (one row = one day) in the delta table. This is required to run this pipeline every day, since the table contains time intelligence helper columns like 'IsInLast14days', which are used later in the semantic model.|Generate_Calendar_Table (Notebook)|calendar|

## Units (Notebooks)

FUAM uses Spark Notebooks to load, transform, write, and merge data.  
Each module contains its own notebook, which typically uses inbound parameters.

> **Important to know**: Notebooks will be executed with the notebook owner's identity in FUAM. In the pipeline, the user who deployed the solution should be the same as the user who is scheduling the pipeline.

## Semantic Model

### General

Currently, there are two semantic models within the FUAM solution accelerator:
-	**FUAM_Core_SM** (time-based)
-	**FUAM_Item_SM** (item-based)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_report_data_lineage.png)

The main semantic model of FUAM is **FUAM_Core_SM**.  
This contains all the business logic on top of the gold layer (FUAM_Lakehouse delta tables).

#### Data model

The main point of view of the **FUAM_Core_SM** data model is **time-based**. Whenever possible, a table is connected via a relationship to the calendar table.  
This structure covers many different analytical scenarios.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_sm_model_approaches.png)

> **Info:** Reconstruction of the data lineage between items or chained-data structures is **not** in the scope of this semantic model. How to extend FUAM is described later.

#### Connectivity mode

By default, the **FUAM_Core_SM** and the **FUAM_Item_SM** semantic models are connected via **DirectLake only** mode to the Lakehouse.

#### Measure structure

The home table of every measure is the "Metrics" placeholder table. The measure groups can almost be mapped 1-to-1 to the FUAM modules described above.

On top of the time-based tables like 'activities' or 'tenant_settings', there are two kinds of measures: 
- Basic measures (like sum, avg, median)
- Time intelligence measures

Most of the time intelligence measures utilize the advantages of the pre-calculated time intelligence columns within the 'calendar' Lakehouse table.

## Reports

FUAM provides some pre-built reports to get you started from the beginning. We have collected different views on the data that we saw as important for enterprise customers. The aim of the report is to show you the potential of the collected data; these reports shouldn’t limit you from building your own report or enriching your data with FUAM.

The following illustration shows you the current structure and purpose of the pre-built reports:

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_report_structure.png)

**Some screenshots of the FUAM_Core_Report:**

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_1.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_2.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_3.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_4.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_5.png)

**Filters**

By following best practices, the report pages try to avoid slicers on the report pages.  
Each report page has its own filter pane column definition to help users focus on the most important information.

![](https://github.com/GT-Analytics/fuam-basic/blob/dev-2025.3.1/media/wiki_deployment/FUAM_basic_deployment_process_6_1.png)

## Extensibility

Since the FUAM deployment notebook overwrites the items on the next run or in case of an update, we **recommend** creating your own custom workspace to build additional modules, semantic models, reports, etc., on top of FUAM.

> **Important:** We can't guarantee that items or data structure will not change in the future.

In case you want to implement your custom requirements, we recommend following these steps:

1. Create a new workspace.
2. Create a new Lakehouse.
3. Shortcut the tables and files from FUAM_Lakehouse to your own lakehouse.
4. Build your own items and logic.

Cloning a semantic model from FUAM:

5. Use **semantic-link-lab** to clone and rebind the semantic model to your custom lakehouse.

Cloning reports from FUAM:

6. Use **semantic-link-lab** to clone and rebind the report to your custom semantic model.

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
- [Documentation - FUAM Lakehouse table lineage](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf)
- [Documentation - FUAM Engine level analyzer reports](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Engine_Level_Analyzer_Reports.md)

##### Some other Fabric Toolbox assets
- [Overview - Fabric Cost Analysis](/monitoring/fabric-cost-analysis/README.md)
- [Overview - Fabric Workspace Monitoring report templates](/monitoring/workspace-monitoring-dashboards/README.md)
- [Overview - Semantic Model MCP Server](https://github.com/microsoft/fabric-toolbox/tree/main/tools/SemanticModelMCPServer)
- [Overview - Semantic Model Audit tool](/tools/SemanticModelAudit/README.md)

##### Semantic Link & Semantic Link Lab
- [What is semantic link?](https://learn.microsoft.com/en-us/fabric/data-science/semantic-link-overview)
- [Overview - Semantic Link Labs](https://github.com/microsoft/semantic-link-labs/blob/main/README.md)

----------------