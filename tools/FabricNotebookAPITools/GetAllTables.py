# 911 - Get All Tables Across All Workspaces in All Lakehouses
# (with pagination on all 3 API calls)

# This snippet returns a Spark view with all tables
# It helps solve challenges:
# - Which table has XYZ in the name (e.g. payments, sales, etc)
# - How many tables we have
# - How many duplicated tables we have

import requests
import pandas as pd
from notebookutils import mssparkutils
from pyspark.sql import SparkSession

access_token = mssparkutils.credentials.getToken(
    "https://api.fabric.microsoft.com"
)

api_headers = {
    "Authorization": f"Bearer {access_token}",
    "Content-Type": "application/json"
}

API_ROOT = "https://api.fabric.microsoft.com/v1"

# -----------------------------------------------------------
# Generic paginated GET — works for all Fabric list endpoints
# -----------------------------------------------------------
def get_all_pages(url, result_key="value"):
    """
    Fetch all pages from a Fabric REST API list endpoint.
    Uses continuationUri/continuationToken for pagination.

    Args:
        url:        The initial API URL
        result_key: "value" for workspaces/lakehouses, "data" for tables
    Returns:
        List of all items across all pages
    """
    all_items = []

    while url:
        resp = requests.get(url, headers=api_headers)
        resp.raise_for_status()
        body = resp.json()

        items = body.get(result_key, [])
        all_items.extend(items)

        # Prefer continuationUri (full URL), fall back to token
        next_url = body.get("continuationUri")
        if next_url:
            url = next_url
        elif body.get("continuationToken"):
            separator = "&" if "?" in url else "?"
            base_url = url.split("?")[0] if "?" in url else url
            url = f"{base_url}{separator}continuationToken={body['continuationToken']}"
        else:
            url = None

    return all_items


# -----------------------------------------------------------
# 1. Get ALL workspaces (paginated)
# -----------------------------------------------------------
workspace_list = get_all_pages(f"{API_ROOT}/workspaces", result_key="value")

print(f"Discovered {len(workspace_list)} workspaces\n")

inventory_records = []
schema_enabled_lakehouses = []

# -----------------------------------------------------------
# 2. Loop through workspaces → lakehouses → tables
# -----------------------------------------------------------
for workspace in workspace_list:
    workspace_id = workspace["id"]
    workspace_name = workspace["displayName"]

    print(f"Processing workspace: {workspace_name}")

    workspace_failed = False

    try:
        # Get ALL lakehouses in this workspace (paginated)
        lakehouse_list = get_all_pages(
            f"{API_ROOT}/workspaces/{workspace_id}/lakehouses",
            result_key="value"
        )

        for lakehouse in lakehouse_list:
            lakehouse_id = lakehouse["id"]
            lakehouse_name = lakehouse["displayName"]

            # Check if lakehouse is schema-enabled
            properties = lakehouse.get("properties", {})
            if (
                properties.get("defaultSchema") is not None
                or properties.get("enableSchemas", False)
            ):
                schema_enabled_lakehouses.append({
                    "workspace_name": workspace_name,
                    "lakehouse_name": lakehouse_name,
                })
                print(f"  ⚠ Skipped '{lakehouse_name}' — schema-enabled lakehouse (REST API not supported)")
                continue

            # Get ALL tables in this lakehouse (paginated)
            table_list = get_all_pages(
                f"{API_ROOT}/workspaces/{workspace_id}/lakehouses/{lakehouse_id}/tables",
                result_key="data"
            )

            for table in table_list:
                inventory_records.append({
                    "workspace_name": workspace_name,
                    "lakehouse_name": lakehouse_name,
                    "table_name": table.get("name"),
                    "table_type": table.get("type"),
                    "location": table.get("location"),
                    "format": table.get("format")
                })

        print(f"  ✓ Workspace processed successfully\n")

    except Exception as ex:
        workspace_failed = True
        print(f"  ✗ Workspace failed: {workspace_name}")
        print(f"    Error: {str(ex)}\n")

if inventory_records:
    pandas_df = pd.DataFrame(inventory_records)
    spark_df = spark.createDataFrame(pandas_df)
    spark_df.createOrReplaceTempView("fabric_lakehouse_inventory")

    print("Temp view created: fabric_lakehouse_inventory")
    print(f"Total tables indexed: {len(inventory_records)}")
else:
    print("No lakehouses or tables found.")

if schema_enabled_lakehouses:
    print(f"\n⚠ Skipped {len(schema_enabled_lakehouses)} schema-enabled lakehouse(s):")
    for lh in schema_enabled_lakehouses:
        print(f"  - {lh['workspace_name']} → {lh['lakehouse_name']}")
    print("  (The REST API /tables endpoint does not support schema-enabled lakehouses yet)")

query_text = """SELECT
    workspace_name,
    lakehouse_name,
    table_name,
    table_type,
    location,
    format
FROM fabric_lakehouse_inventory
"""

display(spark.sql(query_text))

print("Use that query to get data:")
print("****************")
print("%%sql")
print(query_text)