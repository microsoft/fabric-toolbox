# Microsoft Fabric CI/CD: Git-Based Deployments Using Build Environments

<div align=center><img src=../media/CICD-option2-custom.png width=400></div>

This variation of **Option 2** from the official documentation uses the `fabric-cicd` Python library as a **code-first solution** for deploying Microsoft Fabric items from a repository into a workspace.

The associated scripts in this folder assume:
- One or more **feature branches** and associated **Git Integrated workspaces**
- Two or more higher environments such as **dev**, **pre-prod**, and **production**

> ⚠️ Commits to the `main`/`dev` branch are **not allowed**. Changes must be merged via an **approved PR**, which triggers the YAML pipeline to deploy Fabric items using the `fabric-cicd` library.

This allows:
- Running **unit tests** in the `dev` workspace before merging into subsequent branches and environments
- `Dev` and higher environments to be **non-Git integrated**, with all deployments originating from Git

👉 For more details on **workspace design and branching strategy**, refer to the linked blog (link to be added).

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
   - `Tenant ID`
   - `Service Principal Client ID`
   - `Service Principal Secret`
   - Use consistent naming conventions.

---

### Azure DevOps

1. Create an **Azure DevOps project** and upload the two files (`Deploy-To-Fabric.yml` and `deploy-to-fabric.py`) in the correct folder structure, or place them in the root folder and update paths accordingly.
2. Review the `Deploy-To-Fabric.yml` and ensure the **agent pool name** is set correctly.
3. As a **one-time setup**:
   - Connect your Dev workspace to the `dev/main` branch.
   - Specify a folder (e.g., `fabric`) to sync items to your main branch.
   - **Disconnect** the workspace from Git after syncing. This folder name will be set in the variable group.
4. Create **branch policies** as required.

---

5. Create a **variable group** under `Pipelines -> Library`:

   - **Name:** `Fabric_Deployment_Group_S`  
     Stores sensitive information and is linked to the Key Vault created earlier.

6. Create another **variable group**:

   - **Name:** `Fabric_Deployment_Group_NS`  
     Stores non-sensitive key-value pairs to map workspaces to environments.  
     Ensure workspace names are **prefixed with the branch name**.  
     Add a variable to specify the **Git folder**.

---

7. Under `Pipelines -> Environments`, create two or more environments, e.g.:

   - `dev`
   - `test`
   - `prod`

---

8. Add **approvals** as necessary to enforce environment protection:

   > Example: An **approval gate** is triggered whenever the pipeline targets `prod`.

   > 🔒 This is in **addition to PR merge approvals** set in branch policies.

---

9. Create a new **release pipeline**:
   - Choose **Azure Repos Git**
   - Select the repository
   - Choose **Existing YAML file**
   - Select the uploaded `Deploy-To-Fabric.yml` file

10. Return to the variable groups (`Fabric_Deployment_Group_S` and `_NS`) and **allow pipeline access** via the **Pipeline Permissions** button.

11. After configuring your Fabric environment, you can **manually test** the pipeline via Azure DevOps UI.

12. To **monitor/debug** the YAML pipeline:
   - Click the running job under `Pipelines`
   - Review the latest run to ensure success

> ✅ Azure DevOps will display success on the job screen when complete.

---

13. Edit the `Deploy-To-Fabric.yml` to define which branches trigger the pipeline.

14. In the future, once changes are successfully merged via PR:
   - The YAML pipeline is triggered
   - Parameters are passed from the PR
   - The correct workspace is targeted using the **variable group mapping**

```

Let me know if you'd like this saved as a `.md` file or want me to generate a GitHub README version with headers, badges, and optional links!
