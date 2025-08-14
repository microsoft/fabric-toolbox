# Power BI report template for Fabric Workspace Monitoring

## General

The Power BI allows users to configure connections to Monitoring Eventhouse where they can retain detailed historical activity data. This repo hosts **Power BI report** templates (.pbit) that you can point to your Monitoring Eventhouse databases to load data and get insights.
Now, you can seamlessy connect and track your workspace items, operations, visuals etc. without leaving the SaaS experience from Microsoft Fabric.

The Power BI Report template is structured on the following way:

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_template_structure.png)


## How to deploy

Follow the documentation [here](/monitoring/workspace-monitoring-dashboards/how-to/How_to_deploy_Workspace_Monitoring_PBI_Report.md).

## Common scenarios 

There are some common questions where Workspace Monitoring can help with the Power BI report template.

|Workload|Question|Approach|Analytical Pathway|
|----|----|----|----|
|All supported |„What has happened on my workspace recently?“|Trend analysis by workload|Diagnostic Overview|
|Semantic model|„We got a call from management, because yesterday someone throttled the capacity“|The report is designed in way, where users can troubleshoot heavy operations and find the root cause of the e.g. consumption peak with ease.| [Query Analysis](#analytical-pathway--query-analysis) & [Refresh Analysis](#analytical-pathway--refresh-analysis)|
|Semantic model|“A semantic model refresh took very long yesterday. What caused the delay?”|Analyze refresh duration and resource usage|[Refresh Analysis](#analytical-pathway--refresh-analysis)|
|Semantic model|“One semantic model is causing capacity issues. What queries are hitting it?”|Investigate query patterns and CPU usage per model|[Query Analysis](#analytical-pathway--query-analysis)|
|Eventhouse|“Which Eventhouse queries are consuming the most resources or failing frequently?”|Query performance analysis and error tracking|Query Performance & [Query Analysis](#analytical-pathway--query-analysis)|
|Eventhouse|“Are there ingestion pipelines that are failing or running slower than expected?”|Monitor ingestion success rates, durations, and retry patterns|Ingestion Analysis|
|Mirrored database|“Why is the mirrored database table execution impacting performance?”|Analyze execution logs, query volumes, and CPU usage|Table Execution Analysis|
|API for GraphQL|“What is the success ratio of my production GraphQL API request over time?”|Track API call frequency, response times, and error rates|GraphQL Performance Analysis|

-----

## Analytical Pathways

|Workload|Name|
|---|---|
|Semantic model|Key Metrics Overview|
|Semantic model|[Query Analysis](#analytical-pathway--query-analysis)|
|Semantic model|[Refresh Analysis](#analytical-pathway--refresh-analysis)|
|Eventhouse|Query Performance|
|Eventhouse|Ingestion Performance|
|API for GraphQL|GraphQL Performance|
|Mirrored database|Table Execution Analysis|


### Semantic Model Logs

Workspace admins, users, BI developers etc. would like to analyse the operations of all the semantic models within a given workspace.
They want to investigate which semantic model had in the recent time (max last 30 days, because of Monitoring Eventhouse retention period) significant problems with queries and refreshes.

#### Analytical Pathway | Key Metrics Overview
**for Semantic Model logs**


|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: between 1 and 30 days|
|2.|**Define** the "Time Unit" filter, which helps you to convert all time related measures. <br> Available units: _millisecond_, _second_, _minute_, _hour_|
|3.|**Define** the "Size Unit" filter, which helps you to convert all the data size/volume related measures. <br> Available units: _byte_, _kilobyte_, _megabyte_, _gigabyte_|
|4.|**Review** the "Semantic Model Metrics" card. Once there are any collected logs for semantic models, this card will be available.|
|5.|**Click** on the **Key Metrics Overview** button within the "Semantic Model Metrics" tile to begin the analytical pathway.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_0.png)

|Step|Description|
|---|---|
|6.|The cards provide you aggregated insights about all semantic models in the selected time window. <br> **Important:** The report includes query and refresh operations only.|
|7.|The underlying logs provide also information about _Execution Delay_ and _Capacity Throttling_ which was caused by a semantic model by operation. <br> **Important:** This visual contains those information on workspace level only. To monitor delays, rejections and throttling, please use the Capacity Metrics App.|
|8.|Review the Metrics table on the page.  This visual shows the key raw CPU, Memory and Duration and other key metrics for each semantic models, which have been used within the defined time window. <br> _See the Measure description below._ <br> **Highlight** a semantic model in the visual to activate the buttons for step 9 and 10. |
|9.|The analytical pathway _Query Analysis_ allows you to deep dive into the query execution details for the selected semantic model. |
|10.|The analytical pathway _Refresh Analysis_ allows you to deep dive into the refresh execution details for the selected semantic model. |

>**Note:** Other metrics with high values like _Max Execution Delay_, or _Max Memory Peak_ or count of _Errors_ are indicators to continue the investigation.



![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_1.png)



#### Analytical Pathway | Query analysis
**for Semantic Model logs**

|Step|Description|
|---|---|
|1.|**Define** the considered time window (**Date**) on the filter pane <br> Available interval: between 1 and 30 days|
|2.|**Review** the "Semantic Model Metrics" card. Once there are any collected logs for semantic models, this card will be available.|
|3.|**Click** on the **Query Analysis** button within the "Semantic Model Metrics" tile to begin the analytical pathway.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_10.png)

|Step|Description|
|---|---|
|4.|The filter pane on this page contains two filters: _OperationId_ and _Semantic Model_. <br> **Important:** The _Semantic Model_ filters shows the latest name of the model. For instance if you renamed the semantic model several times in the past days, the report will gather the latest, current name of it. The data model behind the report uses ItemIds, which are consistent for each deployed semantic model.|
|5.|**Review** the visual. Each stacked bar chart shows metrics by semantic model by day. The bar size shows the _Max CPU Time_, the color of the bar shows the _Max Peak Memory_ consumption. This combination provides you a comprehesive view, where you can put the CPU time and the memory consumption into correlation. _See examples below_. |
|6.| **Highlight a bar** on the chart for the next step. |


>**Example 1:** The CPU duration (bar) is **high**, however the memory consumption (color) is **green**. This would mean that on that day at least one query operation was **CPU intensive**. 

>**Example 2:** The CPU duration (bar) is **low**, however the memory consumption (color) is **red**. This would mean that on that day at least one query operation was **Memory intensive**.


![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_11.png)

|Step|Description|
|---|---|
|6.|Review the summary of the "Query History" page, which has been filtered for the selected semantic model. Since this page will be used in another analytical pathway, just ignore the "Selected Date" tile. There is a link embedded to understand more your specific Memory limits for Queries.|
|7.|Review the Query History table on the page. This visual show more detailed metrics from each query, which has been executed against the selected semantic model within the selected time window. In this example, we go with that one failed DAX query.|
|8.|After you highlighted the row in the table, click on the "Go to Query Analysis" button to see all the metrics and raw trace logs about this query.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_2.png)


|Step|Description|
|---|---|
|9.|On the "Query Details" page, the data has been filtered for one single operation. This page provides all the relevant information about the given query. |
|10.|The cards provide you detailed information about the query, similarly like on the previos page. These numbers helps you to understand the resource footprint, duration and other metrics of the query.|
|11.| The table visual on the bottom is sorted by Timestamp ascending. This is important to keep it like that, because you will see chronological trace logs. In this example the last raw log (exluded the Execution Metrics, which is an additional trace log event) was an Error event. The column _EventText_ provides you the raw trace log value, which has been reported by the engine. In this case the user has cancelled the query.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_3.png)

**Very well done!**
You finished the analytical pathway "Query analysis" for semantic models.

------------------------------------------------------------------------------------------------

#### Analytical Pathway | Refresh analysis
**for Semantic Model logs**

|Step|Description|
|---|---|
|1.|Define the considered time window on the filter pane [min: 1, max: 30] in days|
|2.|Review the Semantic Model Metrics card.|
|3.|Click on the "Refresh Analysis" button within the "Semantic Model Metrics" tile to begin the analytical pathway.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_4.png)

|Step|Description|
|---|---|
|4.|Review the visual. Each stacked bar chart shows metrics by semantic model by day. The bar size shows the _Max PowerQuery CPU Time_, the color of the bar shows the _Max PowerQuery Peak Memory_ consumption. This combination provides you an comprehesive view, where you can put the CPU time and the memory consumption into correlation. _See examples below_. |
|5.| Highlight a bar on the chart for the next step. |

>**Example 1:** The CPU duration (bar) is **high**, however the memory consumption (color) is **green**. This would mean that on that day at least one refresh operation was **CPU intensive**. 

>**Example 2:** The CPU duration (bar) is **low**, however the memory consumption (color) is **red**. This would mean that on that day at least one refresh operation was **Memory intensive**.

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_5.png)

