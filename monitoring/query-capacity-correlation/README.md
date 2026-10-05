# Fabric Data Warehouse Query Capacity Correlation

This customer-owned Power BI report places Microsoft Fabric Capacity Metrics
and warehouse Query Insights on the same time axis. Use it to investigate a
capacity spike, identify active query workloads, and validate tuning or
scheduling changes.

The report doesn't deploy objects to customer warehouses or store reusable
credentials.

## What the report shows

- Capacity utilization by hour for the latest seven days.
- Queries active during the selected hour or time range.
- Query duration, CPU, user, status, scan volume, and SQL text.
- Warehouse, item type, query hash, and distributed statement ID.

## Prerequisites

- Power BI Desktop with Power BI project (PBIP) support.
- Windows PowerShell 5.1 or PowerShell 7.
- Azure CLI.
- Access to the **Fabric Capacity Metrics** semantic model.
- Read and Query Insights access to each warehouse.

## Download the customer template

Download and extract
[Fabric Data Warehouse Query Capacity Correlation - Customer Template.zip](./Fabric%20Data%20Warehouse%20Query%20Capacity%20Correlation%20-%20Customer%20Template.zip).

The ZIP contains the configuration script, editable PBIP sources, SQL
templates, and this guide. You don't need Git.

## Find the Capacity Metrics workspace

1. Open **OneLake catalog** in Fabric.
1. Filter to **Semantic model**, and search for **Fabric Capacity Metrics**.
1. Copy the exact value in the **Workspace** column.

The workspace name typically resembles:

```text
Microsoft Fabric Capacity Metrics <installation date and time>
```

If the model isn't visible, ask the person who installed the app for access or
for the workspace name.

## Configure the report

1. Open PowerShell in the extracted folder.
1. Unblock the script:

   ```powershell
   Unblock-File .\Configure-CustomerTemplate.ps1
   ```

1. Sign in with Azure CLI:

   ```azurecli
   az login
   ```

1. Run the script with the capacity name, Capacity Metrics workspace, and the
   Windows time zone used by the Capacity Metrics report:

   ```powershell
   .\Configure-CustomerTemplate.ps1 `
     -CapacityName "Contoso Production" `
     -CapacityMetricsWorkspace "Microsoft Fabric Capacity Metrics <installation>" `
     -TimeZoneId "Pacific Standard Time"
   ```

If your account can access exactly one active capacity, omit `-CapacityName`.
You can also provide `-CapacityId` for unattended configuration. The script
uses the existing Azure CLI sign-in to discover capacities and accessible
warehouses; it doesn't add another authentication method.

To find available Windows time zone IDs, run:

```powershell
[TimeZoneInfo]::GetSystemTimeZones() | Select-Object Id, DisplayName
```

Capacity-wide workspace discovery requires Fabric administrator or
service-principal permissions with `Tenant.Read.All` or `Tenant.ReadWrite.All`.
Without those permissions, the script uses only workspaces available to the
signed-in identity.

Optional filters:

```powershell
-WorkspaceNamePattern "^Production" -WarehouseNamePattern "Warehouse$"
```

## Open and refresh

1. Open `Configured\Query Capacity Correlation.pbip`.
1. Sign in to Capacity Metrics and each warehouse SQL connection.
1. Set every source's privacy level to **Organizational**.
1. Review and approve the native Query Insights prompts.
1. Refresh the semantic model.

After publishing, configure each source under **Semantic model settings** >
**Gateway and cloud connections**, then run an on-demand refresh.

## Investigate a capacity spike

1. Select an hour or time range with elevated capacity utilization.
1. Filter by warehouse, item type, status, statement type, or user.
1. Review every Query Insights request that overlaps the selected interval.
1. Compare query duration, allocated CPU, data scanned, and status.
1. Review SQL text and query hashes before tuning or rescheduling a workload.

> [!IMPORTANT]
> Capacity Metrics Operation ID and Query Insights `distributed_statement_id`
> are different identifiers. Don't join or compare them. Correlate with the
> resolved warehouse and overlapping time window.

Capacity consumption and Query Insights CPU are complementary measurements.
Don't convert one directly into the other.

## Validate before sharing

The imported semantic model contains cached SQL text and user identities from
every configured warehouse. Report viewers can see imported data without
having permissions on each source warehouse.

- Review `warehouses.configured.csv`, and remove unintended sources.
- Restrict report access to users authorized to view the imported identities
  and SQL text.
- Confirm that selecting a time range filters capacity and query visuals.
- Refresh successfully in Power BI Service before sharing the report.

## Common issues

### Capacity Metrics model isn't found

Find the **Fabric Capacity Metrics** semantic model in OneLake catalog and
rerun the script with its exact **Workspace** value.

### Warehouses are missing

Confirm that the signed-in account can access the workspace and query
`queryinsights.exec_requests_history`. Query Insights retains 30 days of
history, while the Capacity Metrics source used by this report exposes the
latest seven days. The usable correlation period is their overlap. Query
Insights excludes system queries and can take up to 15 minutes to show a
completed query.

### Capacity discovery is ambiguous

Rerun the script with `-CapacityName` or `-CapacityId`. The error lists active
capacities available to the signed-in identity.

## Build and test

Maintainers can rebuild the downloadable package:

```powershell
.\Build-CustomerPackage.ps1 -Force
```

Run the configuration and archive tests:

```powershell
.\tests\Test-CustomerTemplate.ps1
.\tests\Test-ReleaseArchive.ps1 `
  -ArchivePath ".\Fabric Data Warehouse Query Capacity Correlation - Customer Template.zip"
```
