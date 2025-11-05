# Real-Time Dashboard template for Fabric Workspace Monitoring

## General

The Real-Time Dashboard in Microsoft Fabric enables users to configure live connections to Monitoring Eventhouse, providing real-time visibility into workspace activity and operations. This repository hosts **Real-Time Dashboard** templates that you can connect directly to your Monitoring Eventhouse databases to visualize and monitor real-time data and insights.

With this dashboard, you can seamlessly track your workspace items, operations, visuals, and more—all within the Microsoft Fabric SaaS experience—enabling proactive monitoring and immediate response to events as they happen.

The Real-Time Dashboard template is structured as follows:

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_template_structure.png)

## How to deploy

See the documentation [here](/monitoring/workspace-monitoring-dashboards/how-to/How_to_deploy_Workspace_Monitoring_RTI_Dashboard.md).

## Common scenarios 

Workspace Monitoring with the Real-Time Dashboard template can help answer common questions such as:

|Workload|Question|Approach|Analytical Pathway|
|----|----|----|----|
|Semantic model|"We would like to see all the currently running queries and refreshes on the workspace."|Tracking started/running query and refresh operations.|[Semantic Models Analysis](#analytical-pathway--semantic-model-log-analysis)|
|Semantic model|"Which user actively utilizes the semantic models in this workspace?"|Analyzing resource metrics on the "SM - Users" dashboard page|[Most active Users](#analytical-pathway--semantic-models---most-active-users)|
|Semantic model|"Which semantic models used significant resources for refresh operations in the recent period on the workspace?"|Investigate query patterns and CPU usage per model|[Refreshes & queries](#analytical-pathway--semantic-models--refreshes-queries)|
|Eventhouse|"Which Eventhouse queries are consuming the most resources or failing frequently?"|Query performance analysis and error tracking|[Eventhouse Analysis](#analytical-pathway--eventhouse-analysis-in-near-real-time)|
|Eventhouse|"Are there ingestion pipelines that are failing or running slower than expected?"|Monitor ingestion success rates, durations, and retry patterns|[Eventhouse Analysis](#analytical-pathway--eventhouse-analysis-in-near-real-time)|

-----

## Analytical Pathways

|Workload|Name|
|---|---|
|Eventhouse|[Eventhouse Analysis](#analytical-pathway--eventhouse-log-analysis)|
|Semantic model|[Semantic Models Analysis](#analytical-pathway--semantic-model-log-analysis)|
|Semantic model|[Most active Users](#analytical-pathway--semantic-models---most-active-users)|
|Semantic model|[Refreshes & Queries](#analytical-pathway--semantic-models--refreshes-queries)|


### Overview page

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_0.png)

|Step|Description|
|---|---|
|1.|**Workspace** parameter: **Select** a connected workspace to set the scope of the report. The overview page also shows the name of the selected workspace.|
|2.|**Other** parameters: Each dashboard page contains context-specific parameters you can select. <br> The **UTC offset** parameter adjusts all time-related insights to the selected time zone. <br> The **Time range** parameter filters all visuals on the page (maximum available interval: 30 days).|
|3.|Semantic model logs-related dashboard pages.|
|4.|Eventhouse KQL database log-related dashboard pages.|
|5.|**Explore** the help page, which helps you and other users in your organization get more information about the templates and their purpose, etc.|
|6.|Available log cards show which workload logs are available in the current time window for the selected workspace.|

------

### Analytical Pathway | Eventhouse log analysis
**for near-real-time monitoring/troubleshooting**


Let's begin to analyze the Eventhouse-related operations in this analytical pathway.

#### Overview | Eventhouse KQL databases

This dashboard page is your landing page to start analysis of Eventhouse KQL queries, batch/streaming ingestions, and item activities.

>**Note**: The item activities/activity times within this analytical pathway determine the Eventhouse engine-related activities. <br> Those activities are **not** the activity logs from the Fabric service.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_eh_0.png)

|Step|Description|
|---|---|
|Info|The parameter _EventhouseName_ can filter the dashboard page visuals.|
|1.|The top section of the dashboard page shows aggregated insights about queries from multiple points of view.|
|2.|The bottom section of the dashboard page shows aggregated insights about batch and streaming ingestions from multiple points of view.|

#### Queries | Eventhouse KQL databases

The "EH | Queries" dashboard page focuses on the executed queries within the given time window for the selected workspace.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_eh_1.png)

|Step|Description|
|---|---|
|3.|The cards show an aggregated view of executed queries against all the selected Eventhouse items. <br> The **Queries by status over time** visual shows the metric _QueriesCount_ by status over time, which determines the unique count of queries. <br> The **Cache Hit Misses % over time** visual contains the metric _CacheHitMissesPerc_, which is a calculated metric from 'Cold Cache Hits', 'Hot Cache Hits', 'Cold Cache Misses', and 'Hot Cache Misses' information. It helps you understand the behavior of the query caches. _Hint: If you see an increase in Cache Hit misses, check your caching policy and the time ranges of your queries._ <br> The **Daily Query Duration (Sec) Percentile over time** visual shows the _percentile_DurationSec_X_ metric. Currently, three buckets are defined: _50 sec_, _75 sec_, and _90 sec_.|
|4.|The **Most active users** visual provides the unique query count by Executing User.|
|5.|The table provides key metrics of each query operation. <br> _Hint: You can define the sorting rule of the table with the parameter 'Top Queries - table order by'._|

#### Table Ingestions | Eventhouse KQL databases

The "EH | Table Ingestions" dashboard page focuses on the ingestion operations within the given time window for the selected workspace.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_eh_2.png)

|Step|Description|
|---|---|
|6.|The top section consolidates the key metrics for **batch** and **streaming** ingestions.|
|7.|The bottom section provides details about ingestion results, failures, and latencies. <br> _Hint: To see more granular details, you can filter the insights by KQL database with the parameter 'Database Name'._|

#### Activity time | Eventhouse KQL databases

The "EH | Activity time" dashboard page focuses on the activity operations within the given time window for the selected workspace.

>**Note**: The item activities/activity times within this analytical pathway determine the Eventhouse engine-related activities. <br> Those activities are **not** the activity logs from the Fabric service.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_eh_3.png)

|Step|Description|
|---|---|
|8.|CPU Activity times by operations and over time visuals show how the Eventhouses within the given time window for the selected workspace.|
|9.|The bottom section provides CPU times for the following scenarios: <br> - Update policies <br> - Materialized Views <br> - Commands|

**Very well done!**
You finished the analytical pathway "Eventhouse KQL database analysis".

----------------

### Analytical Pathway | Semantic model log analysis
**for near-real-time monitoring/troubleshooting**

#### Overview | Semantic models

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_1.png)
|Step|Description|
|---|---|
|1.|**Workspace** parameter: **Select** a connected workspace to set the scope of the report. The overview page also shows the name of the selected workspace.|
|2.|**Other** parameters: Each dashboard page contains context-specific parameters you can select. <br> The **UTC offset** parameter adjusts all time-related insights to the selected time zone. <br> The **Time range** parameter filters all visuals on the page (maximum available interval: 30 days).|
|3.|The cards provide you with aggregated insights about all semantic models in the selected time window. <br> **Important:** The dashboard includes query and refresh operations only.|
|4.|Basic capacity-related insights about semantic models: <br>_Total Execution Delay_ and _Total Throttling_ time in the selected time unit.|
|5.|Basic insights about semantic models, such as "Operations by status over time" and "Operations by Application".|
|6.||

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_2.png)

|Step|Description|
|---|---|
|Info|Let's focus on the provided illustration and the associated visuals on the "Semantic Models" dashboard page. <br><br> The Analysis Services engine (for semantic models) collects different trace log events to the same OperationId. The illustration shows which kinds of trace logs will be collected during the lifecycle of a query or refresh operation.|
|7.|The first part of the illustration shows that some trace log events will already be collected before the operation ends. This information doesn't contain all the different key metrics of an operation, like memory consumption or CPU time; however, it allows us to visualize on this Real-Time Dashboard the count of currently running queries and refreshes, which haven't finished yet.|
|8.|At the end of each query or refresh operation, another trace log event entry will be collected by the Workspace Monitoring feature, which is the "ExecutionMetrics". This event contains a summary of all key metrics of an operation. However, this is only available once the operation has finished with status "succeeded" or "failed".|

>**Example A**: A semantic model **query** within a Power BI report takes on average around 1.5 minutes. To identify this operation as soon as possible, this dashboard visualizes the "Running Queries" metric. This metric shows how many different query operations have been started on this monitored workspace within the selected time window, but not finished yet.

>**Example B**: A semantic model **refresh** takes on average around 2 hours. To identify this operation as soon as possible, this dashboard visualizes the "Started Refreshes" metric. This metric shows how many different refresh operations have been started on this monitored workspace within the selected time window, but not finished yet.

**Important to know:** If we visualized only the insights extracted from the "ExecutionMetrics" event, we wouldn't see any information about a given operation until it has finished.

**Very well done!**
You finished the introductory analytical pathway "Semantic model near-real-time analysis".

----------------


### Analytical Pathway | Semantic models | Most active Users
**for near-real-time monitoring/troubleshooting**

The next dashboard page is **SM | Users**, which consolidates all the semantic model operations (queries and refreshes) from the _Executing User_ perspective.

>**Info**: Within the SemanticModelLogs table, there are two different user-related columns. 
>
>It might occur that a user schedules a semantic model refresh, which will be executed automatically by the service; however, this operation is associated with the user who owns the semantic model. 
>
>For such scenarios, the _Executing User_ determines the associated user for refreshes, but also defines the user who executes a query ("User opens the Power BI report page, which has 4 visuals -> 4 query operations will be logged.")

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_5.png)

|Step|Description|
|---|---|
|1.|This is an aggregated view of all the query interactions and refreshes with the key metrics by user.|
|Info|In many cases, when we troubleshoot a semantic model, we would like to understand the behavior of the user.|
|2.||
|3.||

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_6.png)

