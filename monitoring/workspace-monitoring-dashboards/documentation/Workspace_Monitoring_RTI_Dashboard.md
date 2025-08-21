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
|Semantic model|"We would like to see all the currently running queries and refreshes on the workspace."|Tracking started/running query and refresh operations.|[Semantic Models Analysis](#analytical-pathway--semantic-model-analysis-in-near-real-time)|
|Semantic model|"Which user actively utilizes the semantic models in this workspace?"|Analyzing resource metrics on the "SM - Users" dashboard page|[Semantic Models Analysis](#analytical-pathway--semantic-model-analysis-in-near-real-time)|
|Semantic model|"Which semantic models used significant resources for refresh operations in the recent period on the workspace?"|Investigate query patterns and CPU usage per model|[Semantic Models Analysis](#analytical-pathway--semantic-model-analysis-in-near-real-time)|
|Eventhouse|"Which Eventhouse queries are consuming the most resources or failing frequently?"|Query performance analysis and error tracking|[Eventhouse Analysis](#analytical-pathway--eventhouse-analysis-in-near-real-time)|
|Eventhouse|"Are there ingestion pipelines that are failing or running slower than expected?"|Monitor ingestion success rates, durations, and retry patterns|[Eventhouse Analysis](#analytical-pathway--eventhouse-analysis-in-near-real-time)|

-----

## Analytical Pathways

|Workload|Name|
|---|---|
|Semantic model|[Semantic Models Analysis](#analytical-pathway--semantic-model-analysis-in-near-real-time)|
|Eventhouse|[Eventhouse Analysis](#analytical-pathway--eventhouse-analysis-in-near-real-time)|

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

### Analytical Pathway | Semantic Model Analysis in near real-time

#### Overview | Semantic Models
![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_1.png)

|Step|Description|
|---|---|
|1.|**Workspace** parameter: **Select** a connected workspace to set the scope of the report. The overview page also shows the name of the selected workspace.|
|2.|**Other** parameters: Each dashboard page contains context-specific parameters you can select. <br> The **UTC offset** parameter adjusts all time-related insights to the selected time zone. <br> The **Time range** parameter filters all visuals on the page (maximum available interval: 30 days).|
|3.|The cards provide you with aggregated insights about all semantic models in the selected time window. <br> **Important:** The dashboard includes query and refresh operations only.|
|4.|Basic capacity-related insights about semantic models: <br>_Total Execution Delay_ and _Total Throttling_ time in the selected time unit.|
|5.|Basic insights about semantic models, such as "Operations by status over time" and "Operations by Application".|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_2.png)

|Step|Description|
|---|---|
|Info|Let's focus on the provided illustration and the associated visuals on the "Semantic Models" dashboard page. <br><br> The Analysis Services engine (for semantic models) collects different trace log events to the same OperationId. The illustration shows which kinds of trace logs will be collected during the lifecycle of a query or refresh operation.|
|6.|The first part of the illustration shows that some trace log events will already be collected before the operation ends. This information doesn't contain all the different key metrics of an operation, like memory consumption or CPU time; however, it allows us to visualize on this Real-Time Dashboard the count of currently running queries and refreshes, which haven't finished yet.|
|7.|At the end of each query or refresh operation, another trace log event entry will be collected by the Workspace Monitoring feature, which is the "ExecutionMetrics". This event contains a summary of all key metrics of an operation. However, this is only available once the operation has finished with status "succeeded" or "failed".|

>**Example A**: A semantic model **query** within a Power BI report takes on average around 1.5 minutes. To identify this operation as soon as possible, this dashboard visualizes the "Running Queries" metric. This metric shows how many different query operations have been started on this monitored workspace within the selected time window, but not finished yet.

>**Example B**: A semantic model **refresh** takes on average around 2 hours. To identify this operation as soon as possible, this dashboard visualizes the "Started Refreshes" metric. This metric shows how many different refresh operations have been started on this monitored workspace within the selected time window, but not finished yet.

**Important to know:** If we visualized only the insights extracted from the "ExecutionMetrics" event, we wouldn't see any information about a given operation until it has finished.

<br>

#### Active Queries | Semantic Models

Let's continue with the **SM | Active Queries** dashboard page, which is especially helpful in situations where you need to understand which queries are currently running against the semantic models within the monitored workspace.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_3.png)

|Step|Description|
|---|---|
|Info|We recommend filtering this dashboard page for a small time window, such as: last _15 min_, _30 min_, or _1-2 hours_.|
|9.|All the highlighted visuals show you who and which query is currently executing on the workspace. <br> The table query (row) will be highlighted in blue if the "CurrentStatus" is "Started".|

>**Note:** Please be aware that one Power BI report page can contain multiple visuals. Each visual crafts its own DAX query behind the scenes. <br> The metric _# Running Queries_ shows the number of each unique running DAX and MDX query that has been called by the user or by a process (like a subscription).

Let's deep dive into this example query:

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_4.png)

|Step|Description|
|---|---|
|10.|Once you expand a row within the table, you can see the raw DAX query that has been called against the semantic model.|
|11.|**Review** the value of the "EventText" attribute/column. This value is the raw text, which you can also use in, e.g., the DAX editor in Power BI Desktop.|
|12.|Let's assume that you have already identified a semantic model where a user is calling a heavy visual (DAX query). You would like to take action to analyze and optimize the semantic model further. <br> **Explore** three options, which can help you start an in-depth investigation.|

#### Users | Semantic Models

The next dashboard page is **SM | Users**, which consolidates all the semantic model operations (queries and refreshes) from the _Executing User_ perspective.

>**Info**: Within the SemanticModelLogs table, there are two different user-related columns. It might occur that a user schedules a semantic model refresh, which will be executed automatically by the service; however, this operation is associated with the user who owns the semantic model. 
For such scenarios, the _Executing User_ determines the associated user for refreshes, but also defines the user who executes a query ("User opens the Power BI report page, which has 4 visuals -> 4 query operations will be logged.")

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_5.png)

|Step|Description|
|---|---|
|13.|This is an aggregated view of all the query interactions and refreshes with the key metrics by user.|
|Info|In many cases, when we troubleshoot a semantic model, we would like to understand the behaviors of the user.|
|14.|This heatmap shows the _Max CPU Time_ of operations by _Executing User_ by _Usage_ for all the selected semantic models within the selected time window.|
|15.|This heatmap shows the _Max Duration_ of operations by _Executing User_ by _Usage_ for all the selected semantic models within the selected time window.|
|16.|This heatmap shows the _Max Memory Peak_ of operations by _Executing User_ by _Usage_ for all the selected semantic models within the selected time window.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_6.png)

|Step|Description|
|---|---|
|17.|The table "Top 50 Failed Operations sorted by CPU Time desc" shows all the recently failed operations with the key metrics by _Executing User_, _Semantic Model_ (with link), and _OperationId_.

#### Refreshes | Semantic Models

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_7.png)

|Step|Description|
|---|---|
|18.|Overview of the count of unique refreshes.|
|19.|Key insights of refreshes by semantic models. <br> _Max CPU Time_, _Max Duration_, _Max Power Query CPU Time_, and _Max Processed Objects_ by semantic models within the selected time window for the selected workspace.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_ap_8.png)

|Step|Description|
|---|---|
|20.|Key insights of refreshes by semantic models by operation end time.|

**Very well done!**
You finished the analytical pathway for semantic model analysis.

------------------------------------------------------------------------------------------------

### Analytical Pathway | Eventhouse Analysis in near real-time

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
You finished the