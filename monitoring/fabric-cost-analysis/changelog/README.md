# FCA Release notes

## Roadmap

- Warehouse Auto Scale cost analysis
- Forecast
- What if analysis
- Correlate cost with CU based on Fabric Capacity Operations Events

## Release

## 📦 2026.11.26

- **Azure Quotas analysis by quota** (optional Quota feature): FCA now keeps **which quota** each value belongs to. The `quota_fabric` table gets the columns `QuotaId`, `QuotaName`, `Unit` and `CollectionTimestamp`, so the capacity quota (`CapacityQuota`), the number of on-demand enabled capacities and every on-demand CU-hours-per-day quota (OneLake, Data Warehouse, Data Factory...) are reported separately, with their limit, usage, remaining quota and utilization. Before, all the quotas of a region were added up (CU, CU hours and counts together), which gave meaningless totals.
- **Quota report page** redesigned: quotas by status (OK / Warning / Critical), highest utilization per region on the map, detailed table per subscription, region and quota sorted by utilization, new Quota slicer and snapshot date. Warning is at 80% and Critical at 95% (editable in the `Quota Warning Threshold` and `Quota Critical Threshold` measures).
- **Semantic model**: `Quota Used`, `Quota Limit` and `Quota Consumed` now use the latest snapshot of the selected period (values of several days are no longer added up) and are blank when quotas with different units are mixed. New measures: `Quota Remaining`, `Quota Status`, `Quota Max Consumed`, `# Quotas Critical`, `# Quotas Warning`, `# Quotas OK`, `Quota Snapshot Date`, `Quota Last Collected`.
- **Quota collection**: requests that fail (missing permission, subscription or region not available...) are now reported in the notebook output instead of being silently ignored, and the other subscriptions and regions are still loaded. A run that collects nothing keeps the existing data, and a snapshot is replaced per subscription instead of per day.
- **New Azure regions** for quotas and the map: France South, Taiwan North, Belgium Central and Denmark East (54 regions, as returned by the `Microsoft.Fabric` resource provider).
- **On-Demand meters**: the 95 On-Demand meters (`... OD On-Demand Usage CU`) now have a category prefixed with `On-Demand` (for example `On-Demand OneLake`, `On-Demand BCDR`, `On-Demand RTI`), so they can be analyzed separately from the capacity meters. The `#OneLake` measure counts both `OneLake` and `On-Demand OneLake`, so the OneLake cost of the Home page is unchanged. The categories of existing installations are updated by the next run of the pipeline (`01_Load_Meters`).
- **Meter Analysis page** (Operate): new report page to analyze the consumption of the meters day by day, with the Date, Subscription and Region slicers of the other pages, a Category slicer and a Meters list, a one-click **All Meters / OnDemand Only** switch, the daily cost of the standard and OnDemand meters, the daily cost of the top 10 meters, and a sortable table per meter (type, category, unit, quantity, cost, share, days with consumption, average cost per day and daily trend). The OnDemand meters are identified from the `meters` table (category starting with `On-Demand`, or name ending with `OD On-Demand Usage CU`). The semantic model gets a `meter_view` table (calculated, no relationship, no lakehouse table) that hosts the `Meter ...` measures. Nothing to load or configure: see [MeterAnalysis.md](../MeterAnalysis.md).
- **Support page**: the text under the FCA banner was removed and the banner is now centered in the page.
- **OnDemand Cost** (Home page, Additional Cost Details table): new `OnDemand Cost` measure, the cost of all the OnDemand meters (same meter identification as the Meter Analysis page), shown as a new column after *Capacity Overage* and following the page filters. OnDemand meters are not part of the Additional Cost total (Pause Cost, SparkAutoScale and Capacity Overage), so the column is independent of it. The table now also lists the `On-Demand ...` categories that have OnDemand cost but no Additional Cost (new hidden measure `Additional Cost Details Check`, used as the table filter). The values of the other columns and of the cards do not change.
- **OnDemand Cost on the Summary page**: the *Cost details* chart has a new **OnDemand** segment (the `OnDemand Cost` measure) next to Reservation, PAYG, Additional Cost and OneLake. Before, the OnDemand cost was missing from the chart, except for the OnDemand OneLake meters that were counted in OneLake, so the capacities with OnDemand usage were under-reported. To avoid counting these OnDemand OneLake meters twice, the OneLake segment of this chart uses the new measure `OneLake excl. OnDemand`; the five segments add up to the total cost for any filter. The OneLake card of the Home page is unchanged (it keeps `#OneLake`).
- **Upgrade**: run the `00_Deploy_FCA` notebook as usual, existing quota data is kept (see [Quota.md](../Quota.md#upgrade-from-a-previous-version)). Quota data collected by previous versions has no quota name and is not shown in the Quota page, run the **Load Quota** pipeline once to get the new view.

## 📦 2026.10.29

- **New meters**: new meters to follow on demands workloads CUs.
- **Data Reservation Fixes**: Issues 674, 691, 692 and 699 (https://github.com/microsoft/fabric-toolbox/issues).


## 📦 2026.9.11

- **Azure Tags analysis**: new `azuretags` table loaded from the FOCUS cost data, related to `resources`, with a dedicated tag hierarchy filter (tag name / tag value) available across the report
- **Report migrated to the enhanced report format (PBIR)**: report definition is now file-based (pages, visuals, bookmarks), easier to customize, review and version in Git
- **New meters**: OneLake Cold/Cool read, write, iterative and other operations (including BCDR), OneLake Table Read via API, Data Warehouse autoscale, Data Warehouse (Accelerated), High Scale Dataflow Compute - Spark, Spark GPU Optimized, SQL DB in Fabric LR, RTI Event Listener & Alert and RTI Event Operations
- **Solution cost transparency**: documented the CU footprint of running FCA itself (~2% of an F4, ~6,000 CU/day on a 4 regions / 50 capacities / 13 reservations deployment)
- **Deployment improvements**: deployment notebook now runs on Python 3.12 and stages artifacts through a mounted Lakehouse `Files` path (more reliable on large deployments, with automatic cleanup)
- Semantic model clean-up (removed unused `SubAccountId` from `reservation_usage`, metadata and description updates)
- Fixes: missing `SubId` column in the Lakehouse table initialization

## 📦 2026.05.26

- Update for the Fabric Jumpstart
- New FinOps Maturity Score
- Data Agent updates
- Several bug fixes
- Additional documentation
- Meters Updates

## 📦 2026.03.13

- Fabric Jumpstart (https://jumpstart.fabric.microsoft.com/) 
- Fixes
- Folders
- New Meters

## 📦 2026.01.30

- Fixes

## 📦 2025.12.05

- Fixes

## 📦 2025.10.31

- Reservation analysis
- Azure Quotas analysis
- FinOps hubs support
- Meters analysis
- Fixes
- Promotion and deployment videos

## 📦 2025.10.15

- Data Agent updates
- Fixes

## 📦 2025.9.2

- First Release 🎉