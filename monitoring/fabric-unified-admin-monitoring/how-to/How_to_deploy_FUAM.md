# FUAM Deployment

The deployment of FUAM can be done with very little effort, since we tried to automize as much as possible. FUAM will be deployed on your tenant in a workspace.


![FUAM deployment process overview](/monitoring/fabric-unified-admin-monitoring/media/deployment/deploy_fuam_process_cover.png)


## Important to know
- Capacity utilization: Please note that the items of FUAM are utilizing CUs of your capacity.

- Please test the solution on a non-production Fabric SKU first without impacting other workloads on your tenant.

- FUAM has been designed to have a minimum CU footprint on your capacity, however the CU consumption of FUAM is highly dependent, how often you run the pipeline and how many users are exploring the FUAM report. 

## Prerequisites
- A user account with permanent **Fabric Administrator** Entra rights
- Ability to **create** a **Service Principal** on your tenant
- Ability to **create** a **Workspace** on your tenant
- A Power BI or Fabric capacity
- Enabled admin setting '**Users can create Fabric items**' for FUAM workspace admin(s)
- **Recommended:** Fabric Capacity Metrics app (workspace) with attached P or F-capacity
- **Optional:** Ability to access an Azure Key Vault on your tenant


# Steps

## 1. Download Notebook

- Download the [Deploy_FUAM.ipynb](/monitoring/fabric-unified-admin-monitoring/scripts/Deploy_FUAM.ipynb) notebook from src folder locally to you computer.

## 2. Prepare your environment

### 2.1 Create and authorize Service Principal

- Create a new service principal with client secret within Azure Entra ID, without any API permissions. 

> **Info:** Enabling some of the Power BI API permissions might cause errors when executing pipelines later on.


- Add the service principal to a group enabled for the following two admin settings:
  - Service Principals can use Fabric APIs
  - Service Principals can access read-only admin APIs

### 2.2 Create a Workspace

- Create a new workspace "FUAM" (name can be changed), which is backed by a P or F-capacity
- (**Optional**) Download the [Workspace logo](/monitoring/fabric-unified-admin-monitoring/media/deployment/icon_FUAM_workspace.png) 
- (**Optional**) Add the logo to FUAM workspace

## 3. Import and Run Notebook

- Import the recently downloaded **Deploy_FUAM.ipynb** Notebook into your FUAM workspace

    ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_3_1.png)

- Click "Run All" in the Notebook

    ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_3_2.png)

> **Info:** The notebook will **automatically create** two new cloud connections (without credentials). You can also choose your own names in case you have any naming conventions:

| | Connection 1  | Connection 2 |
|-------------| ------------- | ------------- |
|Connection Name| fuam pbi-service-api admin  | fuam fabric-service-api admin  |
|Connection Type| Web v2  | Web v2  |
|Base Url| https://api.powerbi.com/v1.0/myorg/admin  | https://api.fabric.microsoft.com/v1/admin  |
|Token Audience Url| https://analysis.windows.net/powerbi/api| https://api.fabric.microsoft.com|
|Authentification|Service Principal| Service Principal|

> **Error handling:** In case of an error, you'll be able to run the notebook again. It has an update mechanism, which will act as an item update.

## 4. Add credentials to connections

- Navigate under Settings to 'Manage connections and gateways' in Fabric
- Set the credentials of the connections with the recently created service principal information:

     ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_4_1.png)

> **Info:** These connections are used in FUAM pipelines to retrieve data from REST APIs. If the credentials are incorrect or the secret has expired, the pipeline will fail.


## 5. Configure Capacity Metrics App

We recommend to create a new Capacity Metrics App -> workspace in your tenant
- Create a new Capacity Metrics App
- Configure the App like always
- Navigate to the Capacity Metrics App's Workspace
- Attach this workspace to a P or F capacity
- Change the name to 'FUAM Capacity Metrics'
- Copy the Name of the workspace: e.g. 'FUAM Capacity Metrics' and the name of the semantic model e.g. 'Fabric Capacity Metrics'.

The Capacity metrics workspace name will be set later as a value of the **metrics_workspace** parameter in the 'Load_FUAM_Data_E2E' Pipeline.

The capacity metrics semantic model name will be set lates as a value of the **metrics_dataset** parameter in the 'Load_FUAM_Data_E2E' Pipeline.

> **Important:**  By default the Metrics App workspace is created on a Pro license. If you don't change this to F/P-SKU you will get an error

## 6. Run orchestration Pipeline

> **Info:** The **Load_FUAM_Data_E2E** is the main end-to-end orchestration pipeline of FUAM. It contains/triggers all other sub-pipelines (FUAM modules), which are implemented in the solution. The sub-pipelines download all the required data via APIs and the referenced Notebooks will transform/write the data to the final FUAM_Lakehouse delta tables.

- Navigate to your FUAM Workspace
- Search for the item 'Load_FUAM_Data_E2E'
- Open the **Load_FUAM_Data_E2E** pipeline


The Pipeline has different parameters, which are controlling the data load flow:

