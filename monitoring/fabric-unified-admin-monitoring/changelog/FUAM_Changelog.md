# FUAM Release notes
for Fabric Unified Admin Monitoring solution accelerator.

--------------------------

## 📦 2025.9.1

Date: 2025-08-25


### 📈 Enhancements

- **Report updates**:
    - Updated report pages, design, logic of the
        - `FUAM_Gateway_Monitoring_Report_From_Files`
        - `FUAM_SQL_Endpoint_Analyzer_Report`
        - `FUAM_Semantic_Model_Meta_Data_Analyzer_Report`
    - Small updates on report pages of the `FUAM_Item_Analyzer_Report`

### 🛠 Fixes


- **Notebook updates**:
    - Fixed the notebook logic of the IsCurrentMonth column (FUAM_Lakehouse.calendar.IsCurrentMonth) within the `Generate_Calendar_Table` notebook
    - Updated notebooks to support the latest version (v44) of Capacity Metrics


Best Regards!
Kevin & Gellért

--------------------------

## 📦 2025.7.2

Date: 2025-07-22

### Important:
We've updated the "Deploy_FUAM" notebook logic in Release 2025.7.1. 
**Please download the latest version of the notebook, before you update FUAM in your environment.**

### How to Update?
Follow the [documented steps](https://github.com/microsoft/fabric-toolbox/blob/main/monitoring/fabric-unified-admin-monitoring/how-to/How_to_update_FUAM.md).


### 🛠 Fixes

- **Notebook update**: 
    - An issue has been updated in notebook `01_Transfer_CapacityMetricData_Timepoints_Unit` 
    - This fix addresses the following reported issue [#183](https://github.com/microsoft/fabric-toolbox/issues/183) by @alexisjensennz
    - In case you already executed the main pipeline to fetch data with version 2025.7.1, please make sure you change the parameter of metrics_days_in_scope to a higher value in order to make sure the wrong data gets overwritten

--------------------------

## 📦 2025.4.2

- Improved FUAM_Item_Analyzer_Report and underlying semantic model
- Enhanced table schema for 'aggregated_activities_last_30days' table in   '03_Aggregate_Activities_Unit' notebook
    - With that change the aggregated activity table schema is mature enough to keep this schema for the future.
- Fixed [Issue 81](https://github.com/microsoft/fabric-toolbox/issues/81) by eliminating unneeded relationship cross-filter directions
- Fixed [Issue 85](https://github.com/microsoft/fabric-toolbox/issues/85) by improving 'Capacity Compute' report page
- Fixed [Issue 88](https://github.com/microsoft/fabric-toolbox/issues/88) by adding Workspace Type filter to all report pages in the FUAM_Core_Report


--------------------------

## 📦 2025.4.1

Initial Release of FUAM solution accelerator and Announcement at FabCon 2025 Las Vegas