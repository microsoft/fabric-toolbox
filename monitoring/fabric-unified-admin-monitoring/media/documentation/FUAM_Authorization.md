# FUAM Authorization & Authentication

## General

There are different methods of authorization depending on what kind of data needs to be extracted.
Usually, the APIs extracting the data are called in a pipeline using centrally defined connections with a service principal.

**In the following cases, this is not possible:**
- Notebook “01_Transfer_Incremental_Inventory_Unit”: 
    - The scanner API needs multiple API calls, which can be parallelized to a certain degree. To reach optimal performance, the extraction is done in a notebook. 
        - There are two mechanisms for how authorization is handled:
            - If a key vault with the service principal credentials has been defined, this service principal is used.
            - If no service principal is defined, it uses the notebook owner's identity.

- The “capacity metrics” notebooks "XX_Transfer_CapacityMetricData_XX_Unit" use the notebook owner's identity to access the capacity metrics app by using **sempy**. Full implementation via service principal is currently not possible (but coming soon).

## Current approach

To gather all the required data, it is currently not possible to use a single method (with service principal) in each data ingestion module of FUAM.

To keep every interaction with REST APIs secure and to protect sensitive tokens during the data ingestion process, at least two methods are required:
- Cloud connection (with SPN) - **required**
- Azure Key Vault (with SPN) - **optional**
- Notebook owner's identity (Fabric Administrator EntraID User) - **required, if no Azure Key Vault**

![FUAM authorization methods](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_authorization_methods.png)

> **Info:** We will update FUAM once notebooks can be run in pipelines with SPN identity context.

## Required tenant admin settings

### Fabric Administrator

To be able to deploy FUAM, the user must have the following permissions:

Currently, the capacity metrics data is gathered via DAX queries within notebooks, which can be executed via the notebook owner’s identity. For this reason, the user account (who is the owner of the notebook, the one who deployed it) must be a member of the following tenant setting:

•	_Allow XMLA endpoints and Analyze in Excel with on-premises semantic models_ – [learn.microsoft.com](https://learn.microsoft.com/en-us/fabric/admin/service-admin-portal-integration#allow-xmla-endpoints-and-analyze-in-excel-with-on-premises-datasets)

### Service Principal 

There are two admin settings where the service principal (as a member of a group) needs to be enabled:
  - _Service Principals can use Fabric APIs_ - [learn.microsoft.com](https://learn.microsoft.com/en-us/fabric/admin/enable-service-principal-admin-apis)
  - _Service Principals can access read-only admin APIs_ - [learn.microsoft.com](https://learn.microsoft.com/en-us/fabric/admin/enable-service-principal-admin-apis)

> **Info:** It is best practice to add the service principal as a member of an EntraID group.

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
- [Documentation - FUAM Architecture](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Architecture.md)
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
