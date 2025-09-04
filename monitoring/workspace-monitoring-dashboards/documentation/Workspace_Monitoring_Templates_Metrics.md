# Template metrics 
**within the Fabric Workspace Monitoring templates**

## General

This article describes all the common metrics within the Real-Time Dashboard and Power BI templates for Workspace Monitoring.

## References

#### Workspace Monitoring feature
- [What is workspace monitoring](https://learn.microsoft.com/en-us/fabric/fundamentals/workspace-monitoring-overview)

#### Semantic model logs

- [Semantic model operation logs](https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/semantic-model-operations)
- [Semantic model 'ExecutionMetrics'](https://learn.microsoft.com/en-us/power-bi/transform-model/log-analytics/desktop-log-analytics-configure?tabs=refresh#events-and-schema)

#### Eventhouse logs

- [Eventhouse query logs](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/monitor-logs-query)
- [Eventhouse metrics](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/monitor-metrics)

-----


The following tables describe the defined metrics for the RT-Dashboard and Power BI report templates.

### Semantic model related metrics

Source table: **SemanticModelLogs**
|Source column|Metric name(s) in templates|Description|
|--|--|--|
|OperationId|# Operations|Unique count of operations <br> _Filtered for queries and refreshes only._|
|OperationId, Status |Operation Success Ratio|Percentage of successful unique operations. Higher is better. <br>_Filtered for queries and refreshes only._ |
|ExecutingUser|# Users/<br>Active Users|The user running the operation.|
|OperationId|# Queries/<br>Query Operations| Unique count of DAX/MDX query operations.|
|OperationId|# Refreshes/<br>Refresh Operations|Unique count of refresh operations.|
|OperationId, Status |# Errors|Unique count of failed operations.|
|executionDelayMs|Total Execution Delay Time/<br>Execution Delay|Total time spent waiting for Analysis Services engine thread pool thread availability.|
|capacityThrottlingMs|Total Throttling Time/<br>Capacity Throttling|Total time the request got delayed due to capacity throttling.|
|capacityThrottlingMs|Max Throttling Time/<br>Max Capacity Throttling|Max time the request got delayed due to capacity throttling.|
|CpuTimeMs|Total CPU Time|Total amount of CPU time (transferred in selected unit) used by the event/operation.|
|CpuTimeMs|Max CPU Time|Max amount of CPU time (transferred in selected unit) used by the event/operation.|
|queryProcessingCpuTimeMs|Total Query CPU Time|Total CPU time spent by tasks on Analysis Services query thread pool thread.|
|queryProcessingCpuTimeMs|Max Query CPU Time|Max CPU time spent by tasks on Analysis Services query thread pool thread.|
|mEngineCpuTimeMs|Total Power Query CPU Time/<br>Power Query CPU Time|Total CPU time spent by PowerQuery engine (Mashup engine) by the event/operation.|
|mEngineCpuTimeMs|Max Power Query CPU Time|Max CPU time spent by PowerQuery engine (Mashup engine) by the event/operation.|
|vertipaqJobCpuTimeMs|Total VertiPaq CPU Time/<br>VertiPaq CPU Time|Total CPU time spent by Vertipaq engine.|
|vertipaqJobCpuTimeMs|Max VertiPaq CPU Time|Max CPU time spent by Vertipaq engine.|
|CpuTimeMs|Total Progress CPU Time/<br>Progress CPU Time|Total amount of CPU time (transferred in selected unit) used by the refresh/progress event. <br> _Filtered for refresh sequences only._|
|durationMs|Total Duration Time|Total duration of the execution.|
|durationMs|Max Duration|Max duration of selected executions.|
|approximatePeakMemConsumptionKB|Total Memory Peak/Total Operation Memory Peak|Approximate peak total memory consumption during the request.|
|approximatePeakMemConsumptionKB|Max Memory Peak/Max Operation Memory Peak|Max of approximate total memory peak consumption during the request of selected operations.|
|mEnginePeakMemoryKB|Total Power Query Memory Peak|Approximate peak memory commit size (transferred in selected unit) across all PowerQuery engine mashup containers.|
|mEnginePeakMemoryKB|Max Power Query Memory Peak|Max of approximate peak memory commit size across all PowerQuery engine mashup containers of the selected operations.|
|extracted from EventText|Total Processed Objects/<br>Progress Object Count|Total count of progressed count of object (table rows, hierarchy objects etc.)|
|queryResultRows|Query Result Rows|Total number of rows returned as a result of the DAX query.|
|directQueryTotalTimeMs|Total DirectQuery Time|Total time spent on executing and reading all DirectQuery queries during the request.|
|directQueryConnectionTimeMs|DirectQuery Connection Time|Total time spent on creating new DirectQuery connection during the request|
|directQueryIterationTimeMs|DirectQuery Iteration Time|Total time spent on iterating the results returned by the DirectQuery queries.|
|externalQueryTimeoutMs|External Query Execution Time|Timeout associated with queries to external datasources.|
|directQueryRequestCount|DirectQuery Request Count|Total number of DirectQuery storage engine queries executed by the DAX engine.|
|directQueryTotalRows|DirectQuery Rows|Total number of DirectQuery storage engine queries executed by the DAX engine.|
|datasourceConnectionThrottleTimeMs|Datasource Connection Throttle Time|Total throttle time after hitting the datasource connection limit. Learn more about maximum concurrent connections [here](https://learn.microsoft.com/en-us/fabric/enterprise/powerbi/service-premium-what-is#semantic-model-sku-limitation).|
|tabularConnectionTimeoutMs|Tabular Connection Timeout|Timeout associated with external tabular datasource connections (e.g. SQL).|
|directQueryTimeoutMs|DirectQuery Timeout|Timeout associated with DirectQuery queries.|

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



