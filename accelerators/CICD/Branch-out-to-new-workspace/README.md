# Custom “Branch Out to New Workspace” in Microsoft Fabric

## Introduction

Branching out to a new workspace is a common activity in the development lifecycle
within Fabric. This allows engineers to develop and test, in isolation, within a separate
workspace connected to a feature branch as shown in the diagram below, and in our
documentation here.<div align=center><img src=../../media/feature_dev_flow.png width=400></div>

This setup can be achieved either by using the [built-in
capability](https://learn.microsoft.com/en-us/fabric/cicd/git-integration/manage-branches?tabs=azure-devops#scenario-2---develop-using-another-workspace) via the user
interface, or, programmatically via the REST APIs but will need both create new workspace permissions and Contributor role on the origin workspace. 
Both of these methods may also require a post process to reconfigure item level dependencies such as default lakehouses, or
pipeline source/sink connection details. This document describes how to use the
associated scripts in this repository to programmatically automate a custom branch
out to new workspace process end-to-end using the REST APIs.


## Custom Branch Out To New Workspace Scripts

#### Overview

Where required permissions cannot be granted to developers to utilize the built-in capability to create the new feature workspace, 
then the task can to be divided into separate steps can be run using the Fabric
REST APIs using an identity or set of identities or credentials which have:
+ permissions in DevOps to create new branches
+ permission in Fabric to create new workspaces
+ viewer or higher role on the origin workspace
  
**This document provides an overview of the supplied sample scripts to achieve this as
well as setup and execution guidance.**

To automate the necessary steps, the process can be triggered from an Azure DevOps
Release Pipeline by the administrator or a DevOps engineer. This is split into two steps:

1. Creation of the new workspace and new DevOps branch via release pipeline
2. Post activity tasks run via a Fabric Notebook

The release pipeline is defined by an Azure Devops yaml pipeline which runs each of
these steps by invoking a Python script. The yaml pipeline passes various parameters
and secrets (which are stored in an Azure Key Vault) to these scripts at run time. The
secrets are used to store sensitive information, particularly for authentication purposes
as there are a few options to consider from depending on which is the best fit for your
organization:

1. Fabric using an access token generated via interactive user running notebook
    cell
2. Fabric using a dedicated Entra ID account username and password
3. Azure DevOps using service principal (client ID) and secret
4. Azure DevOps using Personal Access Token (PAT)

Certain Fabric REST APIs used in the CICD process do not currently support service
principal, although this feature will be available in the future. In the meantime, there are
two main interim solutions.
a.) Generate a token using notebookutils (code sample provided in Appendix A) prior to
running the YAML pipeline, or,
b.) Leverage a dedicated Entra ID account without MFA, referred to as a “service
account”.

If generating a token using notebookutils, the provided code will need to be run from a
notebook by the user with sufficient permissions, which generates and stores a token in
the linked key vault in a secret called ‘fabrictoken’. This needs to be done within one
hour (expiry time) of triggering the yaml pipeline. Otherwise the keyvault secret can be
used to simply store the username and password of the service account.


**Note: When ‘fabrictoken’ is specified in the variable group this takes precedence
over any username and password authentication method. Where ‘azdopat’ is
specified this takes precedence over service principal authentication.**

### Understanding the scripts

This repository contains a set of files which supports a custom process to branch out to
new workspace. It consists of the following files:

Readme: This document

+ AzDO folder containing yaml definition and python scripts:  
  + Branch_out_workspace.yml : definition of the release pipeline to use variable groups, accept parameters, install msal, and invoke two separate python scripts
  + A scripts folder which contains:
    + BranchOut-Feature-Workspace-Automation.py : This python script is run in the context of an "admin" user and/or credentials (token/pat) which have permissions to create new branch, create new workspace and connect/sync to git.
    + Run_post_activity.py: This script invokes the Fabric notebook to execute post described below.
+ Fabric folder containing a notebook:
  + Branch out to new workspace - Post Activity.ipynb: This notebook executes a number of post activity steps such as:
    1. Rebinding of notebooks, pipelines, semantic models and reports.
    2. Configuring access to “source” data either via copy or shortcut (shortcut only supported in the lakehouse currently)

### Configuration steps

#### Fabric

1. Create an Azure Key vault

Create a key vault and create a secret or secrets depending on the authentication
option described above. If using the Fabric token method then the secret simply needs
to be a placeholder with a dummy secret value at this stage.

2. Update the post activity notebook

Upload the “Branch out to new workspace - Post Activity.ipynb” notebook to a
workspace (My Workspace can also be used) in Fabric which the admin user has
access to. Make note of notebook ID and the Workspace ID which the GUIDs that
follows the “synapsenotebooks” and “groups” token respectively in the browser url.

```
https://app.fabric.microsoft..com/groups/<Workspace_ID>/synapsenotebooks/<Notebook_ID>?experience=data-engineering
```
#### Azure DevOps

