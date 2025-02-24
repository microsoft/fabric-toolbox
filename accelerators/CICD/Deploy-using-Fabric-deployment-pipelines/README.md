# Deploy using Fabric deployment pipelines

<div align=center><img src=../../media/deployment_pipeline_workflow.png width=500></div>

Diagram showing the flow of Git based deployment using deployment pipelines.

With this option, Git is connected only until the dev stage. From the dev stage, deployments happen directly between the workspaces of Dev/Test/Prod, using Fabric deployment pipelines. While the tool itself is internal to Fabric, developers can use the deployment pipelines APIs to orchestrate the deployment as part of their Azure release pipeline, or a GitHub workflow. These APIs enable the team to build a similar build and release process as in other options, by using automated tests (that can be done in the workspace itself, or before dev stage), approvals etc.

Once the PR to the main branch is approved and merged:

A build pipeline is triggered that uploads the changes to the dev stage using Fabric Git APIs. If necessary, the pipeline can trigger other APIs to start post-deployment operations/tests in the dev stage.
After the dev deployment is completed, a release pipeline kicks in to deploy the changes from dev stage to test stage. Automated and manual tests should take place after the deployment, to ensure that the changes are well-tested before reaching production.
After tests are completed and the release manager approves the deployment to Prod stage, the release to Prod kicks in and completes the deployment.
When should you consider using option #3?
When you're using source control only for development purposes, and prefer to deploy changes directly between stages of the release pipeline.
When deployment rules, autobinding and other available APIs are sufficient to manage the configurations between the stages of the release pipeline.
When you want to use other functionalities of Fabric deployment pipelines, such as viewing changes in Fabric, deployment history etc.
Consider also that deployments in Fabric deployment pipelines have a linear structure, and require other permissions to create and manage the pipeline.


## Scripts explanations

- **[Apply_Changes_To_Branch.yaml](cicd/Apply_Changes_To_Branch.yaml):** Yaml file to update the dev workspace after a PR has been approved
- **[Deploy_Changes_From_Source_To_Target_Workspace.yaml](cicd/Deploy_Changes_From_Source_To_Target_Workspace.yaml):** Yaml file to deploy changes from a source workspace to a target workspace
- **[trigger_deployment_pipeline.ps1](cicd/trigger_deployment_pipeline.ps1):** Powershell script called by Deploy_Changes_From_Source_To_Target_Workspace.yaml to call the Deployment Pipeline Fabric Rest API
- **[workspace_update.ps1](cicd/workspace_update.ps1):** Powershell script called by Apply_Changes_To_Branch.yaml to call the GIT Fabric Rest API got
- **[Run_post_activity.py](cicd/Run_post_activity.py):** A Python script is triggered for post-deployment activities, launching a post-activity notebook to rebind connections, among other tasks. For more information please visit [Run post activiy details](https://github.com/microsoft/fabric-toolbox/blob/main/accelerators/CICD/Branch-out-to-new-workspace/README.md).
Please note that the post-activity notebook must exist and can be found [here](https://github.com/microsoft/fabric-toolbox/blob/main/accelerators/CICD/Branch-out-to-new-workspace/Fabric/Branch%20out%20to%20new%20workspace%20-%20Post%20Activity.ipynb)

## Prerequsite and configurations required

- You need all the workspaces required for your workflow (DEV, UAT, XXX, Prod)
  - If you want to automate this part please visit [this page](https://github.com/Azure-Samples/modern-data-warehouse-dataops/blob/main/e2e_samples/fabric_dataops_sample/README.md) for an example
- You need to have create a Fabric Deployment pipeline as you will need the deployment ID for the trigger_deployment_pipeline script
- You will need to create Azure Devops variables even if you can replace them with Azure Key Vault
<div align=center><img src=../../media/ado_variables.png width=500></div>
  
  - deployment_pipeline_id:The fabric deployment pipeline ID created (as for now, it is a manual action)
  - dev_workspace_id: The DEV workspace ID
  - dev_workspace_name: The DEV workspace name
  - job_type_Notebook: The job type when triggering a post activity deployment
  - post_deployment_notebook_id: The Notebook ID for the post activity deployment. In this case, it will be the id of the notebook **Notebook_Post_Deployment**
  - uat_workspace_id: The UAT workspace ID
  - uat_workspace_name: the UAT workspace name

## Steps

### 1 - Create the workspaces
[Create workspaces manually](https://learn.microsoft.com/en-us/fabric/fundamentals/create-workspaces)
[Create workspace automatically](https://github.com/Azure-Samples/modern-data-warehouse-dataops/blob/main/e2e_samples/fabric_dataops_sample/README.md)
### 2 - Create the deployment pipeline
[Create Fabric Deployment Pipeline](https://learn.microsoft.com/en-us/fabric/cicd/deployment-pipelines/get-started-with-deployment-pipelines?tabs=from-fabric%2Cnew-ui)
### 3 - Create the Azure Devops variable used by the different pipelines
[Create Azure Devops Variables](https://learn.microsoft.com/en-us/azure/devops/pipelines/library/variable-groups?view=azure-devops&tabs=azure-pipelines-ui%2Cyaml)
### 4 - Create the Azure Devops pipelines leveraging the Yaml files Apply_Changes_To_Branch.yaml and Deploy_Changes_From_Source_To_Target_Workspace.yaml
[Create Azure Devops Pipeline](https://learn.microsoft.com/en-us/azure/devops/pipelines/get-started/pipelines-get-started?view=azure-devops#define-pipelines-using-yaml)


## Limitations

This approach will support only [Fabric Items supported](https://learn.microsoft.com/en-us/fabric/cicd/deployment-pipelines/intro-to-deployment-pipelines?tabs=new-ui#supported-items) by the deployment pipeline .


Some fabric items require post deployment activities after the deployment pipeline has run.


For more information about what the current post activity is able to support please visit [this page](https://github.com/microsoft/fabric-toolbox/blob/main/accelerators/CICD/Branch-out-to-new-workspace/README.md)

## Demo
**[Fabric Deployment Pipeline with swap connection demo](https://github.com/microsoft/fabric-toolbox/raw/refs/heads/main/accelerators/media/Fabric_cicd_option_3.mp4):** You can watch a quick recording here
