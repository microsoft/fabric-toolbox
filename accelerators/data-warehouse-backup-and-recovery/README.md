# Fabric Data Warehouse Backup and Recovery Playbook
## Overview
This project is intended to be an example of a playbook describing the steps necessary to back up and recover a Fabric Data Warehouse.  It includes the pre-requisites to recover/stand-up the data warehouse again from the latest point in time available.  The sample scripts referenced in this document can be found in the Fabric Toolbox BCDR Playbook project.

Fabric offers many out-of-the-box features to address platform and workload resiliency which greatly reduces risk of data loss.  Today Availability Zones address inner-region availability needs through out-of-the-box provided redundant storage and compute.  Availability Zones also handle automatic recovery of storage and compute in the event of a single VM failure, hardware failure and up to and including two simultaneous data center failures within a region.  

Data backups and a recovery process are needed in the event of a regional or self-induced failure where data is not recoverable via out-of-the-box tooling or via MS support.  This project is not all inclusive as failure scenarios can be varied with different degrees of severity and needs for recoverability.  This document outlines the recovery of data in the most severe of circumstances.

## Backup Requirements
While data is written and duplicated in each Availability Zone within a region, the fault domain in this scenario is the region.  Cross-Regional data availability depends on a combination of out of the box and homegrown solutions.  Backing up the environment must be inclusive of all the necessary items to recover the data in a separate but identical environment if necessary.  Below are the required items and methods of backup for each.

### Workspace Configurations and Security
Workspace configurations should be backed up either manually or via scripts that call the available Rest API’s.  “WorkspacePermissions.ps1” is an example of a script that scripts out workspace permissions that can be replayed as part of recovery efforts.  Note that the “WorkspacePermissions.ps1” script is not inclusive of all workspace configurations (other configs that may need to be scripted include: Azure connections, OneLake Cache for Shortcuts, Workspace Identity, Network Security, etc…).  
Configurations and Security settings should be scripted out and stored in a separate backup repository regularly via an approved scheduling tool.  
Running “WorkspacePermissions.ps1” generates a script to add workspace role assignments via Rest API for a new workspace.

### Fabric Data Warehouse Metadata
Data Warehouse metadata is stored in a SQL environment while the actual data is stored in open-source delta parquet format.  This means that data and metadata must be backed up separately.  To back up the warehouse metadata, ensure existing CI/CD processes are being followed and your workspace is connected to an Azure DevOps repository (recommended).  Note that API’s do not yet support GitHub.  If another repository other than DevOps is used, the redeployment from source control will have to be manual.

### Fabric Data Warehouse Data
Actual data for a Fabric Data Warehouse is stored in open-source delta-parquet format within Fabric OneLake.  Fabric Capacities have a BCDR feature switch to enable geo-redundancy of your OneLake data.  This must be enabled for this solution.  (Please review all [documentation](https://learn.microsoft.com/en-us/fabric/onelake/onelake-disaster-recovery) and costs associated with the BCDR switch.)

### Fabric Data Warehouse Security
Similar to Workspace security, Fabric Data Warehouse security must be backed up (scripted out) regularly.  A simple .sql script can be scheduled to run (via scheduling/orchestration tool) and output the current DW permissions to a .sql script to be replayed at time of recovery.

### *Backup scripts to be scheduled daily:*
| Script Name             | Purpose               | How to Use             |
| ----------- | ------- | ---------- |
| ScriptFabricDWSecurity.sql† | Scripts out all current DW explicit permissions into commands to be replayed in a new DW. | Save the output of this script to a new script file in your backup location.  (This can be orchestrated via .bat script, Fabric pipeline, etc…) |
| ScriptWorkspacePermissions.ps1† | Scripts out all current Workspace permissions into PowerShell script that uses API calls to replay/apply the existing security permissions from one workspace to another. | Update the variables at the top of the script and schedule it to run daily via preferred orchestration tool; outputting the results to a new ps1 script file to be replayed in the event of disaster. |
| Other Workspace Configuration Scripts as needed by your organization | TBD | TBD |
|
### **Azure DevOps repo is expected to be up to date as part of regular CI/CD source control sync*
<br/><br>
## Recovery Steps
1. Manually [provision a new capacity](https://learn.microsoft.com/en-us/fabric/admin/capacity-settings?tabs=fabric-capacity#create-a-new-capacity) in an available region via Azure Portal
2. Execute “RecreateArtifacts.ps1”† to recreate Fabric artifacts<br/>
    a. Update variables at the top of the script:<br/>
        &nbsp; &nbsp; &nbsp;i. Authentication Bearer Token<br/>
        &nbsp; &nbsp; &nbsp;ii.	Capacity Name from step 1 above<br/>
        &nbsp; &nbsp; &nbsp;iii.	New Workspace Name<br/>
        &nbsp; &nbsp; &nbsp;iv.	New Lakehouse Name for staging<br/>
        &nbsp; &nbsp; &nbsp;v.	Old Workspace Name<br/>        &nbsp; &nbsp; &nbsp;vi.	Warehouse Name to be recovered<br/>
    b. The script will perform the following tasks (script and inline annotations are more verbose):<br/>
        &nbsp; &nbsp; &nbsp;i.	Create a new workspace<br/>
        &nbsp; &nbsp; &nbsp;ii.	Assign the new capacity to the new workspace<br/>
        &nbsp; &nbsp; &nbsp;iii.	Connect the new workspace to Azure DevOps repo of the old workspace<br/>
        &nbsp; &nbsp; &nbsp;iv.	Sync the workspace with the Azure DevOps repo at the same hash as the old workspace<br/>
    &nbsp; &nbsp; &nbsp;v.	Create a new Lakehouse artifact<br/>
    &nbsp; &nbsp; &nbsp;vi.	Create shortcut tables in the new Lakehouse pointing to the old warehouse data<br/>
3. Load Data Warehouse from Lakehouse using ingestion script: “IngestDataIntoDeployedWarehouse.sql” †.   This is a two-step process:<br/>
    a. First, run this script on your staging Lakehouse to generate the “insert into” commands.<br/>
    b. Second, copy the output from the script to a new query window and execute the commands in batches.  (Batches will allow ingestion to be run in parallel and reduce impact of any failures due to disconnects.)<br/>
4.	Apply Data Warehouse Security using the output from “ScriptFabricDWSecurity.sql” (this should be scheduled to output the results to a file location daily). ‡
5.	Apply Workspace Security using the output from “ScriptWorkspacePermissions.ps1” (this should be scheduled daily and will output to a file location as part of the backup requirements) ‡
6.	Apply additional workspace configurations as needed/scripted by your organization.
7.	Update client connection strings to point to the new warehouse.  This is a manual process.

**† Indicates a script provided as part of this project <br/>
‡ Indicates a script that is generated as output of the backup process <br/>**





