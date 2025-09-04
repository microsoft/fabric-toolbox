# FUAM Engine Level Analyzer Reports

## General

These templates are deployed with FUAM automatically; however, their configuration can be done manually by the user.

The goal of these templates is to provide more granular insights about a given item.

Review the following illustration in the section **"Specific engine level monitoring templates"**:
![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_report_structure.png)

This article describes the specific engine-level analyzer reports that we recommend using in the following scenarios:
- On-demand troubleshooting of an item
- On-demand troubleshooting of the on-premises data gateway
- Further investigation of the semantic model structure when it has very high CU consumption (based on the analytical pathway within `FUAM_Core_Report`).

----------------

### Semantic Model Meta Data Analyzer (SMMDA)

#### Scenarios
Let's assume you have identified a semantic model in the `FUAM_Core_Report` or in the `FUAM_Item_Analyzer_Report` that caused problems (for instance, high CU utilization caused by a Query or Refresh operation) in the recent time period.

You would like to understand which factors (such as data model, DAX measures, Power Query M-Code, relationships, etc.) could play a significant role in causing this high utilization.

**A) Frequently high CU utilization caused by refreshes of a semantic model:**

Let's assume you identified a semantic model that has significant CU consumption every day caused by **scheduled refresh** operations, but the query operation consumed only a small amount even with 50-60 daily active users. This is a common scenario where it makes sense to dive into the engine-level insights, especially into the data model and Power Query M-Code of the model.

**B) Extremely high CU consumption caused by Query operations of a semantic model:**
Let's assume you identified a semantic model that has significant CU consumption every day caused by **query** operations. This is another common scenario where it makes sense to dive into the engine-level insights, especially into the DAX measure formulas and data model structure.

>**Remark:** This section describes one possible troubleshooting path. There are also other ways to perform similar analysis scenarios.
>  For instance: [The **Model health** built-in feature by semantic link.](https://learn.microsoft.com/en-us/power-bi/transform-model/service-notebooks)

#### Configure connection

1) **Navigate** to the `FUAM_Semantic_Model_Meta_Data_Analyzer_Report` item within the workspace where FUAM has been deployed.
2) **Open** the report.
3) **Navigate** to the "How to configure" report page.
4) **Follow** the steps described on that report page.
5) **Open** the `FUAM_Semantic_Model_Meta_Data_Analyzer_Report` again or **refresh** the web browser page with the opened report.

#### FUAM_Semantic_Model_Data_Analyzer_Report

This report provides many different insights about the given semantic model, such as:
- VertiPaq Insights (size data, dictionaries, etc. by table and by columns)
- Dependencies across tables, columns, and measures (including measure-to-measure dependencies)
- Power Query M definitions by query or expression, parameters
- Table, Partition, and Sequence properties
- Column metadata with encoding hint, advanced properties, etc.
- Relationship metadata (direction, cardinality, security filter, etc.)
- Definition of DAX measures

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_smmda_0.png)

----------------

### SQL Endpoint Analyzer Report

#### Scenarios
Let's assume you have identified a Warehouse item in the `FUAM_Core_Report` or in the `FUAM_Item_Analyzer_Report` that caused problems (for instance, high CU utilization caused by a Query operation) in the recent time period.

You would like to understand which factors (frequency, T-SQL query, etc.) could play a significant role in causing this high utilization.

**A) Extremely high CU consumption caused by Query operations of a Warehouse or SQL analytics endpoint:**
Let's assume you identified a Warehouse/SQL analytics endpoint that has significant CU consumption every day caused by **query** operations.

To understand the query patterns, execution frequency, long-running queries, or the source of the query (this works only if the source application of the query is a DirectQuery Power BI report/semantic model), you would like to analyze the historical queries.

#### Configure connection

1) **Navigate** to the `FUAM_SQL_Endpoint_Analyzer_Report` item within the workspace where FUAM has been deployed.
2) **Open** the report.
3) **Navigate** to the "How to configure" report page.
4) **Follow** the steps described on that report page.
5) **Open** the `FUAM_SQL_Endpoint_Analyzer_Report` again or **refresh** the web browser page with the opened report.

#### FUAM_SQL_Endpoint_Analyzer_Report

