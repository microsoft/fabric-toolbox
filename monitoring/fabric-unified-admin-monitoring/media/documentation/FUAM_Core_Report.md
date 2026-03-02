# FUAM Core Report

**Last Updated:** February 5, 2026  
**Authors:** Kevin Thomas and Gellért Gintli


![image](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_core_1.png)

## Metrics on Home page

### Users

##### Workspace Accesses
Total number of workspace access entries for current granted users, groups, apps within dedicated (Fabric or Premium SKU), across your Fabric tenant.

##### Item Level Accesses
Count of individual item access activities, including reports, semantic models, dataflows, and other Fabric items.

##### Unique Users 14d
Number of distinct users who have accessed Fabric resources in the last 14 days, indicating recent active user engagement.

##### Unique Users 30d
Number of distinct users who have accessed Fabric resources in the last 30 days, providing a broader view of active user base.

----------------

### Connections

##### Source Kinds
Variety of data source types connected to Fabric, such as SQL Server, Azure Data Lake, SharePoint, and other supported connectors.

##### Connections
Total number of data source connections configured across all dedicated (Fabric or Premium SKU) workspaces in your Fabric tenant.


----------------

### Widely Shared Objects

##### Published to Web
Number of reports or content published publicly to the web, enabling anonymous access outside your organization.

##### Organisation Links
Count of items shared via organization-wide links, allowing anyone within your organization to access the content.

----------------

### Refreshables

##### Media SM Refresh Duration (min)
Median semantic model refresh duration in minutes, helping identify typical refresh performance and potential optimization opportunities.

----------------

### Report Usage

##### Views last 14d
Total number of report views in the last 14 days, indicating recent report consumption and user engagement.

##### Views last 30d
Total number of report views in the last 30 days, providing a comprehensive view of report usage trends.

----------------

### Analyzed by external application

##### External App Activities 14d
Number of activities from external applications (e.g., Excel, third-party tools) analyzing Fabric semantic models in the last 14 days.

----------------

### Items

##### Active Items
Count of Fabric active items, indicating actively used resources in your tenant.

----------------

### Workspaces

##### Workspaces
Total number of workspaces in your Fabric tenant, including dedicated (Fabric or Premium SKU) workspaces.

##### Git Connections
Number of workspaces connected to Git repositories for version control and CI/CD integration.

----------------

### Domains

##### Domains
Number of top-level domains configured in your Fabric tenant for organizing and governing workspaces.

##### Sub-domains
Count of sub-domains created under parent domains, enabling hierarchical organization of Fabric resources.

##### Assignment %
Percentage of workspace-to-domain assignments, tracking how workspaces are organized within the domain structure.

----------------

### Capacities

##### Operations 14d
Total number of operations executed across all capacities in the last 14 days, showing overall capacity utilization.

##### Cancelled Ops 14d
Number of operations cancelled in the last 14 days, potentially indicating resource constraints or user-initiated cancellations.

##### Failed Ops 14d
Count of failed operations in the last 14 days, helping identify reliability issues or configuration problems.

##### Avg Item CU 30d
Average Capacity Units (CU) consumed per item over the last 30 days, indicating typical resource consumption patterns.

##### Avg Item CU 14d
Average Capacity Units (CU) consumed per item over the last 14 days, showing recent resource usage trends.

##### Item CU Trend 30d vs. 14d
Comparison of average item CU consumption between 30-day and 14-day periods, revealing usage trends and changes.

----------------

### Tenant Settings

##### Changes 14d
Number of tenant setting modifications made in the last 14 days, tracking administrative configuration changes.

##### Enabled
Count of tenant settings currently enabled, showing active features and capabilities available to users.

##### Disabled
Count of tenant settings currently disabled, indicating restricted features or capabilities in your tenant.

----------------

### Core

##### Capacities
Total number of Fabric capacities provisioned in your tenant, including all SKUs and capacity types.

##### Regions
Number of Azure regions where your Fabric capacities are deployed, showing geographical distribution of resources.


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
- [Documentation - FUAM Technical Deep Dive](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Technical_Deep_Dive.md)

##### Some other Fabric Toolbox assets
- [Overview - Fabric Cost Analysis](/monitoring/fabric-cost-analysis/README.md)
- [Overview - Fabric Spark Monitoring](/monitoring/fabric-spark-monitoring/README.md)
- [Overview - Fabric Workspace Monitoring report templates](/monitoring/workspace-monitoring-dashboards/README.md)
- [Overview - Semantic Model MCP Server](https://github.com/microsoft/fabric-toolbox/tree/main/tools/SemanticModelMCPServer)
- [Overview - Semantic Model Audit tool](/tools/SemanticModelAudit/README.md)

##### Semantic Link & Semantic Link Lab
- [What is semantic link?](https://learn.microsoft.com/en-us/fabric/data-science/semantic-link-overview)
- [Overview - Semantic Link Labs](https://github.com/microsoft/semantic-link-labs/blob/main/README.md)

----------------
