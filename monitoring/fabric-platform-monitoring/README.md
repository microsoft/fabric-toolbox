> [!CAUTION]
> This solution accelerator is not an official Microsoft product! It is a solution accelerator, which can help you implement a monitoring solution within Fabric. As such there is no official support available and there is a risk that things might break.

# Introduction 

Platform administrators face the challenge of observing the activities within the entire platform. There are multiple sources that provide information, such as capacity events, gateway logs, audit logs, and the platform inventory itself. Additionally, there is a need to obtain this data quickly to observe and react to events automatically.

To address this, a solution has been developed based on Fabric Real-Time Intelligence (RTI). This solution extracts information from sources like the new capacity events available in the Real Time Hub (RTH), audit logs through the API, gateway logs via a script included in the solution, and the inventory of the whole platform through the API.

The following architecture illustrates how the solution interacts with different components to receive, process, store, present dashboards, and react to the platform's information. It also enables longer retention of logs for historical purposes and allows comparison of the current state with previous states to create custom solutions.

![image](/monitoring/fabric-platform-monitoring/Images/01_PlatformObservabilityArchitecture.png)

This solution uses Microsoft Fabric to address these issues by providing: 

- In-App Configurations
- Real-Time Dashboard
- PowerShell Setup Configurations for the Gateway Events
- Power BI Report for the Gateway Information

Benefits include faster incident response, improved health analytics, and streamlined operations, consequently enhancing overall efficiency and reducing downtime. 

The solution is divided in several modules that can be used independently or together.

# Modules included with the Fabric Platform Monitoring 

- Capacity Utilization
   - Uses the Capacity Events to get the information of the capacity in real-time.
- Gateway Monitoring
   - To receive the information of the Gateway in real-time. It requires a PowerShell script deployed in the Gateway Machine. Only works with On-Premise Data Gateway and not with VNET Gateways.
- Activity Events
   - Extract and store as fast as possible the Activity Events of the platform, using Eventhouse for handling semi-structure data. You could extract the logs with a frequency as low as 2 minutes.
- Inventory
   - Extract the information of the tenant, keeping a semi-structure format for some details like specific item details that could be added or change over time.

> [!CAUTION]
> At the moment the Capacity Events are in Public Preview. Any change to this event source will be reflected in the solution over time. Please update your solution if the Capacity Events source is updated.

# List of items used

The following Fabric items are deployed and used:
- Eventstreams:
   - CapacityUtilizationEvents
      - For the RTH Capacity Events
   - GatewayMonitoringHeartbeat
      - To receive the gateway heartbeat
   - GatewayMonitoringReports
      - To receive the gateway reports
- Eventhouse:
   - Fabric Platform Monitoring
      - To process, store and query all the information ingested. It divides the information by module, creating a KQL DB for each of the modules.
- Notebooks:
   - Monitoring Audit Logs
      - Extract the Audit logs from the API and ingest them incrementally in the Eventhouse.
      - Configured to run every 5 min.
   - Monitoring Extraction Refreshables:
      - Extract the refreshables from all the capacities and stores the last refresh incrementally.
      - Configured to run every 5 min.
   - Monitoring Extraction Scanner:
      - Extract the full inventory with the Scanner API.
      - Creates the snapshot and loads incrementally.
      - Configured to run every 120 min.
   - Monitoring Extraction Inventory:
      - Extracts the following information at tenant level:
         - Capacities
         - Apps
         - Domains
         - Tenant Settings
         - Workspace Delegated Settings
         - Capacity Delegated Settings
         - Domain Delegated Settings
         - Gateways and Members
         - Gateway Connections
         - Git Connections
      - Configured to run every 30 min.
- Pipelines:
   -For each of the notebooks there´s a Pipeline for the execution and tracking of the Notebooks. Configure the scheduling of the activities withing the Pipelines according to the recommended times


