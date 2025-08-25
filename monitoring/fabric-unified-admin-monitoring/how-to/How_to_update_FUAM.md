# FUAM Update

To update FUAM (Fabric Unified Admin Monitoring) to the latest version, follow the documented steps below.

![FUAM update process overview](/monitoring/fabric-unified-admin-monitoring/media/deployment/update_fuam_process_cover.png)

**Important:**

- FUAM updates **overwrite all FUAM-provided items** based on the item name.
- FUAM updates **do not** affect your collected data within the `FUAM_Lakehouse`; only the metadata will be overwritten.
- If you **have made custom changes to pipelines, notebooks, semantic models, and reports**, please **create a backup or rename your custom items**.
- **Recommended:** Take a screenshot of your current pipeline parameters in `Load_FUAM_Data_E2E` before the update.
- **Recommended:** Back up your workspace items (e.g., using Git) before the update.
- **Recommended:** Check the release notes of FUAM to see enhanced, fixed, or new items and features.
- **Use the same user to update FUAM** as you **used during initial deployment**. It is important to do so because this user is the owner of all the FUAM-related items and the cloud connections.

# Steps

## 1. Preparation

#### 1a) Scope of the update
Before you update your FUAM workspace, please review the following illustration, which describes which items will be overwritten or updated during an update of FUAM:

![FUAM update process scope](/monitoring/fabric-unified-admin-monitoring/media/deployment/update_fuam_process_scope.png)

**Important:** Other items with custom names won't be affected by the update.

#### 1b) Before you update

1. (Recommended) **Back up your workspace** items (e.g., using Git) before the update.
2. (Recommended) **Check the release notes** of FUAM to see enhanced, fixed, or new items and features.
3. (Recommended) **Take a screenshot** of your current pipeline parameters in `Load_FUAM_Data_E2E` before the update.
4. (Highly recommended) **Use the same user to update FUAM** as you **used during initial deployment**. It is important to do so because this user is the owner of all the FUAM-related items and the cloud connections.
 
## 2. Download and run Notebook

1. **Download** the latest version of the [Deploy_FUAM.ipynb](/monitoring/fabric-unified-admin-monitoring/scripts/Deploy_FUAM.ipynb) notebook.
2. **Remove** the old `Deploy_FUAM` notebook from your workspace.
3. **Import** the updated notebook into your FUAM workspace.
4. **Run** the `Deploy_FUAM.ipynb` notebook from within your FUAM workspace.

    ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_3_2.png)

> **Info:** This notebook is designed to initially deploy or update all the items in your FUAM workspace.

### 3. Update Pipeline parameters

**Important:** When you re-run the `Deploy_FUAM` notebook, the update logic will overwrite your current parameters in the `Load_FUAM_Data_E2E` pipeline.

5. Open the `Load_FUAM_Data_E2E` pipeline in your FUAM workspace.
6. Set your previously saved parameters.
7. Save the pipeline.

### 4. Open PBI report

8. Navigate to your FUAM workspace.
9. Search for the item `FUAM_Core_Report`.
10. Open the `FUAM_Core_Report` Power BI report.
11. Feel free to explore the report pages:
    ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_7_3.png)

12. (Optional - only if needed) **Reconfigure** semantic model parameters of:
    - `FUAM_Semantic_Model_Meta_Data_Analyzer_SM`
    - `FUAM_SQL_Endpoint_Analyzer_Report_SM`
    - `FUAM_Gateway_Monitoring_Report_From_Files_SM`

**Info:**  
You do **not** need to manually run the `Load_FUAM_Data_E2E` pipeline after an update. 
**During the next pipeline run**, FUAM will also check and update the status of your FUAM version on the first page of the `FUAM_Core_Report`:

![](/monitoring/fabric-unified-admin-monitoring/media/deployment/updated_fuam_status.png)


## Congratulations!

You are now using the latest and greatest version of FUAM!

----------------

## Other helpful resources
- [Video - Brief introduction to FUAM](https://youtu.be/CmHMOsQcMGI)
- [Documentation - FUAM Authorization & Authentication](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Authorization.md)
- [Documentation - FUAM Architecture](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Architecture.md)
- [Documentation - FUAM Lakehouse Table Lineage](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf)