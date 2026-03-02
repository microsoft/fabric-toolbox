# Fabric notebook source

# METADATA ********************

# META {
# META   "kernel_info": {
# META     "name": "synapse_pyspark"
# META   },
# META   "dependencies": {
# META     "lakehouse": {
# META       "default_lakehouse": "d9e46ba2-db50-43b6-b3c0-a95889986de7",
# META       "default_lakehouse_name": "BankCustomerChurnLakehouse",
# META       "default_lakehouse_workspace_id": "f5d4f720-7eb0-4cc1-b70d-e1d912197072",
# META       "known_lakehouses": [
# META         {
# META           "id": "d9e46ba2-db50-43b6-b3c0-a95889986de7"
# META         }
# META       ]
# META     }
# META   }
# META }

# MARKDOWN ********************

# # Load the Churn users

# CELL ********************

df_raw = spark.read.format("csv").option("header","true").load("abfss://f5d4f720-7eb0-4cc1-b70d-e1d912197072@onelake.dfs.fabric.microsoft.com/d9e46ba2-db50-43b6-b3c0-a95889986de7/Files/churn.csv")
# df now is a Spark DataFrame containing CSV data from "abfss://f5d4f720-7eb0-4cc1-b70d-e1d912197072@onelake.dfs.fabric.microsoft.com/d9e46ba2-db50-43b6-b3c0-a95889986de7/Files/churn.csv".
display(df_raw)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql.functions import col

df = (
    df_raw
    .withColumn("RowNumber", col("RowNumber").cast("int"))
    .withColumn("CustomerId", col("CustomerId").cast("long"))
    .withColumn("CreditScore", col("CreditScore").cast("int"))
    .withColumn("Age", col("Age").cast("int"))
    .withColumn("Tenure", col("Tenure").cast("int"))
    .withColumn("Balance", col("Balance").cast("double"))
    .withColumn("NumOfProducts", col("NumOfProducts").cast("int"))
    .withColumn("HasCrCard", col("HasCrCard").cast("int"))
    .withColumn("IsActiveMember", col("IsActiveMember").cast("int"))
    .withColumn("EstimatedSalary", col("EstimatedSalary").cast("double"))
    .withColumn("Exited", col("Exited").cast("int"))
)

display(df)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

delta_table_path = "Tables/churn" #fill in your delta table path 
df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(delta_table_path)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Create a semantic model and add the churn table into the semantic model


# CELL ********************

# Create a semantic model and add the churn table into the semantic model
import matplotlib.pyplot as plt
import matplotlib.image as mpimg
# Load image
image = mpimg.imread("/lakehouse/default/Files/CreateSemanticModel.png")
# Let the axes disappear
plt.axis('off')
# Plot image in the output
image_plot = plt.imshow(image)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# # Load the Active Users


# CELL ********************

df_active = spark.read.format("csv").option("header","true").load("abfss://f5d4f720-7eb0-4cc1-b70d-e1d912197072@onelake.dfs.fabric.microsoft.com/d9e46ba2-db50-43b6-b3c0-a95889986de7/Files/active.csv")
# df now is a Spark DataFrame containing CSV data from "abfss://f5d4f720-7eb0-4cc1-b70d-e1d912197072@onelake.dfs.fabric.microsoft.com/d9e46ba2-db50-43b6-b3c0-a95889986de7/Files/churn.csv".
display(df_active)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql.functions import col

df_active_clean = (
    df_active
    .withColumn("RowNumber", col("RowNumber").cast("int"))
    .withColumn("CustomerId", col("CustomerId").cast("long"))
    .withColumn("CreditScore", col("CreditScore").cast("int"))
    .withColumn("Age", col("Age").cast("int"))
    .withColumn("Tenure", col("Tenure").cast("int"))
    .withColumn("Balance", col("Balance").cast("double"))
    .withColumn("NumOfProducts", col("NumOfProducts").cast("int"))
    .withColumn("HasCrCard", col("HasCrCard").cast("int"))
    .withColumn("IsActiveMember", col("IsActiveMember").cast("int"))
    .withColumn("EstimatedSalary", col("EstimatedSalary").cast("double"))
)

display(df_active_clean)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

delta_table_path = "Tables/active" #fill in your delta table path 
df_active_clean.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(delta_table_path)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
