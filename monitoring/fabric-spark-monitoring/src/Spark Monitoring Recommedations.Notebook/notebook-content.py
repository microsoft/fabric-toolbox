# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   }
# META }

# MARKDOWN ********************

# # PySpark Application Runtime & Task Analysis
# 
# Unlock the performance story behind your Spark applications.  
# 
# This **PySpark-based script** dives into Spark event logs from eventhouse.
# 
# ## 🔍 What It Provides
# 
# - ⏱ **Total Application Runtime**  
#   Measure how long your Spark application actually ran from start to finish.
# 
# - 🧮 **Executor Wall-Clock Time (Non-Overlapping)**  
#   Compute accurate, non-overlapping time spent by all executors to assess real resource usage.
# 
# - 🖥️ **Driver Wall Clock Time**  
#   Identify how much time was spent on the driver node — a key indicator of centralized or unbalanced workloads.
# 
# - 📊 **Task-Level Summaries**  
#   Analyze task-level performance, including execution time, I/O metrics, shuffle details, and per-stage skew stats. 
# 
# - 📈 **Runtime Scaling Predictions**  
#   Simulate how application runtime changes with more executors to estimate scalability and cost efficiency.
# 
# - 💡 **Actionable Recommendations**  
#   Get context-aware tips on improving performance, enabling native execution, and optimizing resource usage.


# PARAMETERS CELL ********************

kustoUri = ""
database = ""

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

print(kustoUri)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql import SparkSession, Window
from pyspark.sql.functions import (
    col, lit, count, countDistinct, avg, expr, percentile_approx,
    min as spark_min, max as spark_max, sum as spark_sum, row_number
)
import pandas as pd
from pyspark.sql.types import StructType, StructField, StringType, IntegerType, DoubleType
from pyspark.sql import Row
from pyspark.sql.functions import col, get_json_object


def compute_application_runtime(event_log_df):
    start_row = event_log_df.filter(col("properties.Event") == "SparkListenerApplicationStart") \
        .select((col("properties.Timestamp") / 1000).cast("timestamp").alias("start_time")) \
        .limit(1).collect()

    end_row = event_log_df.filter(col("properties.Event") == "SparkListenerApplicationEnd") \
        .select((col("properties.Timestamp") / 1000).cast("timestamp").alias("end_time")) \
        .limit(1).collect()

    if start_row and end_row:
        return (end_row[0]["end_time"].timestamp() - start_row[0]["start_time"].timestamp())
    return 0.0


def compute_executor_wall_clock_time(event_log_df):
    task_end_df = event_log_df.filter(col("properties.Event") == "SparkListenerTaskEnd") \
        .select(
            col("properties.Task Info.Launch Time").alias("start_time"),
            col("properties.Task Info.Finish Time").alias("end_time")
        ).dropna()

    intervals = task_end_df.selectExpr("start_time / 1000 as start_sec", "end_time / 1000 as end_sec") \
        .orderBy("start_sec")

    merged_intervals = []
    for row in intervals.collect():
        start, end = row["start_sec"], row["end_sec"]
        if not merged_intervals or merged_intervals[-1][1] < start:
            merged_intervals.append([start, end])
        else:
            merged_intervals[-1][1] = max(merged_intervals[-1][1], end)

    return sum(end - start for start, end in merged_intervals)


