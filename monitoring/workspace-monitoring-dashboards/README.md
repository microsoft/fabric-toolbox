# Fabric Workspace Monitoring Report templates (preview)


![Fabric Workspace Monitoring component overview with report templates](./media/general/fwm_overview_cover.png)

Current Template Version: **2025.7.1**

## Introduction

### Workspace Monitoring (preview)
Large data solutions typically generate disparate and complicated data that can be difficult to converge into a single view. Workspace Monitoring provides a seamless, consistent experience with end-to-end visibility across Fabric workloads. Fabric Workspace Monitoring enables users to correlate events from origination to subsequent operations and queries across Fabric experiences and services.

Workspace Monitoring is a built-in solution that enables users to:

- drive root-cause analysis
- analyze historical logs
- detect anomalies


When Workspace Monitoring is enabled at the workspace level, the workspace will start sending the selected diagnostics to a KQL database within Fabric that can be queried using KQL or SQL.

----------- 

### Report templates (preview)
**for Workspace Monitoring**

This module of the Fabric toolbox provides a set of pre-built reports (Real-Time Dashboard and Power BI Report) on top of the Fabric Workspace Monitoring feature to be able to easily monitor your workspace from day one.

There are two monitoring template options available:

| Real-Time Dashboard | Power BI Report|
| ------ | ------ |
| This template allows users to track workspace activities in real-time. It provides an operational tool for users to analyze issues within seconds, and zoom in to exact time periods that an event occured. | This template allows users to configure connections to the Monitoring Eventhouse to retain detailed historical activity data. |
|[How to deploy **RTI Dashboard**](./how-to/How_to_deploy_Workspace_Monitoring_RTI_Dashboard.md)| [How to deploy **PBI Report**](./how-to/How_to_deploy_Workspace_Monitoring_PBI_Report.md)  |
|[Documentation to **RTI Dashboard**](./documentation/Workspace_Monitoring_RTI_Dashboard.md) | [Documentation to **PBI Report**](./documentation/Workspace_Monitoring_PBI_Report.md) |


### It is real. In Real-Time Dashboard

This template, in combination with Workspace Monitoring features, allows users to track workspace activities in real-time. It connects directly to the underlying monitoring Eventhouse KQL database, providing an overview of items, operations, and users. Users can also compare DAX improvements between semantic models. Users can deep dive an analyze the Query and Ingestion patterns of Eventhouses. 


The Real-Time Dashboard template is structured on the following way:

![Workspace Monitoring Real Time Dashboard template structure](./media/general/fwm_rtid_template_0_structure.png)


### Log Insights in Power BI Report

The Power BI allows users to configure connections to Monitoring Eventhouse where they can retain detailed historical activity data. This repo hosts **Power BI report** templates (.pbit) that you can point to your Monitoring Eventhouse databases to load data and get insights.

We have ported and enhanced the 'Fabric Log Analytics for Analysis Service Engine report template', which retrieved the data with the BYOLA approach.

Now, you can seamlessy connect and track your workspace items, operations, visuals etc. without leaving the SaaS experience from Microsoft Fabric.

The Power BI Report template is structured on the following way:
![Workspace Monitoring Power BI Dashboard template structure](./media/general/fwm_pbi_template_0_structure.png)


### Migrate from BYOLA
We recommend to use the Power BI report template for the new Workspace Monitoring feature in Microsoft Fabric, whenever you are migrating your workspace monitoring solution from (BYOLA) Log Analytics Workspace monitoring.

------------------------

## Considerations and limitations

**Power BI report template**
- **Eventhouse Query Limits**
    - If the template refresh fails due to the data volume, you can filter the data by configuring the Fabric Item Id parameter.



------------------------

## Remarks

**Capacity utilization:**
Please note that the **report templates** and the items of the  Workspace Monitoring **are utilizing CU of your capacity.**
The Workspace Monitoring feature is not charged during public preview.

**CPU & Memory metrics in Monitoring Eventhouse and templates:**
Please note that the CPU and Memory related metrics are **not aggregated, smoothed or bursted, like the operations in the Microsoft Fabric Capacity Metrics App**. A one-to-one comparison is for different reasons not possible. Billable capacity utilization and storage information are shown in the Microsoft Fabric Capacity Metrics App. https://learn.microsoft.com/en-us/fabric/enterprise/metrics-app

Please test the solution on a non-production Fabric SKU first without impacting other workloads on your tenant.

------------------------

## Support
These templates (Real-Time Dashboard template and Power BI template) **are not official Microsoft services**. 


**Ideas/Suggestions:**
Submit your ideas and suggestions as an issue in this repository.


**Bug Reports:** 
We maintain a backlog in the project issues page. Let us know if you run into any problems or share your suggestions by adding an entry into the issues section.

**Important**
Please, **do not** open a support ticket in case of an issue regarding the templates.
In case of any questions, issues regarding the templates, please **create an issue in this repository.**

For more information, please visit the main page of this repository or the learn.microsoft.com website.

------------------------
## Trademarks
This project may contain trademarks or logos for projects, products, or services. Authorized use of Microsoft trademarks or logos is subject to and must follow Microsoft's Trademark & Brand Guidelines. Use of Microsoft trademarks or logos in modified versions of this project must not cause confusion or imply Microsoft sponsorship. Any use of third-party trademarks or logos are subject to those third-party's policies.
