# Microsoft Fabric CI/CD: Git-Based Deployments Using Build Environments

<div align=left><img src=../../media/CICD-option2-custom.png width=650></div>

This variation of [**Option 2**](https://learn.microsoft.com/en-us/fabric/cicd/manage-deployment#option-2---git--based-deployments-using-build-environments) from the official documentation uses the [`fabric-cicd`](https://blog.fabric.microsoft.com/en-us/blog/introducing-fabric-cicd-deployment-tool?ft=All#:~:text=Fabric-cicd%20is%20a%20code-first%20solution%20for%20deploying%20Microsoft,with%20the%20primary%20goal%20of%20streamlining%20script-based%20deployments) Python library as a **code-first solution** for deploying Microsoft Fabric items from a repository branch into a workspace.

As depicted in the diagram above, the associated scripts in this folder assume:
- Two or more higher environments such as **dev**, **test**, and **prod**.
- Each git branch contains the item definitions for each workspace. Each branch is associated with an environment. 
- One or more feature development environments are **feature branches** with associated **Git Integrated workspaces**
- ⚠️ As per usual best practice, commits to the main or dev branch are **not allowed** due to branch policy, therefore any changes must be merged via an **approved PR**, which triggers the YAML pipeline to deploy Fabric items using the `fabric-cicd` library.

This allows:
- Running **unit tests** in the `dev` workspace before merging into subsequent branches and environments
- `Dev` and higher environments are **non-Git integrated**, with all deployments originating from Git

👉 For more details on **workspace design and branching strategy**, refer to [this blog post](https://blog.fabric.microsoft.com/en-us/blog/optimizing-for-ci-cd-in-microsoft-fabric?ft=Fabric-platform:category).

---

## Understanding the Scripts

### Folder Structure

The AzDO folder in this section of the repository contains the YAML pipeline definition file and a Python script inside the `deploy/scripts` subfolder.

#### `Deploy-To-Fabric.yml`
Defines the release pipeline:
- Specifies which branches trigger the pipeline *(to be completed)*
- Defines parameters for which item types to deploy
- Includes **non-sensitive** and **sensitive** variable groups
- Steps to install the `fabric-cicd` library and invoke the Python script

#### `deploy/scripts/deploy-to-fabric.py`
- Accesses **variable group** values from Python
- Uses **Service Principal** credentials to obtain a token
- Looks up the **workspace ID** using Fabric APIs
- Uses the `fabric-cicd` module to deploy items based on the branch and configuration

---

## Configuration & Setup

### Azure

1. Create an **Azure Key Vault** and add secrets:
   - `Tenant ID` - aztenantid
   - `Service Principal Client ID` - azclientid
   - `Service Principal Secret` - - azspsecret
   - Use the same naming conventions as shown in the image.
<div align=center><img src=../../media/cicd-option2-keyvault.png></div>   

---

### Azure DevOps

1. Create an **Azure DevOps project** and upload the two files (`Deploy-To-Fabric.yml` and `deploy-to-fabric.py`) in the correct folder structure, or place them in the root folder and update paths accordingly.
2. Review the `Deploy-To-Fabric.yml` and ensure the **agent pool name** is set correctly.
3. As a **one-time setup**:
   - Connect your Dev workspace to the `dev/main` branch.
   - Specify a folder (e.g., `fabric`) to sync items to your main branch. This folder name will be set in the variable group later.
   - This stores an initial snapshot of each item definition from the workspace into the dev/main branch.
   - **Disconnect** the workspace from Git after syncing.
4. Create additional branches from main/dev as required e.g. test and prod branches. These are not connected to any workspace, but instead their contents will be deployed to their target workspace using the fabric-cicd module.  
5. Create **branch policies** as required.
   <div align=center><img src=../../media/cicd-option2-branch-policy.png></div>   
   <div align=center><img src=../../media/cicd-option2-branch-reviewers.png></div>   

---

6. Create a **variable group** under `Pipelines -> Library`:

   - **Name:** `Fabric_Deployment_Group_S`  
     Stores sensitive information and is linked to the Key Vault created earlier.

<div align=center><img src=../../media/cicd-option2-variable-group-s.png width=450></div>   

7. Create another **variable group**:

   - **Name:** `Fabric_Deployment_Group_NS`  
     Stores non-sensitive key-value pairs.
     Add variables as shown below to to correctly map environments to associated workspace name,  
     ensure workspace name variables are **prefixed with the branch name**.  
     Add a variable to specify the **Git folder**.

<div align=center><img src=../../media/cicd-option2-variable-group-ns.png width=450></div>   

---

8. Under `Pipelines -> Environments`, create two or more environments, e.g.:

   - `dev`
   - `test`
   - `prod`

<div align=center><img src=../../media/cicd-option2-envs.png></div>   

---

9. Add **approvals** as necessary to enforce environment protection:

   > Example: An **approval gate** is triggered whenever the pipeline targets `prod`.

   > 🔒 This is in **addition to PR merge approvals** set in branch policies.

<div align=center><img src=../../media/cicd-option2-approvals.png width=600></div>   

---

10. Create a new **release pipeline**:
   - Choose **Azure Repos Git**
   - Select the repository
   - Choose **Existing YAML file**
   - Select the uploaded `Deploy-To-Fabric.yml` file

11. Return to the variable groups (`Fabric_Deployment_Group_S` and `_NS`) and **allow pipeline access** via the **Pipeline Permissions** button.

12. After configuring your Fabric environment, you can **manually test** the pipeline via Azure DevOps UI.

13. To **monitor/debug** the YAML pipeline:
   - Click the running job under `Pipelines`
   - Review the latest run to ensure success

> ✅ Azure DevOps will display success on the job screen when complete.
<div align=center><img src=../../media/cicd-option2-pipeline-success.png></div>   

Click on the latest run and ensure it has run successfully.
<div align=center><img src=../../media/cicd-option2-pipeline-run.png width=600></div>   
Azure DevOps success will be displayed on the previous job screen
<div align=center><img src=../../media/cicd-option2-pipeline-success-overview.png width=600></div>   

---

14. Edit the `Deploy-To-Fabric.yml` to define [which branches trigger the pipeline](https://learn.microsoft.com/en-us/azure/devops/pipelines/yaml-schema/trigger?view=azure-pipelines#examples-1).

14. In future, once changes are successfully merged to the branch through PR process this will trigger the yaml pipeline passing the required parameters, and using the mapping defined in the  variable group will ensure the items are deployed to the correct workspace based on which branch triggered the pipeline.

```