def estimate_runtime_scaling(app_id,task_df, executor_wall_clock_sec, driver_wall_clock_sec, current_executors, critical_path_sec):
    critical_path_ms = critical_path_sec * 1000
    total_task_time_ms = task_df.agg(spark_sum("executor_run_time_ms")).first()[0]
    parallelizable_ms = total_task_time_ms - critical_path_ms

    if not total_task_time_ms or not executor_wall_clock_sec:
        return pd.DataFrame([])

    total_wall_clock_sec = executor_wall_clock_sec + driver_wall_clock_sec
    predictions = []

    driver_ratio = driver_wall_clock_sec / total_wall_clock_sec

    for multiplier in [1.0, 2.0, 3.0, 4.0, 5.0]:
        new_executors = max(1, int(current_executors * multiplier))
        
        # Estimate executor time with critical path + parallel work
        estimated_executor_sec = (critical_path_ms + (parallelizable_ms / new_executors)) / 1000.0

        # Estimate overlap: higher driver_ratio means less parallelism
        overlap_weight = 1 - driver_wall_clock_sec / (driver_wall_clock_sec + estimated_executor_sec)

        # Weighted estimate: somewhere between max and sum
        # app_duration_sec = max(driver_wall_clock_sec, estimated_executor_sec) + overlap_weight * min(driver_wall_clock_sec, estimated_executor_sec)

        app_duration_sec = driver_wall_clock_sec + estimated_executor_sec
        # Adjust app duration with driver-executor mix
        # app_duration_sec = driver_ratio * driver_wall_clock_sec + (1 - driver_ratio) * estimated_executor_sec + driver_wall_clock_sec


        predictions.append({
            "Executor Count": new_executors,
            "Executor Multiplier": f"{int(multiplier * 100)}%",
            "Estimated Executor WallClock": f"{int(estimated_executor_sec // 60)}m {int(estimated_executor_sec % 60)}s",
            "Estimated Total Duration": f"{int(app_duration_sec // 60)}m {int(app_duration_sec % 60)}s",
        })

    # print(predictions)

    schema = StructType([
    StructField("Executor_Count", IntegerType(), False),
    StructField("Executor_Multiplier", DoubleType(), False),
    StructField("Estimated_Executor_WallClock", StringType(), False),
    StructField("Estimated_Total_Duration", StringType(), False),
])

    # print("predictions table")

    # df = spark.createDataFrame(predictions, schema=schema)

    #     # --- Show the DataFrame ---
    # df.show(truncate=False)

    predictions_df = pd.DataFrame(predictions)
    predictions_df["app_id"] = app_id

    # spark_predictions_df = spark.createDataFrame(predictions_df, schema=schema)

    # display(pd.DataFrame(predictions))

    return predictions_df



def generate_recommendations(app_id,app_duration_sec, driver_wall_clock_sec, executor_wall_clock_sec, metadata_df, task_df):
    recs = []

    driver_pct = 100 * driver_wall_clock_sec / app_duration_sec
    executor_pct = 100 * executor_wall_clock_sec / app_duration_sec

    if driver_pct > 70:
        recs.append("This Spark job is driver-heavy (driver time > 70%). Consider parallelizing more operations to offload work to executors.")

    if "spark.native.enabled" in metadata_df.columns:
        nee_enabled = metadata_df.select("`spark.native.enabled`").first()[0]
        if nee_enabled in [False, "false"] and executor_pct > 50:
            recs.append("Native Execution Engine (NEE) is disabled, but executors are doing significant work. Enable NEE for performance gains without added cost.")

    if driver_pct > 99:
        recs.append("This appears to be Python-native code running entirely on the driver. Run on Fabric Python kernel or refactor into Spark code for better parallelism.")

    if "spark.synapse.session.tag.HIGH_CONCURRENCY_SESSION_TAG" in metadata_df.columns and "artifactType" in metadata_df.columns:
        hc_enabled = metadata_df.select("spark.synapse.session.tag.HIGH_CONCURRENCY_SESSION_TAG").first()[0]
        artifact_type = metadata_df.select("artifactType").first()[0] if driver_pct < 98 else None
        if hc_enabled in [False, "false", None] and artifact_type == "SynapseNotebook":
            recs.append("High Concurrency is disabled for Fabric Notebook. Consider enabling High Concurrency mode to pack more notebooks into fewer sessions and save costs.")

    rec_rows = [Row(app_id=app_id, recommendation=rec) for rec in recs]

    # If no recommendations, return a default "No issues found"
    if not rec_rows:
        rec_rows = [Row(app_id=app_id, recommendation="No performance recommendations found.")]

    # Create DataFrame
    rec_df = spark.createDataFrame(rec_rows)
    # print("recommedations table")
    # rec_df.show(truncate=False)

    return rec_df