|Step|Description|
|---|---|
|4.|**Review** the heatmaps: <br> - This heatmap shows the _Max CPU Time_ of operations by _Executing User_ by _Semantic model_ for all the selected semantic models within the selected time window. <br> - This heatmap shows the _Max Duration_ of operations by _Executing User_ by _Semantic model_ for all the selected semantic models within the selected time window. <br> - This heatmap shows the _Max Memory Peak_ of operations by _Executing User_ by _Semantic model_ for all the selected semantic models within the selected time window. <br> This step helps you to focus on the most active users by the three key metrics. |
|5.|**Review** the table for more details. This table visual shows user-initiated/related query and refresh operation metrics. <br> _**Info:** Filtered for top 10 users based on _Max CPU Time_ descending._ |

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_7.png)

|Step|Description|
|---|---|
|Info| _In this example, we could identify one user who had some resource peaks, 167 failed operations, execution delay, etc. in the recent period._|
|5a.|**Right-click** (secondary mouse click) on the user name in the table. |
|5b.|**Click** in the menu the "Drillthrough to" option and **click** on "SM User Details". <br> _This will guide you to the "SM - User Details" dashboard page and will filter the next page for the selected user._ |

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_8.png)

|Step|Description|
|---|---|
|Info| _This dashboard page is essential for another scenario, where you as a Power BI developer want to see the resource footprint/utilization of queries during the development/optimization process._|
|6.|**Review** this set of visuals. It summarizes in near-real time the current executing queries and started refreshes, initiated by the selected user. <br>|
|7.|**Review** the execution intensity-related insights, initiated by the selected user.|
|8.|**Investigate** which semantic model within the selected workspace is used by the user with high resource footprints. <br> _This overview, in combination with the visuals from Step 9, will help you understand the usage patterns of the user._ |
|9.|**Review** the heatmaps: <br> - This heatmap shows the _Max CPU Time_ of operations by _Semantic model_ by _Usage Scenario_ for all the selected semantic models within the selected time window by the selected user. <br> - This heatmap shows the _Max Duration_ of operations by _Semantic model_ by _Usage Scenario_ for all the selected semantic models within the selected time window by the selected user. <br> - This heatmap shows the _Max Memory Peak_ of operations by _Semantic model_ by _Usage Scenario_ for all the selected semantic models within the selected time window by the selected user. <br> _This step helps you decide which detailed analysis path you should continue in the next step._ |

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_9.png)

