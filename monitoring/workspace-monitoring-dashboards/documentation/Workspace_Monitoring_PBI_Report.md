# Power BI report template for Fabric Workspace Monitoring

## General

Power BI allows users to configure connections to Monitoring Eventhouse, where they can retain detailed historical activity data. This repo hosts **Power BI report** templates (.pbit) that you can point to your Monitoring Eventhouse databases to load data and get insights.
Now, you can seamlessly connect and track your workspace items, operations, visuals, etc., without leaving the SaaS experience in Microsoft Fabric.

The Power BI Report template is structured as follows:

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_template_structure.png)


## How to deploy

See the documentation [here](/monitoring/workspace-monitoring-dashboards/how-to/How_to_deploy_Workspace_Monitoring_PBI_Report.md).

## Common scenarios 

Workspace Monitoring with the Power BI report template can help answer common questions such as:

|Workload|Question|Approach|Analytical Pathway|
|----|----|----|----|
|All supported |"What has happened on my workspace recently?"|Trend analysis by workload|[Diagnostic Overview](#analytical-pathway--diagnostic-overview)|
|Semantic model|"We got a call from management, because yesterday someone throttled the capacity"|The report is designed in a way that allows users to troubleshoot heavy operations and find the root cause of, e.g., a consumption peak with ease.| [Query Analysis](#analytical-pathway--sm--query-analysis) & [Refresh Analysis](#analytical-pathway--sm--refresh-analysis)|
|Semantic model|"A semantic model refresh took very long yesterday. What caused the delay?"|Analyze refresh duration and resource usage|[Refresh Analysis](#analytical-pathway--sm--refresh-analysis)|
|Semantic model|"One semantic model is causing capacity issues. What queries are hitting it?"|Investigate query patterns and CPU usage per model|[Query Analysis](#analytical-pathway--sm--query-analysis)|
|Eventhouse|"Which Eventhouse queries are consuming the most resources or failing frequently?"|Query performance analysis and error tracking|[Query Performance Analysis](#analytical-pathway--eh--query-performance) |
|Eventhouse|"Are there ingestion pipelines that are failing or running slower than expected?"|Monitor ingestion success rates, durations, and retry patterns|[Ingestion Analysis](#analytical-pathway--eh--ingestion-performance)|
|Mirrored database|"Why is the mirrored database table execution impacting performance?"|Analyze execution logs, query volumes, and CPU usage|[Table Execution Analysis](#analytical-pathway--mirrored-database-table-execution)|
|API for GraphQL|"What is the success ratio of my production GraphQL API request over time?"|Track API call frequency, response times, and error rates|[GraphQL Performance Analysis](#analytical-pathway--graphql-performance)|

-----

## Analytical Pathways

|Workload|Name|
|---|---|
|All supported|[Diagnostic Overview](#analytical-pathway--diagnostic-overview)|
|Semantic model|[Key Metrics Overview](#analytical-pathway--sm--key-metrics-overview)|
|Semantic model|[Query Analysis](#analytical-pathway--sm--query-analysis)|
|Semantic model|[Refresh Analysis](#analytical-pathway--sm--refresh-analysis)|
|Eventhouse|[Query Performance](#analytical-pathway--eh--query-performance)|
|Eventhouse|[Ingestion Performance](#analytical-pathway--eh--ingestion-performance)|
|API for GraphQL|[GraphQL Performance](#analytical-pathway--graphql-performance)|
|Mirrored database|[Table Execution Analysis](#analytical-pathway--mirrored-database-table-execution)|


### Analytical Pathway | Diagnostic Overview


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_100.png)

|Step|Description|
|---|---|
|1.|"In scope bar". This static visual asset helps you identify the scope of a given report page. Other Fabric Toolbox solution accelerators also use this approach. <br> In this report, there are two levels available: **Workspace level** and **Item level**. |
|2.|The **Explore Fabric Toolbox** and **Open Disclaimer** buttons help you and other users in your organization get more information about the templates and their purpose, etc.|
|3.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: 1 to 30 days|
|4.|**Define** the "Time Unit" filter, which helps you convert all time-related measures. <br> Available units: _millisecond_, _second_, _minute_, _hour_|
|5.|**Define** the "Size Unit" filter, which helps you convert all data size/volume-related measures. <br> Available units: _byte_, _kilobyte_, _megabyte_, _gigabyte_|
|6.|The **Semantic Model Metrics** card acts as a starting point for the analytical pathways. <br> _Semantic model operation logs are part of the workspace monitoring logs and are registered in the Eventhouse KQL database, which is part of the Real-Time Intelligence solution. You can use these logs to monitor the usage and performance of your workspace._  Link: [Semantic model operation logs](https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/semantic-model-operations)|
|7.|The **Eventhouse Metrics** card acts as a starting point for the analytical pathways. <br> _This report visualizes data from the **metrics table**, which contains the details of ingestions, materialized views, and continuous exports of an Eventhouse KQL database, and the **query logs** tables, which contain the list of queries run on an Eventhouse KQL database._  Links: [Query logs](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/monitor-logs-query) and [Metric operation logs](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/monitor-metrics)|
|8.|The **GraphQL Metrics** card acts as a starting point for the analytical pathways. <br> _GraphQL operation logs are part of the workspace monitoring logs and are registered in the Eventhouse KQL database, which is part of the Real-Time Intelligence solution. You can use these logs to monitor the usage and performance of your workspace._  Link: [GraphQL operation logs](https://learn.microsoft.com/en-us/fabric/data-engineering/graphql-operations)|
|9.|The **Mirrored Database Metrics** card acts as a starting point for the analytical pathways. <br> _Mirrored database operation logs are part of the workspace monitoring logs and are registered in the Eventhouse KQL database, which is part of the Real-Time Intelligence solution. You can use these logs to monitor the execution and performance of your mirrored database._  Link: [Mirrored database table execution logs](https://learn.microsoft.com/en-us/fabric/database/mirrored-database/monitor-logs) |

### Semantic Model Logs

Workspace admins, users, BI developers, etc., would like to analyze the operations of all the semantic models within a given workspace.
They want to investigate which semantic model recently (max last 30 days, because of Monitoring Eventhouse retention period) had significant problems with queries and refreshes.

### Analytical Pathway | SM | Key Metrics Overview
**for Semantic Model logs**

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_0.png)


|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: 1 to 30 days|
|2.|**Define** the "Time Unit" filter, which helps you convert all time-related measures. <br> Available units: _millisecond_, _second_, _minute_, _hour_|
|3.|**Define** the "Size Unit" filter, which helps you convert all data size/volume-related measures. <br> Available units: _byte_, _kilobyte_, _megabyte_, _gigabyte_|
|4.|**Review** the "Semantic Model Metrics" card. Once there are any collected logs for semantic models, this card will be available.|
|5.|**Click** on the **Key Metrics Overview** button within the "Semantic Model Metrics" tile to begin the analytical pathway.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_1.png)


|Step|Description|
|---|---|
|6.|The cards provide you with aggregated insights about all semantic models in the selected time window. <br> **Important:** The report includes query and refresh operations only.|
|7.|The underlying logs also provide information about _Execution Delay_ and _Capacity Throttling_ caused by a semantic model operation. <br> **Important:** This visual contains that information at the workspace level only. To monitor delays, rejections, and throttling, please use the Capacity Metrics App.|
|8.|Review the Metrics table on the page. This visual shows the key raw CPU, Memory, Duration, and other key metrics for each semantic model used within the defined time window. <br> See _[Measure description](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_Templates_Metrics.md)._ <br> **Highlight** a semantic model in the visual to activate the buttons for step 9 and 10. |
|9.|The analytical pathway _Query Analysis_ allows you to deep dive into the query execution details for the selected semantic model. |
|10.|The analytical pathway _Refresh Analysis_ allows you to deep dive into the refresh execution details for the selected semantic model. |

>**Note:** Other metrics with high values like _Max Execution Delay_, _Max Memory Peak_, or count of _Errors_ are indicators to continue the investigation.



### Analytical Pathway | SM | Query analysis
**for Semantic Model logs**


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_10.png)

|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: 1 to 30 days|
|2.|**Review** the "Semantic Model Metrics" card. Once there are any collected logs for semantic models, this card will be available.|
|3.|**Click** on the **Query Analysis** button within the "Semantic Model Metrics" tile to begin the analytical pathway.|



![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_11.png)


|Step|Description|
|---|---|
|4.|The filter pane on this page contains two filters: _OperationId_ and _Semantic Model_. <br> **Important:** The _Semantic Model_ filter shows the latest name of the model. For instance, if you renamed the semantic model several times in the past days, the report will gather the latest, current name of it. The data model behind the report uses ItemIds, which are consistent for each deployed semantic model.|
|5.|**Review** the visual. Each stacked bar chart shows metrics by semantic model by day. The bar size shows the _Max CPU Time_, the color of the bar shows the _Max Peak Memory_ consumption. This combination provides you a comprehensive view, where you can correlate CPU time and memory consumption. _See examples below._ |
|6.| **Highlight a bar** on the chart for the next step. |


>**Example 1:** The CPU duration (bar) is **high**, but the memory consumption (color) is **green**. This would mean that on that day at least one query operation was **CPU intensive**. 

>**Example 2:** The CPU duration (bar) is **low**, but the memory consumption (color) is **red**. This would mean that on that day at least one query operation was **Memory intensive**.


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_12.png)


|Step|Description|
|---|---|
|7.|**Hover** over the bar to see more details about the given day for the given semantic model in the tooltip.|
|8.|**Click** on the "Go to Historical Queries" button, once one bar has been highlighted, to jump to the next analysis page.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_2.png)

|Step|Description|
|---|---|
|9.|**Review** the summary of the "Query History" page, which has been filtered for the selected semantic model. Since this page will be used in another analytical pathway, just ignore the "Selected Date" tile. There is a link embedded to help you understand your specific memory limits for queries.|
|10.|**Review** the "Query History" table on the page. This visual shows more detailed metrics from each query executed against the selected semantic model within the selected time window. In this example, we go with that one failed DAX query.|
|11.|**Highlight** a row in the table and **click** on the **Go to Query Analysis** button to see all the metrics and raw trace logs about this query.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_3.png)

|Step|Description|
|---|---|
|12.|On the "Query Details" page, the data has been filtered for one single operation. This page provides all the relevant information about the given query. |
|13.|The cards provide you with detailed information about the query, similar to the previous page. These numbers help you understand the resource footprint, duration, and other metrics of the query.|
|14.| The table visual at the bottom is sorted by Timestamp in ascending order. This is important to maintain, as you will see chronological trace logs. In this example, the last raw log (excluding the "Execution Metrics" operation, which is an additional trace log event) was an Error event. The column _EventText_ provides the raw trace log value, which has been reported by the engine. In this case, the user has cancelled the query.|

**Very well done!**
You finished the analytical pathway "Query analysis" for semantic models.

------------------------------------------------------------------------------------------------

### Analytical Pathway | SM | Refresh analysis
**for Semantic Model logs**


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_4.png)

|Step|Description|
|---|---|
|1.|**Define** the considered time window on the filter pane [min: 1, max: 30] in days|
|2.|**Review** the Semantic Model Metrics card.|
|3.|**Click** on the "Refresh Analysis" button within the "Semantic Model Metrics" tile to begin the analytical pathway.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_5.png)


|Step|Description|
|---|---|
|4.|**Review** the visual. Each stacked bar chart shows metrics by semantic model by day. The bar size shows the _Max PowerQuery CPU Time_, the color of the bar shows the _Max PowerQuery Peak Memory_ consumption. This combination provides you a comprehensive view, where you can correlate CPU time and memory consumption. _See examples below._ |
|5.| **Highlight** a bar on the chart for the next step. |

>**Example 1:** The CPU duration (bar) is **high**, but the memory consumption (color) is **green**. This would mean that on that day at least one refresh operation was **CPU intensive**. 

>**Example 2:** The CPU duration (bar) is **low**, but the memory consumption (color) is **red**. This would mean that on that day at least one refresh operation was **Memory intensive**.


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_6.png)


|Step|Description|
|---|---|
|6.|**Hover over** the bar to see more details about the given day for the given semantic model in the tooltip.|
|7.|**Click** on the "Continue Refresh Analysis" button, once one bar has been highlighted, to jump to the next analysis page.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_7.png)


|Step|Description|
|---|---|
|8.|**Review** the matrix visual, which shows each refresh for the selected semantic model on the selected day.|
|9.|**Expand** an OperationId to see the refreshed table metrics.|
|10.|**Expand** a _Table Name_ and the _Object Type_ to identify which object was very resource intensive. |

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_8.png)

|Step|Description|
|---|---|
|Info|There is another view to analyze a selected refresh operation on a GANTT chart. This helps you better understand which object or sequence during the refresh took the longest time.|
|11.|**Highlight** a Refresh Operation.|
|12.|**Click** on the "Navigate to Refresh GANTT" button.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_9.png)


|Step|Description|
|---|---|
|13.|**Review** the 'Progress CPU Metrics by Object Type' visual. This shows the _Progress CPU Time_ and _PowerQuery CPU Time_ by object type, like Partition, Calculated column, etc. In this example, we can see that the partition object type was the most resource intensive object to refresh.|
|14.|**Review** the 'Progress CPU Metrics by Table Name' visual. This shows the _Progress CPU Time_ and _PowerQuery CPU Time_ by object type, like Partition, Calculated column, etc. In this example, we can see that the table _SalesTable_ was the most resource intensive object to refresh within the semantic model.|
|15.|**Review** the GANTT visual. In this example, we analyze the table _SalesTable_. The sub-operations (Operation Detail Name) _TabularRefresh_, _ExecuteSql_, _ReadData_, _CompressSegment_, etc., help you understand at which sub-operation the refresh sequence took the longest time.  |
|16.| In the 'Refresh Details' table visual below, you can identify the resource footprint for each sub-operation (Operation Detail Name) by _Table_, by _Object Type_, by _Object Name_. In this example, the "Tabular Refresh" and the "Read Data" sub-operations had the highest CPU consumption. |
|Optional|If you are interested in other assets like "Memory Analyzer", "Best Practice Analyzer", or "Semantic Model Meta Data Analyzer" to optimize the semantic model, you can explore those assets by clicking on the button in the bottom-right corner of the report page.|

**Very well done!**
You finished the analytical pathway "Refresh analysis" for semantic models.

------------------------------------------------------------------------------------------------

### Eventhouse Logs



### Analytical Pathway | EH | Query Performance


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_0.png)

|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: 1 to 30 days|
|2.|**Review** the "Eventhouse Metrics" card. Once there are any collected logs for Eventhouse KQL databases, this card will be available.|
|3.|**Click** on the **Query Performance** button within the "Eventhouse Metrics" tile to begin the analytical pathway.|



![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_1.png)

|Step|Description|
|---|---|
|Info|This page guides you through analyzing Eventhouse KQL database queries with a top-down approach.|
|4.|**Review** the aggregated insights about query operations, which have been executed against all Eventhouse KQL databases within the selected time window. **Review** the _Query Success Ratio_ measure. |
|5.|**Review** the performance trends charts about query operations. The charts are structured horizontally from left to right. <br> The two charts at the bottom of this step provide insights into raw CPU time and operation duration, both as averages and as maximum aggregated values by day. The other two charts provide insights into memory consumption and the count of unique users, also as averages and maximums by day. |
|6.|**Review** the bar charts. The charts provide you with an aggregated view by KQL database for the selected time window by _Query count_ (top), by _Max CPU Time_ (middle), and by _Max Memory Consumption_ (bottom). |

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_2.png)

|Step|Description|
|---|---|
|7.|**Highlight** a KQL database within one of the bar charts from the previous step. |
|8.|**Click** on the **Continue with Historical Query Analysis** button to continue the analytical pathway for the selected KQL database.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_3.png)

|Step|Description|
|---|---|
|9.|**Review** the table visual. Each row represents a single query operation for the selected KQL database within the selected time window. _See definition and description of measures here_|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_4.png)

|Step|Description|
|---|---|
|10.|**Highlight** a row based on a measure you identified as an outlier. |
|11.|**Click** on the **Go to Query Details** button to continue the analytical pathway.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_5.png)

|Step|Description|
|---|---|
|Info|This page shows all the collected insights and properties for a given query.|
|12.|The cards provide you with some basic properties about the query, like _Application Name_, _Execution User_, or _Status_ of the query operation. |
|13.|The key metrics cards provide you with the key measures about the executed query. <br> See _[Measure description](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_Templates_Metrics.md)._ |
|14.|This set of cards shows the different cache accesses and hits. <br> _Max Available Hot Cache_ is the max amount of data that was available for the query in hot cache. The max amount of data stored in hot cache is defined by the database or table caching policy. <br> _Max Unavailable Hot Cache_ is the max amount of data that wasn't available for the query in hot cache. <br> _Max Available Cold Cache_ is the max amount of cold storage data that was available for the query in cold cache due to data prefetching. <br> _Max Unavailable Cold Cache_ is the max amount of cold storage data that wasn't available for the query in cold cache.|
|15.|This set of cards shows metrics about "Engine Scans" and "Query Results". <br> _Max Scanned Rows_ is the number of rows scanned by the query. A high number might indicate the cause of a query latency issue. <br> _Max Scanned Extents_ is the max number of extents scanned by the query. A high number might indicate the cause of a query latency issue. <br> _Max Result Tables_ is the number of tables result sets. <br> _Max Query Rows_ is the max number of rows in the result set. |
|16.|The "Queries" visual shows the start and end time of the query, raw query text, and failure reason.|