def compute_stage_task_summary(event_log_df, metadata_df, app_id):
    task_end_df = event_log_df.filter(col("properties.Event") == "SparkListenerTaskEnd").withColumn("applicationID", lit(app_id))

    tasks_df = task_end_df.select(
        col("properties.Stage ID").alias("stage_id"),
        col("properties.Stage Attempt ID").alias("stage_attempt_id"),
        col("properties.Task Info.Task ID").alias("task_id"),
        col("properties.Task Info.Executor ID").alias("executor_id"),
        col("properties.Task Info.Launch Time").alias("launch_time"),
        col("properties.Task Info.Finish Time").alias("finish_time"),
        col("properties.Task Info.Failed").alias("failed"),
        (col("properties.Task Metrics.Executor Run Time") / 1000).alias("duration_sec"),
        (col("properties.Task Metrics.Input Metrics.Bytes Read") / 1024 / 1024).alias("input_mb"),
        col("properties.Task Metrics.Input Metrics.Records Read").alias("input_records"),
        (col("properties.Task Metrics.Shuffle Read Metrics.Remote Bytes Read") / 1024 / 1024).alias("shuffle_read_mb"),
        col("properties.Task Metrics.Shuffle Read Metrics.Total Records Read").alias("shuffle_read_records"),
        (col("properties.Task Metrics.Shuffle Write Metrics.Shuffle Bytes Written") / 1024 / 1024).alias("shuffle_write_mb"),
        col("properties.Task Metrics.Shuffle Write Metrics.Shuffle Records Written").alias("shuffle_write_records"),
        (col("properties.Task Metrics.Output Metrics.Bytes Written") / 1024 / 1024).alias("output_mb"),
        col("properties.Task Metrics.Output Metrics.Records Written").alias("output_records")
    ).filter(col("failed") == False)

    stage_duration_df = tasks_df.groupBy("stage_id", "stage_attempt_id").agg(
        spark_min("launch_time").alias("min_launch_time"),
        spark_max("finish_time").alias("max_finish_time"),
        countDistinct("executor_id").alias("num_executors")
    ).withColumn(
        "stage_execution_time_sec", expr("(max_finish_time - min_launch_time) / 1000")
    )

    stage_summary_df = tasks_df.groupBy("stage_id", "stage_attempt_id").agg(
        count("task_id").alias("num_tasks"),
        count(expr("CASE WHEN failed = false THEN 1 END")).alias("successful_tasks"),
        count(expr("CASE WHEN failed = true THEN 1 END")).alias("failed_tasks"),

        spark_min("duration_sec").alias("min_duration_sec"),
        spark_max("duration_sec").alias("max_duration_sec"),
        avg("duration_sec").alias("avg_duration_sec"),
        percentile_approx("duration_sec", 0.75).alias("p75_duration_sec"),

        avg("shuffle_read_mb").alias("avg_shuffle_read_mb"),
        spark_max("shuffle_read_mb").alias("max_shuffle_read_mb"),
        avg("shuffle_read_records").alias("avg_shuffle_read_records"),
        spark_max("shuffle_read_records").alias("max_shuffle_read_records"),

        avg("shuffle_write_mb").alias("avg_shuffle_write_mb"),
        spark_max("shuffle_write_mb").alias("max_shuffle_write_mb"),
        avg("shuffle_write_records").alias("avg_shuffle_write_records"),
        spark_max("shuffle_write_records").alias("max_shuffle_write_records"),

        avg("input_mb").alias("avg_input_mb"),
        spark_max("input_mb").alias("max_input_mb"),
        avg("input_records").alias("avg_input_records"),
        spark_max("input_records").alias("max_input_records"),

        avg("output_mb").alias("avg_output_mb"),
        spark_max("output_mb").alias("max_output_mb"),
        avg("output_records").alias("avg_output_records"),
        spark_max("output_records").alias("max_output_records")
    )

    final_summary_df = stage_summary_df.join(
        stage_duration_df, on=["stage_id", "stage_attempt_id"], how="left"
    ).orderBy(col("stage_execution_time_sec").desc()).limit(5)

    final_summary_df = final_summary_df.withColumn("app_id", lit(app_id))

    app_duration_sec = compute_application_runtime(event_log_df)
    executor_wall_clock_sec = compute_executor_wall_clock_time(event_log_df)
    driver_wall_clock_sec = app_duration_sec - executor_wall_clock_sec
    max_executors = tasks_df.select("executor_id").distinct().count()

    # print(f"Application Duration: {app_duration_sec:.2f} sec")
    # print(f"Executor Wall Clock Time (non-overlapping): {executor_wall_clock_sec:.2f} sec")
    # print(f"Driver Wall Clock Time (estimated): {driver_wall_clock_sec:.2f} sec")
    # print(f"Executor Time % of App Time: {100 * executor_wall_clock_sec / app_duration_sec:.2f}%")
    # print(f"Driver Time % of App Time: {100 * driver_wall_clock_sec / app_duration_sec:.2f}%")
    # print(f"Maximum Number of Executors Ran: {max_executors}")

    per_stage_max_df = tasks_df.groupBy("stage_id").agg(spark_max("duration_sec").alias("max_task_time_sec"))
    critical_path_row = per_stage_max_df.agg(spark_sum("max_task_time_sec").alias("critical_path_time_sec")).first()
    critical_path_sec = critical_path_row["critical_path_time_sec"]

    task_df = tasks_df.withColumn("executor_run_time_ms", col("duration_sec") * 1000)

    schema = StructType([
    StructField("Executor Count", IntegerType(), True),
    StructField("Executor Multiplier", StringType(), True),
    StructField("Estimated Executor WallClock", StringType(), True),
    StructField("Estimated Total Duration", StringType(), True)
    ])

    empty_df = spark.createDataFrame([], schema)

    if critical_path_sec:
        # print(f"Critical Path Time: {critical_path_sec:.2f} sec")
        predictions_df=estimate_runtime_scaling(app_id,task_df, executor_wall_clock_sec, driver_wall_clock_sec, max_executors, critical_path_sec)
    else:
        predictions_df=empty_df
        print("Critical Path could not be computed.")

    

    # Prepare metrics list
    metrics = [
        ("Application Duration (sec)", round(app_duration_sec, 2)),
        ("Executor Wall Clock Time (sec)", round(executor_wall_clock_sec, 2)),
        ("Driver Wall Clock Time (sec)", round(driver_wall_clock_sec, 2)),
        ("Executor Time % of App Time", round(100 * executor_wall_clock_sec / app_duration_sec, 2)),
        ("Driver Time % of App Time", round(100 * driver_wall_clock_sec / app_duration_sec, 2)),
        ("Max Executors", max_executors),
        # ("Critical Path Time (sec)", round(critical_path_sec, 2))
    ]

    # Convert metrics to rows with app_id
    metrics_rows = [Row(app_id=app_id, metric=key, value=float(value)) for key, value in metrics]

    # Define schema explicitly for the metrics DataFrame
    schema = StructType([
        StructField("app_id", StringType(), False),
        StructField("metric", StringType(), False),
        StructField("value", DoubleType(), False)
    ])

    # Create DataFrame
    metrics_df = spark.createDataFrame(metrics_rows, schema=schema)

    # # Show the DataFrame
    # display(metrics_df)

    recommendations_df=generate_recommendations(app_id,app_duration_sec, driver_wall_clock_sec, executor_wall_clock_sec, metadata_df, task_df)

    return final_summary_df, metrics_df, predictions_df, recommendations_df

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# # Eventhouse Source

