# DAX Performance Testing

## Summary

This notebook is designed to measure DAX query timings under different cache states (cold, warm, and hot).

## Requirements

1. **DAX Queries from Excel**  
   - You must provide an Excel file containing the DAX queries in a table you wish to test.  
   - For each query, a column needs align with the `runQueryType` used for a given `queryId`.  
   - This notebook reads those queries and executes them on one or more Power BI/Fabric models.

1. **Lakehouse Logging**  
   - You also must attach the appropriate Lakehouse in Fabric so that logs can be saved (both in a table and as files if you choose).  

1. **Capacity Pause/Resume**  
   - In some scenarios (e.g., simulating a "cold" cache on DirectQuery or Import models), the code pauses and resumes capacities.  
   - **Warning**: Pausing a capacity will interrupt any running workloads on that capacity. Resuming will take time and resources, and can affect other workspaces assigned to the same capacity.

## Key Features

1. **Model Definitions**
    - The definitions for models to be tested are stored in a dictionary, specifying storage mode, workspace, and cache states to test.
1. **Query Input**
    - Queries are pulled from an Excel file in your Lakehouse. Each query needs an ID and at least one column that matches the runQueryType in the model definition.
1. **Different Cache States**
    - **Cold Cache**: Clears all cache. For Import/Direct Query, this involves pausing capacity, reassigning workspaces, and clearing VertiPaq cache. For DirectLake, it triggers a dataset clearValues refresh and then a full refresh. For Direct Query, the way cold-cache is set assumes that your data store is in a Fabric workspace, e.g., Lakehouse, Warehouse, etc.
    - **Warm Cache**: Partial caching. For Direct Query, we set cold-cache first, then run a query to “prime” the model. For Import and Direct Lake, we ensure all columns are framed by running the target query, then we clear the Vertipaq cache.
    - **Hot Cache**: Runs the target query before measuring the second time to ensure columns are framed and all caches are set. The Vertipaq cache is not cleared.
1. **Capacity Pause/Resume**
    - **Warning**: Pausing a capacity will interrupt any running workloads on that capacity. Resuming will take time and resources, and can affect other workspaces assigned to the same capacity.
    - For cold-cache queries on Import and DirectQuery models, the notebook pauses and resumes capacities to ensure truly cold-cache testing. Configure your workspace capacities in the config cell if using this feature.
1. **Logging to Lakehouse**
    - Query logs are captured using an Analysis Services trace and stored in your attached Lakehouse. This includes duration, CPU time, and success/failure status.

## Why Use This Notebook?

1. **Consistent Testing**: Automates cache clearing and capacity pausing for reliable comparisons.
1. **Scalable**: Run as many queries as you want, any number of times as needed against your models and track each attempt.
1. **Centralized Logs**: All results are stored in a Lakehouse for easy analysis.
1. Versatility: Some use cases include: testing different DAX measure versions, comparing the impact of model changes on DAX performance, comparing performance across storage modes, etc.

## Getting Started

1. Download the notebook from GitHub and upload to a Fabric workspace.

![dpt-upload-notebook](media/dpt-upload-notebook.png)

2. Attach a Lakehouse that will be used to save the logs and host the query list.

![dpt-attach-lakehouse](media/dpt-attach-lakehouse.png)

3. Add an Excel file with your query list to the Lakehouse. One column must be named “queryId” and there can be as many other columns as you want containing the DAX queries. You will assign one query column to each model. The same column can be used for multiple models. Update the excel file path the with correct file name and worksheet name.

![dpt-excel-dax-example](media/dpt-excel-dax-example.png)
![dpt-upload-dax-queries](media/dpt-upload-dax-queries.png)

4. Update the list of models you want to test.

![dpt-define-test-models](media/dpt-define-test-models.png)

5. Configure the rest of the settings in the config cell. You can leave the capacity settings blank if you are not testing cold-cache from Import and/or Direct Query. There are a lot of options, so read carefully. 🙂

![dpt-configure-additional-args](media/dpt-configure-additional-args.png)

6. Run the notebook and collect the logs. Under the run_dax_queries() cell, you can track along with the testing if you want to understand what is happening.

![dpt-track-run](media/dpt-track-run.png)

7. Analyze the logs saved in your Lakehouse to compare query results across query versions, cache-states, models, etc.

![dpt-query-logs](media/dpt-query-logs.png)