|Step|Description|
|---|---|
|Info|_Before you continue, we **recommend filtering** some semantic models based on the insights learned from the previous step._|
|10.|This section consolidates the **query** and **refresh** operations for the filtered context. |

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_10.png)

|Step|Description|
|---|---|
|10q.|_Continue with this sub-step if the previous investigation showed that the selected user's interaction with the semantic model comes mainly from queries._ <br> To understand how the selected user interacts (queries) with the semantic model, **review** the insights of the last 50 queries initiated by the selected user, such as raw query dialect and query text (EventText), status, etc. |
|10r.|_Continue with this sub-step if the previous investigation showed that semantic model(s) have resource-intensive refresh operations initiated by the selected user._ <br> To understand how and how often the selected user triggered a refresh of the semantic model, **review** the insights of the last 50 refreshes with all the detailed performance metrics like _Total CPU Time_, _Total Power Query CPU Time_, _Total Power Query Memory Peak_, or _Total Processed Objects (mainly rows)_. <br> _**Info:** In this version of the dashboard, the user is not directly connected to this table visual's data._|

You can now use these facts about the usage patterns and consider the next possible actions:

(Optional) **Understanding DAX/MDX query**:  
You can copy the query to your organization's Copilot to ask for a description with complexity risks.

(Optional) **Optimization of semantic model**:
- Analyze the semantic model with built-in [Model health](https://learn.microsoft.com/en-us/power-bi/transform-model/service-notebooks) features.
- Third-party tools

**Amazing!**
You finished the analytical pathway "Most active User logs near-real-time analysis".

----------------

### Analytical Pathway | Semantic models | Refreshes & queries
**for near-real-time monitoring/troubleshooting**

#### Refreshes | Semantic model logs

**High-level explanation:**  
A refresh process (full, partial, etc.) has a unique OperationId. For example, in the case of a full refresh, the process includes multiple sub-operations, and every sub-operation also has sub-operation sequences. In other words, every single source table, column, hierarchy, relationship, etc., has to be refreshed/recalculated to get a properly refreshed semantic model. This logic happens automatically within the semantic model engine.  

Within the Real-Time Dashboard template, the Refreshes page aims to provide high-level insights about semantic model refreshes as soon as possible. This means that the Workspace Monitoring database already contains logs about a semantic model refresh before it fully finishes. With that said, in combination with these logs and the Real-Time Dashboard template, we are able to get the logs of a refresh operation from the very beginning and can track in near-real time, for instance, the processed objects (mainly rows).

>**Note:** This page is a preview page. Currently, it doesn't contain **failed** refreshes and the **associated** executing **users**.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_11.png)

|Step|Description|
|---|---|
|1.|**Review** the unique count of refreshes cards. <br> _Started Refreshes_ is the count of refresh operations within the selected time window for the selected workspace, which have not been finished yet. <br> _Succeeded Refreshes_ is the count of unique refresh operations within the selected time window for the selected workspace. |
|2.|**Review** the chart visuals of refreshes by semantic models. They help you understand which semantic model took a long time to refresh, consumed much memory, etc. <br> Metrics: _Max CPU Time_, _Max Duration_, _Max Power Query CPU Time_, _Max Power Query Peak Memory_, and _Max Processed Objects_ by semantic model within the selected time window for the selected workspace.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_12.png)

