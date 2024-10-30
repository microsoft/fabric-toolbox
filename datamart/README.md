![Datamart Modernization](./media/Datamart%20Modernization.png)

# Power BI Datamart Modernization

This section provides scripts and accelerators to modernize and upgrade a Power BI datamart into a Microsoft Fabric data warehouse, enhancing performance with Direct Lake semantic models and improved creator experiences.

# Script and Notebook

This section offers accelerators designed to assist you in upgrading and modernizing to a Fabric data warehouse. The resources provided include:

- **[Schema and table creation](./schema_and_table_migration.ps1):** Script for creating the schema and table, includes data type compatibility conversion between a datamart and a data warehouse.
- **[Power BI semantic model migration](./Datamart%20Migration.ipynb):** Automatatic modernization of existing Power BI semantic models built from a datamart to Direct Lake models on top of the Fabric Data Warehouse, includes rebinding of reports.

# Instructions

To get started, use the [schema and table creation](./schema_and_table_migration.ps1) PowerShell script. This module will guide you through the process of completing the following required input fields.

| Name | Description |
| :-- | :-- |
| Datamart Server Address | How to [retireve the SQL connection string](https://learn.microsoft.com/power-bi/transform-model/datamarts/datamarts-analyze#get-the-t-sql-connection-string) for the Fabric datamart. |
| Datamart Name | The datamart name as it is displayed in the workspace list. |
| Datawarehouse Server Address | How to [retrieve the SQL connection string](https://learn.microsoft.com/en-us/fabric/data-warehouse/connectivity#retrieve-the-sql-connection-string) for the Fabric data warehouse. |
| Datawarehouse Name | The data warehouse name as it is displayed in the workspace list. |
| Schema Name | The name of a new schema that will be created in the data warehouse. |
| Tenant Id| The CTID is appended to the end of the tenant URL, you can [find the CTID in the Fabric portal](https://learn.microsoft.com/fabric/admin/find-fabric-home-region) by opening the About Microsoft Fabric dialog window. It's available from the Help & Support (?) menu, which is located at the top-right of the Fabric portal. |
