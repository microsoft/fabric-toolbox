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

# Install imblearn for SMOTE using pip 
%pip install imblearn 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Import the required libraries
import pandas as pd
import numpy as np 

import mlflow
import mlflow.pyfunc 
from mlflow.models.signature import infer_signature

# Import the required libraries for model training 
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, precision_score, confusion_matrix, recall_score, roc_auc_score, classification_report 

from lightgbm import LGBMClassifier 

from collections import Counter 
from imblearn.over_sampling import SMOTE

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Load data
# Prior to training any machine learning model, you need to load the delta table from the Lakehouse to read the cleaned data you created in the previous step. 

# CELL ********************

SEED = 12345 
df_clean = spark.read.format("delta").load("Tables/df_clean").toPandas() 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Build the Churn Prediction Model

# CELL ********************

# Setup experiment name 
EXPERIMENT_NAME = "bank-churn-experiment" 
mlflow.set_experiment(EXPERIMENT_NAME) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

#Split the dataset to 60%, 20%, 20% for training, validation, and test datasets 

y = df_clean["Exited"] 
X = df_clean.drop("Exited",axis=1) 

#Train-Test Separation 
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.20, random_state=SEED) 

#Train-Validation Separation 
X_train, X_val, y_train, y_val = train_test_split(X_train, y_train, test_size=0.25, random_state=SEED) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Save the test data to a delta table 
table_name = "df_test" 
df_test=spark.createDataFrame(X_test) 
df_test.write.mode("overwrite").option("overwriteSchema", "true").format("delta").save(f"Tables/{table_name}") 
print(f"Spark test DataFrame saved to delta table: {table_name}") 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# The data exploration in previous step showed that out of the 10,000 data points corresponding to 10,000 customers, only 2,037 customers (around 20%) have left the bank. This indicates that the dataset is highly imbalanced. The problem with imbalanced classification is that there are too few examples of the minority class for a model to effectively learn the decision boundary. SMOTE is the most widely used approach to synthesize new samples for the minority class. 
# 
# Apply SMOTE to the training data to synthesize new samples for the minority class. 

# CELL ********************

sm = SMOTE(random_state=1234) 
X_res, y_res = sm.fit_resample(X_train, y_train) 
new_train = pd.concat([X_res, y_res], axis=1) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Train a LigthtGBM model
# Train the model using LightGBM and register the trained model as a ML model artifact. 
# 
# At the time this tutorial was written, Fabric Real-Time Scoring Endpoint did not yet support tensor-based models. Therefore, we created a non-tensor-based output schema for the machine learning model. 

# CELL ********************

class Predictor(mlflow.pyfunc.PythonModel): 
    def __init__(self, base_model): 
        self.base_model = base_model
        
    def predict(self, context, model_input: pd.DataFrame) -> pd.DataFrame:
        # prediction 
        pred = self.base_model.predict(model_input) 
        pred = np.asarray(pred, dtype=np.int64) 

        # probability (positive class) 
        proba = self.base_model.predict_proba(model_input) 
        proba = np.asarray(proba[:, 1], dtype=np.float64) 
        
        return pd.DataFrame({
            "prediction": pred, 
            "probability": proba
        }) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

# Define the LightGMB model 
lgbm_sm_model = LGBMClassifier( 
    learning_rate=0.07, 
    max_delta_step=2, 
    n_estimators=100, 
    max_depth=10, 
    eval_metric="logloss", 
    objective='binary', 
    random_state=42
) 

with mlflow.start_run(run_name="lgbm_sm_non_tensor") as run: 
    lgbm_non_tensor_sm_run_id = run.info.run_id 
    
    # Train on balanced data 
    lgbm_sm_model.fit(X_res, y_res.ravel())

    # Validation predictions (convert to pandas for non-tensor signature)
    y_pred = lgbm_sm_model.predict(X_val)

    # Optionally include probability for positive class as a tabular output example for signature
    y_proba = lgbm_sm_model.predict_proba(X_val)[:, 1]
    y_proba_series = pd.Series(y_proba.astype(float), name="probability")

    # Build output example for signature (TWO cols) 
    pred_ex = np.asarray(lgbm_sm_model.predict(X_val), dtype=np.int64) 
    proba_ex = np.asarray(lgbm_sm_model.predict_proba(X_val)[:, 1], dtype=np.float64) 
    y_example = pd.DataFrame({"prediction": pred_ex, "probability": proba_ex}) 
    signature = infer_signature(X_val, y_example) 
    
    # Compute metrics 
    accuracy = accuracy_score(y_val, y_pred)
    cr_lgbm_sm = classification_report(y_val, y_pred)
    cm_lgbm_sm = confusion_matrix(y_val, y_pred) 
    roc_auc_lgbm_sm = roc_auc_score(y_res, lgbm_sm_model.predict_proba(X_res)[:, 1]) 
    
    # Log metrics
    mlflow.log_metric("val_accuracy", accuracy) 
    mlflow.log_metric("train_roc_auc", roc_auc_lgbm_sm) 

    # Classification report 
    mlflow.log_text(cr_lgbm_sm, "classification_report.txt") 
    
    # Confusion matrix
    cm_df = pd.DataFrame( cm_lgbm_sm, index=["Actual_0", "Actual_1"], columns=["Pred_0", "Pred_1"]) 
    mlflow.log_table(cm_df, "confusion_matrix.json") 
    
    # Log model  
    mlflow.pyfunc.log_model( 
        artifact_path="model", 
        python_model=Predictor(lgbm_sm_model), 
        signature=signature, 
        input_example=X_val.head(5), 
        registered_model_name="lgbm_sm_non_tensor" 
        ) 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# MARKDOWN ********************

# ## Validate the model performance

# CELL ********************

import mlflow.pyfunc 

# Fetch the model 
load_model_lgbm1_sm = mlflow.pyfunc.load_model(f"runs:/{lgbm_non_tensor_sm_run_id}/model") 

# Assess the performance of the loaded model on validation dataset 
ypred_lgbm1_sm_v1 = load_model_lgbm1_sm.predict(X_val)

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

import seaborn as sns 
sns.set_theme(style="whitegrid", palette="tab10", rc = {'figure.figsize':(9,6)}) 

import matplotlib.pyplot as plt 
import matplotlib.ticker as mticker 
from matplotlib import rc, rcParams 
import numpy as np 
import itertools 


def plot_confusion_matrix(cm, classes, normalize=False, title='Confusion matrix', cmap=plt.cm.Blues): 
    print(cm) 
    plt.figure(figsize=(4,4)) 
    plt.rcParams.update({'font.size': 10}) 
    plt.imshow(cm, interpolation='nearest', cmap=cmap) 
    plt.title(title) 
    plt.colorbar() 
    tick_marks = np.arange(len(classes)) 
    plt.xticks(tick_marks, classes, rotation=45, color="blue") 
    plt.yticks(tick_marks, classes, color="blue") 
    
    fmt = '.2f' if normalize else 'd' 
    thresh = cm.max() / 2. 
    for i, j in itertools.product(range(cm.shape[0]), range(cm.shape[1])): 
        plt.text(j, i, format(cm[i, j], fmt), horizontalalignment="center", 
        color="red" if cm[i, j] > thresh else "black") 
    
    plt.tight_layout() 
    plt.ylabel('True label') 
    plt.xlabel('Predicted label') 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }

# CELL ********************

cfm = confusion_matrix(y_val, y_pred=ypred_lgbm1_sm_v1["prediction"]) 
plot_confusion_matrix(cfm, classes=['Non Churn','Churn'], title='LightGBM-non-tensor') 
tn, fp, fn, tp = cfm.ravel() 

# METADATA ********************

# META {
# META   "language": "python",
# META   "language_group": "synapse_pyspark"
# META }
