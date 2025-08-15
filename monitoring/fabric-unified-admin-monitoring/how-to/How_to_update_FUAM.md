# FUAM Update

To update FUAM (Fabric Unified Admin Monitoring) to the latest version, follow the documented steps below.

![FUAM update process overview](/monitoring/fabric-unified-admin-monitoring/media/deployment/update_fuam_process_cover.png)


**Important:**

- FUAM updates **overwrite all FUAM-provided items** based on the item name.
- FUAM updates **do not** affect your collected data within the `FUAM_Lakehouse`, just the meta data will be overwritten.

- If you **have made custom changes to pipelines, notebooks, semantic models, and reports**, please **create a backup or rename your custom items**

- **Recommended:** Take a screenshot from your current pipeline parameters in "Load_FUAM_Data_E2E"

- **Recommended:** Back up your workspace items (e.g., using Git) before the update

- **Recommended:** Check the Release notes of FUAM to see enhanced, fixed or new items, features of FUAM


# Steps

## 1. Update Instructions

1. **Download** the latest version of the [Deploy_FUAM.ipynb](/monitoring/fabric-unified-admin-monitoring/scripts/Deploy_FUAM.ipynb) notebook.
2. **Remove** the old `Deploy_FUAM` notebook from your workspace.
3. **Import** the updated notebook into your FUAM workspace.
4. **Run** the `Deploy_FUAM.ipynb` notebook from within your FUAM workspace.


    ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_3_2.png)


> **Info:** This notebook is designed to initially deploy or update all the items in your FUAM workspace


### 2. Open PBI report
- Navigate to your FUAM Workspace
- Search for the item 'FUAM_Core_Report'
- Open the **FUAM_Core_Report** Power BI report
- Feel free to explore the report pages
   ![](/monitoring/fabric-unified-admin-monitoring/media/deployment/FUAM_basic_deployment_process_7_3.png)


## Congratulations!

You are using the latest and greatest version of FUAM!

----------------

## Other helpful resources
- [Video - Brief introduction to FUAM](https://youtu.be/CmHMOsQcMGI)
- [Documentation - FUAM's Authorization & Authentication](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Authorization.md)
- [Documentation - FUAM Architecture](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Architecture.md)
- [Documentation - FUAM Lakehouse table lineage](/monitoring/fabric-unified-admin-monitoring/media/documentation/FUAM_Documentation_Lakehouse_table_lineage.pdf)

----------------