**Very well done!**
You finished the analytical pathway "Query Performance" for Eventhouse KQL databases.

------------------------------------------------------------------------------------------------


### Analytical Pathway | EH | Ingestion Performance


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_6.png)

|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: 1 to 30 days|
|2.|**Review** the "Eventhouse Metrics" card. Once there are any collected logs for Eventhouse KQL databases, this card will be available.|
|3.|**Click** on the **Ingestion Performance** button within the "Eventhouse Metrics" tile to begin the analytical pathway.|



![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_7.png)

|Step|Description|
|---|---|
|Info|This page guides you through analyzing Eventhouse KQL database ingestions with a top-down approach.|
|4.|**Review** the aggregated insights about ingestion operations, which have happened across all Eventhouse KQL databases within the selected time window in the monitored workspace. <br> This page shows insights about **Batch Ingestions** and **Streaming Ingestion** operations |
|5.|**Review** the performance trends charts about ingestion operations. <br> The chart at the top shows the total _Batch Ingestion Volume_ and _Streaming Ingestion Volume_ in the selected unit over time.|
|6.|**Review** the bar chart. The chart provides you with an aggregated view by KQL database for the selected time window by _Batch Ingestion Volume_ and _Streaming Ingestion Volume_ in the selected unit. <br> **Highlight** a KQL database within the bar chart. |
|7.|_In this example, we will continue with batch ingestion analysis._ <br> **Click** on the **Go to Batch Ingestion Analysis** button to continue the analytical pathway for the selected KQL database.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_8.png)

