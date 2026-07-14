'''
Quick Tutorial:

1. Run Code Below
2. Run this SQL code in a separate cell to get list of tables in the lakehouses accross all workspaces (non-schema-enabled only)

%%sql
SELECT workspace_name, lakehouse_name, table_name, table_type, location, format 
FROM fabric_lakehouse_inventory
'''

%pip install --upgrade semantic-link

import sempy.fabric as fabric
import pandas as pd
from pyspark.sql.types import StructType, StructField, StringType

all_tables = []
failed = []

workspaces = fabric.list_workspaces()

for _, ws in workspaces.iterrows():
    ws_id = ws["Id"]
    ws_name = ws["Name"]

    try:
        lakehouses = fabric.list_items(workspace=ws_id, item_type="Lakehouse")

        for _, lh in lakehouses.iterrows():
            lh_name = lh["Display Name"]

            try:
                df = fabric.lakehouse.list_lakehouse_tables(
                    lakehouse=lh_name,
                    workspace=ws_id
                )
                df.insert(0, "workspace_name", ws_name)
                df.insert(1, "lakehouse_name", lh_name)
                all_tables.append(df)

            except Exception:
                failed.append({"workspace": ws_name, "lakehouse": lh_name})

    except Exception:
        failed.append({"workspace": ws_name, "lakehouse": "N/A"})

if all_tables:
    result = pd.concat(all_tables, ignore_index=True)

    # Normalize column names to lowercase with underscores
    result.columns = [c.lower().replace(" ", "_") for c in result.columns]

    inventory = result.rename(columns={
        "name":        "table_name",
        "type":        "table_type",
        "format":      "format",
        "location":    "location",
    })[["workspace_name", "lakehouse_name", "table_name", "table_type", "location", "format"]]

    spark_df = spark.createDataFrame(inventory.astype(str))
    spark_df.createOrReplaceTempView("fabric_lakehouse_inventory")

    print(f"Total tables indexed: {spark_df.count()}")
    print("View fabric_lakehouse_inventory created. Query it with:")

    display(spark.sql("SELECT workspace_name, lakehouse_name, table_name, table_type, location, format FROM fabric_lakehouse_inventory"))
else:
    print("No tables found.")

if failed:
    print(f"\nFailed lakehouses ({len(failed)}):")
    display(pd.DataFrame(failed))