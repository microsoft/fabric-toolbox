# FabricRTI_Accelerator
## Introduction
Real-Time Intelligence is a powerful service in Microsoft Fabric that empowers everyone in your organization to extract insights and visualize their streaming and high granularity data in real time. It offers an end-to-end solution for event-driven scenarios, streaming data, and data logs. Whether dealing with gigabytes or petabytes, all organizational data in motion converges in the Real-Time Hub. It seamlessly connects time-based data from various sources using no-code connectors, enabling immediate visual insights, geospatial analysis, and trigger-based reactions that are all part of an organization-wide data catalog.
Once you seamlessly connect any stream of data, the entire SaaS solution becomes accessible. Real-Time Intelligence handles data ingestion, transformation, storage, analytics, visualization, tracking, AI, and real-time actions. Your data remains protected, governed, and integrated across your organization, seamlessly aligning with all Fabric offerings. Real-Time Intelligence transforms your data into a dynamic, actionable resource that drives value across the entire organization.

[Read more](https://learn.microsoft.com/en-us/fabric/real-time-intelligence/overview)
## Overview
This project aims to provide easy, Low code and automated way of deploying Real-Time intelligence workload and its entities in Microsoft Fabric. This removes the hassle of manually creating each item and entities when you want to move from one environment or workspace to another. Users can run the PowerShell script along with required parameters to provision automatically - 
* Eventhouse, KQL Database and it's entities like Tables, Functions and Materialized Views.
* Eventstream with definition of source, processing and destination.

[Full List of Fabric APIs](https://learn.microsoft.com/en-us/rest/api/fabric/articles/)

Currently Eventhouse and Eventstream accelerators are added in this project. Look out for accelerators for Activator as soon as the APIs are available. 
Jump to the relavent section by using the links below
* [Eventhouse](https://github.com/SuryaTejJosyula/FabricRTI_Accelerator#eventhouse)
* [Eventstream](https://github.com/SuryaTejJosyula/FabricRTI_Accelerator#eventstream)

# Eventhouse

[Eventhouse and KQL DB APIs Blog](https://blog.fabric.microsoft.com/en-us/blog/using-apis-with-fabric-real-time-analytics/)
## Instructions
To create Eventhouse and its entities, run the PowerShell script with following parameters

|Parameter|Mandatory?|Description|
|--------|--------|----------|
|tenantId|Yes|Tenant ID of your Fabric tenant|
|workspaceId|	Yes	|Workspace ID where you want to create Eventhouse|
|eventhouseName |	Yes|	Display name of your Eventhouse|
|kqlDBName |	No|	Name of your KQL DB. If not provided, default KQL DB in Eventhouse will be used|
|dbScriptName |	No|	Database script with creation script of all entities|

* Make sure you have Azure modules installed in Powershell.
 ```
	Install-Module Az 
```
* Make sure you have the database script in the same folder as the Powershell script. A test database script is provided here - TestPS_KQL.csl . This script creates a simple table testPS3 and a function GetNames()._
* The script will open an interactive login window and then ask for a selection of tenant and subscription (Yes! You must select subscription although you are working with Fabric). You can set any default subscription for subsequent runs 
```
Update-AzConfig -DefaultSubscriptionForLogin "My_Subscription_Name" 
```
* Run the script
```
.\createEventhouse.ps1 -tenantId 'xxxxxx-yyyy-aaaa-bbbb-aaaaaaaaa'  -workspaceId 'xxxxx-yyyy-yyyy-aaaa-aaaaaaaaaaaa' -eventhouseName 'Eventhouse_001' -kqlDBName 'KQLDB_001' -dbScriptName 'CreateDB_script.csl' 
```

* Example of Eventhouse, KQL Database, table and a function created using this Powershell script
  
  ![Eventhouse](../media/Created_Entities.png)