# CELL ********************

from pyspark.sql import SparkSession, Row
from pyspark.sql.functions import col, from_json, lit, length
import logging
from pyspark.sql import functions as F


# === Configuration ===
# kustoQuery = "['ingestionTable']"
kustoQuery = """
RawLogs
"""

applicationIDs = """
sparklens_metadata
| project applicationId
| distinct applicationId
"""
# The query URI for reading the data e.g. https://<>.kusto.data.microsoft.com.
#kustoUri = "https://trd-ektwgkvj37tkhsvrky.z4.kusto.fabric.microsoft.com"
# The database with data to be read.

# The access credentials.
accessToken = mssparkutils.credentials.getToken(kustoUri)
kustoDf  = spark.read\
    .format("com.microsoft.kusto.spark.synapse.datasource")\
    .option("accessToken", accessToken)\
    .option("kustoCluster", kustoUri)\
    .option("kustoDatabase", database)\
    .option("kustoQuery", kustoQuery).load()

# Try to load previously processed application IDs
try:
    applicationIDs = spark.read\
        .format("com.microsoft.kusto.spark.synapse.datasource")\
        .option("accessToken", accessToken)\
        .option("kustoCluster", kustoUri)\
        .option("kustoDatabase", database)\
        .option("kustoQuery", applicationIDs).load()
    print("Successfully loaded applicationIDs.")