|Step|Description|
|---|---|
|8.|**Review** the chart. It shows the total amount of ingested data volume over time for the selected KQL database within the selected time window.|
|9.|**Review** the line charts. <br> The _Average Batch Size over time_ chart shows the average of expected uncompressed data size in an aggregated ingestion batch. <br> The _Average Batch Blob Count over time_ chart shows the average number of data sources ingested in a completed batch. <br> The _Average Batch Ingestion Latency over time_ chart shows the average time taken from when data is received in the cluster until it's ready for query. _**Note:** In this visual, the underlying data has been filtered for the ingestion type "Queued Ingestion"._ |
|10.|The "Ingestion Volume by Database" visual provides insights at the table level.|

**Let's continue with streaming ingestion**
**Click** on the **back** button to go back to the "Eventhouse | Query Performance" report page.


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_9.png)
 
|Step|Description|
|---|---|
11.|**Review** the bar chart. The chart provides you with an aggregated view by KQL database for the selected time window by _Batch Ingestion Volume_ and _Streaming Ingestion Volume_ in the selected unit. <br> **Highlight** a KQL database within the bar chart. |
|12.|_In this example, we will continue with streaming ingestion analysis._ <br> **Click** on the **Go to Streaming Ingestion Analysis** button to continue the analytical pathway for the selected KQL database.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_eh_10.png)

