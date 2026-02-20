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

# # Batch Scoring on Active Customers 

# CELL ********************

# Load the active users
active_users = spark.read.format("delta").load("Tables/active") 
display(active_users) 


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql import functions as F 
from pyspark.sql.window import Window 

# Start with Spark DataFrame 
df = active_users.drop("RowNumber", "Surname") 

# Tenure as integer 
df = df.withColumn("Tenure", F.col("Tenure").cast("int")) 

# NewTenure = Tenure / Age 
df = df.withColumn("NewTenure", F.col("Tenure") / F.col("Age")) 

# CreditScore qcut into 6 bins 
credit_window = Window.orderBy("CreditScore") 
df = df.withColumn("CreditIdx", F.row_number().over(credit_window)) 
credit_count = df.count() 
df = df.withColumn("NewCreditsScore", F.ceil(F.lit(6) * F.col("CreditIdx") / F.lit(credit_count))) 

# Age qcut into 8 bins 
age_window = Window.orderBy("Age") 
df = df.withColumn("AgeIdx", F.row_number().over(age_window)) 
age_count = df.count() 
df = df.withColumn("NewAgeScore", F.ceil(F.lit(8) * F.col("AgeIdx") / F.lit(age_count))) 

# Balance qcut with rank(method="first") into 5 bins 
balance_window = Window.orderBy("Balance") 
df = df.withColumn("BalanceRank", F.row_number().over(balance_window)) 
balance_count = df.count() 
df = df.withColumn("NewBalanceScore", F.ceil(F.lit(5) * F.col("BalanceRank") / F.lit(balance_count))) 

# EstimatedSalary qcut into 10 bins 
salary_window = Window.orderBy("EstimatedSalary") 
df = df.withColumn("SalaryIdx", F.row_number().over(salary_window)) 
salary_count = df.count() 
df = df.withColumn("NewEstSalaryScore", F.ceil(F.lit(10) * F.col("SalaryIdx") / F.lit(salary_count))) 

# Cleanup temporary columns 
df_clean = df.drop("CreditIdx","AgeIdx","BalanceRank","SalaryIdx") 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql import functions as F 

def clean_data_spark(df): 
    df = (
        df 
        # One-hot Geography 
        .withColumn("Geography_France", F.when(F.col("Geography") == "France", 1).otherwise(0))
        .withColumn("Geography_Germany", F.when(F.col("Geography") == "Germany", 1).otherwise(0))
        .withColumn("Geography_Spain", F.when(F.col("Geography") == "Spain", 1).otherwise(0)) 
        
        # One-hot Gender 
        .withColumn("Gender_Male", F.when(F.col("Gender") == "Male", 1).otherwise(0)) 
        .withColumn("Gender_Female", F.when(F.col("Gender") == "Female", 1).otherwise(0)) 
        
        # Drop original categorical columns 
        .drop("Geography", "Gender") 
        ) 
    return df 
 
df_clean_1 = clean_data_spark(df_clean)
display(df_clean_1) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from synapse.ml.predict import MLFlowTransformer

model = MLFlowTransformer(
    inputCols=list(df_clean_1.columns), 
    outputCol='predictions', 
    modelName='lgbm_sm_non_tensor', 
    modelVersion=1 
) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

import pandas 
from pyspark.sql.functions import col 

predictions = model.transform(df_clean_1) 

predictions = predictions.select( 
     "*", 
     col("predictions.prediction").alias("prediction"), 
     col("predictions.probability").alias("probability") 
).drop("predictions") 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

display(predictions)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.ml.feature import SQLTransformer  
# Substitute "model_name", "model_version", and "features" below with values for your own model name, model version, and feature columns 

model_name = 'lgbm_sm_non_tensor' 
model_version = 1
features = df_clean_1.columns 

sqlt = SQLTransformer().setStatement( f"SELECT PREDICT('{model_name}/{model_version}', {','.join(features)}) as predictions FROM __THIS__") 

# Substitute "X_test" below with your own test dataset 
display(sqlt.transform(df_clean_1)) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

from pyspark.sql.functions import col, pandas_udf, udf, lit 

# Substitute "model" and "features" below with values for your own model name and feature columns 
my_udf = model.to_udf() 
features = df_clean_1.columns 

display(df_clean_1.withColumn("predictions", my_udf(*[col(f) for f in features]))) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Save predictions to lakehouse to be used for generating a Power BI report 

table_name = "active_predictions" 
predictions.write.format('delta').mode("overwrite").save(f"Tables/{table_name}") 
print(f"Spark DataFrame saved to delta table: {table_name}") 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