This analyzer report connects to the [query insights](https://learn.microsoft.com/en-us/fabric/data-warehouse/query-insights) system views provided out-of-the-box from Microsoft Fabric.

For more information about the underlying data structure, please visit the following articles:
- [queryinsights.exec_requests_history (Transact-SQL)](https://learn.microsoft.com/en-us/sql/relational-databases/system-views/queryinsights-exec-requests-history-transact-sql?view=fabric&preserve-view=true)
- [queryinsights.long_running_queries (Transact-SQL)](https://learn.microsoft.com/en-us/sql/relational-databases/system-views/queryinsights-long-running-queries-transact-sql?view=fabric&preserve-view=true)
- [queryinsights.frequently_run_queries (Transact-SQL)](https://learn.microsoft.com/en-us/sql/relational-databases/system-views/queryinsights-frequently-run-queries-transact-sql?view=fabric&preserve-view=true)

The **Start** report page helps you to navigate within the report. 
The **Overview** analytical path provides different aggregated points of view about the given Warehouse or SQL analytics endpoint item.
The **Breakdown** analytical path provides you insights about request histories.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_0.png)

On the **Overview** page, one of the main metrics is the **Allocated CPU Time**. 

>**Important:**
>Please note that this is the **raw CPU time** that has been allocated for a given request by the Fabric capacity. 
>The **Allocated CPU Time** metric is **not** the CU value, which you see on the Capacity Metrics app.

**Unit conversion:**
- The unit of all data volume-related metrics can be changed by the filter on the filter pane under **Data Unit**.
- The unit of all the CPU-related metrics can be changed by the filter on the filter pane under **Time Unit**.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_1.png)

On the **Request History** page, the heatmaps help you to understand the usage patterns of the given Warehouse/SQL analytics endpoint.

To see each single request, use the Drillthrough feature on the report page.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_2.png)

The **Request Details** report page provides a list of all the executed requests of the given item within the filtered context.
Select a query and drill through to the **Request Diagnostic** page to see the raw command of the request and also additional metadata if available.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_3.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_4.png)

----------------

### Gateway Monitoring Report (file based)

Inspired by the report template [Gateway performance monitoring (public preview)](https://learn.microsoft.com/en-us/data-integration/gateway/service-gateway-performance) from our colleagues, FUAM also deploys a Gateway monitoring template, which you can use in on-demand/troubleshooting scenarios to provide transparency about the logs on your on-premises data gateway.

>**Important:** This template **does not** support VNET gateway logs. It may come in a future release of FUAM. If you have this scenario, please let us know and raise an issue in this repository.

#### Recommended usage
We recommend using this template for on-demand analysis of a single gateway instance. (However, the data model of the report supports analyzing logs from multiple gateway instances.)

>**Tip:** Download the report from your FUAM workspace and copy the pbix file to the gateway host machine. Open the report there to be able to access the folder where the gateway populates the log files.

>**Note:** The report (semantic model) connects via the [Folder](https://learn.microsoft.com/en-us/power-query/connectors/folder) data connector to your local machine, which may cause performance issues on the gateway host when you refresh it against a huge log folder (5-10GB or above).

#### Configure connection

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_setup.png)

#### FUAM_Gateway_Monitoring_Report_From_Files

On the **Start** page, you will see two analytical pathways to troubleshoot/monitor the performance and health of your gateway instance.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_0.png)

The **System counters** report page shows different telemetry metrics about the host, gateway service, and mashup engine. 

>**Important:** The calculation of the values on this page will be correct only if you set the right number of VM CPU cores of your gateway host in the "CPU Core Helper" slicer.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_1.png)

The **Overview** page provides insights about the direct queries and semantic model refreshes that have been executed on the gateway.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_2.png)

With the help of the chart on the **Requests by Data Connector** page, you can identify which data connector has been used in the selected time window. 

>**Note:** The chart uses the "small multiples" feature from Power BI. When more than 9 different data connectors have been used on the gateway, please scroll down within the visual to see more.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_3.png)

The **Historical Request Analysis** report page is another view of the insights over time.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_4.png)

The **Requests** report page is the starting point to dive into the details of the executed requests on the gateway. 
Use the drillthrough function on the table visual to continue with the **Query diagnostic** report page.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_5.png)

This advanced diagnostic report page, called **Query Diagnostic Board**, collects all the granular logs of a given request.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_6.png)

**The page has two sections:**

**Left** hand side:
Follow the predefined analytical steps to see:
- the origin and type of the request, 
- performance metrics of each QueryTrackingId entry, 
- executed request text (DAX/MDX query text or refresh command)
- once a sub-operation (QueryTrackingId) loaded/transferred data within a refresh request

**Right** hand side:
This section is not connected to the filtered requests. The goal here is to see the entire load of the gateway within the period when the request has been executed. It is helpful especially in scenarios where a semantic model refresh takes multiple hours.

>**Important:** The calculation of the values on this page will be correct only if you set the right number of VM CPU cores of your gateway host in the "CPU Core Helper" slicer.


----------------

## Other helpful resources

##### Built-in Fabric monitoring features
- [Microsoft Fabric Capacity Metrics app ](https://learn.microsoft.com/en-us/fabric/enterprise/metrics-app)
- [Capacity Metrics - Troubleshooting guide: Monitor and identify capacity usage](https://learn.microsoft.com/en-us/fabric/enterprise/capacity-planning-troubleshoot-consumption)

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

##### Some other Fabric Toolbox assets
- [Overview - Fabric Cost Analysis](/monitoring/fabric-cost-analysis/README.md)
- [Overview - Fabric Workspace Monitoring report templates](/monitoring/workspace-monitoring-dashboards/README.md)
- [Overview - Semantic Model MCP Server](https://github.com/microsoft/fabric-toolbox/tree/main/tools/SemanticModelMCPServer)
- [Overview - Semantic Model Audit tool](/tools/SemanticModelAudit/README.md)

##### Semantic Link & Semantic Link Lab
- [What is semantic link?](https://learn.microsoft.com/en-us/fabric/data-science/semantic-link-overview)
- [Overview - Semantic Link Labs](https://github.com/microsoft/semantic-link-labs/blob/main/README.md)

----------------