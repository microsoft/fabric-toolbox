# ⚡ Fabric Spark Monitoring

A project designed to accelerate the deployment and experience of the Spark Monitoring solution in Microsoft Fabric. It provides a visual overview of cluster health, resource constraints, and enables comparison between two Spark applications.

---

> [!CAUTION]  
> The SparkMonitoring solution accelerator is not an official Microsoft product! It is a solution accelerator, which can help you implement a monitoring solution within Fabric. As such there is no offical support available and there is a risk that things might break. 

> [!CAUTION]  
> This solution does not work with spark starter pools as it is not possible to configure the emitters on those. As part of the setup configuration we add the spark property spark.fabric.pools.skipStarterPools - true.

---

## 📋 Description

This accelerator provisions a workspace pre-configured with all necessary resources and settings to monitor Spark workloads in Fabric. It helps users:

- View cluster health and performance metrics
- Identify resource bottlenecks like memory, CPU, Shuffling, Spilling etc.
- Compare two Spark applications side-by-side in terms of resource allocation

Please be aware that we added a few visuals from the KQL dashboard perspective but there is nothing preventing you from developing your own reports of top of the data that is available in the eventhouse.

---

## 📦 Installation

1. Download the setup notebook which is located under setup/Spark Monitoring Setup.ipynb
2. Open the notebook and **update the settings at the top - please add the environments that you want the emitters configuration to be applied**
3. Run the notebook Platform_Monitoring_Setup.Notebook
   
Once executed, this will:

- Create a workspace with the required resources
- Attach the necessary properties to the environments that you choose.

---

## ⚠️ Manual Steps

After running the notebook, complete the following **manual configuration steps**:

1. Setup the trigger on the sparkLens Pipeline on the most appropriate timing for your use-case
---

## 📐 Architecture

<img width="1057" height="552" alt="image" src="https://github.com/user-attachments/assets/83d566b6-6539-4bc2-8359-1e626686b1ec" />

The architecture is composed by:

1. Spark configurations that are added to the environments and that start emitting data to a newly created eventhouse.
2. Eventhouse outputs data as it comes to an eventhouse
3. Eventhouse has update policies which divide the logs into more granular tables
4. KQL dashboard reads from the eventhouse and presents the data.

---

##🖼️📸💻✨Screenshots:

1.Application meters (Memory, CPU, Shuffling, Spilling)

<img width="1757" height="553" alt="image" src="https://github.com/user-attachments/assets/0f1f3599-4525-494e-8bff-e32622212afc" />

2.Side by Side application comparison

<img width="1857" height="855" alt="image" src="https://github.com/user-attachments/assets/6481a9f5-edec-4ff8-b0b2-b3c1111be1d1" />

3.SparkLens optimizations/Reccomendations

<img width="1827" height="722" alt="image" src="https://github.com/user-attachments/assets/22f2ca35-9c82-4130-a0f9-6a5aaa1e03ae" />

---

## 🤝 Contributing

We welcome contributions! Please follow these guidelines:

- Make your changes to the relevant artifact(s)
- Update `deployment_order1.json` with any new IDs for proper dependency resolution
- Submit a pull request for review
---


