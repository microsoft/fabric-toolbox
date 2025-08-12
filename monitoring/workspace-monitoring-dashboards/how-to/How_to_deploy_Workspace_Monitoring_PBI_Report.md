

### Log Insights in Power BI Report

The Power BI allows users to configure connections to Monitoring Eventhouse where they can retain detailed historical activity data. This repo hosts **Power BI report** templates (.pbit) that you can point to your Monitoring Eventhouse databases to load data and get insights.

We have ported and enhanced the 'Fabric Log Analytics for Analysis Service Engine report template', which retrieved the data with the BYOLA approach.

Now, you can seamlessy connect and track your workspace items, operations, visuals etc. without leaving the SaaS experience from Microsoft Fabric.

The Power BI Report template is structured on the following way:
![Workspace Monitoring Power BI Dashboard template structure](./media/general/fwm_pbi_template_0_structure.png)


### Migrate from BYOLA
We recommend to use the Power BI report template for the new Workspace Monitoring feature in Microsoft Fabric, whenever you are migrating your workspace monitoring solution from (BYOLA) Log Analytics Workspace monitoring.


# Setup | Power BI template for Fabric Workspace Monitoring


## Steps

### Parameters

The following parameters are defined in the template:

|**Parameter**  |**Description**  |
|---------|---------|
| **Query URI** * | Globally unique identifier uri of the Eventhouse Monitoring database containing the Semantic model logs. |
| **Days Ago To Start** * | Load data from the specified day to the time the call was initiated. The maximum value you can select is 30 days. However, your Premium capacity/Fabric SKU memory limits apply to this parameter. If those limits are exceeded, the template might fail to refresh. |
| **Days Ago To Finish** * | Load data up to the specified number of days ago. Use 0 for today. |
| **UTC Offset Hours** * | An hourly offset used to convert the data from Coordinate Universal Time (UTC) to a local time zone. |
| **Fabric Item Id**  | Optionally enter a fabric artifact (semantic model) Id. |
| **RangeStart** | Optionally enter the start date for incremental refreshes |
| **RangeEnd** | Optionally enter the end date for incremental refreshes |

--------------

### Deployment

1. Download the '**Fabric Workspace Monitoring.pbit**' file from the repository
2. **Open** the report in Power BI Desktop
3. **Paste** the **URI** of the Monitoring Database to the first parameter
![Screenshot](/media/deployment/pbi/fwm_pbi_template_1_getting_queryuri.png)
4. **Sign-in** with your Microsoft Account
5. Click on '**Load**'
6. **Save** the report (for instance as a '.pbix' file)
7. **Publish** the report in a preferred workspace
8. **Navigate** to the settings of the semantic model
9. **Edit** the credentials of the data source in Fabric
10. Trigger the first initial refresh in Fabric
    - Optionally - Schedule the semantic model refresh, if preferred
11. Once the refresh has been succedeed, open the report

**Optimize Power BI refreshes for the template**
Additionally, you can optimize the Power BI report template usage, you can configure the incremental refresh for each table.