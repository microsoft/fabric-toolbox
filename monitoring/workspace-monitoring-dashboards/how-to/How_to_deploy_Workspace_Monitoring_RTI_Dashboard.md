

# Setup | Real-Time Dashboard template
**for Fabric Workspace Monitoring**

### General

This template, in combination with Workspace Monitoring features, allows users to track workspace activities in real-time. It connects directly to the underlying monitoring Eventhouse KQL database, providing an overview of items, operations, and users. Users can also compare DAX improvements between semantic models. Users can deep dive an analyze the Query and Ingestion patterns of Eventhouses. 


The Real-Time Dashboard template is structured on the following way:

![Workspace Monitoring Real Time Dashboard template structure](/monitoring/workspace-monitoring-dashboards/media/documentation/rti/fwm_rti_template_structure.png)

-----

# Deployment Steps

### Preparation
- Download the [Fabric Workspace Monitoring Dashboard.json](/monitoring/workspace-monitoring-dashboards/Fabric%20Workspace%20Monitoring%20Dashboard.json) template file from the repository
- Navigate to your workpace

#### Main steps
1. Click on '**New item**'
2. Create a new '**Real-Time Dashboard**' item
3. Provide a dashboard name 
4. Click on '**Create**'
4. Navigate to the Dashboard and select the '**Manage**' tab
6. Click on '**Replace from file**'
7. Select the downloaded '**Fabric Workspace Monitoring Dashboard.json**' template

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/deployment/rti/fwm_rtid_template_1_getting_started_1.png)

8. Click on '**Data sources**'
9. Click on '**Add**' on the side bar
10. Select the **Eventhouse / KQL Database**
    - Select the preferred Monitoring KQL database from OneLake catalog
11. Click on '**Connect**'

![Screenshot](/monitoring/workspace-monitoring-dashboards/media/deployment/rti/fwm_rtid_template_1_getting_started_2.png)

12. Provide a data source name
13. The data source shall be connected to several tiles, parameters and base queries
14. Select the initial value of the **Workspace** parameter on the menu bar
    - Optionally: Set Default value for Workspace parameter
        - Navigate to '**Parameters**' on the '**Manage**' tab
        - Click on '**Edit**' at the '**Workspace**' parameter
        - Select a '**Default value**'
15. '**Save**' the Dashboard
16. '**Refresh**' the Dashboard
    
17. Switch the UI experience to '**Viewing**' mode
![Screenshot](/monitoring/workspace-monitoring-dashboards/media/deployment/rti/fwm_rtid_template_1_getting_started_3.png)

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