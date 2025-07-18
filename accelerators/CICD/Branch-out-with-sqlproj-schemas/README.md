# Custom “Branch Out to New Workspace” in Microsoft Fabric

## Introduction

Branching out to a new workspace is a common activity in the development lifecycle within Fabric. This allows engineers to develop and test, in isolation, within a separate workspace connected to a feature branch as shown in the diagram below, and in our documentation here.<div align=center><img src=../../media/feature_dev_flow.png width=400></div>

This setup can be achieved either by using the [built-in capability](https://learn.microsoft.com/en-us/fabric/cicd/git-integration/manage-branches?tabs=azure-devops#scenario-2---develop-using-another-workspace) via the user interface, or, programmatically via the REST APIs but will need both create new workspace permissions and Contributor role on the origin workspace.
Both of these methods may also require a post process to reconfigure item level dependencies such as default lakehouses, or pipeline source/sink connection details. This document describes how to use the
associated scripts in this repository to programmatically automate a custom branch out to new workspace process end-to-end using the REST APIs.

## Custom Branch Out To New Workspace Scripts

### Overview

Where required permissions cannot be granted to developers to utilize the built-in capability to create the new feature workspace, then the task can to be divided into separate steps can be run using the Fabric REST APIs using an identity or set of identities or credentials which have:

+ permissions in DevOps to create new branches
+ permission in Fabric to create new workspaces
+ viewer or higher role on the origin workspace
  
**This document provides an overview of the supplied sample scripts to achieve this as well as setup and execution guidance.**

To automate the necessary steps, the process can be triggered from an Azure DevOps Release Pipeline by the administrator or a DevOps engineer. This is split into two steps:

1. Branch Out to a new workspace and new DevOps branch via Fabric Source Control
2. Execute a Pull Request to merge changes into the required environments

The release pipeline is defined by an Azure Devops yaml pipeline which runs each of these steps by invoking a series of Bash, Powershell, sqlpackage and Python script. The yaml pipeline passes various parameters and secrets (which are stored in an Azure Key Vault) to these scripts at run time. The secrets are used to store sensitive information, particularly for authentication purposes as there are a few options to consider from depending on which is the best fit for your organization:

1. Azure DevOps Service Connection
2. Azure DevOps using service principal (client ID) and secret
3. Azure DevOps using Personal Access Token (PAT)

### Understanding the scripts

This repository contains a set of files which supports a custom process to merge changes from a feature workspace into higher environments workspace following a path to live. It consists of the following files:

Readme: This document

+ scripts/deploy folder containing python scripts:
  + deploy-to-fabric.py: authenticates to Microsoft Fabric using a token, looks up the target workspace by name, and publishes/unpublishes defined items via the Fabric REST API.It then retrieves connection strings for warehouses, lakehouses, and SQL databases in that workspace and exports them as Azure DevOps pipeline variables.
  + wks-src-connection.py: Queries the Microsoft Fabric REST API using a bearer token to find the specified workspace and locate its first lakehouse. Fetches that lakehouse’s SQL endpoint connection string, prints it, and sets it as an Azure DevOps pipeline variable.
+ Deploy-To-Fabric.yml file
  1. Defines CI/CD triggers for dev, test, and prod branches (including PRs) and sets pipeline parameters for deploying Fabric items and notebook options.
  2. Loads variable groups containing workspace names and Git folder info.
  3. Stage “DeployToFabric”:
     1. Extracts or looks up the PR number and source/target branches via the Azure DevOps REST API.
     2. Sets target_env and source_workspace_name based on whether it’s a PR or CI build.
     3. Installs Python 3.12, the fabric-cicd library, retrieves a Fabric API token, and runs Python scripts to deploy selected Fabric artifacts and capture connection strings.
  4. Stage “BuildSQL”:
     1. Prints the Fabric resource names and endpoints.
     2. Retrieves a SQL access token, extracts a Lakehouse DACPAC, modifies a Warehouse .sqlproj to reference it, then restores and builds the SQL project and publishes the DACPAC artifact.
  5. Stage “DeploySQL”:
     1. Optionally Deploy Lakehouse Schema via Notebook
     2. Downloads the DACPAC artifact and, per environment (dev/test/prod), acquires a SQL token and uses sqlpackage to deploy Lakehouse, Warehouse, and SQL Database DACPACs.
  6. Job “PostDeploy”:
     1. Optionally runs a Fabric notebook to deploy a data pipeline if configured.
+ Fabric folder containing
  + parameter.yml: used by the deploy-to-fabric.py to parametrize values trough find and replace

### Configuration steps

#### Azure/Fabric

1. Create an Azure Key vault: Create a key vault and create a secret or secrets depending on the authentication option described above. If using the Fabric token method then the secret simply needs to be a placeholder with a dummy secret value at this stage.
2. Fabric Workspaces: if needed create your a Workspace for each Environment you want to focus on (dev, test, prod, etc). Depending on the used authentication add correct principal as a Contributor.

#### Azure DevOps

1. Create an Azure DevOps project and initialize a main repo
2. If needed create required branches and environments
3. Create a variable group under the Pipelines, Library, called Fabric_Deployment_Group_S to store sensitive information, and link the variable group to the key vault as shown below. Note the variables may be different depending on the authentication method chosen, as shown below.

When using Azure DevOps PAT and Fabric token ensure the following secrets are configured:

<div align=center><img src=../../media/variable_groups.png width=500></div>

When using a service account ensure the following secrets are configured:

<div align=center><img src=../../media/variable_group_s.png width=500></div>

4. Create another variable group called Fabric_Deployment_Group_NS and populate the required key value pairs as shown in the image below.

<div align=center><img src=../../media/variable_group_ns.png width=500></div>

ADO_API_URL: normally will be https://dev.azure.com

ADO_ORG_NAME, ADO_PROJECT_NAME, ADO_REPO_NAME can be obtained when viewing the Repos page in Azure DevOps as shown below

<div align=center><img src=../../media/ado_taxonomy.png width=500></div>

5. Navigate to the repos page and add / upload the YAML file to the root of the repo.
6. Edit the YAML file and review and change the pipeline and script parameters as necessary:
   1. The default parameters section contains relevant default values for example items_in_scope to be publish
7. Add a new folder to the root of the repo called scripts and upload the associated python scripts.
8. Create a new release pipeline, chose Azure Repos Git, select the repository, chose Existing YAML file and select the uploaded YAML file.
9. Go back to the variable groups created in step 4 and click the pipeline permissions button to allow the pipeline to use the variable group.
10. Commit and Sync all changes to dev.

#### Fabric Development

1. Create a new Feature Workspace where the new development for fabric will happen (Ex: Customer0_FeatureX), depending on the used authentication add correct principal as a Contributor.
2. Create a new Feature branch in ADO that will be used for the Workspace Git Integration, the name of branch MUST BE the same as the workspace name (Ex: Customer0_FeatureX)
3. Enable Git Integration on the Feature Workspace, Connect to ADO, chose the Organization, Project, Git Repository, Branch (feature branch Ex: Customer0_FeatureX), and Git Folder (fabric in this case). Click Connect and Sync
4. If the fabric git folder does not exist, click Create and sync.
5. Create Fabric objects
   1. the default items in scope are "Notebook","DataPipeline","Lakehouse","SemanticModel","Report","Warehouse","SQLDatabase". Only use the items you will be creating on the workspace. If you wan to sync other object review the supported objects here https://microsoft.github.io/fabric-cicd/latest/
   2. If you are using a connection to an external location (Ex: Shortcut to ADLS, SQL Server Connection, etc) make sure the correct principal has access to it (like the ADO Service Connection)
6. Create a Pull Request from the Feature Branch (Ex: Customer0_FeatureX) to Dev, Approve and Complete
7. Check ADO pipeline run

## Appendix A

1. Getting Workspace names from source from PR and variable groups
   On the line 110 of the Deploy-To-Fabric.yml file, we have a task (GetPRBranches) that uses different API calls to get information about Source branches and Workspace (this is why the name for feature branch and workspace must be hte same). This could be replace with an alternative way to get the Source workspace (the Workspace were you have working on the change to later merge to higher environments) like using parameters or variables

2. Parametrization
   If you are looking to parametrize values like connection IDs, paths or SQL Endpoints so you that fabric object (like Notebooks and Pipelines) reference the correct value based on the environment, you can use the parameterization option on the fabric-cicd module https://microsoft.github.io/fabric-cicd/latest/how_to/parameterization/. It has to be placed within the Git Folder (fabric in our case) and use the find_replace options

3. Execution of Notebooks
   The Deploy-To-Fabric.yml file, provides and option to execute a Notebook in the case you wanted to create Lakehouse tables after shortcuts have been created. Use the parameter user_schema_notebook and define the variable notebookLHTableSchema on the variable group Fabric_Deployment_Group_NS

4. Execution of Pipelines
   The Deploy-To-Fabric.yml file, provides and option to execute a Pipeline on the Workspace as a post activity. Use the parameter run_data_pipeline and define the variable dataPipeline on the variable group Fabric_Deployment_Group_NS.