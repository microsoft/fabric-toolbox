# Fabric connection management

A Microsoft Fabric notebook that uses the [Fabric Connections REST APIs](https://learn.microsoft.com/rest/api/fabric/core/connections) to inventory your connections and surface three common governance risks:

- **Stale connections** – connections that were never bound to an item, or whose credentials haven't been used recently.
- **Duplicate connections** – multiple connections that point to the same endpoint through the same connectivity route.
- **Ownership continuity risks** – connections whose only owner is an individual user rather than a group.

All executable cells are **read-only**. The final optional cell demonstrates how to add an approved Microsoft Entra security group as a connection owner, but every line is commented out so a normal run can't change ownership.

## Requirements

- The notebook targets the **Fabric Python runtime** (not PySpark). It uses `pandas` and `requests`; no Spark session or lakehouse is required.
- Run it as an identity that can access the connections you want to review. Listing connections and role assignments requires the `Connection.Read.All` or `Connection.ReadWrite.All` scope. Adding an owner requires `Connection.ReadWrite.All` plus sufficient rights on each connection.
- The API returns only connections visible to the caller. For cloud connections this generally means connections the caller owns; a gateway administrator can additionally see connections on gateways they administer.

## Configuration

Adjust these values in the configuration cell before running:

| Setting | Default | Purpose |
| --- | --- | --- |
| `RECENCY_START_DATE` | `2026-05-01` | Connections created before this date are excluded from the unbound test, because Connection Recency data wasn't available when they were created. |
| `CREDENTIAL_UNUSED_DAYS` | `90` | Credentials not used within this many days (including credentials with no recorded use) are flagged. |
| `APPROVED_OWNER_GROUP_ID` | `""` | Object ID of the Microsoft Entra security group that could be added as an owner. Leave blank for read-only analysis. |

## How to use

1. Import `fabric-connection-management.ipynb` into your Fabric workspace and open it with the Python runtime.
2. Review the configuration cell and set the thresholds and (optionally) the approved owner group ID.
3. Run the cells top to bottom. Each section returns a DataFrame of review candidates:
   - **Section 1 – Stale connections**
   - **Section 2 – Duplicate connections**
   - **Section 3 – Ownership continuity**
4. Treat all results as **review candidates, not automatic deletion candidates**. Confirm seasonal, annual, and incident-response workloads with connection owners before making changes.
5. (Optional) To add the approved Entra group as an owner, set `APPROVED_OWNER_GROUP_ID`, review the preview cell, then uncomment the final cell.

## Disclaimer

This notebook contains sample code provided for demonstration purposes only. It isn't an official Microsoft product or supported solution and is provided **as is**, without warranties of any kind. Use it only in a test or other nonproduction environment. You are responsible for reviewing, testing, securing, and validating the code before use and assume all risks arising from its use, including any changes to connections, permissions, credentials, or data.