|Step|Description|
|---|---|
|12.|**Review** the chart. It shows the total amount of ingested data volume and average streaming ingestion latency over time for the selected KQL database within the selected time window.|


**Very well done!**
You finished the analytical pathway "Ingestion Performance" for Eventhouse KQL databases.


------------------------------------------------------------------------------------------------

### API for GraphQL

### Analytical Pathway | GraphQL Performance
**for GraphQL requests**

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_gql_0.png)


|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: 1 to 30 days <br> **Define** the "Time Unit" filter, which helps you convert all time-related measures. <br> Available units: _millisecond_, _second_, _minute_, _hour_ <br> **Define** the "Size Unit" filter, which helps you convert all data size/volume-related measures. <br> Available units: _byte_, _kilobyte_, _megabyte_, _gigabyte_|
|2.|**Review** the "GraphQL Metrics" card. Once there are any collected logs for semantic models, this card will be available.|
|3.|**Click** on the **GraphQL Performance** button within the "GraphQL Metrics" tile to begin the analytical pathway.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_gql_1.png)


|Step|Description|
|---|---|
|4.|The cards provide you with aggregated insights about all GraphQL requests in the selected time window.|
|5.|**Review** the line charts. The visual "Request Duration over time" includes two metrics: <br> _Total Request Duration_ <br> _Total Overhead Duration_ is the GraphQL overhead time for a dataplane request. |
|6.|**Review** the "GraphQL API Requests" table on the page. This visual shows the key raw CPU, Memory, Duration, and other key metrics for each semantic model used within the defined time window. <br> See _[Measure description](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_Templates_Metrics.md)._ <br> **Highlight** a semantic model in the visual to activate the buttons for step 9 and 10. |
|9.|The analytical pathway _Query Analysis_ allows you to deep dive into the query execution details for the selected semantic model. |
|10.|The analytical pathway _Refresh Analysis_ allows you to deep dive into the refresh execution details for the selected semantic model. |