|Step|Description|
|---|---|
|3.|**Track** the currently running refreshes in the table. This table shows all the available aggregated insights of refreshes by semantic models by operationId. <br><br> Refresh entry with status **Started**: <br> In this case, the EndTime represents the end time of the latest sub-operation sequence. <br> _In this example, the semantic model "Storm_Import_Base" is still running; however, the operation has already processed 50,000 rows, which is one of the tables within the semantic model._  <br><br> Refresh entry with status **Succeeded**: <br> In this case, the StartTime and EndTime represent the active time window, where the engine logged information for the most important sub-operations _(See the illustration "High-level process of Semantic model refreshes" on the dashboard page at Step 1 to understand what these sub-operations are)_. |

>**Tip:** If you are interested in more detailed insights of refreshes, like processed tables and partitions, please explore the [Power BI report template for Workspace Monitoring](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_PBI_Report.md).

#### Queries | Semantic model logs

Let's continue with the **SM | Active Queries** dashboard page, which is especially helpful in situations where you need to understand which queries are currently running against the semantic models within the monitored workspace.

>**Note:** One Power BI report page can contain multiple visuals. Each visual crafts its own DAX query behind the scenes. <br> The metric _# Running Queries_ shows the number of each unique running DAX and MDX query that has been called by the user or by a process (like a report subscription).

