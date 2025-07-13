
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