except Exception as e:
    print("Warning: Failed to load applicationIDs from sparklens_metadata table. Check if it exists.")
    applicationIDs = spark.createDataFrame([], StructType([]))


kustoDf.cache()
applicationIDs.cache()

filtered_df = kustoDf.filter(get_json_object(col("records"), "$.category") == "EventLog")

sample_json_df = filtered_df.select("records").limit(1000)  # you can adjust the sample size
json_rdd = sample_json_df.rdd.map(lambda r: r[0])
inferred_schema = spark.read.json(json_rdd).schema
print("📘 Inferred schema:")
print(inferred_schema.simpleString())
parsed_df = kustoDf.withColumn("records_parsed", F.from_json(F.col("records"), inferred_schema))
flattened_df = parsed_df.select("*", "records_parsed.*").drop("records_parsed")
filtered_df=flattened_df

metadata_df = []
summary_dfs = []
metrics_df = []
predictions_df =[]
recommendations_df = []


# Filter out application IDs that have already been processed (if any)
if not applicationIDs.rdd.isEmpty():
    existing_ids = [row["applicationId"] for row in applicationIDs.select("applicationId").distinct().collect()]
    if existing_ids:
        filtered_df = filtered_df.filter(~col("applicationId").isin(existing_ids))

# Final check if anything to process
if filtered_df.rdd.isEmpty():
    print("No new records to process in this run")
