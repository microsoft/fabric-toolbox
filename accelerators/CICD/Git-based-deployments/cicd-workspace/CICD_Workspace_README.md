# The CI/CD workspace

<br>

In this solution, the cicd-workspace folder serves as a placeholder for a collection of notebooks that execute logic within a CI/CD Fabric workspace.

<br>

The following notebooks should be imported in a Fabric workspace of your choice:

- nb_cicd_pre_deployment
- nb_cicd_pre_update_lakehouses
- nb_cicd_pre_update_warehouses
- nb_cicd_post_deployment
- nb_cicd_post_update_data_pipelines
- nb_cicd_post_update_notebooks
- nb_cicd_post_update_semantic_models
- nb_helper
- nb_extract_lakehouse_access
- nb_prepare_cicd_workspace


<br>

These notebooks will record their execution in a CI/CD lakehouse, which must be created in advance. Refer to the notebook **nb_prepare_cicd_workspace** for guidance on setting up the lakehouse.
Additionally, they will perform pre- and post-deployment activities essential to the CI/CD process.
The following sections provide a detailed explanation of these activities.

## <u>Pre deployment activities</u>

<br>

These activities are initiated by the YAML pipelines during the execution of the **Run pre deployment steps - Lakehouses & Warehouses** step. This step runs the **pre_deployment.py** python script, which then triggers the execution of the **nb_cicd_pre_deployment** notebook in the CI/CD workspace.

<br>

The **Run pre-deployment steps - Lakehouses & Warehouses** step retrieves the appropriate inputs from variable groups based on the scenario (CI or CD). During the execution of **pre_deployment.py**, these variables are properly formatted and passed as parameters (JSON body) when triggering the **nb_cicd_pre_deployment** notebook via the Fabric REST API (**jobs/instances?jobType=RunNotebook**).

<br>

The notebook **nb_cicd_pre_deployment** creates a DAG in which 2 other notebooks are consequently called using **mssparkutils.notebook.runMultiple** and in the following order of precedence:

- nb_cicd_pre_update_lakehouses
- nb_cicd_pre_update_warehouses

The notebook **nb_cicd_pre_update_lakehouses** performs the following activities:

- Creates the lakehouse(s) in the target workspace if required
- Identifies managed tables, shortcuts (in the table and file sections of the lakehouse), folders, OneLake access roles, sql objects created against the SQL Analytical endpoints of the lakehouse (views, functions, stored procedures, rls related objects like security policies and predicates) in the source lakehouse.
- Handles the seeding of tables in the target lakehouse in full or incremental mode. The incremental mode handles changes at the managed tables level (new tables, altered tables: new columns, deleted columns, altered data types )
- Handles the creation of shortcuts, folders, security roles in the target lakehouse
- Handles the creation of the sql objects

The notebook **nb_cicd_pre_update_warehouses** performs the following activities:

- Identifies changes in the source Warehouses
- Apply the changes on the target warehouses

This code executes only when an incremental change is deployed, meaning it is not required during an initial deployment.

<span style="color: red; font-weight: bold;">It is crucial that the pre-deployment step for the lakehouse is executed, as the subsequent step related to the Git update might fail if the Warehouse depends on the lakehouse.</span>

<br>

## <u>Post deployment activities</u>

<br>

These activities are triggered by the YAML pipelines during the execution of the **Run post-deployment steps - Notebooks & Data Pipelines & Semantic Models/Reports** step. This step runs the **post_deployment.py** python script, which in turn triggers the execution of the **nb_cicd_post_deployment** notebook in the CI/CD workspace.

The **Run post-deployment steps - Notebooks & Data Pipelines & Semantic Models/Reports** step retrieves the necessary inputs from the variables stored in different variable groups, depending on the scenario (CI or CD). These variables are properly formatted during the execution of **post_deployment.py** and passed as parameters (JSON body) when the **nb_cicd_post_deployment notebook** is executed via the Fabric REST API (**jobs/instances?jobType=RunNotebook**).
The notebook **nb_cicd_post_deployment** creates a DAG in which 2 other notebooks are consequently called using **mssparkutils.notebook.runMultiple** and in the following order of precedence:

<br>

The notebook **nb_cicd_post_deployment** creates a DAG in which 2 other notebooks are consequently called using **mssparkutils.notebook.runMultiple** and in the following order of precedence:

- nb_cicd_post_update_data_pipelines
- nb_cicd_post_update_notebooks
- nb_cicd_post_update_semantic_models

PS: configure the parallelism required for the notebook execution based on your capacity thresholds. More info about that in the official documentation: 
https://learn.microsoft.com/en-us/fabric/data-engineering/spark-job-concurrency-and-queueing


<br>

- The notebook **nb_cicd_post_update_data_pipelines** performs the following activities: iterates over the existing list of data factory pipelines in the target workspace and changes the connections in each of them based on the mapping provided (source connection -> target connection).
- The notebook **nb_cicd_post_update_notebooks** performs the following activities: iterates over the existing list of notebook in the target workspace and changes the default lakehouse and known warehouses in the notebook definition.
- The notebook **nb_cicd_post_update_semantic_models** performs the following activities: iterates over the existing list of semantic models in the target workspace and changes the direct lake connection (when the semantic model is a default or custom semantic model with a direct lake mode), or changes the connections based on the mapping provided (source connection -> target connection) if the semantic model uses Direct Query or Import mode.

Each notebook performs the required activity only if at least one item of the required type is present in the target workspace.

<span style="color: red; font-weight: bold;">Without the post deployment activities, the items mentioned above will point to the lower environments (sql connections, lakehouses, warehouses, etc..).</span>


## <u>Helper notebooks</u>

- The **nb_helper** notebook contains a set of funtions required during the execution of the pre and post deployment notebooks listed above.

- The **nb_prepare_cicd_workspace** notebook can help setting up the CI/CD workspace and rebind the notebooks listed above to the CI/CD lakehouse. The steps described in the notebook can be performed manually.

- The **nb_extract_lakehouse_access** notebook can help extracting onelake roles defined in source lakehouses (DEV workspace), by generating 4 json files: onelake_roles.json, onelake_rules.json, onelake_entra_members.json, onelake_item_members.json. These files can be used as templates for customized roles in higher environment (TEST & PROD workspaces)

















