# General

FUAM's architecture is **based on Fabric items** such as pipelines, notebooks, lakehouses, semantic models, and Power BI reports. We've designed the component to be modular, allowing you to extend FUAM with your own modules. This architectural design also makes the solution easier to maintain.

The **data ingestion** logic is orchestrated and parameterizable, allowing us to use the main orchestration pipeline for initial and incremental data loads. **FUAM_Lakehouse** is one of the core components of the architecture. All data is transformed and stored persistently, opening up amazing possibilities by analyzing the collected data in a semantic model in DirectLake mode.



![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_architecture.png)

# Lakehouses

FUAM is designed to be modular. FUAM aims for a medallion architecture (Bronze, Silver, and Gold), with the target tables (Gold layer) and the raw files (Bronze layer) stored centrally.

|Lakehouse|Description|
|--|--|
|FUAM_Lakehouse|Main data storage. Stores all FUAM data into Delta parquet tables|
|FUAM_Staging_Lakehouse|Intermediate storage for processing. No long-term storage of data.|
|FUAM_Config_Lakehouse |Used for deployment of FUAM.|
|FUAM_Backup_Lakehouse |Aimed for backup of raw and/or parquet files.|


You can find the detailed documentation of **FUAM_Lakehouse** tables, data lineage and its purpose here:
[FUAM Lakehouse table documentation](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf).

# Modules (Pipelines)

FUAM is based on a modular approach. Each module contains the end-to-end logic for data ingestion (from the source to the lakehouse table). Each module is orchestrated in a central orchestration pipeline, which significantly simplifies scheduling.

|Module| Description | Item name| Populated tables in FUAM_Lakehouse |
|--|--|--|--|
|Capacities|Collects capacities and its properties.|Load_Capacities_E2E|capacities, capacity_users|
|Workspaces|Collects existing workspaces. Personal workspaces are **not** in-scope.|Load_Workspaces_E2E|workspaces|
|Capacity Refreshables|Collects scheduled semantic model and its telemetry from historical refreshes.|Load_Capacity_Refreshables_E2E|capacity_refreshables, capacity_refreshable_days, capacity_refreshable_details, capacity_refreshable_summaries, capacity_refreshable_times|
|Capacity Metrics|Collects capacity metrics on three different levels. Aggregated TimePoints, Operations, CUs by Item Kind by Day and Operations, CUs by Item By Day By OperationName|Load_Capacity_Metrics_E2E|capacity_metrics_by_timepoint, capacity_metrics_by_item_kind_by_day, capacity_metrics_by_item_by_operation_by_day, calendar_timepoints|
|Activities|Collects activity logs from the tenant.|Load_Activities_E2E|activities, aggregated_activities_last_30days|
|Active Items|Collects data about active items on the tenant.|Load_Active_Items_E2E|active_items|
|Inventory|Collects meta data about the tenant via Scanner API.|Load_Inventory_E2E|dashboards, dataflows, datasource_instances, environments, eventhouses, eventstreams, kql_databases, lakehouses, notebooks, pipelines, reflexes, reports, semantic_models, warehouses, workspaces_scanned_users|
|Tenant Settings|Takes snapshots of current tenant settings |Load_Tenant_Settings_E2E|tenant_settings, tenant_settings_enabled_security_groups|
|Delegated Tenant Setting Overrides|Takes snapshots of current delegated capacity tenant setting overrides.|Load_Delegated_Tenant_Settings_Overrides_E2E|delegated_tenant_settings_overrides|
|Git Connections|Collects current configured git connections to workspaces.|Load_Git_Connections_E2E|git_connections|
|Calendar|The calendar generates rows (one row = one day) in the delta table. This is required to run this pipeline every day, since the table contains time intelligence helper columns like 'IsInLast14days', which are used later in the semantic model |Generate_Calendar_Table (Notebook)|calendar|


# Units (Notebooks)

FUAM uses Spark Notebooks to load, transform, write, merge data. 
Each module contains its own Notebook, which are typically using inbound parameters.

> **Important to know**: Notebooks will be executed with the Notebook owner identity in FUAM. In Pipeline the user, who deployed the solution should be the same with the user, who is scheduling the pipeline


# Semantic Model

### General

Currently, there are two semantic models within the FUAM solution accelerator:
-	**FUAM_Core_SM** (time based)
-	**FUAM_Item_SM** (item based)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_report_data_lineage.png)


The main semantic model of FUAM is the **FUAM_Core_SM**.
This contains all the business logic on top of the gold layer (FUAM_Lakehouse delta tables).



#### Data model

The main point-of-view of the **FUAM_Core_SM** data model is **time-based**. Whenever possible, a table is connected via relationship to the calendar table.
This structure covers lot of different analytical scenarios. 

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_sm_model_approaches.png)

> **Info:** Reconstruction of the data lineage between items or chained-data structures are **not** in the scope of this semantic model. How to can extend FUAM is described later.


#### Connectivity mode

In default the **FUAM_Core_SM** and the **FUAM_Item_SM** semantic models are connected via **DirectLake only** mode to the Lakehouse.



#### Measure structure

The home table of every measure is the "Metrics" placeholder table. The measure groups can almost 1-to-1 mapped to the FUAM modules, which are described above.

On top of the time based tables like 'activities' or 'tenant_settings', there are two kind of measures: 
- Basic measures (like sum, avg, median)
- Time intelligence measures

Most of the time intelligence measures utilizing the advantages of the pre-calculated time intelligence columns within the 'calender' Lakehouse table


# Reports

FUAM provides some pre-built reports to get ready from the beginning. We have collected different views on the data which we saw important to have at enterprise customers. The aim of the report is to show you the potential of the collected data; these reports shouldn’t limit you to building your own report or enriching your data with FUAM.

The following illustration shows you the current structure and purpose of the pre-built reports:


![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_report_structure.png)

**Some screenshots of the FUAM_Core_Report:**

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_1.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_2.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_3.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_4.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_5.png)


**Filters**

By following the best practices the report pages tries to avoid slicers on the report pages.
Each report page has its own filter pane column definition to help users focus on the most important information.


![](https://github.com/GT-Analytics/fuam-basic/blob/dev-2025.3.1/media/wiki_deployment/FUAM_basic_deployment_process_6_1.png)


# Extensibility

Since the FUAM deployment notebook overwrites the items by the next run or in case an update, we **recommend** to create your own custom workspace to build on top of FUAM additional modules, semantic models, reports etc.

> **Important:** We can't guarantee that items or data structure will change in the future.


In case of implementing your custom requirements, we recommend to follow this steps:

1. Create a new workspace
2. Create a new Lakehouse
3. Shortcut the tables, files from FUAM_Lakehouse to your own lakehouse
4. Build your own items and logic


Cloning semantic model from FUAM:

4. Use **semantic-link-lab** to clone and rebind the semantic model to your custom lakehouse

Cloning reports from FUAM:

5. Use **semantic-link-lab** to clone and rebind the report to your custom semantic model


----------------

## Other helpful resources
- [Video - Brief introduction to FUAM](https://youtu.be/CmHMOsQcMGI)
- [Documentation - FUAM's Authorization & Authentication](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Authorization.md)
- [Documentation - FUAM Lakehouse table lineage](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf)

----------------