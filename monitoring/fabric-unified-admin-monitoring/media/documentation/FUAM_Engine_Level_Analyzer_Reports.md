# FUAM Engine Level Analyzer Reports

## General

These templates will deployed with FUAM automatically, however the configuration of these can be done manually by the user.

The goal of those templates is to provide more granular insights about a given item.


Review the following illustration at the section **"Specific engine level monitoring templates"**:
![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_report_structure.png)


This article describes the specific engine level analyzer reports, which we recommend to use in the following scenarios:
- On-demand troubleshooting of an item
- On-demand troubleshooting of the on-premises data gateway
- Investigating the semantic model structure further, whenever it had a very high CU consumption (based on analytical pathway within `FUAM_Core_Report`).

----------------

### Semantic Model Meta Data Analyzer (SMMDA)

#### Scenarios
Let's assume you have identified a semantic model in the `FUAM_Core_Report` or in the `FUAM_Item_Analyzer_Report`, which caused problems (for instance high CU utilization caused by Query or Refresh operation) in the recent time period. 


You would like understand, which factors (like data model, DAX measures, PowerQuery M-Code, Relationships, etc.) could play a significant role to get this high utilization. 

**A) Frequently high CU utilization caused by refreshes of a semantic model:**

Let's assume, we identified a semantic model, which has every day a significant CU consumption caused by **scheduled refresh** operations, but the query operation took only a little bit even at 50-60 daily active users. This is a common scenario, where it makes sense to deep into the engine level insights, especially into the data model and Power Query M-Code of the model.

**B) Extremely high CU consumption caused by Query operations of a semantic model:**
Let's assume, we identified a semantic model, which has every day a significant CU consumption caused by **query** operations. This is another common scenario, where it make sense to deep into the engine level insights, especially into the DAX measure formulas and data model structure.


>**Remark:** This section describes one possible troubleshooting path. There are also other ways to get done similar analysis scenarios.
>  For instance: [The **Model health** built-in feature by semantic link.](https://learn.microsoft.com/en-us/power-bi/transform-model/service-notebooks)


#### Configure connection

1) **Navigate** to the `FUAM_Semantic_Model_Meta_Data_Analyzer_Report` item within the workspace where FUAM has been deployed.
2) **Open** the report
3) **Navigate** to the "How to configure" report page
4) **Follow** the steps described on that report page

5) **Open** the `FUAM_Semantic_Model_Meta_Data_Analyzer_Report` again or **refresh** the web browser page with the opened report.


#### FUAM_Semantic_Model_Data_Analyzer_Report

This report provides lot of different insights about the given semantic model, like:
- VertiPaq Insights (size data, dictionaries, etc by table by columns)
- Dependencies across tables, columns, measures (also measure to measure dependencies)
- Power Query M definitions by query or expression, parameters
- Table, Partition and Sequence properties
- Column meta data with encoding hint, advanced properties etc.
- Relationship meta data (direction, cardinality, security filter etc.)
- Definition of DAX measures

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_smmda_0.png)



----------------

### SQL Endpoint Analyzer Report

#### Scenarios
Let's assume you have identified a Warehouse item in the `FUAM_Core_Report` or in the `FUAM_Item_Analyzer_Report`, which caused problems (for instance high CU utilization caused by Query operation) in the recent time period. 

You would like understand, which factors (frequency, T-SQL query, etc.) could play a significant role to get this high utilization. 

**A) Extremely high CU consumption caused by Query operations of a Warehouse or SQL analytics endpoint:**
Let's assume, we identified a Warehouse/SQL analytics endpoint, which has every day a significant CU consumption caused by **query** operations.

To understand the query patterns, execution frequency, long running queries or the source of the query (it works only if the source Application of the query is DirectQuery Power BI report/semantic model.), you would like to analyse the historical queries.

#### Configure connection

1) **Navigate** to the `FUAM_SQL_Endpoint_Analyzer_Report` item within the workspace where FUAM has been deployed.
2) **Open** the report
3) **Navigate** to the "How to configure" report page
4) **Follow** the steps described on that report page

5) **Open** the `FUAM_SQL_Endpoint_Analyzer_Report` again or **refresh** the web browser page with the opened report.

#### FUAM_SQL_Endpoint_Analyzer_Report

This analyzer report connects to the [query insights](https://learn.microsoft.com/en-us/fabric/data-warehouse/query-insights) system views provided out-of-the-box from Microsoft Fabric.

For more information of the underlying data structure, please visit following articles:
- [queryinsights.exec_requests_history (Transact-SQL)](https://learn.microsoft.com/en-us/sql/relational-databases/system-views/queryinsights-exec-requests-history-transact-sql?view=fabric&preserve-view=true)
- [queryinsights.long_running_queries (Transact-SQL)](https://learn.microsoft.com/en-us/sql/relational-databases/system-views/queryinsights-long-running-queries-transact-sql?view=fabric&preserve-view=true)
- [queryinsights.frequently_run_queries (Transact-SQL)](https://learn.microsoft.com/en-us/sql/relational-databases/system-views/queryinsights-frequently-run-queries-transact-sql?view=fabric&preserve-view=true)

The **Start** report page helps you to navigate within the report. 
The **Overview** analytical path provides aggregated different point-of-views about the given Warehouse or SQL analytics endpoint item.
The **Breakdown** analytical path provides you insights about request histories

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_0.png)

On the **Oveview** page, one of the main metric is the **Allocated CPU Time**. 

>**Important:**
>Please note that is the **raw CPU time**, which has been allocated for a given request by the Fabric capacity. 
>The **Allocated CPU Time** metrics is **not** the CU value, which you see on the Capacity Metrics app.


**Unit conversion:**
- The unit of all data volume related metrics can be changed by the filter on the filter pane under **Data Unit**
- The unit of all the CPU related metrics can be changed by the filter on the filter pane under **Time Unit**


![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_1.png)

On the **Request History** page, the heatmaps help oyu to understand the usage patterns of the given Warehouse/SQL analytics endpoint.

To see each single request, use the Drillthrough feature on the report page.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_2.png)

The **Request Details** report page provides a list of all the executed requests of the given item within the filtered context.
Select a query and drill through to the **Request Diagnostic** page to see the raw command of the request and also additional meta data if available.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_3.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_sql_analytics_endpoint_analyzer_4.png)


----------------

### Gateway Monitoring Report (file based)

Inspired by the report template [Gateway performance monitoring (public preview)](https://learn.microsoft.com/en-us/data-integration/gateway/service-gateway-performance) from our colleagues, FUAM also deployes a Gateway monitoring template, which you can use in on-demand/troubleshooting scenarios to provide transparency about the logs on your on-premises data gateway.

>**Important:** This template **does not** supports VNET gateway logs. It may come in a future release of FUAM. If you have this scenario, please let us know and raise an issue in this repository.

#### Configure connection

1) **Navigate** to the `FUAM_Gateway_Monitoring_Report_From_Files` item within the workspace where FUAM has been deployed.
2) **Open** the report
3) **Navigate** to the "Getting Started" report page
4) **Follow** the steps described on that report page

On the **Start** page, you will see two analytical pathways to troubleshoot/monitor the performance, health of your gateway instance.

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_0.png)


![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_1.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_2.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_3.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_4.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_5.png)

![image](/monitoring/fabric-unified-admin-monitoring/media/general/engine_level_analyzers/fuam_gateway_monitoring_6.png)


## Other helpful articles

[Capacity Metrics - Troubleshooting guide: Monitor and identify capacity usage](https://learn.microsoft.com/en-us/fabric/enterprise/capacity-planning-troubleshoot-consumption)