else:
    # Optionally show a few rows to verify
    filtered_df.count()

    # === 2.1 Infer Schema from Properties ===
    json_rdd = (
        filtered_df
        .filter(col("properties").isNotNull())
        .selectExpr("CAST(properties AS STRING) as json_str")
        .rdd
        .map(lambda row: row["json_str"])
    )

    sample_df = spark.read.json(json_rdd)

    # sample_df.show()

    sample_schema = sample_df.schema

    event_log_df = filtered_df

    # === 3. Extract Metadata ===
    def extract_app_metadata(df):
        native_enabled_df = df.selectExpr("properties.`Spark Properties`.`spark.native.enabled` AS spark_native_enabled") \
                            .filter(col("spark_native_enabled").isNotNull()) \
                            .distinct() \
                            .limit(1)

        native_enabled = native_enabled_df.collect()[0]["spark_native_enabled"] if not native_enabled_df.rdd.isEmpty() else None

        return df.select(
            "applicationId", "applicationName", "artifactId", "artifactType", "capacityId",
            "executorMax", "executorMin", "fabricEnvId", "fabricLivyId", "fabricTenantId",
            "fabricWorkspaceId", "isHighConcurrencyEnabled"
        ).distinct().withColumn("spark.native.enabled", lit(native_enabled))

    metadata_df = extract_app_metadata(filtered_df)
    # metadata_df.show(truncate=False)

    # === 4. Process Each Application ID ===
    app_ids = metadata_df.select("applicationId").distinct().rdd.flatMap(lambda x: x).collect()

    print(f"Found {len(app_ids)} applications.")

    i=0

    for app_id in app_ids:
        accessToken = mssparkutils.credentials.getToken(kustoUri)
        i += 1
        print(f"Processing application ID: {app_id}, application number: {i}")

        filtered_event_log_df = event_log_df.filter(col("applicationId") == app_id)
        filtered_metadata_df = metadata_df.filter(col("applicationId") == app_id)

        start_events = filtered_event_log_df \
            .filter(col("properties.Event") == "SparkListenerApplicationStart") \
            .select("properties.Timestamp") \
            .limit(1) \
            .collect()

        if not start_events:
            logging.warning(f"Missing SparkListenerApplicationStart event for {app_id}")
            schema = StructType([
                StructField("applicationID", StringType(), True),
                StructField("error", StringType(), True),
            ])
            error_row = {"applicationID": app_id, "error": "Missing SparkListenerApplicationStart event"}
            summary_dfs.append(spark.createDataFrame([error_row], schema=schema))
            continue

        try:
            print("Starting summary")
            app_summary_df_list = compute_stage_task_summary(filtered_event_log_df, filtered_metadata_df, app_id)
            print("writing results to EventHouse")
            filtered_metadata_df.write \
                .format("com.microsoft.kusto.spark.synapse.datasource") \
                .option("accessToken", accessToken) \
                .option("kustoCluster", kustoUri)\
                .option("kustoDatabase", database)\
                .option("kustoTable", "sparklens_metadata") \
                .option("tableCreateOptions", "CreateIfNotExist") \
                .mode("Append") \
                .save()

            app_summary_df_list[0].write \
                .format("com.microsoft.kusto.spark.synapse.datasource") \
                .option("accessToken", accessToken) \
                .option("kustoCluster", kustoUri)\
                .option("kustoDatabase", database)\
                .option("kustoTable", "sparklens_summary") \
                .option("tableCreateOptions", "CreateIfNotExist") \
                .mode("Append") \
                .save()

            app_summary_df_list[1].write \
                .format("com.microsoft.kusto.spark.synapse.datasource") \
                .option("accessToken", accessToken) \
                .option("kustoCluster", kustoUri)\
                .option("kustoDatabase", database)\
                .option("kustoTable", "sparklens_metrics") \
                .option("tableCreateOptions", "CreateIfNotExist") \
                .mode("Append") \
                .save()

            spark.createDataFrame(app_summary_df_list[2]).write \
                .format("com.microsoft.kusto.spark.synapse.datasource") \
                .option("accessToken", accessToken) \
                .option("kustoCluster", kustoUri)\
                .option("kustoDatabase", database)\
                .option("kustoTable", "sparklens_predictions") \
                .option("tableCreateOptions", "CreateIfNotExist") \
                .mode("Append") \
                .save()

            app_summary_df_list[3].write \
                .format("com.microsoft.kusto.spark.synapse.datasource") \
                .option("accessToken", accessToken) \
                .option("kustoCluster", kustoUri)\
                .option("kustoDatabase", database)\
                .option("kustoTable", "sparklens_recommedations") \
                .option("tableCreateOptions", "CreateIfNotExist") \
                .mode("Append") \
                .save()

        except Exception as e:
            print(f"Error processing application {app_id}: {str(e)}")
            schema = StructType([
                StructField("applicationID", StringType(), True),
                StructField("error", StringType(), True),
            ])
            error_row = {"applicationID": app_id, "error": str(e)}
            error_df=spark.createDataFrame([error_row], schema=schema)
            #summary_dfs.append(spark.createDataFrame([error_row], schema=schema))
            error_df.write \
                .format("com.microsoft.kusto.spark.synapse.datasource") \
                .option("accessToken", accessToken) \
                .option("kustoCluster", kustoUri)\
                .option("kustoDatabase", database)\
                .option("kustoTable", "sparklens_errors") \
                .option("tableCreateOptions", "CreateIfNotExist") \
                .mode("Append") \
                .save()


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }