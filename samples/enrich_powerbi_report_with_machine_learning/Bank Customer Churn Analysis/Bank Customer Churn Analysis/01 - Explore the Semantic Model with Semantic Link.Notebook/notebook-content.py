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

# CELL ********************

# Semantic Link uses your Fabric identity — no separate credential handling.
import sempy.fabric as fabric

# Discover semantic models (datasets) you can access
df_datasets = fabric.list_datasets()
display(df_datasets)

# Inspect tables in a specific semantic model
dataset_name = "Bank Customer Churn Analysis"
df_tables = fabric.list_tables(dataset_name)
display(df_tables)

# Inspect columns and metadata (useful for feature planning)
df_columns = fabric.list_columns(dataset_name)
display(df_columns)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Measures are the business logic. Keeping them centralized prevents drift.
df_measures = fabric.list_measures(dataset_name)
display(df_measures)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Pull governed data from the semantic model.
# This keeps your ML features aligned with what Power BI shows.
df_raw = fabric.read_table(dataset=dataset_name, table="churn")
display(df_raw)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Data exploration

# CELL ********************

import seaborn as sns
sns.set_theme(style="whitegrid", palette="tab10", rc = {'figure.figsize':(9,6)})
import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
from matplotlib import rc, rcParams
import numpy as np
import pandas as pd
import itertools

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

def clean_data(df):
    # Drop rows with missing data across all columns
    df = df.dropna()
    # Drop duplicate rows in columns: 'CustomerId', 'RowNumber'
    df = df.drop_duplicates(subset=['CustomerId', 'RowNumber'])
    # Drop columns: 'RowNumber', 'Surname'
    df = df.drop(columns=['RowNumber', 'Surname'])
    return df

df_clean = clean_data(df_raw.copy())
df_clean.head()

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Determine the dependent (target) attribute
dependent_variable_name = "Exited"
print(dependent_variable_name)
# Determine the categorical attributes
categorical_variables = [col for col in df_clean.columns if col in "O"
                        or df_clean[col].nunique() <=5
                        and col not in "Exited"]
print(categorical_variables)
# Determine the numerical attributes
numeric_variables = [col for col in df_clean.columns if df_clean[col].dtype != "object"
                        and df_clean[col].nunique() >5 and col not in "CustomerId"]
print(numeric_variables)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

df_num_cols = df_raw[numeric_variables]
sns.set(font_scale = 0.7) 
fig, axes = plt.subplots(nrows = 2, ncols = 3, gridspec_kw =  dict(hspace=0.3), figsize = (17,8))
fig.tight_layout()
for ax,col in zip(axes.flatten(), df_num_cols.columns):
    sns.boxplot(x = df_num_cols[col], color='green', ax = ax)
fig.delaxes(axes[1,2])


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

df_raw['Exited'] = df_raw['Exited'].astype(str)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

attr_list = ['Geography', 'Gender', 'HasCrCard', 'IsActiveMember', 'NumOfProducts', 'Tenure']
df_raw['Exited'] = df_raw['Exited'].astype(str)
fig, axarr = plt.subplots(2, 3, figsize=(15, 4))
for ind, item in enumerate (attr_list):
    print(ind, item)
    sns.countplot(x = item, hue = 'Exited', data = df_raw, ax = axarr[ind%2][ind//2])
fig.subplots_adjust(hspace=0.7)


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

columns = df_num_cols.columns[: len(df_num_cols.columns)]
fig = plt.figure()
fig.set_size_inches(18, 8)
length = len(columns)
for i,j in itertools.zip_longest(columns, range(length)):
    plt.subplot((length // 2), 3, j+1)
    plt.subplots_adjust(wspace = 0.2, hspace = 0.5)
    df_num_cols[i].hist(bins = 20, edgecolor = 'black')
    plt.title(i)
plt.show()


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Feature engieering

# CELL ********************

df_clean['Tenure'] = df_clean['Tenure'].astype(int)
df_clean["NewTenure"] = df_clean["Tenure"]/df_clean["Age"]
df_clean["NewCreditsScore"] = pd.qcut(df_clean['CreditScore'], 6, labels = [1, 2, 3, 4, 5, 6])
df_clean["NewAgeScore"] = pd.qcut(df_clean['Age'], 8, labels = [1, 2, 3, 4, 5, 6, 7, 8])
df_clean["NewBalanceScore"] = pd.qcut(df_clean['Balance'].rank(method="first"), 5, labels = [1, 2, 3, 4, 5])
df_clean["NewEstSalaryScore"] = pd.qcut(df_clean['EstimatedSalary'], 10, labels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

import pandas as pd
 
def clean_data(df_clean):
    # One-hot encode columns: 'Geography', 'Gender'
    df_clean = pd.get_dummies(df_clean, columns=['Geography', 'Gender'])
    return df_clean
 
df_clean_1 = clean_data(df_clean.copy())
df_clean_1.head()


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

table_name = "df_clean"
# Create Spark DataFrame from pandas
sparkDF=spark.createDataFrame(df_clean_1) 
sparkDF.write.mode("overwrite").option("overwriteSchema", "true").format("delta").save(f"Tables/{table_name}")
print(f"Spark dataframe saved to delta table: {table_name}")


# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