1. Create an Azure DevOps project and initialize a main repo
2. Connect your ‘dev’ workspace to the repo and branch
3. Create a variable group under the Pipelines, Library, called
    Fabric_Deployment_Group_S to store sensitive information, and link the variable
    group to the key vault as shown below. Note the variables may be different
    depending on the authentication method chosen, as shown below.

When using Azure DevOps PAT and Fabric token ensure the following secrets are
configured:

<div align=center><img src=../../media/variable_groups.png width=500></div>

When using a service account ensure the following secrets are configured:

<div align=center><img src=../../media/variable_group_s.png width=500></div>

4. Create another variable group called Fabric_Deployment_Group_NS and populate
    the required key value pairs as shown in the image below.

<div align=center><img src=../../media/variable_group_ns.png width=500></div>

ADO_API_URL: normally will be https://dev.azure.com

ADO_ORG_NAME, ADO_PROJECT_NAME, ADO_REPO_NAME can be obtained when
viewing the Repos page in Azure DevOps as shown below

<div align=center><img src=../../media/ado_taxonomy.png width=500></div>

5. Navigate to the repos page and add / upload the YAML file to the root of the repo.
6. Edit the YAML file and review and change the pipeline and script parameters as necessary:
   a. The default parameters section contains relevant default values for example, the default capacity to be assigned to the new workspace. The capacity ID can be obtained in the Fabric Admin portal. Navigate to the capacities tab, click on the actions icon to display the capacity details.

<div align=center><img src=../../media/fabric-capacity.png width=500></div>

b. the parameters on line 76 are configured correctly depending which
authentication method has been chosen:

<div align=center><img src=../../media/configure_params.png width=500></div>

7. Add a new folder to the root of the repo called scripts and upload the associated python scripts.

8. Create a new release pipeline, chose Azure Repos Git, select the repository, chose Existing YAML file and select the uploaded YAML file.

9. Go back to the variable groups created in step 4 and click the pipeline permissions button to allow the pipeline to use the variable group.

10. Go back to the release pipeline created, click on the release pipeline name and click
    the “Run Pipeline” button.
    
11. This will display run-time parameters which can be modified as necessary:

<div><img align=right src=../../media/pipeline_params.png width=500>
<p>&nbsp;</p><p>&nbsp;</p> 
a. Source workspace: Name of the dev workspace
</p><p> b. Target workspace: Name of the new workspace to be created which will also serve as the new branch name
</p><p> c. Copy Lakehouse data: Enter True or False depending on whether you wish to copy lakehouse data from the source workspace
</p><p> d. Copy Warehouse data: Enter True or False depending on whether you wish to copy warehouse data from the source workspace
</p><p> e. Create Lakehouse Shortcuts: Only applicable if Copy Lakehouse Data is False. This configures shortcuts pointing back to the source lakehouse
</p><p> f. Swap connections in pipelines: Specify connections to be replaced using format (from 1 ,to1),(from2,to2),...(fromN,toN) using either connection ID or name.
</p><p> g. Enter Developer Email: Add the email address of the developer to be granted admin role on the new workspace 
</p><p> h. Enter Capacity ID: Enter the capacity ID of the new workspace if different from the default GUID.
</p><p> i. Enter the branch name: Enter the source branch name which the new branch will be created from.
</p><p> j. Click Run and monitor the release pipeline in Azure Devops and also the progress of the post activity notebook in the Fabric monitoring hub.
</div><p>&nbsp;</p><p>&nbsp;</p>
<p>&nbsp;</p>
12. To debug and monitor the running YAML pipeline click on the “BranchOut” job
<div align=center><img src=../../media/branchout_job.png width=500></div>
Importantly ensure both python scripts complete successfully.
<div align=center><img src=../../media/branchout_success.png width=500></div>
Azure DevOps success will be displayed on the previous job screen
<div align=center><img src=../../media/branchout_complete.png width=500></div>
13. The second python script asynchronously invokes the post activity notebook in Fabric, therefore navigate to the monitoring hub in Fabric to ensure the notebook completes successfully. To debug or troubleshoot notebook errors, click on the failed activity name in the monitoring hub
<div align=center><img src=../../media/monitor_failed.png width=500></div>
Click on item snapshots and review the output of the notebook.
<div align=center><img src=../../media/monitor_debug.png width=500></div>
After successfully running the pipeline the new workspace should set up and ready for the developer to access and start developing.


## Appendix A

import requests

nameOfKeyVault = 'azdosc'

secret_value = notebookutils.credentials.getToken('pbi')

secret_name = "fabrictoken"

access_token = notebookutils.credentials.getToken('keyvault')

url = f'https://{nameOfKeyVault}.vault.azure.net/secrets/{secret_name}?api-
version=7.3'

headers = {

'Authorization': f'Bearer {access_token}',

'Content-Type': 'application/json'

}

body = {

'value': secret_value

}

response = requests.put(url, headers=headers, json=body)

if response.status_code == 200:

print(f"Secret '{secret_name}' added to Key Vault.")

else:

print(f"Failed to add secret: {response.status_code} - {response.text}")



This is a offline tool, your data stays locally and is not send to any server!
Feedback & Bug Reports