|       Parameter Name         | Description                        |Allowed values                        |
|----------------|-------------------------------|-----------------------------|
|has_tenant_domains|If **true**, the tenant inventory is enriched with domain information. Use it only, if domains are in use at your tenant. **Default is false**        | true or false            |
|extract_powerbi_artifacts_only|If **true**, the tenant inventory contains **only** semantic models, dataflows, datamarts, reports, dashboard and apps. If **false** the pipeline extracts Power BI **and** Fabric items. Currently, first-party workloads are supported only. **Default is false** | true or false |
|metric_days_in_scope|Defines how many days should be extracted from the capacity metrics app. A maximum of 14 days can be extracted. For an initial load you can set it to the maximum and in subsequent runs reduce it to 2 days|range between **1** and **14**|
|metric_workspace|This is the name of the workspace where the capacity metrics app was deployed|string|
|metric_dataset|This is the name of the semantic model of the capacity metrics app |string|
|activity_days_in_scope|It defines how many days in the past the activity must be retrieved from the API. Recommended to **use 30 for the initial load** and change the value to **2 for daily load**.| range between **1** and **30** |
|display_data|If **true**, the notebooks will display more information about each relevant step at runtime. This is useful for debugging. **Default is false**| true or false |
|optional_keyvault_name|**Optional**: If you have configured a key vault, enter the name of the key vault. Otherwise, simply leave this field blank. In this case, the Load_Inventory module will use the Notebook owner's identity.| empty or string|
|optional_keyvault_sp_ tenantId_secret_name|**Optional**: If you have configured a key vault and its secretes, enter the name of the tenantId secret name. Otherwise, simply leave this field blank. In this case, the Load_Inventory module will use the Notebook owner's identity.|empty or string|
|optional_keyvault_sp_ clientId_secret_name|**Optional**: If you have configured a key vault and its secretes, enter the name of the clientId secret name. Otherwise, simply leave this field blank. In this case, the Load_Inventory module will use the Notebook owner's identity.|empty or string|
|optional_keyvault_sp_ secret_secret_name|**Optional**: If you have configured a key vault and its secretes, enter the name of the service principal's secret secret name. Otherwise, simply leave this field blank. In this case, the Load_Inventory module will use the Notebook owner's identity.|empty or string|


- Run the Pipeline once. This will initially load the data into FUAM_Lakehouse

    ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_5_1.png)

> **Error handling:**

> Make sure that you are signed-in with a User, which has 'Fabric Administrator' rights on the tenant

> Make sure that the SP has granted access for the two tenant settings: 'Service Principals can use Fabric APIs' and 'Service Principals can access read-only admin APIs'

> Review the credentials of the connections

> Set the 'activity_days_in_scope' to 28, whenever the 'Load_Activities' pipeline got an error

> Or check the 'Remark' section.



## 7. Prepare the FUAM Reports

### 7.1 Refresh Core_SM semantic model
- Navigate to your FUAM Workspace
- Search for the item '**FUAM_Core_SM**'
- Click on 'Refresh' semantic model

### 7.1 Refresh Item_SM semantic model
- Navigate to your FUAM Workspace
- Search for the item '**FUAM_Item_SM**'
- Click on 'Refresh' semantic model


### 7.3 Open PBI report
- Navigate to your FUAM Workspace
- Search for the item 'FUAM_Core_Report'
- Open the **FUAM_Core_Report** Power BI report
- Feel free to explore the report pages
   ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_7_3.png)


> **Error handling:** In case of errors like 'Visual can't be rendered', please check the 'Remark' section.

## 8. Schedule Pipeline for daily load

- Navigate to your FUAM Workspace
- Search for the item 'Load_FUAM_Data_E2E'
- Open the **Load_FUAM_Data_E2E** pipeline
- (Recommended) Change the **metrics_days_in_scope** parameter value to **2**
- (Recommended) Change the **activity_days_in_scope** parameter value to **2**
- Click on **Run** -> **Schedule**
- Configure the schedule
   ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_8_1.png)

With that you have configured the main orchestration pipeline, which will be executed every day. The new parameter values act like an 'incremental' load. The capacity metrics and activity logs will be fetched only for the last two days and populated in the Lakehouse table.

---------------

## Congratulations! 
You have deployed and configured FUAM.

---------------

# Remarks

#### Limitations
- There is a maximum of 500 requests a 100 workspaces possible through the scanner API (learn.microsoft.com). If you have more than 50.000 workspaces in your organisation, which are attached to capacities, the pipeline must wait one hour for the next Scanner API call. This might lead to a longer Pipeline run.

- There can be errors in case specific item types have not been created on the tenant, yet. We tried to reduce these kind of errors, by catching this kind of errors, but on relatively empty tenants this could still effect the execution

- The pipeline 'Load_Inventory_E2E' is using the notebook owner's identity to query the Scanner API. In case the user doesn't have 'Fabric Administrator' permissions, the notebook will fail. Use Azure Key Vault to run the Scanner API calls in Service Principal context.

- In some cases the reports throw an error because of missing fields (in the semantic model), which have not been provided by the API. In this case please execute the following steps:

    - Try to refresh the underlying semantic model
    - Open the semantic model
    - Click on "Edit tables"
    - Press "Confirm" to refresh semantic model meta data
    - Test semantic model refresh & report


#### Known errors
- There are some known issues on "empty" or demo tenants, where some objects do not exist, which causes errors:
    - If there is no workspace description on the whole tenant. In this case just add one workspace description. This will fix the error
    - In case there are no regular scheduled refreshes on the tenant, the execution for capacity refreshables can fail. This should be resolved by creating a scheduled refresh and running it multiple times
    - In case the are no delegated tenant settings set in one of the capacities, the extraction step will fail. You can remove this step if it is not needed in your tenant

# Other helpful resources
- [Watch 'Introduction to FUAM Basic'](https://www.youtube.com/watch?v=Ai71Xzr_2Ds)
