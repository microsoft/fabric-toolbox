# Fabric Unified Admin Monitoring (FUAM)

Solution accelerator for Fabric platform administrator monitoring.

![image](./media/general/fuam_cover.png)

## Introduction

Fabric Unfied Admin Monitoring (short: FUAM) is a solution to enable a holistic monitoring on top of Power BI and Fabric. Today monitoring for Fabric can be done through different reports, apps and tools. 


FUAM has the goal to provide a more holistic view on top of the various information, which can be extracted from Fabric, allowing it's users to analyze at a very high level, but also to deep dive into specific artifacts for a more fine granular data analysis.


![image](./media/general/fuam_monitoring_map_cover.png)


FUAM is completely build with Fabric capabilities with Pipelines and Notebooks as the main tool to extract and transform data. All of the data is stored in it's raw format, but also in Delta Parquet, enabling the user to directly use it through Power BI Direct Lake or the Lakehouse SQL Endpoint via SQL. FUAM comes with a set of standard report enabling a quick overview on the data, but it's intended to give the users all tool to customize or build the own reports on top of the data model. Through the openness of Fabric it's of course also possible to combine it with your own data enabling you to do the analysis you wish.


## FUAM Content


FUAM extracts the following data from the tenant:

- Tenant Settings
- Delegated Tenant Settings
- Activities
- Workspaces
- Capacities
- Capacity Metrics
- Tenant meta data (Scanner API)
- Capacity Refreshables
- Git Connections
- Engine level insights (coming soon in Optimization module)

### Architecture
The architecture of FUAM is built on Fabric items like Pipelines, Notebooks, Lakehouses, Semantic models and Power BI reports. We have built the component in a modular structure, which helps you to extend FUAM with your own modules. This architecture design helps to maintain the solution also with ease.

The data ingestion logic is orchastrated and parametizable, which allows to use the main orchestration pipeline for initial and incremental data loads. FUAM Lakehouse is one of the core component in the architecture. All the data is transformed and persisted in a way, which open amazing capabilities analyzing the collected data in a semantic model with DirectLake mode.

![image](./media/general/fuam_architecture.png)

### Benefits
- Modular building blocks
- One-source-of-truth approach
- End-to-end report experience
- Intelligent Optimization module (coming soon)
- Long term CU utilization analysis
- Bring your own data & connect FUAM

## Setup

Are you ready to try FUAM out? We have prepared two step-by-step documentations, which support you to deploy FUAM in your workspace on your tenant:

#### [Click here to **deploy/upgrade** FUAM](./how-to/How_to_deploy_FUAM.md_to/)


## Support
The FUAM solution accelerator template **is not official Microsoft service**.

**Ideas/Suggestions:** Submit your ideas and suggestions as an issue in this repository.

**Bug Reports:** We maintain a backlog in the project issues page. Let us know if you run into any problems or share your suggestions by adding an entry into the issues section.

**Important:** Please, do not open a support ticket in case of an issue regarding the templates. In case of any questions, issues regarding the templates, please create an issue in this repository.
