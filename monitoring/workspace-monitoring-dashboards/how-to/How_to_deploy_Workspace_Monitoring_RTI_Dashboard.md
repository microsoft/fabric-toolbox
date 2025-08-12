


### It is real. In Real-Time Dashboard

This template, in combination with Workspace Monitoring features, allows users to track workspace activities in real-time. It connects directly to the underlying monitoring Eventhouse KQL database, providing an overview of items, operations, and users. Users can also compare DAX improvements between semantic models. Users can deep dive an analyze the Query and Ingestion patterns of Eventhouses. 


The Real-Time Dashboard template is structured on the following way:

![Workspace Monitoring Real Time Dashboard template structure](./media/general/fwm_rtid_template_0_structure.png)



# Setup | Real-Time Dashboard template for Fabric Workspace Monitoring

## Steps

### Preparation
- Download the '**Fabric Workspace Monitoring Dashboard.json**' template file from the repository
- Navigate to your workpace

#### Main steps
1. Click on '**New item**'
2. Create a new '**Real-Time Dashboard**' item
3. Provide a dashboard name 
4. Click on '**Create**'
4. Navigate to the Dashboard and select the '**Manage**' tab
6. Click on '**Replace from file**'
7. Select the downloaded '**Fabric Workspace Monitoring Dashboard.json**' template

![Screenshot](/media/deployment/rti/fwm_rtid_template_1_getting_started_1.png)

8. Click on '**Data sources**'
9. Click on '**Add**' on the side bar
10. Select the **OneLake data hub**
11. Select the preferred Monitoring KQL database from OneLake catalog
12. Click on '**Connect**'

![Screenshot](/media/deployment/rti/fwm_rtid_template_1_getting_started_2.png)

13. Provide a data source name
14. The data source shall be connected to several tiles, parameters and base queries
15. Select the initial value of the **Workspace** parameter on the menu bar
    - Optionally: Set Default value for Workspace parameter
        - Navigate to '**Parameters**' on the '**Manage**' tab
        - Click on '**Edit**' at the '**Workspace**' parameter
        - Select a '**Default value**'
16. '**Save**' the Dashboard
17. '**Refresh**' the Dashboard
    
18. Switch the UI experience to '**Viewing**' mode
![Screenshot](/media/deployment/rti/fwm_rtid_template_1_getting_started_3.png)

Congratulations! You are ready to go!
![Screenshot](/media/deployment/rti/fwm_rtid_template_1_getting_started_4.png)
