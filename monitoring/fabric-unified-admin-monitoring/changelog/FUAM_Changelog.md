
# 📦 Changelog – FUAM Release 2025.7.1


## Important:
We've updated the "Deploy_FUAM" notebook logic. 
**Please download the latest version of the notebook, before you update FUAM in your environment.**

### How to Update?
Follow the [documented steps](https://github.com/microsoft/fabric-toolbox/blob/main/monitoring/fabric-unified-admin-monitoring/how-to/How_to_update_FUAM.md).

---

## 🚀 New Features

- **FUAM Version Check Logic**
  - Users of `FUAM_Core_Report` can now verify if a newer FUAM version is available.
    - **Label: "FUAM is up-to-date"** – No updates found in the Fabric Toolbox repository compared to the installed version.
    - **Label: "Update is available"** – A newer version is available in the Fabric Toolbox.

- **New Table in FUAM_Lakehouse: `item_users`**
  - Extracted from the inventory module.
  - Addresses the following reported issue [#117](https://github.com/microsoft/fabric-toolbox/issues/117) by @masterpikx 
  - ℹ️ *Note: This table is not yet integrated into the report.*

- **New Notebook "01_Create_Snapshot_Tables_Unit.Notebook" to create snapshots**
    - This notebook creates daily snapshots of the following tables:
        - active_items
        - workspaces
        - capacities
        - workspaces_scanned_users
    - Important: the notebook is currently not triggered from the main pipeline
    - You can run or schedule it based on your demands

---

## 🛠 Fixes

- **Optimized `Load_FUAM_Data_E2E` Pipeline Logic**
  - Addresses the following reported issues:
    - [#94](https://github.com/microsoft/fabric-toolbox/issues/94) by @salilcbi  
    - [#117](https://github.com/microsoft/fabric-toolbox/issues/117) by @RaviAmara-Eaton  
    - [#166](https://github.com/microsoft/fabric-toolbox/issues/166) by @tlanza89  

- **Improved Data Transformation for Active Items**
  - Deduplication of unexpected `ItemIds` (e.g., `0000-000-xxx`).
  - Related to [#132](https://github.com/microsoft/fabric-toolbox/issues/132) by @fdnavarropecci


- **Improved Data Transformation for Capacity Refreshables**
  - Handling data structure when API doesn't contain additional refresh metrics

---

## ✨ Enhancements

- **Harmonized Parameters in `Load_FUAM_Data_E2E` Pipeline**
  - Unified logic for `metric_days_in_scope` and `activity_days_in_scope`.
  - Example: A value of `2` loads data for the two full previous days and today.
  - Recommended setting: `2` for daily pipeline execution.

- **Notebook Updates**  
    - Now, the Capacity Metrics App version 37 is also compatible with FUAM
  - Based on [#173](https://github.com/microsoft/fabric-toolbox/issues/173) by @modamin, the logic has been updated:
    - `01_Transfer_CapacityMetricData_Timepoints_Unit`  
    - `02_Transfer_CapacityMetricData_ItemKind_Unit`  
    - `03_Transfer_CapacityMetricData_ItemOperation_Unit`  

- **Session Tags Applied to FUAM Notebooks**
  - Implemented based on [#121](https://github.com/microsoft/fabric-toolbox/issues/121)
  - Thanks to @TrutzS for the support!

- **New Filter in `FUAM_Core_Report`**
  - Added **Workspace Type** filter  
  - Fixed filter based on reported issue [#85](https://github.com/microsoft/fabric-toolbox/issues/85) by @nielsv
  - Report page improvements based on [#149](https://github.com/microsoft/fabric-toolbox/issues/149) by @carloscantu22

- **FUAM_Core_Report Enhancements**
  - Added **"Item Analyzer link"** link to both `Item Catalog` and `Item Catalog+` report pages.
  - Added **[?] icons** to report pages with referenced documentation

- **FUAM_Item_Analyzer_Report Enhancements**
  - Expanded scope for aggregated activities (last 30 days).
  - Extended SQL logic in `03_Aggregate_Activities_Unit`.
  - Updated visuals to reference the `aggregated_activities_last_30days` lakehouse table.


---


We’re excited to see such strong engagement from the community and truly appreciate all the valuable feedback. With this update, we’ve made FUAM more robust and laid the groundwork for new features that were announced in the initial release. More versions are already in the works—stay tuned!
