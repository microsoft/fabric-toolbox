# FUAM - Optimization Module - Semantic Models (Beta)

**Last Updated:** May 31, 2026  
**Authors:** Kevin Thomas

### Approach
The Optimization module extracts item-type-specific detailed information that helps identify the root causes of high CU utilization on a capacity. Because collecting this level of detail for every item in a tenant would be too time- and CU-intensive, the module focuses on the items with the greatest optimization impact.

To achieve this, items are first ranked by their CU consumption over the previous day, per capacity. Only the top *n* items (where *n* is configurable through the pipeline/notebook parameters) are then selected for detailed extraction.

For semantic models, two types of information are collected:

1. **Best Practice Analyzer results** – automatically executed to track whether item creators follow community-defined best practices. This makes it easy to spot common modeling anti-patterns (e.g., unused columns, missing relationships, inefficient DAX) that drive unnecessary CU consumption, and to monitor how model quality evolves over time.
2. **VertiPaq Analyzer data** – extracted at table level to capture the memory footprint of each model. The per-table breakdown helps pinpoint the largest contributors to memory pressure, guiding targeted optimizations such as reducing cardinality, removing unused tables, or adjusting data types.

All extracted information is persisted to Lakehouse tables, allowing a historical record to accumulate over time.

### Authorization
Because no Admin API is available for extracting Best Practice Analyzer and VertiPaq Analyzer data, a principal must be explicitly authorized on each workspace that contains the items to be analyzed. To support this, a service principal (SPN) configured through Azure Key Vault is required.

In contrast to the inventory extraction — where Key Vault integration is optional — it is a **hard requirement** for the Optimization module. In addition to the parameters already used for inventory extraction, you must also provide the **object ID of the SPN's associated enterprise application** (see [App objects and service principals](https://learn.microsoft.com/en-us/entra/identity-platform/app-objects-and-service-principals?tabs=browser)). It will not work with the object id of the SPN or the client id of the SPN.

The service principal is automatically added as a member of the relevant workspaces by the user who runs the notebook (when triggered through a pipeline, this is the user who last edited the pipeline). That user must:

- have access to the Key Vault (both IAM and network access), and
- hold tenant-level admin rights, since workspace authorization for the SPN is performed through the Admin API.

For this reason, **Privileged Identity Management (PIM)**–elevated accounts are currently **not supported**.

#### How to find the object ID of the SPN's associated application

The required ID is **not** the object ID of the App Registration itself, but the object ID of the corresponding **Enterprise Application** (service principal) in your tenant. To retrieve it:

**Option A – Azure portal**
1. Sign in to the [Azure portal](https://portal.azure.com) and open **Microsoft Entra ID**.
2. Select **Enterprise applications** in the left navigation.
3. Set the **Application type** filter to *All Applications* and search for the display name of your SPN.
4. Open the application and copy the value shown as **Object ID** on the Overview blade. Use this value in the notebook/pipeline parameter.

> Tip: The App Registration's *Application (client) ID* and the Enterprise Application's *Object ID* are different values. Make sure you use the Enterprise Application's Object ID.

**Option B – Azure CLI**

```bash
az ad sp show --id <application-client-id> --query id -o tsv
```

`<application-client-id>` is the Application (client) ID shown on the App Registration's Overview page. The returned value is the Enterprise Application's Object ID.

**Option C – PowerShell (Microsoft Graph)**

```powershell
Connect-MgGraph -Scopes "Application.Read.All"
(Get-MgServicePrincipal -Filter "appId eq '<application-client-id>'").Id
```

### Limitations

Before enabling the Optimization module, please be aware of the following limitations:

- **Top *n* per capacity only.** Items outside the top *n* by previous-day CU consumption are not analyzed.
- **Key Vault + Service Principal are mandatory** (unlike inventory extraction, where Key Vault is optional).
- **Executing user must be a permanent tenant admin** with IAM and network access to the Key Vault. Privileged Identity Management (PIM)–elevated roles are **not supported**.
- **Currently limited to semantic models.** Additional item types may be added in future releases.

### Remarks
In the Load_FUAM_Data_E2E pipeline the activity for the optimization module is by default deactivated. Activate it manually, if you like to test it out.

Support for additional item types (beyond semantic models) is planned and will be added in future releases.

We actively welcome your feedback — whether it's a bug report, a usability issue, or a suggestion for additional metrics or item types to cover. Please share your input by opening an issue or discussion in the [fabric-toolbox repository](https://github.com/microsoft/fabric-toolbox/issues). Your feedback directly shapes the roadmap for this module.