>**Important:** On this dashboard page, for performance reasons, the visuals don't show any performance metrics of the query. This page is aimed at tracking the currently/recently executed semantic model queries in the most efficient way possible.

>**Known limitation**: If the 'Time range' parameter has a historical time window, e.g., between 2025-07-01 and 2025-07-15, but the current date is 2025-08-23, then the page doesn't show the currently running queries.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_13.png)

|Step|Description|
|---|---|
|Info|We recommend filtering this dashboard page for a small time window, such as: last _15 min_, _30 min_, or _1-2 hours_.|
|4.|**Review** the visuals. The cards show you the unique count of queries by status. <br> The visual in the middle of this section shows you who and which query is currently executing on the workspace. <br> The illustration on the right-hand side of this section explains which data is available for this kind of analysis, and which scope is defined for the entire AS engine query execution.|
|5.|**Review** this table visual. It shows the top 50 recent semantic model queries for the selected workspace. It shows queries with dialect: 'DAX Query' and 'MDX Query' for three possible statuses: 'Started', 'Failed', or 'Succeeded'.  |
|5a.|Let's take a look at the queries with status **Started**. The entries within the table will be highlighted in blue for this status.|
|5b.|There is a kind of 'specific' query type with dialect 'MDXQuery' with 'EventText': "COMMIT TRANSACTION" and "BEGIN TRANSACTION". Those entries are initiated by **DirectLake** model data framing operations. In other words, they are not real queries. |
|5c.|Let's take a look at the queries with status **Failed**. To understand more about the query, you can **click** on the OperationId and navigate to the "SM - Query Drillthrough" dashboard page. |

Let's deep dive into an example query:

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_14.png)

|Step|Description|
|---|---|
|Info|Once you expand a row within the table, you can see the raw DAX/MDX query that has been called against the semantic model.|
|5d.|**Review** the value of the "EventText" attribute/column. This value is the raw text, which you can also use in, e.g., the DAX editor in Power BI Desktop.|
|6.|Let's assume that you have already identified a semantic model where a user is calling a heavy visual (DAX query). You would like to take action to analyze and optimize the semantic model further. <br> **Explore** the three options, which can help you start an in-depth investigation.|

**Very well done!**
You finished the analytical pathway for "Semantic model refreshes & queries".

--------------------------------------------------------


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