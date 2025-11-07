

# Setup | Power BI template 
**for Fabric Workspace Monitoring**

### General

The Power BI allows users to configure connections to Monitoring Eventhouse where they can retain detailed historical activity data. This repo hosts **Power BI report** templates (.pbit) that you can point to your Monitoring Eventhouse databases to load data and get insights.

![Workspace Monitoring Real Time Dashboard template structure](/monitoring/workspace-monitoring-dashboards/media/documentation/pbi/fwm_pbi_template_structure.png)

-----

### Parameters

The following parameters are defined in the template:

|**Parameter**  |**Description**  |
|---------|---------|
| **Query URI** * | Globally unique identifier uri of the Eventhouse Monitoring database containing the Semantic model logs. |
| **Eventhouse Name** * | Default value: **Monitoring Eventhouse** | 

--------------

# Deployment Steps

1. Download the [Fabric Workspace Monitoring Report.pbit](/monitoring/workspace-monitoring-dashboards/Fabric%20Workspace%20Monitoring%20Report.pbit) file from the repository
2. **Open** the report in Power BI Desktop
3. **Paste** the **URI** of the Monitoring Database to the **Query URI** parameter
![Screenshot](/monitoring/workspace-monitoring-dashboards/media/deployment/pbi/fwm_pbi_template_1_getting_queryuri.png)
4. **Paste** the value `Monitoring Eventhouse` to the **Eventhouse Name** parameter 
5. **Sign-in** with your Microsoft Account
6. Click on '**Load**'
7. **Save** the report (for instance as a '.pbix' file)
8. **Publish** the report in a preferred workspace
9. **Navigate** to the settings of the semantic model
10. **Edit** the credentials of the data source in Fabric
11. Trigger the first initial refresh in Fabric
    - **Important:** Schedule the semantic model refresh, on daily basis. _The calendar table has to be refreshed every day._
12. Once the refresh has been succedeed, open the report

**Congratulations!** You are ready to go!

----------------

## Other helpful resources

##### Workspace Monitoring Templates
- [Documentation - Real-Time Dashboard template for Workspace Monitoring](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_RTI_Dashboard.md)
- [Documentation - Power BI template for Workspace Monitoring](/monitoring/workspace-monitoring-dashboards/documentation/Workspace_Monitoring_PBI_Report.md)

##### Microsoft Fabric features
- [Workspace monitoring overview](https://learn.microsoft.com/en-us/fabric/fundamentals/workspace-monitoring-overview)
- [Enable workspace monitoring](https://learn.microsoft.com/en-us/fabric/fundamentals/enable-workspace-monitoring)


##### Other Fabric Toolbox assets
- [Overview - FUAM solution accelerator for tenant level monitoring](/monitoring/fabric-unified-admin-monitoring/README.md)
- [Overview - Semantic Model Audit tool](/tools/SemanticModelAudit/README.md)


----------------