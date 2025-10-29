# ⚡ SparkMonitoring RTI Accelerator

A project designed to accelerate the deployment and experience of the Spark Monitoring solution in Microsoft Fabric. It provides a visual overview of cluster health, resource constraints, and enables comparison between two Spark applications.

---

## 📋 Description

This accelerator provisions a workspace pre-configured with all necessary resources and settings to monitor Spark workloads in Fabric. It helps users:

- View cluster health and performance metrics
- Identify resource bottlenecks
- Compare two Spark applications side-by-side

---

## 📦 Installation

1. **Sync the `Config` folder** via Git repo using the **Microsoft Fabric UI**. (or alternatively just download the .ipynb file)
2. Open the notebook and **update the settings at the top**.
3. Run the notebook Platform_Monitoring_Setup.Notebook

Once executed, this will:

- Create a workspace with the required resources
- Attach the necessary properties to the environments that you choose.

---

## ⚠️ Manual Steps

After running the notebook, complete the following **manual configuration steps**:

1. Update the **connection config** in the **Semantic Model** to point to your Eventhouse.
2. Publish the **Environments** settings to ensure configuration values are applied correctly.
3. Please be aware that when using spark starter pools you need to add the following config: spark.fabric.pools.skipStarterPools: "true"
4. Setup the trigger on the sparkLens Pipeline
---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

- Make your changes to the relevant artifact(s)
- Update `deployment_order1.json` with any new IDs for proper dependency resolution
- Submit a pull request for review

---

## 📷 Screenshots

### Home Dashboard
![image](https://github.com/user-attachments/assets/85c352c0-987c-4f82-8f03-777ffb6e3b8b)


### SparkLens / Recommendations
![image](https://github.com/user-attachments/assets/01072561-a488-4b97-bb17-cd13a56ea3a2)


### Stages
![image](https://github.com/user-attachments/assets/b017c244-c104-4321-8503-cfdabd1dcd62)

### NEE
![image](https://github.com/user-attachments/assets/cc8edb52-19de-472b-9db6-a7cbb4c59590)

### Application Comparator
![image](https://github.com/user-attachments/assets/223c9976-1963-4039-95d7-5b478aef6be1)

![image](https://github.com/user-attachments/assets/c4add4a3-81d1-4976-949e-bbc6ce2b63df)


---


