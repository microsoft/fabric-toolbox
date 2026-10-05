# FCA Release notes

## Roadmap

- Warehouse Auto Scale cost analysis
- Forecast
- What if analysis
- Correlate cost with CU based on Fabric Capacity Operations Events

## Release

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