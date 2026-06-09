# Warehouse Collation Updater

A Python script that updates the collation of a Microsoft Fabric Warehouse dataset (TMSL) via the Power BI REST API using interactive Azure AD authentication.

This is used to fix metadata errors in the warehouse when the warehouse collation and the dataset (TMSL) collation are out of sync.

### Why does this happen?

This occurs when users create warehouses manually in two different workspaces with different collations and then use CI/CD (git integration or deployment pipeline workflows) to update the warehouse content across them. If there are no collation-specific conflicts (e.g., two objects within a schema with the same name but different accent or casing), the deployment succeeds — but this is **not a supported scenario**. The result is a mismatch between the warehouse collation and the dataset (TMSL) collation, which causes metadata errors in the warehouse.

---

## Unsupported scenarios

The following CI/CD workflows are **not officially supported** when warehouses in different workspaces have different collations. Even though these operations may succeed without errors, they can result in a collation mismatch between the warehouse and its dataset (TMSL), leading to metadata errors.

<table>
<thead>
<tr>
<th>Scenario</th>
<th>Description</th>
<th>Risk</th>
</tr>
</thead>
<tbody>
<tr>
<td><strong>Deployment Pipelines</strong></td>
<td>Promoting warehouse content through pipeline stages (e.g., Dev &rarr; Test &rarr; Prod) where the target warehouse was created with a different collation than the source.</td>
<td>Deployment may succeed, but the dataset collation will not be updated to match the target warehouse collation.</td>
</tr>
<tr>
<td><strong>Branching out to a new or existing workspace</strong></td>
<td>Using Git integration to branch out from an existing workspace to a new or existing workspace where the warehouse has a different collation.</td>
<td>Warehouse content is synced, but the collation metadata is not reconciled.</td>
</tr>
<tr>
<td><strong>Switching branches on a workspace</strong></td>
<td>Switching to a branch that was associated with a warehouse of a different collation on a Git-connected workspace.</td>
<td>Synced content may carry over collation assumptions that do not match the current warehouse.</td>
</tr>
<tr>
<td><strong>Merging changes between workspaces through branches</strong></td>
<td>Merging Git branches across workspaces where the warehouses have different collations.</td>
<td>Merge may succeed at the Git level, but the resulting dataset collation will not reflect the target warehouse's collation.</td>
</tr>
</tbody>
</table>

> [!NOTE]
> In all of these scenarios, if a collation mismatch occurs, use the script below to update the dataset (TMSL) collation to match the warehouse collation.

---

## Setup

1. Download `pbi_interactive.py` to a folder on your machine (e.g., `C:\Users\<you>\Documents\`)

2. Open a terminal (PowerShell on Windows, Terminal on macOS/Linux) and navigate to that folder:

   ```
   cd C:\Users\<you>\
   ```

3. Install the required Python packages:

   ```
   pip install azure-identity requests
   ```

   | Package | Purpose |
   |---|---|
   | `azure-identity` | Interactive Azure AD browser login (no client ID needed) |
   | `requests` | HTTP calls to the Power BI API |

4. Verify the install:

   ```
   python -c "import azure.identity; import requests; print('Ready')"
   ```

   If you see `Ready`, you're good to go.

---

## Parameters

| Parameter | Required | Description |
|---|---|---|
| `--tenant-id` | Yes | Your Azure AD tenant ID (GUID) |
| `--warehouse-id` | Yes | The Fabric Warehouse ID (GUID) |
| `--collation` | Yes | The new collation to apply to the dataset |
| `--base-url` | No | Base URL for the Power BI API (default: `https://df-msit-scus-redirect.analysis.windows.net/v1.0/myorg`) |

### Supported collation values

- `Latin1_General_100_BIN2_UTF8`
- `Latin1_General_100_CI_AS_KS_WS_SC_UTF8`

---

## How to get the parameter values

### Tenant ID

1. Go to the [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **Overview**
3. Copy the **Tenant ID** from the overview page

Or run in PowerShell:

```powershell
(Get-AzContext).Tenant.Id
```

### Warehouse ID

1. Open your Fabric Warehouse in the browser
2. The warehouse ID is the GUID in the URL:
   ```
   https://app.fabric.microsoft.com/groups/......./warehouses/<warehouse-id>
   ```
3. Copy that GUID

### Collation

Use the collation that matches your warehouse's collation setting. The script will compare it against the current dataset (TMSL) collation and only apply the update if they differ.

You can query the warehouse collation by running this SQL in your warehouse:

```sql
SELECT name, collation_name FROM sys.databases WHERE name = '<warehouse name>';
```

---

## How to run

### Windows (PowerShell)

```powershell
& python .\pbi_interactive.py --tenant-id "YOUR_TENANT_ID" --warehouse-id "YOUR_WAREHOUSE_ID" --collation "Latin1_General_100_CI_AS_KS_WS_SC_UTF8"
```

To use a custom base URL:

```powershell
& python .\pbi_interactive.py --tenant-id "YOUR_TENANT_ID" --warehouse-id "YOUR_WAREHOUSE_ID" --collation "Latin1_General_100_CI_AS_KS_WS_SC_UTF8" --base-url "https://your-custom-endpoint.analysis.windows.net/v1.0/myorg"
```

### macOS / Linux

```bash
python3 pbi_interactive.py --tenant-id "YOUR_TENANT_ID" --warehouse-id "YOUR_WAREHOUSE_ID" --collation "Latin1_General_100_CI_AS_KS_WS_SC_UTF8"
```

### Example

```powershell
& python .\pbi_interactive.py --tenant-id "72f988bf-86f1-41af-91ab-2d7cd011db47" --warehouse-id "2bea3fa9-2cc0-44af-b475-e1aebe2292a4" --collation "Latin1_General_100_CI_AS_KS_WS_SC_UTF8"
```

---

## What the script does

1. **Signs in** via interactive Azure AD browser login
2. **Extends the lease** on the warehouse to prevent background processing conflicts
3. **Gets the current dataset** (TMSL) and reads its collation and datamart version
4. **Validates** that the provided collation differs from the current dataset collation. If they are the same, the script stops — they must be different so the warehouse collation can be applied to the dataset to resolve metadata errors
5. **Updates the collation** in the dataset and submits it back via `PutDatasetCommand`
6. If the update is in progress, waits 15 seconds and asks you to **refresh the warehouse in your browser**

---

## Example output

```
Token acquired via interactive browser login.
Signed in. Warehouse: 2bea3fa9-2cc0-44af-b475-e1aebe2292a4

[Step 1] Extending lease...
  Done.
[Step 2] Getting current dataset...
  Current collation: Latin1_General_100_BIN2_UTF8
  Datamart version:  6
[Step 3] Updating collation to 'Latin1_General_100_CI_AS_KS_WS_SC_UTF8'...
  Collation updated successfully!
```

---

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `Login failed` | Azure AD sign-in failed | Check your tenant ID and try again |
| `Could not extend lease` | Warehouse may be busy or inaccessible | Retry after a minute |
| `Could not get dataset` | Permissions or warehouse ID issue | Verify you have access and the warehouse ID is correct |
| `Could not update dataset` | TMSL rejected by the API | Check the error details in the output |
| `collation is the same` | No update needed | The dataset already has the collation you specified |
