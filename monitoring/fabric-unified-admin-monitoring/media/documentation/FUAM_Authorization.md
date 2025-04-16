# Authorization & Authentication
**for FUAM solution accelerator**

## General

There are different methods of authorization depending on what kind of data needs to be extracted.
Usually, the APIs extracting the data which are called in a pipeline using the centrally defined connections with a service principal.


**In the following cases, this is not possible:**
- Notebook “01_Transfer_Incremental_Inventory_Unit”: 
    - The scanner API needs multiple API calls which can be parallelized to a certain degree. To reach optimal performance, the extraction is done in a notebook. 
        - There are two mechanisms of how authorization is happening:
            - If a key vault with the service principal credentials has been defined this service principal is used
            - In case of no service principal is defined it uses the Notebooks owner’s identity

- The “capacity metrics” notebooks "XX_Transfer_CapacityMetricData_XX_Unit" use the notebook owner’s identity to access the capacity metrics app by using **sempy**. Fully implementation via service principal is currently not possible (but coming soon).

## Current approach

To gather all the required data, it is currently not possible to use one single method (with service principal) in each data ingestion module of FUAM.

To keep every interaction to REST APIs securely and secure sensitive tokens during the data ingestion process, there are at least two methods required:
- Cloud connection (with SPN) - **required**
- Azure Key Vault (with SPN) - **optional**
- Notebook owner’s identity (Fabric Administrator EntraID User) - **required, if no Azure Key Vault**

![FUAM authorization methods](/monitoring/fabric-unified-admin-monitoring/media/general/fuam_authorization_methods.png)

> **Info:** We will update FUAM once notebooks can be run in pipelines with SPN identity context


## Required tenant admin settings

### Fabric Administrator

To be able to deploy FUAM, the user 

Currently, the capacity metrics data will be gathered via DAX queries within Notebooks, which can be executed via the Notebook’s Owner Identity. For this reason, the User Account (who is the owner of the Notebook, the one who deployed it) must be a member of the following tenant setting:

•	_Allow XMLA endpoints and Analyze in Excel with on-premises semantic models_ – [learn.microsoft.com](https://learn.microsoft.com/en-us/fabric/admin/service-admin-portal-integration#allow-xmla-endpoints-and-analyze-in-excel-with-on-premises-datasets)


### Service Principal 

There are two admin settings, where the service principal (as a member of a group) needs to be enabled:
  - _Service Principals can use Fabric APIs_ - [learn.microsoft.com](https://learn.microsoft.com/en-us/fabric/admin/enable-service-principal-admin-apis)
  - _Service Principals can access read-only admin APIs_ - [learn.microsoft.com](https://learn.microsoft.com/en-us/fabric/admin/enable-service-principal-admin-apis)

> **Info:** It is a best practice to add the Service Principal as a member of an EntraID group.



----------------

## Other helpful resources
- [Video - Brief introduction to FUAM](https://youtu.be/CmHMOsQcMGI)
- [Documentation - FUAM Architecture](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Architecture.md)
- [Documentation - FUAM Lakehouse table lineage](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf)

----------------