The Notebooks uses the [Semantic Link Labs](https://github.com/microsoft/semantic-link-labs) to interact with the APIs.

# Implementation guide 

## Full process overview 

To implement this solution, we have some step to follow. This steps will cover the creation of all the items in the previous architecture and the script in the Gateway Nodes. We can find the following steps needs to be done: 

- Fabric items initial setup
- Eventstream changes
- Notebook scheduling
- Real-Time Dashboard configuration
- Script deployment and setup in the gateway nodes (Optional)


## Requirements and estimated workloads 

- Service Principal - [How to Register an App in Microsoft Entra ID](https://learn.microsoft.com/entra/identity-platform/quickstart-register-app)
- An Entra ID Security Group with the Service Principal as Member
- An Azure Key Vault ([What is Azure Key Vault?](https://learn.microsoft.com/azure/key-vault/general/basic-concepts)) with the following secrets:
   - Tenant ID
   - App (Client) ID of the Service Principal
   - Secret of the Service Principal
- The user that is going to execute the scripts must have at least "Key Vault Secrets User" - [Provide access to Key Vault keys, certificates, and secrets with Azure role-based access control](https://learn.microsoft.com/azure/key-vault/general/rbac-guide?tabs=azure-cli)
- The Security Group of the service principal must have the following permissions in Fabric Tenant Settings:
   - [Service principals can use Fabric APIs](https://learn.microsoft.com/en-us/fabric/admin/tenant-settings-index#developer-settings)
   - [Service principals can access read-only admin APIs](https://learn.microsoft.com/en-us/fabric/admin/tenant-settings-index#admin-api-settings)
   - [Enhance admin APIs responses with detailed metadata](https://learn.microsoft.com/en-us/fabric/admin/tenant-settings-index#admin-api-settings)
   - [Enhance admin APIs responses with DAX and mashup expressions](https://learn.microsoft.com/en-us/fabric/admin/tenant-settings-index#admin-api-settings)
   - [Member Role over the workspace to use](https://learn.microsoft.com/en-us/fabric/fundamentals/roles-workspaces)
   - [Admin Role over the On-Premise Data Gateways to monitor](https://learn.microsoft.com/en-us/data-integration/gateway/manage-security-roles)
- Fabric Workspace with the Service Principal added to the Workspace. Add the Service Principal explicitly
- Microsoft Fabric Capacity of F8 or higher, recommended F16 (the capacity size needed will depend on the amount of logs sent and processed by the system)


## Fabric initial setup 

Create a workspace and import the [Platform Monitoring Setup Notebook](/monitoring/fabric-platform-monitoring/setup/Platform%20Monitoring%20Setup.ipynb). Follow the instructions for the first run.

> [!CAUTION]
> No change are made to any additional item in the workspace or eventhouse. But if you customize the default ones (Notebook, Policies, Tables, Functions, etc), the change could be reverted back or the update could fail.

## Script deployment and setup in the gateway nodes (Optional)

These are available scripts to retrieve and process logs from on-premises gateways. These scripts help in managing and processing logs. 

You can find the gateway scripts in the subfolder [/gateway/PowerShellScript](/monitoring/fabric-platform-monitoring/gateway/PowerShellScript)

Requirements:
- PowerShell 7+

### The setup-configuration 

First use the [Gateway Config Notebook](/monitoring/fabric-platform-monitoring/setup/Gateway%20Config.ipynb) to generate the configuration script for the PowerShell application.

Download the config.json created in the “Built-in Resources” of the notebook and create a folder "/configs/" in the scripts root folder and copy the JSON file.

![image](/monitoring/fabric-platform-monitoring/Images/02_Notebook_Builtin_Resources_Example.png)

Execute the Setup-UpdateConfiguration Script. The script will first ask you whether you still need to install the necessary PowerShell Modules needed for Lakehouse connectivity (Az.Accounts, Az.Storage, DataGateway).  

Az.Accounts is a module that manages credentials and common configuration for all Azure modules. The Az.Storage module is a PowerShell module that provides cmdlets for managing and interacting with Azure Storage resources. The Data Gateway module is responsible for managing On-premises data gateway and also Power BI data sources. 

 More information about these modules and Az PowerShell can be found here: 

- [Install Azure PowerShell on Windows | Microsoft Learn ](https://learn.microsoft.com/en-us/powershell/azure/install-azps-windows?view=azps-11.6.0&tabs=powershell&pivots=windows-psgallery)
- [Sign in to Azure PowerShell interactively | Microsoft Learn ](https://learn.microsoft.com/en-us/powershell/azure/authenticate-interactive?view=azps-12.0.0)
- [az account | Microsoft Learn ](https://learn.microsoft.com/en-us/cli/azure/account?view=azure-cli-latest)
- [az storage | Microsoft Learn ](https://learn.microsoft.com/en-us/cli/azure/storage?view=azure-cli-latest)
- [PowerShell Cmdlets for On-premises data gateway management | Microsoft Learn](https://learn.microsoft.com/en-us/powershell/gateway/overview?view=datagateway-ps)
- [Use Azure service principals with Azure PowerShell | Microsoft Learn ](https://learn.microsoft.com/en-us/powershell/azure/create-azure-service-principal-azureps?view=azps-11.6.0)

Once the modules have been set, the script will automatically retrieve the Gateway ID and set up the connections to the Eventstream and Lakehouse.

### Run-GatewayHeartbeat Script:  

The heartbeat logs contain the status of a gateway.  The script will loop and send the logs to the Eventstream to be processed in Fabric. 

### Run-UploadGatewayLogs Script  

This is the main script that does the data movement from local to the service. In case of the Report files we can send the files to the Eventstream and Lakehouse. The log files are sent to the Lakehouse.

### Get-DataGatewayInfo

It will get the Gateway Node info, we can run this once per week or even lower rate.

### Schedule the Scripts

We can use the Task Scheduler in Windows to automate the script. You will fin a template of the Task Schedulers in the folder [\TaskSchedulers](/monitoring/fabric-platform-monitoring/gateway/TaskSchedulers)


## Power BI Gateway Report (Optional)

The report is deployed automatically with the solution, and the only action needed is to setup an user in the Semantic Model to connect to the KQL DB.

You will find the following pages.

### Gateways

Description of the gateway and the indicator if the heartbeat has been received in the last minute.

<img width="1543" alt="image" src="/monitoring/fabric-platform-monitoring/Images/13%20-%20Report%20Gateway%20Information.png">

### Jobs

A summary of all jobs (Semantic Model refresh, Dataflow Gen1 refresh, Dataflow Gen2 and Paginated Reports) executed in the clusters.

You can filter by the date you want to look into, how many days you want to look back, the cluster name and the node name.

Selecting a Job in the list will allow you to do a "Drill through" to the Job Details.

<img width="1543" alt="image" src="/monitoring/fabric-platform-monitoring/Images/14%20-%20Report%20Jobs.png">

### Job Details

The details of the job, where you can find:
- Summary of the queries related to the job
- How many queries has errors, if any
- Data source kinds summary
- Number of queries by node in the cluster for the job
- Service name related to the job (Power BI Datasets (Semantic Models), Power Query Online (Dataflows Gen2), Dataflows and Paginated Reports)
- Workspace ID and Item ID (Dataflows Gen1 don´t provide this information)
- Errors per query, in which node did it happen and the details of the error
- Summary of connections kind and the path
- Query details with the full information of the query

<img width="1508" alt="image" src="/monitoring/fabric-platform-monitoring/Images/15%20-%20Report%20Job%20Details.png">


### Queries

General information of all queries that ran in the gateways

<img width="1418" alt="image" src="/monitoring/fabric-platform-monitoring/Images/16%20-%20Report%20Queries.png">

### Running Jobs

Will show only the jobs that are running in the gateways. Selecting a job and going to the details will give you the information on the job and related queries.

<img width="1412" alt="image" src="/monitoring/fabric-platform-monitoring/Images/17%20-%20Report%20Running%20Jobs.png">

### System Counters

Overview of the system counters report generated by the Gateways.

<img width="1406" alt="image" src="/monitoring/fabric-platform-monitoring/Images/18%20-%20Report%20System%20Information.png">
