# Get All Tables Across All Workspaces in All Lakehouses
# (with pagination on all 3 API calls)

# This snippet returns a Spark view with all tables
# It helps solve challenges:
# - Which table has XYZ in the name (e.g. payments, sales, etc)
# - How many tables we have
# - How many duplicated tables we have

import requests
from notebookutils import mssparkutils
from urllib.parse import urlparse, urlencode, parse_qsl, urlunparse
from pyspark.sql.types import StructType, StructField, StringType


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
def _get_with_retry(url, headers, timeout=30, retries=3, backoff=1.0):
    for attempt in range(retries + 1):
        resp = requests.get(url, headers=headers, timeout=timeout)
        if resp.status_code < 500 and resp.status_code != 429:
            resp.raise_for_status()
            return resp
        if attempt == retries:
            resp.raise_for_status()
        wait = float(resp.headers.get("Retry-After", backoff * (2 ** attempt)))
        time.sleep(wait)

def get_all_pages(url, result_key=("value", "data")):
    """
    result_key: a string, or a tuple of keys tried in order.
    The first key present in the response body is used.
    """
    if isinstance(result_key, str):
        result_key = (result_key,)

    all_items = []
    while url:
        body = _get_with_retry(url, api_headers).json()

        items = next((body[k] for k in result_key if k in body), [])
        all_items.extend(items)

        if body.get("continuationUri"):
            url = body["continuationUri"]
        elif body.get("continuationToken"):
            parsed = urlparse(url)
            params = dict(parse_qsl(parsed.query))
            params["continuationToken"] = body["continuationToken"]
            url = urlunparse(parsed._replace(query=urlencode(params)))
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
failed_workspaces = []

# -----------------------------------------------------------
# 2. Loop through workspaces → lakehouses → tables
# -----------------------------------------------------------
for workspace in workspace_list:
    workspace_id = workspace["id"]
    workspace_name = workspace["displayName"]

    print(f"Processing workspace: {workspace_name}")

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
        failed_workspaces.append({
            "workspace_name": workspace_name,
            "error": str(ex),
        })
        print(f"  ✗ Workspace failed: {workspace_name}")
        print(f"    Error: {ex}\n")

inventory_schema = StructType([
    StructField("workspace_name", StringType(), True),
    StructField("lakehouse_name", StringType(), True),
    StructField("table_name",     StringType(), True),
    StructField("table_type",     StringType(), True),
    StructField("location",       StringType(), True),
    StructField("format",         StringType(), True),
])

if inventory_records:
    spark_df = spark.createDataFrame(inventory_records, schema=inventory_schema)
    spark_df.createOrReplaceTempView("fabric_lakehouse_inventory")
    print("A view fabric_lakehouse_inventory created")
    print(f"Total tables indexed: {spark_df.count()}")
else:
    print("No lakehouses or tables found.")

if schema_enabled_lakehouses:
    print(f"\n⚠ Skipped {len(schema_enabled_lakehouses)} schema-enabled lakehouse(s):")
    for lh in schema_enabled_lakehouses:
        print(f"  - {lh['workspace_name']} → {lh['lakehouse_name']}")
    print("  (The REST API /tables endpoint does not support schema-enabled lakehouses yet)")

if failed_workspaces:
    print(f"\n✗ Failed to process {len(failed_workspaces)} workspace(s):")
    for fw in failed_workspaces:
        print(f"  - {fw['workspace_name']}: {fw['error']}")

query_text = """SELECT
    workspace_name,
    lakehouse_name,
    table_name,
    table_type,
    location,
    format
FROM fabric_lakehouse_inventory
"""

if schema_enabled_lakehouses:
    display(spark.sql(query_text))

print("Use that query to get data:")
print("****************")
print("%%sql")
print(query_text)
