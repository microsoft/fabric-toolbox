# Automated Item Deletion Scripts

Set of PowerShell scripts that a tenant administrator runs to delete all Fabric items across all workspaces in a tenant. All Fabric items must be deleted before tenant remap, which moves a tenant's home region.

> The final two steps permanently delete your items, and you can't restore them. Confirm that you backed up all item definitions and data before you continue.

---

## What these scripts delete

| Deleted | Preserved |
|---|---|
| **Fabric items**: Lakehouses, Warehouses, Notebooks, Dataflows, Eventhouses, Eventstreams, and all other Fabric artifacts are **permanently deleted** | **Power BI items**: Semantic Models, Dashboards, Reports, and Paginated Reports are **skipped**|

---

## Usage

To clean up the Fabric items in your tenant, download `Step0.ps1` through `Step6.ps1` and follow these steps:

1. Sign in to the Global Admin account in Azure and open an Azure Cloud Shell session. Upload `Step0.ps1` through `Step6.ps1` to this session, and name them exactly as given.
1. Dot source each script by running the following command:

   ```powershell
   . ./Step0.ps1; . ./Step1.ps1; . ./Step2.ps1; . ./Step3.ps1; . ./Step4.ps1; . ./Step5.ps1; . ./Step6.ps1
   ```

1. Run `Get-WorkspaceIds`. Note where `workspaceIds.txt`, `personalWorkspaceIds.txt`, and `sharedWorkspaceIds.txt` are stored.
1. Run `Restore-Workspaces -WorkspaceIdsFilePath workspaceIds.txt`. This command assumes that you're in the same folder as when you ran `Get-WorkspaceIds`. If not, make sure that `workspaceIds.txt`, `personalWorkspaceIds.txt`, and `sharedWorkspaceIds.txt` are in the same folder, and run the command again from that folder.
1. Open the Power BI Admin Portal and go to **Capacity settings**. Find a **Healthy** capacity and copy its ID. In the following command, replace `ID` with the copied ID, and then run the following command:

   ```powershell
   Set-WorkspacesToCapacity -WorkspaceIdsFilePath workspaceIds.txt -CapacityId ID
   ```

   If the capacity becomes full, find another healthy capacity and repeat the process until all workspaces are assigned to a capacity.
1. Run the following command:

   ```powershell
   Add-AdminOnSharedWorkspaces -SharedWorkspaceIdsFilePath sharedWorkspaceIds.txt
   ```

1. Run the following command:

   ```powershell
   Add-AdminOnPersonalWorkspaces -PersonalWorkspaceIdsFilePath personalWorkspaceIds.txt
   ```

1. Run `Remove-AllActiveArtifacts -WorkspaceIdsFilePath workspaceIds.txt`. This step permanently deletes your items, and you can't restore them after executing the command. When prompted, type the confirmation word `YES`.
1. Run `Remove-AllSoftDeletedArtifacts -WorkspaceIdsFilePath workspaceIds.txt`. When prompted, type the confirmation word `YES`.

These scripts perform best-effort deletion of items across the tenant and have built-in error handling, including throttling retries.

---

## Output Files

| File | Step | Content |
|---|---|---|
| `workspaceIds.txt` | Step0 | List of all workspace IDs found in the tenant |
| `sharedWorkspaceIds.txt` | Step0 | List of all shared workspace IDs found |
| `personalWorkspaceIds.txt` | Step0 | List of all personal workspace IDs found |
| `workspace_$($wsId)_active_artifacts.json` | Step5 | List of active items (Power BI and Fabric) found |
| `workspace_$($wsId)_active_fabric_artifacts.json` | Step5 | List of active Fabric items found which are targeted for deletion |
| `workspace_$($wsId)_softdeleted_artifacts.json` | Step6 | List of soft-deleted items (Power BI and Fabric) found |
| `workspace_$($wsId)_softdeleted_fabric_artifacts.json` | Step6 | List of soft-deleted Fabric items found which are targeted for deletion |

---

## Troubleshooting

- **Restore-Workspaces reports workspace in Removing state**: No action is needed. The workspace is already being deleted by the system and can't be reliably restored
- **Set-WorkspacesToCapacity errors on full capacity**: Find health capacity with available space or create a new capacity and assign all remaining workspaces to this capacity
- **Add-AdminOnPersonalWorkspaces fails on non-429 error**: You may already be an admin on the workspace, or the workspace ID may be incorrect. Open the workspace directly in Fabric or Power BI to check
- **Remaining items after Remove-AllActiveArtifacts**: If there are remaining items reported in the tenant remap readiness checks after executing the Step 5 script, make sure to run Step 6 script as well to clean up any soft-deleted items. These items are in the recycle bin of each workspace
- **Remaining items after running all scripts**: These scripts perform best-effort deletion of items in the tenant. There still may be additional items, such as on Admin Monitoring workspaces, that need to be deleted before passing readiness checks