**Very well done!**
You finished the analytical pathway "Query Performance" for Eventhouse KQL databases.

------------------------------------------------------------------------------------------------


### Mirrored Databases

### Analytical Pathway | Mirrored Database Table Execution
**for Mirrored Databases**

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_mdb_0.png)


|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: 1 to 30 days <br> **Define** the "Time Unit" filter, which helps you convert all time-related measures. <br> Available units: _millisecond_, _second_, _minute_, _hour_ <br> **Define** the "Size Unit" filter, which helps you convert all data size/volume-related measures. <br> Available units: _byte_, _kilobyte_, _megabyte_, _gigabyte_|
|2.|**Review** the "Mirrored Database Metrics" card. Once there are any collected logs for semantic models, this card will be available.|
|3.|**Click** on the **Table Execution Analysis** button within the "Mirrored Database Metrics" tile to begin the analytical pathway.|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_mdb_1.png)


|Step|Description|
|---|---|
|4.|The cards provide you with aggregated insights about all Table Executions in the selected time window.|
|5.|**Review** the line charts. The visual "Mirroring Latency over time" includes two metrics from the Replicator engine: <br> _Avg Mirroring Latency_ is the average latency to replicate the batch of data during mirroring. <br> _Max Mirroring Latency_ is the max latency to replicate the batch of data during mirroring. |
|6.|**Review** the "Mirrored Databases - Table Execution Logs" table on the page. This visual shows the key mirroring-related metrics for each mirrored item within your workspace that has been used within the defined time window. <br> See _[Measure description](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_Templates_Metrics.md)._|


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_mdb_2.png)

|Step|Description|
|---|---|
|7.|**Highlight** a Mirrored Database Item in the visual to activate the button |
|8.|**Click** on the "Go to Table/Operation Level Mirroring Analysis" button to continue the analytical pathway.|



![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_mdb_3.png)

|Step|Description|
|---|---|
|9.|The cards provide you with aggregated insights about all Table Executions in the selected time window for the selected Mirrored Database item.|
|10.|**Review** the "Table Execution Log Summary" visual. One row within the visual represents a table in the selected Mirrored Database item. Other relevant insights are included to get a better understanding of each replicated table. |
|11.|**Review** the "Mirrored Databases - Table Execution Log Detailed" table on the page. This visual shows all the executed operations (OperationName) by mirrored table (SourceTableName). For operations like _Snapshotting_, metrics like _Processed Data_ and _Mirroring Latency_ are available. In case of error by operation by table, the columns _ErrorType_ and _ErrorMessage_ will show details.|

**Very well done!**
You finished the analytical pathway "Query Performance" for Eventhouse KQL

----------------

## Other helpful resources

##### Microsoft Fabric features
- [Workspace monitoring overview](https://learn.microsoft.com/en-us/fabric/fundamentals/workspace-monitoring-overview)
- [Enable workspace monitoring](https://learn.microsoft.com/en-us/fabric/fundamentals/enable-workspace-monitoring)

##### Workspace Monitoring Templates
- [Documentation - Real-Time Dashboard template for Workspace Monitoring](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_RTI_Dashboard.md)
- [Documentation - Power BI template for Workspace Monitoring](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_PBI_Report.md)

##### Some other Fabric Toolbox assets
- [Overview - Fabric Cost Analysis](/monitoring/fabric-cost-analysis/README.md)
- [Overview - FUAM solution accelerator for tenant level monitoring](/monitoring/fabric-unified-admin-monitoring/README.md)
- [Overview - Semantic Model MCP Server](https://github.com/microsoft/fabric-toolbox/tree/main/tools/SemanticModelMCPServer)
- [Overview - Semantic Model Audit tool](/tools/SemanticModelAudit/README.md)

##### Semantic Link & Semantic Link Lab
- [What is semantic link?](https://learn.microsoft.com/en-us/fabric/data-science/semantic-link-overview)
- [Overview - Semantic Link Labs](https://github.com/microsoft/semantic-link-labs/blob/main/README.md)

----------------