|Step|Description|
|---|---|
|6.|Hover over the bar to see the more details about the given day for the given semantic model in the tooltip.|
|7.|Click on the "Continue Refresh Analysis" button, once one bar has been highlighted to jump to the next analysis page.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_6.png)


|Step|Description|
|---|---|
|8.|Review the matrix visual, which shows each refreshes for the selected semantic model on the selected day.|
|9.|Expand an OperationId to see the refreshed table metrics.|
|10.|Expand a _Table Name_ and the _Object Type_ to identify, which object was very resource intensive. |

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_7.png)

|Step|Description|
|---|---|
|Info|There is another view to analyse a selected refresh operation on a GANTT chart. This helps you to better understand, which object, sequence during the refresh took long|
|11.|Highlight a Refresh Operation.|
|12.|Click on the "Navigate to Refresh GANTT" button.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_8.png)

|Step|Description|
|---|---|
|13.|Review the 'Progress CPU Metrics by Object Type' visual. This shows the _Progress CPU Time_ and _PowerQuery CPU Time_ by object type like Partition, Calculated column etc. In this example, we can see that the partition object type was the most resource intensive object to refresh.|
|14.|Review the 'Progress CPU Metrics by Table Name' visual. This shows the _Progress CPU Time_ and _PowerQuery CPU Time_ by object type like Partition, Calculated column etc. In this example, we can see that the table _SalesTable_ was the most resource intensive object to refresh within the semantic model.|
|15.|Review the GANTT visual. In this example we analyse the table _SalesTable_. The sub-operations (Operation Detail Name) _TabularRefresh_, _ExecuteSql_, _ReadData_, _CompressSegment_, etc. helps you to understand at which sub-operation the refresh sequence took the longest time.  |
|16.| In the 'Refresh Details' table visual below, you can identify the resource footprint for each sub-operation (Operation Detail Name) by _Table_ by _Object Type_ by _Object Name_. In this example the "Tabular Refresh" and the "Read Data" sub-operations had the highest CPU consumption. |
|Optional|If you are interested on other assets like "Memory Analyzer", "Best Practice Analyzer" or "Semantic Model Meta Data Analyzer" to optimize the semantic model, you can explore those assets by clicking on the button on the right-bottom corner of the report page.|

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_ap_9.png)


**Very well done!**
You finished the analytical pathway "Refresh analysis" for semantic models.

------------------------------------------------------------------------------------------------

### Analysis of Eventhouse Logs


### Analysis of Mirrored Database Table Execution Logs




### Migrate from BYOLA
We recommend to use the Power BI report template for the new Workspace Monitoring feature in Microsoft Fabric, whenever you are migrating your workspace monitoring solution from (BYOLA) Log Analytics Workspace monitoring.
